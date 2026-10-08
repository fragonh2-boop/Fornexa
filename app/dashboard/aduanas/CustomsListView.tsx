import Link from "next/link";
import { MetricGrid, ScreenHeader, screenButton } from "../../components/ScreenChrome";
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
      <section className={styles.content}>
        <ScreenHeader eyebrow="CUSTOMS CONTROL" title="Cadena documental aduanera" description={demo ? "Expedientes aduaneros ficticios, MRN, sistema, estado y trazabilidad." : "Expedientes aduaneros reales, MRN, sistema, estado y trazabilidad."}>
          <Link href={`${basePath}/importar?entidad=aduanas`} className={screenButton.secondary}>Importar documentos</Link>
          <Link href={`${basePath}/registros/aduanas/nuevo`} className={screenButton.primary}>+ Nuevo expediente</Link>
        </ScreenHeader>

        <MetricGrid items={[
          { label: "Expedientes abiertos", value: open, detail: `${imports} import · ${exports} export` },
          { label: "Pendientes de Aduana", value: pendingCustoms, detail: "Presentados, aceptados o en control" },
          { label: "Total expedientes", value: cases.length, detail: demo ? "Ejemplos ficticios" : "Persistidos en FORNEXA" },
          { label: "Última actualización", value: selected?.updatedAt.split(", ")[0] || "—", text: true, detail: [selected?.updatedAt.split(", ")[1], demo ? "Dato ficticio" : "Dato real"].filter(Boolean).join(" · ") },
        ]} />

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
