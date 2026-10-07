import Link from "next/link";
import AppShell from "../../../components/AppShell";
import DataGrid from "../../../components/DataGrid";
import MobileAccessPanel from "./MobileAccessPanel";
import styles from "../../expediciones/expediciones.module.css";

export type TripDetailData = {
  code: string;
  status: string;
  planned_start?: string | null;
  planned_end?: string | null;
  trailer_registration?: string | null;
  carrier?: { trade_name?: string | null; legal_name?: string | null } | null;
  vehicle?: { registration?: string | null; vehicle_type?: string | null } | null;
  driver?: { name?: string | null } | null;
  trip_expeditions?: Array<{
    sequence?: number | null;
    expedition?: {
      code?: string | null;
      status?: string | null;
      order?: {
        code?: string | null;
        packages?: number | string | null;
        gross_weight?: number | string | null;
        volume?: number | string | null;
        linear_meters?: number | string | null;
      } | null;
    } | null;
  }>;
  trip_stops?: Array<{
    sequence: number;
    stop_type?: string | null;
    company_name?: string | null;
    full_address?: string | null;
    window_start?: string | null;
    window_end?: string | null;
    status: string;
    operational_reference?: string | null;
  }>;
};

const STATUS_LABELS: Record<string, string> = {
  DRAFT: "Borrador", PLANNED: "Planificado", READY: "Preparado", IN_PROGRESS: "En curso",
  COMPLETED: "Finalizado", CANCELLED: "Cancelado",
};
const STOP_LABELS: Record<string, string> = {
  PENDING: "Pendiente", ARRIVED: "Llegada", COMPLETED: "Completada", INCIDENT: "Incidencia", SKIPPED: "Omitida",
};

function formatDate(value: string | null | undefined) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : new Intl.DateTimeFormat("es-ES", { dateStyle: "short", timeStyle: "short" }).format(date);
}

export default function TripDetailView({ trip: t, readOnly = false, simulation = false, basePath = "/dashboard" }: {
  trip: TripDetailData; readOnly?: boolean; simulation?: boolean; basePath?: "/dashboard" | "/demo";
}) {
  const isSimulation = simulation || basePath === "/demo";
  const returnBasePath = isSimulation ? "/demo" : basePath;
  const legs = [...(t.trip_expeditions ?? [])].sort((a, b) => (a.sequence ?? 0) - (b.sequence ?? 0));
  const stops = [...(t.trip_stops ?? [])].sort((a, b) => (a.sequence ?? 0) - (b.sequence ?? 0));
  const totals = legs.reduce((acc, leg) => {
    const order = leg.expedition?.order;
    acc.packages += Number(order?.packages || 0);
    acc.weight += Number(order?.gross_weight || 0);
    acc.volume += Number(order?.volume || 0);
    acc.linear += Number(order?.linear_meters || 0);
    return acc;
  }, { packages: 0, weight: 0, volume: 0, linear: 0 });
  const expeditionRows = legs.map(leg => ({
    secuencia: leg.sequence ?? "—",
    expediente: leg.expedition?.code ?? "—",
    pedido: leg.expedition?.order?.code ?? "—",
    bultos: leg.expedition?.order?.packages ?? "—",
    peso: leg.expedition?.order?.gross_weight != null ? `${Number(leg.expedition.order.gross_weight).toLocaleString("es-ES")} kg` : "—",
    volumen: leg.expedition?.order?.volume != null ? `${Number(leg.expedition.order.volume).toLocaleString("es-ES")} m³` : "—",
    metros: leg.expedition?.order?.linear_meters != null ? `${Number(leg.expedition.order.linear_meters).toLocaleString("es-ES")} ml` : "—",
    estado: leg.expedition?.status ?? "—",
  }));
  const stopRows = stops.map(stop => ({
    secuencia: stop.sequence,
    tipo: stop.stop_type,
    empresa: stop.company_name || "—",
    direccion: stop.full_address,
    ventana: `${formatDate(stop.window_start)} → ${formatDate(stop.window_end)}`,
    referencia: stop.operational_reference || "—",
    estado: STOP_LABELS[stop.status] ?? stop.status,
  }));

  return <AppShell><div className={styles.page}>
    <header className={styles.header}>
      <div><Link href={`${returnBasePath}/viajes`}>← Volver a viajes</Link><p className={styles.eyebrow}>VIAJE · {t.code}</p><h1>{t.code}</h1><p>{STATUS_LABELS[t.status] ?? t.status} · {formatDate(t.planned_start)} → {formatDate(t.planned_end)}</p></div>
      <div className={styles.actions}><div className={styles.avatar}>FG</div></div>
    </header>
    <section className={styles.metrics}>
      <article><span>Expediciones</span><strong>{legs.length}</strong></article>
      <article><span>Paradas</span><strong>{stops.length}</strong></article>
      <article><span>Peso agregado</span><strong>{totals.weight.toLocaleString("es-ES")} kg</strong></article>
      <article><span>Volumen agregado</span><strong>{totals.volume.toLocaleString("es-ES")} m³</strong></article>
    </section>
    <section className={styles.panel}><h2>Asignación</h2><p>Transportista: {t.carrier?.trade_name || t.carrier?.legal_name || "—"} · Vehículo: {t.vehicle?.registration || "—"} {t.vehicle?.vehicle_type ? `(${t.vehicle.vehicle_type})` : ""} · Remolque: {t.trailer_registration || "—"} · Conductor: {t.driver?.name || "—"}</p></section>
    <section className={styles.panel}><MobileAccessPanel tripCode={t.code} readOnly={readOnly} simulation={isSimulation} /></section>
    <section className={styles.panel}>
      <h2>Expediciones del viaje</h2>
      <DataGrid storageKey={`${isSimulation ? "demo-" : ""}viaje-${t.code}-expediciones`} persistPreferences={!isSimulation} columns={[
        { key: "secuencia", label: "Secuencia" }, { key: "expediente", label: "Expediente" },
        { key: "pedido", label: "Pedido" }, { key: "bultos", label: "Bultos" },
        { key: "peso", label: "Peso" }, { key: "volumen", label: "Volumen" },
        { key: "metros", label: "M. lineales" }, { key: "estado", label: "Estado" },
      ]} rows={expeditionRows} emptyMessage="Este viaje no tiene expediciones asignadas." />
    </section>
    <section className={styles.panel}>
      <h2>Ruta y paradas</h2>
      <DataGrid storageKey={`${isSimulation ? "demo-" : ""}viaje-${t.code}-paradas`} persistPreferences={!isSimulation} columns={[
        { key: "secuencia", label: "Secuencia" }, { key: "tipo", label: "Tipo" },
        { key: "empresa", label: "Empresa" }, { key: "direccion", label: "Dirección" },
        { key: "ventana", label: "Ventana" }, { key: "referencia", label: "Referencia" },
        { key: "estado", label: "Estado" },
      ]} rows={stopRows} emptyMessage="Este viaje no tiene paradas configuradas." />
    </section>
  </div></AppShell>;
}
