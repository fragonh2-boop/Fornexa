import Link from "next/link";
import DataGrid, { type GridColumn, type GridRow } from "../../components/DataGrid";
import { MetricGrid, ScreenHeader, screenButton } from "../../components/ScreenChrome";
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
    <section className={styles.content}>
      <ScreenHeader eyebrow="DOCUMENTACIÓN DIGITAL" title="ePOD & CMR" description="Generación, firma, reservas, evidencias y cierre documental del transporte.">
        <Link href={`${basePath}/epod-cmr/nuevo`} className={screenButton.primary}>+ Nuevo CMR</Link>
      </ScreenHeader>

      <MetricGrid items={[
        { label: "Documentos activos", value: metrics.activos },
        { label: "Pendientes de firma", value: metrics.pendientes },
        { label: "Con reservas", value: metrics.reservas },
      ]} />

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
