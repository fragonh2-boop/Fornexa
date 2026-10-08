import Link from "next/link";
import AppShell from "../../components/AppShell";
import DataGrid from "../../components/DataGrid";
import styles from "../expediciones/expediciones.module.css";

export type ViajeListItem = {
  id: string;
  expeditions: string[];
  vehicle: string;
  driver: string;
  carrier: string;
  stops: number;
  plannedStart: string | null;
  status: string;
};

function formatDate(value: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : new Intl.DateTimeFormat("es-ES", { dateStyle: "short", timeStyle: "short" }).format(date);
}

export default function ViajesListView({ items, basePath = "/dashboard" }: {
  items: ViajeListItem[];
  basePath?: "/dashboard" | "/demo";
}) {
  const demo = basePath === "/demo";
  const rows = items.map(trip => ({
    id: trip.id,
    expediciones: trip.expeditions.length ? trip.expeditions.join(" · ") : "Sin asignar",
    vehiculo: trip.vehicle,
    conductor: trip.driver,
    transportista: trip.carrier,
    salida: formatDate(trip.plannedStart),
    paradas: trip.stops,
    estado: trip.status,
  }));
  const activos = items.filter(trip => !["Finalizado", "Cancelado"].includes(trip.status)).length;
  const enCurso = items.filter(trip => trip.status === "En curso").length;
  const expeditions = items.reduce((sum, trip) => sum + trip.expeditions.length, 0);

  return <AppShell><div className={styles.page}>
    <header className={styles.header}>
      <div><p className={styles.eyebrow}>TRANSPORTE</p><h1>Viajes</h1><p>Viajes físicos reales, con expediciones, vehículo, conductor y secuencia de paradas.</p></div>
      <div className={styles.actions}><Link href={`${basePath}/nuevo/viaje`} className={styles.primary}>+ Nuevo viaje</Link><div className={styles.avatar}>FG</div></div>
    </header>
    <section className={styles.metrics}>
      <article><span>Activos</span><strong>{activos}</strong></article>
      <article><span>En curso</span><strong>{enCurso}</strong></article>
      <article><span>Expediciones asignadas</span><strong>{expeditions}</strong></article>
      <article><span>Último viaje</span><strong className={styles.lastId}>{items[0]?.id ?? "—"}</strong></article>
    </section>
    <section className={styles.panel}>
      <DataGrid
        storageKey={demo ? "demo-viajes-real" : "viajes-real"}
        persistPreferences={!demo}
        columns={[
          { key: "id", label: "Viaje" },
          { key: "expediciones", label: "Expediciones" },
          { key: "vehiculo", label: "Vehículo" },
          { key: "conductor", label: "Conductor" },
          { key: "transportista", label: "Transportista" },
          { key: "salida", label: "Salida prevista" },
          { key: "paradas", label: "Paradas" },
          { key: "estado", label: "Estado" },
        ]}
        rows={rows}
        rowHrefs={items.map(trip => `${basePath}/viajes/${encodeURIComponent(trip.id)}`)}
        searchPlaceholder="Buscar por viaje, expedición, vehículo, conductor o estado"
        emptyMessage="No hay viajes reales todavía."
      />
    </section>
  </div></AppShell>;
}
