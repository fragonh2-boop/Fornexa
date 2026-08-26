import Link from "next/link";
import DataGrid, { type GridColumn, type GridRow } from "../../components/DataGrid";
import { createSupabaseAdmin } from "@/lib/supabase-admin";
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
  ["Control Tower", "/dashboard"],
  ["Partidas", "/dashboard/partidas"],
  ["Expediciones", "/dashboard/expediciones"],
  ["Viajes", "/dashboard/viajes"],
  ["Clientes", "/dashboard/clientes"],
  ["Colaboradores", "/dashboard/colaboradores"],
  ["ePOD & CMR", "/dashboard/epod-cmr"],
] as const;

function formatDate(value: string | null | undefined) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : new Intl.DateTimeFormat("es-ES").format(date);
}

async function getDocuments() {
  const supabase = createSupabaseAdmin();
  const { data, error } = await supabase
    .from("cmr_documents")
    .select(`
      id,
      cmr_number,
      status,
      pickup_location,
      delivery_location,
      carrier_reservations,
      issued_at,
      trip_id,
      cmr_expeditions (
        sequence,
        expedition:expeditions!cmr_expeditions_expedition_id_fkey ( code )
      ),
      cmr_signatures ( role )
    `)
    .order("issued_at", { ascending: false });

  if (error) {
    console.error("CMR: error al leer Supabase", error);
    return [];
  }

  return (data ?? []).map((document: any) => {
    const expeditions = [...(document.cmr_expeditions ?? [])].sort((a: any, b: any) => (a.sequence ?? 0) - (b.sequence ?? 0));
    const expeditionCodes = expeditions.map((item: any) => item.expedition?.code).filter(Boolean);
    const signatures = document.cmr_signatures ?? [];
    const reservations = String(document.carrier_reservations || "").trim();
    return {
      cmr: document.cmr_number as string,
      expedicion: expeditionCodes.length ? expeditionCodes.join(", ") : "—",
      viaje: document.trip_id || "—",
      ruta: `${document.pickup_location || "—"} → ${document.delivery_location || "—"}`,
      fecha: formatDate(document.issued_at),
      firmas: `${signatures.length}/3`,
      reservas: reservations ? reservations : "Sin reservas",
      estado: document.status || "—",
    } satisfies GridRow;
  });
}

export default async function CmrPage() {
  const rows = await getDocuments();
  const metrics = {
    activos: rows.filter(row => !["Cerrado", "Entregado"].includes(String(row.estado))).length,
    pendientes: rows.filter(row => String(row.firmas) !== "3/3").length,
    reservas: rows.filter(row => String(row.reservas) !== "Sin reservas").length,
  };

  return <main className={styles.shell}>
    <aside className={styles.sidebar}>
      <Link href="/dashboard" className={styles.brand}>FORNEXA</Link>
      <nav>{nav.map(([label, href]) => <Link key={href} href={href} className={href === "/dashboard/epod-cmr" ? styles.active : ""}>{label}</Link>)}</nav>
    </aside>

    <section className={styles.content}>
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>DOCUMENTACIÓN DIGITAL</p>
          <h1>ePOD & CMR</h1>
          <p>Generación, firma, reservas, evidencias y cierre documental del transporte.</p>
        </div>
        <div className={styles.actions}>
          <Link href="/dashboard/epod-cmr/nuevo" className={styles.primary}>+ Nuevo CMR</Link>
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
          <p>Datos reales del modelo CMR en Supabase.</p>
        </div>
        <DataGrid
          storageKey="cmr-documents"
          columns={columns}
          rows={rows}
          rowHrefs={rows.map(row => `/dashboard/epod-cmr/${row.cmr}`)}
          searchPlaceholder="Buscar por CMR, expedición, viaje, ruta o estado"
          emptyMessage="No hay documentos CMR que coincidan con los filtros."
        />
      </section>
    </section>
  </main>;
}
