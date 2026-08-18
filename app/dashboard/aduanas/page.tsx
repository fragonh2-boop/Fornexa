import Link from "next/link";
import { createSupabaseAdmin } from "@/lib/supabase-admin";
import styles from "./customs.module.css";

const DIRECTION_LABELS: Record<string, string> = {
  IMPORT: "Importación",
  EXPORT: "Exportación",
  TRANSIT: "Tránsito",
};

const STATUS_LABELS: Record<string, string> = {
  DRAFT: "Borrador",
  SUBMITTED: "Presentado",
  ACCEPTED: "Aceptado",
  CONTROL: "Control aduanero",
  RELEASED: "Levante",
  CLOSED: "Cerrado",
  REJECTED: "Rechazado",
  CANCELLED: "Cancelado",
};

function formatDate(value: string | null | undefined) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : new Intl.DateTimeFormat("es-ES", { dateStyle: "short", timeStyle: "short" }).format(date);
}

async function getCases() {
  const supabase = createSupabaseAdmin();
  const { data, error } = await supabase
    .from("customs_cases")
    .select("id, reference, country_code, direction, system, status, mrn, declarant_eori, representative_eori, payload, created_at, updated_at")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Aduanas: error al leer Supabase", error);
    return [];
  }

  return (data ?? []).map((item: any) => ({
    id: item.reference || item.id,
    direction: DIRECTION_LABELS[item.direction] ?? item.direction ?? "—",
    system: item.system || "—",
    status: STATUS_LABELS[item.status] ?? item.status ?? "—",
    mrn: item.mrn || "—",
    country: item.country_code || "—",
    declarant: item.declarant_eori || "—",
    representative: item.representative_eori || "—",
    updatedAt: formatDate(item.updated_at),
    payload: item.payload ?? {},
  }));
}

export default async function CustomsPage() {
  const cases = await getCases();
  const open = cases.filter(item => !["Cerrado", "Cancelado", "Rechazado"].includes(item.status)).length;
  const imports = cases.filter(item => item.direction === "Importación").length;
  const exports = cases.filter(item => item.direction === "Exportación").length;
  const pendingCustoms = cases.filter(item => ["Presentado", "Aceptado", "Control aduanero"].includes(item.status)).length;
  const selected = cases[0];

  return (
    <main className={styles.shell}>
      <aside className={styles.sidebar}>
        <Link href="/dashboard" className={styles.brand}>FORNEXA</Link>
        <nav className={styles.nav}>
          <Link href="/dashboard">Control Tower</Link>
          <Link href="/dashboard/decision-center">Decision Center</Link>
          <Link href="/dashboard/partidas">Partidas</Link>
          <Link href="/dashboard/expediciones">Expediciones</Link>
          <Link href="/dashboard/viajes">Viajes</Link>
          <Link className={styles.active} href="/dashboard/aduanas">Aduanas</Link>
          <Link href="/dashboard/epod-cmr">ePOD & CMR</Link>
          <Link href="/dashboard/integraciones">Integraciones</Link>
          <Link href="/dashboard/informes">Informes</Link>
        </nav>
        <div className={styles.sidebarFooter}><span>España · CAU</span><small>Datos reales de Supabase</small></div>
      </aside>

      <section className={styles.content}>
        <header className={styles.header}>
          <div><p className={styles.eyebrow}>CUSTOMS CONTROL</p><h1>Cadena documental aduanera</h1><p>Expedientes aduaneros reales, MRN, sistema, estado y trazabilidad.</p></div>
          <div className={styles.headerActions}><Link href="/dashboard/importar?entidad=aduanas" className={styles.secondary}>Importar documentos</Link><Link href="/dashboard/registros/aduanas/nuevo">+ Nuevo expediente</Link><div className={styles.avatar}>FG</div></div>
        </header>

        <section className={styles.metrics}>
          <article><span>Expedientes abiertos</span><strong>{open}</strong><small>{imports} import · {exports} export</small></article>
          <article><span>Pendientes de Aduana</span><strong>{pendingCustoms}</strong><small>Presentados, aceptados o en control</small></article>
          <article><span>Total expedientes</span><strong>{cases.length}</strong><small>Persistidos en FORNEXA</small></article>
          <article><span>Última actualización</span><strong>{selected?.updatedAt ?? "—"}</strong><small>Dato real</small></article>
        </section>

        <section className={styles.workspace}>
          <article className={styles.inbox}>
            <div className={styles.panelHeader}><div><p className={styles.eyebrow}>BANDEJA OPERATIVA</p><h2>Expedientes</h2></div><span>{cases.length} registros</span></div>
            <div className={styles.fileList}>
              {cases.map((file) => <Link className={styles.fileCard} key={String(file.id)} href={`/dashboard/registros/aduanas/${encodeURIComponent(String(file.id))}`}>
                <div><span className={styles.fileId}>{file.id}</span></div>
                <strong>{file.direction} · {file.country}</strong><p>{file.system} · MRN {file.mrn}</p>
                <div className={styles.fileMeta}><span>{file.status}</span><time>{file.updatedAt}</time></div>
              </Link>)}
              {cases.length === 0 && <p className={styles.empty}>No hay expedientes aduaneros reales todavía.</p>}
            </div>
          </article>

          <article className={styles.detail}>
            {selected ? <>
              <div className={styles.detailTop}><div><p className={styles.eyebrow}>{selected.direction} · {selected.id}</p><h2>MRN {selected.mrn}</h2><p>{selected.country} · {selected.system}</p></div><div className={styles.detailState}><span>{selected.status}</span></div></div>
              <div className={styles.identityGrid}>
                <div><span>MRN</span><strong>{selected.mrn}</strong></div><div><span>Sistema</span><strong>{selected.system}</strong></div><div><span>Actualizado</span><strong>{selected.updatedAt}</strong></div>
              </div>
              <div className={styles.bottomGrid}>
                <section><h3>Declaración</h3><p><span>Declarante EORI</span><strong>{selected.declarant}</strong></p><p><span>Representante EORI</span><strong>{selected.representative}</strong></p></section>
                <section><h3>Estado</h3><p><span>Dirección</span><strong>{selected.direction}</strong></p><p><span>País</span><strong>{selected.country}</strong></p></section>
                <section><h3>Trazabilidad</h3><p><span>Última actualización</span><strong>{selected.updatedAt}</strong></p><p><span>Fuente</span><strong>customs_cases</strong></p></section>
              </div>
            </> : <div className={styles.empty}><h2>Sin expedientes</h2><p>Cuando se cree el primer expediente aduanero, aparecerá aquí con sus datos reales.</p></div>}
          </article>
        </section>
      </section>
    </main>
  );
}
