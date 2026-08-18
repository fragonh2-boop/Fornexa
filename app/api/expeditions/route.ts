import { NextResponse } from "next/server";
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

export async function GET() {
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
