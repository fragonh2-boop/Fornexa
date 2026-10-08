import ViajesListView from "./ViajesListView";
import { getAuthenticatedOrReviewContext } from "@/lib/auth-context";
import { createSupabaseAdmin } from "@/lib/supabase-admin";

const STATUS_LABELS: Record<string, string> = {
  DRAFT: "Borrador",
  PLANNED: "Planificado",
  READY: "Preparado",
  IN_PROGRESS: "En curso",
  COMPLETED: "Finalizado",
  CANCELLED: "Cancelado",
};

async function getTrips() {
  const auth = await getAuthenticatedOrReviewContext();
  if (!auth) return [];

  const supabase = createSupabaseAdmin();
  const { data, error } = await supabase
    .from("trips")
    .select(`
      id,
      code,
      status,
      planned_start,
      created_at,
      carrier:parties!trips_carrier_id_fkey ( trade_name, legal_name ),
      vehicle:vehicles!trips_vehicle_id_fkey ( registration, vehicle_type ),
      driver:drivers!trips_driver_id_fkey ( name ),
      trip_expeditions (
        sequence,
        expedition:expeditions!trip_expeditions_expedition_id_fkey ( code )
      ),
      trip_stops ( id, sequence, status )
    `)
    .eq("tenant_id", auth.tenantId)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Viajes: error al leer Supabase", error);
    return [];
  }

  return (data ?? []).map((trip: any) => {
    const expeditions = [...(trip.trip_expeditions ?? [])].sort((a: any, b: any) => (a.sequence ?? 0) - (b.sequence ?? 0));
    return {
      id: trip.code as string,
      expeditions: expeditions.map((item: any) => item.expedition?.code).filter(Boolean),
      vehicle: trip.vehicle?.registration || "—",
      driver: trip.driver?.name || "—",
      carrier: trip.carrier?.trade_name || trip.carrier?.legal_name || "—",
      stops: trip.trip_stops?.length ?? 0,
      plannedStart: trip.planned_start as string | null,
      status: STATUS_LABELS[trip.status] ?? trip.status,
    };
  });
}

export default async function TripsPage() {
  const items = await getTrips();
  return <ViajesListView items={items} />;
}
