import { NextResponse } from "next/server";
import { getAuthenticatedContext, getAuthenticatedOrReviewContext } from "@/lib/auth-context";
import { createSupabaseAdmin } from "@/lib/supabase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const EDIT_ROLES = new Set(["OWNER", "ADMIN", "OPERATOR"]);
const PRODUCT_STATUSES = new Set(["ACTIVE", "INACTIVE"]);
const GTIN_PATTERN = /^(?:\d{8}|\d{12,14})$/;

function text(value: unknown) {
  return String(value ?? "").trim();
}

function upper(value: unknown) {
  return text(value).toUpperCase();
}

function positiveLimit(value: string | null, fallback: number) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? Math.min(parsed, 500) : fallback;
}

function decimal(value: unknown) {
  const raw = text(value).replace(",", ".");
  if (!raw) return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function optionalDecimal(body: Record<string, unknown>, key: string, label: string, errors: string[]) {
  if (!text(body[key])) return null;
  const value = decimal(body[key]);
  if (value === null) errors.push(`${label}: usa un número igual o superior a cero.`);
  return value;
}

async function findActiveCustomer(supabase: ReturnType<typeof createSupabaseAdmin>, tenantId: string, code: string) {
  const { data, error } = await supabase.from("parties")
    .select("id,code,trade_name,legal_name,status")
    .eq("tenant_id", tenantId)
    .eq("code", code)
    .eq("is_customer", true)
    .eq("status", "ACTIVE")
    .maybeSingle();
  if (error) throw error;
  return data;
}

function productItem(product: any, customersById: Map<string, any>) {
  const owner = customersById.get(product.owner_party_id ?? product.customer_id);
  return {
    id: product.id,
    sku: product.sku,
    name: product.name,
    description: product.description ?? "",
    gtin: product.gtin ?? "",
    ownerCustomerCode: owner?.code ?? "",
    ownerCustomerName: owner?.trade_name ?? owner?.legal_name ?? "Cliente no disponible",
    uomBase: product.uom_base ?? "UN",
    netWeightKg: product.net_weight_kg,
    grossWeightKg: product.gross_weight_kg,
    lengthCm: product.length_cm,
    widthCm: product.width_cm,
    heightCm: product.height_cm,
    volumeM3: product.volume_m3,
    hazardStatus: product.hazard_status,
    status: product.status,
    updatedAt: product.updated_at,
  };
}

export async function GET(request: Request) {
  const auth = await getAuthenticatedOrReviewContext();
  if (!auth) return NextResponse.json({ error: "No autorizado." }, { status: 401 });

  try {
    const params = new URL(request.url).searchParams;
    const customerCode = upper(params.get("customerCode"));
    const activeOnly = params.get("activeOnly") === "true";
    const limit = positiveLimit(params.get("limit"), customerCode ? 250 : 500);
    const supabase = createSupabaseAdmin();

    const customer = customerCode ? await findActiveCustomer(supabase, auth.tenantId, customerCode) : null;
    if (customerCode && !customer) return NextResponse.json({ error: "Cliente activo no encontrado." }, { status: 404 });

    let productsQuery = supabase.from("products")
      .select("id,sku,name,description,gtin,owner_party_id,customer_id,uom_base,net_weight_kg,gross_weight_kg,length_cm,width_cm,height_cm,volume_m3,hazard_status,status,updated_at")
      .eq("tenant_id", auth.tenantId)
      .order("sku")
      .limit(limit);
    if (customer) productsQuery = productsQuery.eq("customer_id", customer.id);
    if (activeOnly) productsQuery = productsQuery.eq("status", "ACTIVE");

    const [productsResult, customersResult, uomsResult] = await Promise.all([
      productsQuery,
      supabase.from("parties").select("id,code,trade_name,legal_name,status").eq("tenant_id", auth.tenantId).eq("is_customer", true).order("code"),
      supabase.from("uom_definitions").select("code,name,category").eq("tenant_id", auth.tenantId).eq("is_active", true).order("code"),
    ]);
    if (productsResult.error || customersResult.error || uomsResult.error) {
      console.error("Products GET", productsResult.error || customersResult.error || uomsResult.error);
      return NextResponse.json({ error: "No se pudo cargar el catálogo de artículos." }, { status: 500 });
    }

    const customers = customersResult.data ?? [];
    const customersById = new Map(customers.map(item => [item.id, item]));
    return NextResponse.json({
      items: (productsResult.data ?? []).map(item => productItem(item, customersById)),
      customers: customers.map(item => ({
        code: item.code,
        name: item.trade_name ?? item.legal_name ?? item.code,
        status: item.status,
      })),
      uoms: uomsResult.data ?? [],
      canEdit: !auth.isReview && EDIT_ROLES.has(auth.role),
      truncated: (productsResult.data ?? []).length === limit,
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Products GET", error);
    return NextResponse.json({ error: "No se pudo cargar el catálogo de artículos." }, { status: 500 });
  }
}

async function writeProduct(request: Request, method: "POST" | "PUT") {
  const auth = await getAuthenticatedContext();
  if (!auth) return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  if (!EDIT_ROLES.has(auth.role)) return NextResponse.json({ error: "No tienes permisos para modificar artículos." }, { status: 403 });

  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "JSON no válido." }, { status: 400 });

  const sku = upper(body.sku);
  const name = text(body.name);
  const description = text(body.description);
  const gtin = text(body.gtin);
  const ownerCustomerCode = upper(body.ownerCustomerCode);
  const uomBase = upper(body.uomBase) || "UN";
  const status = upper(body.status) || "ACTIVE";
  const errors: string[] = [];
  if (!sku || sku.length > 100) errors.push("SKU obligatorio, máximo 100 caracteres.");
  if (name.length < 2 || name.length > 240) errors.push("Nombre: entre 2 y 240 caracteres.");
  if (description.length > 5000) errors.push("Descripción: máximo 5.000 caracteres.");
  if (gtin && !GTIN_PATTERN.test(gtin)) errors.push("GTIN: usa 8, 12, 13 o 14 dígitos.");
  if (!ownerCustomerCode) errors.push("Selecciona un cliente propietario activo.");
  if (!PRODUCT_STATUSES.has(status)) errors.push("Estado de artículo no válido.");

  const netWeightKg = optionalDecimal(body, "netWeightKg", "Peso neto", errors);
  const grossWeightKg = optionalDecimal(body, "grossWeightKg", "Peso bruto", errors);
  const lengthCm = optionalDecimal(body, "lengthCm", "Largo", errors);
  const widthCm = optionalDecimal(body, "widthCm", "Ancho", errors);
  const heightCm = optionalDecimal(body, "heightCm", "Alto", errors);
  const volumeM3 = optionalDecimal(body, "volumeM3", "Volumen", errors);
  if (netWeightKg !== null && grossWeightKg !== null && grossWeightKg < netWeightKg) errors.push("El peso bruto no puede ser inferior al peso neto.");
  if (errors.length) return NextResponse.json({ error: "Revisa los datos del artículo.", errors }, { status: 400 });

  const supabase = createSupabaseAdmin();
  const customer = await findActiveCustomer(supabase, auth.tenantId, ownerCustomerCode);
  if (!customer) return NextResponse.json({ error: "El cliente propietario debe existir y estar activo en este tenant." }, { status: 400 });

  const { data: uom, error: uomError } = await supabase.from("uom_definitions")
    .select("code")
    .eq("tenant_id", auth.tenantId)
    .eq("code", uomBase)
    .eq("is_active", true)
    .maybeSingle();
  if (uomError) throw uomError;
  if (!uom) return NextResponse.json({ error: "La unidad base debe ser una unidad activa del maestro." }, { status: 400 });

  const id = text(body.id);
  if (method === "PUT" && !id) return NextResponse.json({ error: "Identificador de artículo obligatorio." }, { status: 400 });
  const { data: before, error: beforeError } = method === "PUT"
    ? await supabase.from("products").select("id,metadata,revision_number").eq("tenant_id", auth.tenantId).eq("id", id).maybeSingle()
    : { data: null, error: null };
  if (beforeError) throw beforeError;
  if (method === "PUT" && !before) return NextResponse.json({ error: "Artículo no encontrado." }, { status: 404 });

  const values = {
    customer_id: customer.id,
    owner_party_id: customer.id,
    sku,
    name,
    description: description || null,
    gtin: gtin || null,
    uom_base: uomBase,
    net_weight_kg: netWeightKg,
    gross_weight_kg: grossWeightKg,
    length_cm: lengthCm,
    width_cm: widthCm,
    height_cm: heightCm,
    volume_m3: volumeM3,
    status,
    metadata: before?.metadata ?? {},
    revision_number: method === "PUT" ? Number(before?.revision_number ?? 1) + 1 : 1,
    updated_at: new Date().toISOString(),
  };

  const result = method === "POST"
    ? await supabase.from("products").insert({ ...values, tenant_id: auth.tenantId }).select("id,sku,name,status").single()
    : await supabase.from("products").update(values).eq("tenant_id", auth.tenantId).eq("id", id).select("id,sku,name,status").single();
  if (result.error) {
    if (result.error.code === "23505") return NextResponse.json({ error: "Ya existe un artículo con ese SKU para el cliente propietario." }, { status: 409 });
    throw result.error;
  }

  await supabase.from("audit_events").insert({
    tenant_id: auth.tenantId,
    entity_type: "PRODUCT",
    entity_id: result.data.id,
    action: method === "POST" ? "CREATE" : "UPDATE",
    actor_user_id: auth.userId,
    source_channel: "FORNEXA_WEB",
    changed_fields: ["identity", "owner", "uom", "physical_attributes", "status"],
    before_data: before,
    after_data: values,
  });

  return NextResponse.json({ item: result.data }, { status: method === "POST" ? 201 : 200, headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  try { return await writeProduct(request, "POST"); }
  catch (error) { console.error("Products POST", error); return NextResponse.json({ error: "No se pudo crear el artículo." }, { status: 500 }); }
}

export async function PUT(request: Request) {
  try { return await writeProduct(request, "PUT"); }
  catch (error) { console.error("Products PUT", error); return NextResponse.json({ error: "No se pudo actualizar el artículo." }, { status: 500 }); }
}
