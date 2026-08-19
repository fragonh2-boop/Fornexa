import { NextResponse } from "next/server";
import { getAuthenticatedContext, getAuthenticatedOrReviewContext } from "@/lib/auth-context";
import { createSupabaseAdmin } from "@/lib/supabase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STATUS_LABELS: Record<string, string> = {
  DRAFT: "Borrador",
  PLANNED: "Planificado",
  ASSIGNED: "Asignado",
  IN_TRANSIT: "En tránsito",
  DELIVERED: "Entregado",
  CLOSED: "Cerrado",
  CANCELLED: "Cancelado",
};

function text(value: unknown) {
  return String(value ?? "").trim();
}

function departureOrNull(value: unknown) {
  const raw = text(value);
  if (!raw) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return `${raw}T00:00:00.000Z`;
  const parsed = new Date(raw);
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : null;
}

export async function GET() {
  const auth = await getAuthenticatedOrReviewContext();
  if (!auth) return NextResponse.json({ error: "No autorizado." }, { status: 401 });

  const supabase = createSupabaseAdmin();
  const { data, error } = await supabase
    .from("expeditions")
    .select(`
      id,
      code,
      status,
      created_at,
      order:orders!expeditions_order_id_fkey ( code ),
      origin:party_addresses!expeditions_origin_address_id_fkey ( city, country_code ),
      destination:party_addresses!expeditions_destination_address_id_fkey ( city, country_code ),
      service:service_catalog!expeditions_service_id_fkey ( name ),
      expedition_delivery_notes ( delivery_note_id ),
      trip_expeditions (
        sequence,
        trip:trips!trip_expeditions_trip_id_fkey ( code, status )
      )
    `)
    .eq("tenant_id", auth.tenantId)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Expeditions API error", error);
    return NextResponse.json({ error: "No se pudieron cargar los expedientes." }, { status: 500 });
  }

  const items = (data ?? []).map((expedition: any) => {
    const trips = [...(expedition.trip_expeditions ?? [])].sort((a: any, b: any) => (a.sequence ?? 0) - (b.sequence ?? 0));
    const currentTrip = [...trips].reverse().find((leg: any) => leg.trip?.status === "IN_PROGRESS") ?? trips[trips.length - 1];

    return {
      id: expedition.code,
      pedido: expedition.order?.code ?? null,
      albaranes: expedition.expedition_delivery_notes?.length ?? 0,
      origen: expedition.origin?.city ?? null,
      destino: expedition.destination?.city ?? null,
      servicio: expedition.service?.name ?? null,
      estado: STATUS_LABELS[expedition.status] ?? expedition.status,
      viajesCount: trips.length,
      viajeActual: currentTrip?.trip?.code ?? null,
      createdAt: expedition.created_at,
    };
  });

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

  const orderCode = text(body.orderCode).toUpperCase();
  if (!orderCode) return NextResponse.json({ error: "La partida es obligatoria." }, { status: 400 });

  const supabase = createSupabaseAdmin();
  const { data: order, error: orderError } = await supabase
    .from("orders")
    .select("id,code,status,service_id,pickup_address_id,delivery_address_id")
    .eq("tenant_id", tenantId)
    .eq("code", orderCode)
    .maybeSingle();

  if (orderError) {
    console.error("Expeditions POST order lookup", orderError);
    return NextResponse.json({ error: "No se pudo validar la partida." }, { status: 500 });
  }
  if (!order) return NextResponse.json({ error: "La partida no existe en este tenant." }, { status: 404 });
  if (["COMPLETED", "CANCELLED"].includes(order.status)) {
    return NextResponse.json({ error: "La partida está cerrada o cancelada y no puede generar un expediente." }, { status: 409 });
  }

  const { data: existing, error: existingError } = await supabase
    .from("expeditions")
    .select("id,code")
    .eq("tenant_id", tenantId)
    .eq("order_id", order.id)
    .maybeSingle();
  if (existingError) {
    console.error("Expeditions POST existing lookup", existingError);
    return NextResponse.json({ error: "No se pudo comprobar la asignación existente." }, { status: 500 });
  }
  if (existing) {
    return NextResponse.json({ error: `La partida ${orderCode} ya pertenece al expediente ${existing.code}.` }, { status: 409 });
  }

  const plannedDeparture = departureOrNull(body.plannedDeparture);
  if (body.plannedDeparture && !plannedDeparture) {
    return NextResponse.json({ error: "Fecha de salida no válida." }, { status: 400 });
  }

  const { data: expedition, error: insertError } = await supabase
    .from("expeditions")
    .insert({
      tenant_id: tenantId,
      order_id: order.id,
      service_id: order.service_id,
      origin_address_id: order.pickup_address_id,
      destination_address_id: order.delivery_address_id,
      planned_departure: plannedDeparture,
      status: "PLANNED",
      metadata: {
        source: "web_expedition_form",
        actorUserId: userId,
        orderCode,
      },
    })
    .select("id,code,status,created_at")
    .single();

  if (insertError || !expedition) {
    const duplicate = String(insertError?.message ?? "").toLowerCase().includes("unique");
    console.error("Expeditions POST insert", insertError);
    return NextResponse.json({ error: duplicate ? "La partida ya tiene un expediente." : "No se pudo crear el expediente." }, { status: duplicate ? 409 : 500 });
  }

  const { error: orderUpdateError } = await supabase
    .from("orders")
    .update({ status: "PLANNED", updated_at: new Date().toISOString() })
    .eq("id", order.id)
    .eq("tenant_id", tenantId);

  if (orderUpdateError) {
    console.error("Expeditions POST order status update", orderUpdateError);
    const { error: rollbackError } = await supabase
      .from("expeditions")
      .delete()
      .eq("id", expedition.id)
      .eq("tenant_id", tenantId);
    if (rollbackError) console.error("Expeditions POST compensation failed", rollbackError);
    return NextResponse.json({ error: "No se pudo completar la planificación de la partida." }, { status: 500 });
  }

  return NextResponse.json({
    item: {
      id: expedition.code,
      orderCode,
      status: STATUS_LABELS[expedition.status] ?? expedition.status,
      createdAt: expedition.created_at,
    },
  }, { status: 201, headers: { "Cache-Control": "no-store" } });
}
