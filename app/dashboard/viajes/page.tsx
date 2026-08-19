import Link from "next/link";
import AppShell from "../../components/AppShell";
import DataGrid from "../../components/DataGrid";
import { getAuthenticatedOrReviewContext } from "@/lib/auth-context";
import { createSupabaseAdmin } from "@/lib/supabase-admin";
import styles from "../expediciones/expediciones.module.css";

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

function formatDate(value: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : new Intl.DateTimeFormat("es-ES", { dateStyle: "short", timeStyle: "short" }).format(date);
}

export default async function TripsPage() {
  const items = await getTrips();
  const rows = items.map((trip) => ({
    id: trip.id,
    expediciones: trip.expeditions.length ? trip.expeditions.join(" · ") : "Sin asignar",
    vehiculo: trip.vehicle,
    conductor: trip.driver,
    transportista: trip.carrier,
    salida: formatDate(trip.plannedStart),
    paradas: trip.stops,
    estado: trip.status,
  }));
  const activos = items.filter((trip) => !["Finalizado", "Cancelado"].includes(trip.status)).length;
  const enCurso = items.filter((trip) => trip.status === "En curso").length;
  const expeditions = items.reduce((sum, trip) => sum + trip.expeditions.length, 0);

  return <AppShell><div className={styles.page}>
    <header className={styles.header}><div><p className={styles.eyebrow}>TRANSPORTE</p><h1>Viajes</h1><p>Viajes físicos reales, con expediciones, vehículo, conductor y secuencia de paradas.</p></div><div className={styles.actions}><Link href="/dashboard/nuevo/viaje" className={styles.primary}>+ Nuevo viaje</Link><div className={styles.avatar}>FG</div></div></header>
    <section className={styles.metrics}><article><span>Activos</span><strong>{activos}</strong></article><article><span>En curso</span><strong>{enCurso}</strong></article><article><span>Expediciones asignadas</span><strong>{expeditions}</strong></article><article><span>Último viaje</span><strong className={styles.lastId}>{items[0]?.id ?? "—"}</strong></article></section>
    <section className={styles.panel}><DataGrid storageKey="viajes-real" columns={[{key:"id",label:"Viaje"},{key:"expediciones",label:"Expediciones"},{key:"vehiculo",label:"Vehículo"},{key:"conductor",label:"Conductor"},{key:"transportista",label:"Transportista"},{key:"salida",label:"Salida prevista"},{key:"paradas",label:"Paradas"},{key:"estado",label:"Estado"}]} rows={rows} rowHrefs={items.map(trip=>`/dashboard/viajes/${trip.id}`)} searchPlaceholder="Buscar por viaje, expedición, vehículo, conductor o estado" emptyMessage="No hay viajes reales todavía." /></section>
  </div></AppShell>;
}
