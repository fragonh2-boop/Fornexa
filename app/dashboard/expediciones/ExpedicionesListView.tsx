import Link from "next/link";
import AppShell from "../../components/AppShell";
import DataGrid from "../../components/DataGrid";
import styles from "./expediciones.module.css";

export type ExpedicionListItem = {
  id: string;
  pedido: string | null;
  albaranesCount: number;
  origen: string | null;
  destino: string | null;
  servicio: string | null;
  estado: string;
  viajesCount: number;
  viajeActual: string | null;
  createdAt: string;
};

export default function ExpedicionesListView({ items, basePath = "/dashboard" }: {
  items: ExpedicionListItem[];
  basePath?: "/dashboard" | "/demo";
}) {
  const demo = basePath === "/demo";
  const rows = items.map(item => ({
    id: item.id,
    pedido: item.pedido || "—",
    albaranes: `${item.albaranesCount} ${item.albaranesCount === 1 ? "albarán" : "albaranes"}`,
    ruta: `${item.origen || "—"} → ${item.destino || "—"}`,
    viajes: item.viajesCount
      ? `${item.viajesCount} ${item.viajesCount === 1 ? "viaje" : "viajes"}${item.viajeActual ? ` · actual ${item.viajeActual}` : ""}`
      : "Sin asignar",
    servicio: item.servicio || "Varios",
    estado: item.estado || "Planificado",
  }));
  const groupedAlbaranes = items.reduce((total, item) => total + item.albaranesCount, 0);
  const multiTrip = items.filter(item => item.viajesCount > 1).length;
  const activos = items.filter(item => item.estado !== "Entregado" && item.estado !== "Cerrado").length;

  return <AppShell><div className={styles.page}>
    <header className={styles.header}>
      <div>
        <p className={styles.eyebrow}>EXPEDIENTE LOGÍSTICO</p>
        <h1>Expedientes</h1>
        <p>Unidad operativa persistente: nace de un pedido y puede recorrer uno o varios viajes.</p>
      </div>
      <div className={styles.actions}>
        <button className={styles.secondary}>Importar Excel</button>
        <Link href={`${basePath}/nuevo/expedicion`} className={styles.primary}>+ Nuevo expediente</Link>
        <div className={styles.avatar}>FG</div>
      </div>
    </header>
    <section className={styles.metrics}>
      <article><span>Activos</span><strong>{activos}</strong></article>
      <article><span>Albaranes consolidados</span><strong>{groupedAlbaranes}</strong></article>
      <article><span>Multiviaje</span><strong>{multiTrip}</strong></article>
      <article><span>Último expediente</span><strong className={styles.lastId}>{items[0]?.id ?? "—"}</strong></article>
    </section>
    <section className={styles.panel}>
      <DataGrid
        storageKey={demo ? "demo-expediciones" : "expediciones"}
        persistPreferences={!demo}
        columns={[
          { key: "id", label: "Expediente" },
          { key: "pedido", label: "Pedido" },
          { key: "albaranes", label: "Albaranes" },
          { key: "ruta", label: "Ruta" },
          { key: "viajes", label: "Viajes / tramo actual" },
          { key: "servicio", label: "Servicio" },
          { key: "estado", label: "Estado" },
        ]}
        rows={rows}
        searchPlaceholder="Buscar por expediente, pedido, viaje, ruta, servicio o estado"
        emptyMessage="No hay expedientes todavía. Se crean automáticamente al consolidar albaranes de un pedido."
      />
    </section>
  </div></AppShell>;
}
