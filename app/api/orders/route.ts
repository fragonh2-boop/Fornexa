import { NextResponse } from "next/server";
import { getAuthenticatedContext, getAuthenticatedOrReviewContext } from "@/lib/auth-context";
import { createSupabaseAdmin } from "@/lib/supabase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const LEGACY_SERVICE_CODES: Record<string, string> = {
  "Grupaje": "GROUPAGE",
  "LTL": "LTL",
  "Carga completa": "FTL",
  "Paquetería": "PARCEL",
  "Directo": "DIRECT",
};

const STATUS_LABELS: Record<string, string> = {
  DRAFT: "Borrador",
  READY: "Preparada",
  PARTIALLY_PLANNED: "Parcialmente planificada",
  PLANNED: "Planificada",
  IN_TRANSIT: "En tránsito",
  COMPLETED: "Completada",
  CANCELLED: "Cancelada",
};

function text(value: unknown) {
  return String(value ?? "").trim();
}

function numberOrNull(value: unknown) {
  const raw = text(value).replace(",", ".");
  if (!raw) return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function integerOrNull(value: unknown) {
  const parsed = Number(text(value));
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : null;
}

function dateOrNull(value: unknown) {
  const raw = text(value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  return `${raw}T00:00:00.000Z`;
}

export async function GET() {
  const auth = await getAuthenticatedOrReviewContext();
  if (!auth) return NextResponse.json({ error: "No autorizado." }, { status: 401 });

  const tenantId = auth.tenantId;
  const supabase = createSupabaseAdmin();
  const { data, error } = await supabase
    .from("orders")
    .select(`
      id,code,customer_reference,packages,gross_weight,volume,linear_meters,goods_description,adr,status,created_at,
      customer:parties!orders_customer_id_fkey(code,trade_name,legal_name),
      pickup:party_addresses!orders_pickup_address_id_fkey(code,city,country_code),
      delivery:party_addresses!orders_delivery_address_id_fkey(code,city,country_code),
      service:service_catalog!orders_service_id_fkey(code,name),
      expeditions(id,code,status)
    `)
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Orders API GET error", error);
    return NextResponse.json({ error: "No se pudieron cargar las partidas." }, { status: 500 });
  }

  const items = (data ?? []).map((order: any) => ({
    id: order.code,
    customerCode: order.customer?.code ?? null,
    customer: order.customer?.trade_name ?? order.customer?.legal_name ?? null,
    reference: order.customer_reference,
    origin: order.pickup?.city ?? null,
    originCode: order.pickup?.code ?? null,
    destination: order.delivery?.city ?? null,
    destinationCode: order.delivery?.code ?? null,
    serviceCode: order.service?.code ?? null,
    service: order.service?.name ?? null,
    packages: order.packages,
    weight: order.gross_weight,
    volume: order.volume,
    linearMeters: order.linear_meters,
    adr: order.adr,
    status: STATUS_LABELS[order.status] ?? order.status,
    expeditionCode: order.expeditions?.[0]?.code ?? null,
    createdAt: order.created_at,
  }));

  return NextResponse.json({ items }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  const auth = await getAuthenticatedContext();
  if (!auth) return NextResponse.json({ error: "No autorizado." }, { status: 401 });

  const tenantId = auth.tenantId;
  const userId = auth.userId;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON no válido." }, { status: 400 });
  }

  const customerCode = text(body.customerCode).toUpperCase();
  const pickupCode = text(body.pickupCode).toUpperCase();
  const deliveryCode = text(body.deliveryCode).toUpperCase();
  const requestedServiceCode = text(body.serviceCode).toUpperCase() || LEGACY_SERVICE_CODES[text(body.service)] || "";
  const packages = integerOrNull(body.packages);
  const grossWeight = numberOrNull(body.grossWeight);

  if (!customerCode || packages === null || packages < 1 || grossWeight === null) {
    return NextResponse.json({ error: "Customer ID, bultos y peso son obligatorios." }, { status: 400 });
  }

  const supabase = createSupabaseAdmin();

  const { data: customer, error: customerError } = await supabase
    .from("parties")
    .select("id,code,adr_control")
    .eq("tenant_id", tenantId)
    .eq("code", customerCode)
    .eq("is_customer", true)
    .maybeSingle();

  if (customerError) throw customerError;
  if (!customer) return NextResponse.json({ error: "Customer ID no válido para este tenant." }, { status: 400 });

  async function resolveAddress(code: string) {
    if (!code) return null;
    const { data, error } = await supabase
      .from("party_addresses")
      .select("id,code,party_id")
      .eq("tenant_id", tenantId)
      .eq("code", code)
      .eq("is_active", true)
      .maybeSingle();
    if (error) throw error;
    return data;
  }

  const [pickup, delivery] = await Promise.all([resolveAddress(pickupCode), resolveAddress(deliveryCode)]);
  if (pickupCode && !pickup) return NextResponse.json({ error: "Punto de recogida no válido para este tenant." }, { status: 400 });
  if (deliveryCode && !delivery) return NextResponse.json({ error: "Punto de entrega no válido para este tenant." }, { status: 400 });

  let serviceId: string | null = null;
  if (requestedServiceCode) {
    const { data: service, error: serviceError } = await supabase
      .from("service_catalog")
      .select("id")
      .eq("tenant_id", tenantId)
      .eq("code", requestedServiceCode)
      .maybeSingle();
    if (serviceError) throw serviceError;
    if (!service) return NextResponse.json({ error: "Servicio no válido para este tenant." }, { status: 400 });
    serviceId = service.id;
  }

  const adrDeclared = text(body.adr).toUpperCase();
  const adr = adrDeclared === "S" ? {
    declared: true,
    regime: text(body.adrRegime),
    unNumber: text(body.unNumber).toUpperCase(),
    class: text(body.adrClass),
    packingGroup: text(body.packingGroup),
    tunnelCode: text(body.tunnelCode).toUpperCase(),
    description: text(body.adrDescription),
  } : adrDeclared === "N" ? { declared: false } : {};

  if (customer.adr_control && !["S", "N"].includes(adrDeclared)) {
    return NextResponse.json({ error: "Este cliente requiere declarar expresamente si la partida es ADR." }, { status: 400 });
  }

  const insert = {
    tenant_id: tenantId,
    customer_id: customer.id,
    customer_reference: text(body.customerReference) || null,
    service_id: serviceId,
    pickup_address_id: pickup?.id ?? null,
    delivery_address_id: delivery?.id ?? null,
    requested_pickup_start: dateOrNull(body.requestedDate),
    packages,
    gross_weight: grossWeight,
    volume: numberOrNull(body.volume),
    linear_meters: numberOrNull(body.linearMeters),
    goods_description: text(body.goodsDescription) || null,
    adr,
    status: "READY",
    metadata: {
      source: "web_partida_form",
      actorUserId: userId,
      pickup: {
        code: pickupCode || null,
        address: text(body.pickupAddress) || null,
        country: text(body.pickupCountry).toUpperCase() || null,
        postalCode: text(body.pickupPostalCode) || null,
        zone: text(body.pickupZone) || null,
        shipper: text(body.shipper) || null,
      },
      delivery: {
        code: deliveryCode || null,
        address: text(body.deliveryAddress) || null,
        country: text(body.deliveryCountry).toUpperCase() || null,
        postalCode: text(body.deliveryPostalCode) || null,
        zone: text(body.deliveryZone) || null,
        consignee: text(body.consignee) || null,
      },
    },
  };

  const { data: order, error: insertError } = await supabase
    .from("orders")
    .insert(insert)
    .select("id,code,status,created_at")
    .single();

  if (insertError) {
    console.error("Orders API POST error", insertError);
    return NextResponse.json({ error: "No se pudo guardar la partida." }, { status: 500 });
  }

  return NextResponse.json({
    item: {
      id: order.code,
      uuid: order.id,
      status: STATUS_LABELS[order.status] ?? order.status,
      createdAt: order.created_at,
    },
  }, { status: 201, headers: { "Cache-Control": "no-store" } });
}
