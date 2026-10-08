import Link from "next/link";
import AppShell from "../../components/AppShell";
import DataGrid from "../../components/DataGrid";
import { MetricGrid, ScreenHeader, screenButton, screenPanelClass } from "../../components/ScreenChrome";
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
    <ScreenHeader eyebrow="TRANSPORTE" title="Viajes" description="Viajes físicos reales, con expediciones, vehículo, conductor y secuencia de paradas.">
      <Link href={`${basePath}/nuevo/viaje`} className={screenButton.primary}>+ Nuevo viaje</Link>
    </ScreenHeader>
    <MetricGrid items={[
      { label: "Activos", value: activos },
      { label: "En curso", value: enCurso },
      { label: "Expediciones asignadas", value: expeditions },
      { label: "Último viaje", value: items[0]?.id ?? "—", text: true },
    ]} />
    <section className={screenPanelClass}>
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
