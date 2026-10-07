import ExpedicionesListView from "./ExpedicionesListView";
import { getAuthenticatedOrReviewContext } from "@/lib/auth-context";
import { createSupabaseAdmin } from "@/lib/supabase-admin";

const STATUS_LABELS: Record<string, string> = {
  DRAFT: "Borrador",
  PLANNED: "Planificado",
  ASSIGNED: "Asignado",
  IN_TRANSIT: "En tránsito",
  DELIVERED: "Entregado",
  CLOSED: "Cerrado",
  CANCELLED: "Cancelado",
};

async function getExpeditions() {
  const auth = await getAuthenticatedOrReviewContext();
  if (!auth) return [];

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
    console.error("Expediciones: error al leer Supabase", error);
    return [];
  }

  return (data ?? []).map((expedition: any) => {
    const trips = [...(expedition.trip_expeditions ?? [])].sort((a: any, b: any) => (a.sequence ?? 0) - (b.sequence ?? 0));
    const currentTrip = [...trips].reverse().find((leg: any) => leg.trip?.status === "IN_PROGRESS") ?? trips[trips.length - 1];

    return {
      id: expedition.code as string,
      pedido: expedition.order?.code ?? null,
      albaranesCount: expedition.expedition_delivery_notes?.length ?? 0,
      origen: expedition.origin?.city ?? null,
      destino: expedition.destination?.city ?? null,
      servicio: expedition.service?.name ?? null,
      estado: STATUS_LABELS[expedition.status as string] ?? (expedition.status as string),
      viajesCount: trips.length,
      viajeActual: currentTrip?.trip?.code ?? null,
      createdAt: expedition.created_at as string,
    };
  });
}

export default async function ExpedicionesPage() {
  const items = await getExpeditions();
  return <ExpedicionesListView items={items} />;
}
