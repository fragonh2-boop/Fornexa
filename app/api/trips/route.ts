import { NextResponse } from "next/server";
import { getAuthenticatedContext, getAuthenticatedOrReviewContext } from "@/lib/auth-context";
import { createSupabaseAdmin } from "@/lib/supabase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STATUS_LABELS: Record<string, string> = {
  DRAFT: "Borrador",
  PLANNED: "Planificado",
  READY: "Preparado",
  IN_PROGRESS: "En curso",
  COMPLETED: "Finalizado",
  CANCELLED: "Cancelado",
};

function text(value: unknown) { return String(value ?? "").trim(); }
function timestampOrNull(value: unknown) {
  const raw = text(value);
  if (!raw) return null;
  const parsed = new Date(raw);
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : null;
}
function cleanRegistration(value: unknown) { return text(value).toUpperCase().replace(/\s+/g, ""); }
function cleanCode(value: unknown) { return text(value).toUpperCase().replace(/[^A-Z0-9_-]/g, ""); }
function addressText(address: any, fallback: any) {
  if (address) {
    return [address.address_line1, address.address_line2, address.postal_code, address.city, address.country_code]
      .map(text)
      .filter(Boolean)
      .join(", ");
  }
  return [fallback?.address, fallback?.postalCode, fallback?.zone, fallback?.country]
    .map(text)
    .filter(Boolean)
    .join(", ");
}

export async function GET() {
  const auth = await getAuthenticatedOrReviewContext();
  if (!auth) return NextResponse.json({ error: "No autorizado." }, { status: 401 });

  const supabase = createSupabaseAdmin();
  const { data, error } = await supabase
    .from("trips")
    .select(`
      id,code,status,planned_start,created_at,trailer_registration,
      vehicle:vehicles!trips_vehicle_id_fkey(registration,vehicle_type),
      driver:drivers!trips_driver_id_fkey(code,name),
      trip_expeditions(sequence,expedition:expeditions!trip_expeditions_expedition_id_fkey(code))
    `)
    .eq("tenant_id", auth.tenantId)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Trips API GET", error);
    return NextResponse.json({ error: "No se pudieron cargar los viajes." }, { status: 500 });
  }

  const items = (data ?? []).map((trip: any) => ({
    id: trip.code,
    status: STATUS_LABELS[trip.status] ?? trip.status,
    plannedStart: trip.planned_start,
    vehicle: trip.vehicle?.registration ?? null,
    vehicleType: trip.vehicle?.vehicle_type ?? null,
    trailerRegistration: trip.trailer_registration ?? null,
    driverCode: trip.driver?.code ?? null,
    driver: trip.driver?.name ?? null,
    expeditions: [...(trip.trip_expeditions ?? [])]
      .sort((a: any, b: any) => (a.sequence ?? 0) - (b.sequence ?? 0))
      .map((item: any) => item.expedition?.code)
      .filter(Boolean),
    createdAt: trip.created_at,
  }));

  return NextResponse.json({ items }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  const auth = await getAuthenticatedContext();
  if (!auth) return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  const tenantId = auth.tenantId;
  const userId = auth.userId;

  let body: Record<string, unknown>;
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "JSON no válido." }, { status: 400 }); }

  const expeditionCodes = Array.isArray(body.expeditionCodes)
    ? [...new Set(body.expeditionCodes.map(cleanCode).filter(Boolean))]
    : [];
  const vehicleRegistration = cleanRegistration(body.vehicleRegistration);
  const vehicleType = text(body.vehicleType);
  const trailerRegistration = cleanRegistration(body.trailerRegistration) || null;
  const driverCode = cleanCode(body.driverCode);
  const driverName = text(body.driverName);
  const plannedStart = timestampOrNull(body.plannedStart);

  if (!expeditionCodes.length) return NextResponse.json({ error: "Selecciona al menos un expediente." }, { status: 400 });
  if (!vehicleRegistration) return NextResponse.json({ error: "La matrícula del vehículo es obligatoria." }, { status: 400 });
  if (!driverCode || !driverName) return NextResponse.json({ error: "Código y nombre del conductor son obligatorios." }, { status: 400 });
  if (body.plannedStart && !plannedStart) return NextResponse.json({ error: "Fecha de salida no válida." }, { status: 400 });

  const supabase = createSupabaseAdmin();
  const { data: expeditions, error: expeditionsError } = await supabase
    .from("expeditions")
    .select("id,code,status,origin_address_id,destination_address_id,order:orders!expeditions_order_id_fkey(id,code,metadata)")
    .eq("tenant_id", tenantId)
    .in("code", expeditionCodes);
  if (expeditionsError) return NextResponse.json({ error: "No se pudieron validar los expedientes." }, { status: 500 });
  if ((expeditions ?? []).length !== expeditionCodes.length) return NextResponse.json({ error: "Algún expediente no existe en este tenant." }, { status: 400 });
  const invalid = (expeditions ?? []).find(item => ["DELIVERED", "CLOSED", "CANCELLED"].includes(item.status));
  if (invalid) return NextResponse.json({ error: `El expediente ${invalid.code} está cerrado/cancelado y no puede asignarse.` }, { status: 409 });

  const addressIds = [...new Set((expeditions ?? []).flatMap(item => [item.origin_address_id, item.destination_address_id]).filter((id): id is string => typeof id === "string"))];
  const { data: addresses, error: addressesError } = addressIds.length
    ? await supabase
        .from("party_addresses")
        .select("id,name,address_line1,address_line2,postal_code,city,country_code,latitude,longitude,contact_name,contact_phone,default_window_start,default_window_end")
        .eq("tenant_id", tenantId)
        .in("id", addressIds)
    : { data: [], error: null };
  if (addressesError) return NextResponse.json({ error: "No se pudieron resolver las direcciones operativas." }, { status: 500 });
  const addressById = new Map((addresses ?? []).map(item => [item.id, item]));

  const expeditionByCode = new Map((expeditions ?? []).map(item => [item.code, item]));
  for (const code of expeditionCodes) {
    const expedition: any = expeditionByCode.get(code);
    const metadata = expedition?.order?.metadata ?? {};
    const pickup = expedition?.origin_address_id ? addressById.get(expedition.origin_address_id) : null;
    const delivery = expedition?.destination_address_id ? addressById.get(expedition.destination_address_id) : null;
    if (!addressText(pickup, metadata.pickup) || !addressText(delivery, metadata.delivery)) {
      return NextResponse.json({ error: `El expediente ${code} no tiene origen y destino operativos completos.` }, { status: 422 });
    }
  }

  let vehicleId: string;
  const { data: existingVehicle, error: vehicleLookupError } = await supabase
    .from("vehicles")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("registration", vehicleRegistration)
    .maybeSingle();
  if (vehicleLookupError) return NextResponse.json({ error: "No se pudo validar el vehículo." }, { status: 500 });
  if (existingVehicle) vehicleId = existingVehicle.id;
  else {
    const { data: vehicle, error } = await supabase.from("vehicles").insert({
      tenant_id: tenantId,
      registration: vehicleRegistration,
      vehicle_type: vehicleType || null,
      status: "AVAILABLE",
      metadata: { source: "web_trip_form", actorUserId: userId },
    }).select("id").single();
    if (error || !vehicle) return NextResponse.json({ error: "No se pudo registrar el vehículo." }, { status: 500 });
    vehicleId = vehicle.id;
  }

  let driverId: string;
  const { data: existingDriver, error: driverLookupError } = await supabase
    .from("drivers")
    .select("id,name")
    .eq("tenant_id", tenantId)
    .eq("code", driverCode)
    .maybeSingle();
  if (driverLookupError) return NextResponse.json({ error: "No se pudo validar el conductor." }, { status: 500 });
  if (existingDriver) driverId = existingDriver.id;
  else {
    const { data: driver, error } = await supabase.from("drivers").insert({
      tenant_id: tenantId,
      code: driverCode,
      name: driverName,
      status: "ACTIVE",
    }).select("id").single();
    if (error || !driver) return NextResponse.json({ error: "No se pudo registrar el conductor." }, { status: 500 });
    driverId = driver.id;
  }

  const { data: trip, error: tripError } = await supabase.from("trips").insert({
    tenant_id: tenantId,
    vehicle_id: vehicleId,
    trailer_registration: trailerRegistration,
    driver_id: driverId,
    planned_start: plannedStart,
    status: "PLANNED",
    metadata: { source: "web_trip_form", actorUserId: userId },
  }).select("id,code,status,created_at").single();
  if (tripError || !trip) {
    console.error("Trips API insert", tripError);
    return NextResponse.json({ error: "No se pudo crear el viaje." }, { status: 500 });
  }

  const expeditionIdByCode = new Map((expeditions ?? []).map(item => [item.code, item.id]));
  const links = expeditionCodes.map((code, index) => ({
    tenant_id: tenantId,
    trip_id: trip.id,
    expedition_id: expeditionIdByCode.get(code),
    sequence: index + 1,
  }));
  const { error: linkError } = await supabase.from("trip_expeditions").insert(links);
  if (linkError) {
    console.error("Trips API link expeditions", linkError);
    await supabase.from("trips").delete().eq("id", trip.id).eq("tenant_id", tenantId);
    return NextResponse.json({ error: "No se pudieron asignar los expedientes al viaje." }, { status: 500 });
  }

  const stopRows = expeditionCodes.flatMap((code, index) => {
    const expedition: any = expeditionByCode.get(code);
    const metadata = expedition?.order?.metadata ?? {};
    const pickup = expedition?.origin_address_id ? addressById.get(expedition.origin_address_id) : null;
    const delivery = expedition?.destination_address_id ? addressById.get(expedition.destination_address_id) : null;
    const base = index * 2;
    return [
      {
        tenant_id: tenantId,
        trip_id: trip.id,
        sequence: base + 1,
        stop_type: "PICKUP",
        address_id: pickup?.id ?? null,
        company_name: pickup?.name || text(metadata.pickup?.shipper) || code,
        full_address: addressText(pickup, metadata.pickup),
        latitude: pickup?.latitude ?? null,
        longitude: pickup?.longitude ?? null,
        contact_name: pickup?.contact_name ?? null,
        contact_phone: pickup?.contact_phone ?? null,
        operational_reference: code,
        status: "PENDING",
        metadata: { source: "trip_projection", expeditionId: expedition.id, expeditionCode: code, role: "pickup" },
      },
      {
        tenant_id: tenantId,
        trip_id: trip.id,
        sequence: base + 2,
        stop_type: "DELIVERY",
        address_id: delivery?.id ?? null,
        company_name: delivery?.name || text(metadata.delivery?.consignee) || code,
        full_address: addressText(delivery, metadata.delivery),
        latitude: delivery?.latitude ?? null,
        longitude: delivery?.longitude ?? null,
        contact_name: delivery?.contact_name ?? null,
        contact_phone: delivery?.contact_phone ?? null,
        operational_reference: code,
        status: "PENDING",
        metadata: { source: "trip_projection", expeditionId: expedition.id, expeditionCode: code, role: "delivery" },
      },
    ];
  });
  const { error: stopsError } = await supabase.from("trip_stops").insert(stopRows);
  if (stopsError) {
    console.error("Trips API project stops", stopsError);
    await supabase.from("trips").delete().eq("id", trip.id).eq("tenant_id", tenantId);
    return NextResponse.json({ error: "No se pudo construir la ruta canónica del viaje." }, { status: 500 });
  }

  const { error: statusError } = await supabase
    .from("expeditions")
    .update({ status: "ASSIGNED", updated_at: new Date().toISOString() })
    .eq("tenant_id", tenantId)
    .in("id", (expeditions ?? []).map(item => item.id));
  if (statusError) console.error("Trips API expedition status", statusError);

  return NextResponse.json({
    item: {
      id: trip.code,
      status: STATUS_LABELS[trip.status] ?? trip.status,
      expeditions: expeditionCodes,
      stops: stopRows.length,
      createdAt: trip.created_at,
    },
  }, { status: 201, headers: { "Cache-Control": "no-store" } });
}
