import Link from "next/link";
import DataGrid, { type GridColumn, type GridRow } from "../../components/DataGrid";
import styles from "./cmr.module.css";

const columns: GridColumn[] = [
  { key: "cmr", label: "CMR" },
  { key: "expedicion", label: "Expedición" },
  { key: "viaje", label: "Viaje" },
  { key: "ruta", label: "Ruta" },
  { key: "fecha", label: "Fecha carga" },
  { key: "firmas", label: "Firmas" },
  { key: "reservas", label: "Reservas" },
  { key: "estado", label: "Estado" },
];

const nav = [
  ["Control Tower", ""],
  ["Partidas", "/partidas"],
  ["Expediciones", "/expediciones"],
  ["Viajes", "/viajes"],
  ["Clientes", "/clientes"],
  ["Colaboradores", "/colaboradores"],
  ["ePOD & CMR", "/epod-cmr"],
] as const;

export default function CmrListView({ rows, basePath = "/dashboard" }: {
  rows: GridRow[];
  basePath?: "/dashboard" | "/demo";
}) {
  const demo = basePath === "/demo";
  const metrics = {
    activos: rows.filter(row => !["Cerrado", "Entregado"].includes(String(row.estado))).length,
    pendientes: rows.filter(row => String(row.firmas) !== "3/3").length,
    reservas: rows.filter(row => String(row.reservas) !== "Sin reservas").length,
  };

  return <main className={styles.shell}>
    <aside className={styles.sidebar}>
      <Link href={basePath} className={styles.brand}>FORNEXA</Link>
      <nav>{nav.map(([label, href]) => <Link key={href} href={`${basePath}${href}`} className={href === "/epod-cmr" ? styles.active : ""}>{label}</Link>)}</nav>
    </aside>

    <section className={styles.content}>
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>DOCUMENTACIÓN DIGITAL</p>
          <h1>ePOD & CMR</h1>
          <p>Generación, firma, reservas, evidencias y cierre documental del transporte.</p>
        </div>
        <div className={styles.actions}>
          <Link href={`${basePath}/epod-cmr/nuevo`} className={styles.primary}>+ Nuevo CMR</Link>
          <div className={styles.avatar}>FG</div>
        </div>
      </header>

      <section className={styles.metrics}>
        <article><span>Documentos activos</span><strong>{metrics.activos}</strong></article>
        <article><span>Pendientes de firma</span><strong>{metrics.pendientes}</strong></article>
        <article><span>Con reservas</span><strong>{metrics.reservas}</strong></article>
      </section>

      <section className={styles.panel}>
        <div className={styles.panelHeader}>
          <div><span>CMR LIVE</span><h2>Documentos recientes</h2></div>
          <p>{demo ? "Ejemplos ficticios de documentación CMR. No se emiten documentos reales." : "Datos reales del modelo CMR en Supabase."}</p>
        </div>
        <DataGrid
          storageKey={demo ? "demo-cmr-documents" : "cmr-documents"}
          persistPreferences={!demo}
          columns={columns}
          rows={rows}
          rowHrefs={rows.map(row => `${basePath}/epod-cmr/${row.cmr}`)}
          searchPlaceholder="Buscar por CMR, expedición, viaje, ruta o estado"
          emptyMessage="No hay documentos CMR que coincidan con los filtros."
        />
      </section>
    </section>
  </main>;
}
