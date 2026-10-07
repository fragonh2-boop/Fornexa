import Link from "next/link";
import styles from "./customs.module.css";

export type CustomsListItem = {
  id: string;
  direction: string;
  system: string;
  status: string;
  mrn: string;
  country: string;
  declarant: string;
  representative: string;
  updatedAt: string;
  payload?: unknown;
};

export default function CustomsListView({ cases, basePath = "/dashboard" }: {
  cases: CustomsListItem[];
  basePath?: "/dashboard" | "/demo";
}) {
  const demo = basePath === "/demo";
  const open = cases.filter(item => !["Cerrado", "Cancelado", "Rechazado"].includes(item.status)).length;
  const imports = cases.filter(item => item.direction === "Importación").length;
  const exports = cases.filter(item => item.direction === "Exportación").length;
  const pendingCustoms = cases.filter(item => ["Presentado", "Aceptado", "Control aduanero"].includes(item.status)).length;
  const selected = cases[0];

  return (
    <main className={styles.shell}>
      <aside className={styles.sidebar}>
        <Link href={basePath} className={styles.brand}>FORNEXA</Link>
        <nav className={styles.nav}>
          <Link href={basePath}>Control Tower</Link>
          <Link href={`${basePath}/decision-center`}>Decision Center</Link>
          <Link href={`${basePath}/partidas`}>Partidas</Link>
          <Link href={`${basePath}/expediciones`}>Expediciones</Link>
          <Link href={`${basePath}/viajes`}>Viajes</Link>
          <Link className={styles.active} href={`${basePath}/aduanas`}>Aduanas</Link>
          <Link href={`${basePath}/epod-cmr`}>ePOD & CMR</Link>
          <Link href={`${basePath}/integraciones`}>Integraciones</Link>
          <Link href={`${basePath}/informes`}>Informes</Link>
        </nav>
        <div className={styles.sidebarFooter}><span>España · CAU</span><small>{demo ? "Datos ficticios de demostración" : "Datos reales de Supabase"}</small></div>
      </aside>

      <section className={styles.content}>
        <header className={styles.header}>
          <div><p className={styles.eyebrow}>CUSTOMS CONTROL</p><h1>Cadena documental aduanera</h1><p>{demo ? "Expedientes aduaneros ficticios, MRN, sistema, estado y trazabilidad." : "Expedientes aduaneros reales, MRN, sistema, estado y trazabilidad."}</p></div>
          <div className={styles.headerActions}><Link href={`${basePath}/importar?entidad=aduanas`} className={styles.secondary}>Importar documentos</Link><Link href={`${basePath}/registros/aduanas/nuevo`}>+ Nuevo expediente</Link><div className={styles.avatar}>FG</div></div>
        </header>

        <section className={styles.metrics}>
          <article><span>Expedientes abiertos</span><strong>{open}</strong><small>{imports} import · {exports} export</small></article>
          <article><span>Pendientes de Aduana</span><strong>{pendingCustoms}</strong><small>Presentados, aceptados o en control</small></article>
          <article><span>Total expedientes</span><strong>{cases.length}</strong><small>{demo ? "Ejemplos ficticios" : "Persistidos en FORNEXA"}</small></article>
          <article><span>Última actualización</span><strong>{selected?.updatedAt ?? "—"}</strong><small>{demo ? "Dato ficticio" : "Dato real"}</small></article>
        </section>

        <section className={styles.workspace}>
          <article className={styles.inbox}>
            <div className={styles.panelHeader}><div><p className={styles.eyebrow}>BANDEJA OPERATIVA</p><h2>Expedientes</h2></div><span>{cases.length} registros</span></div>
            <div className={styles.fileList}>
              {cases.map((file) => <Link className={styles.fileCard} key={String(file.id)} href={`${basePath}/registros/aduanas/${encodeURIComponent(String(file.id))}`}>
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
