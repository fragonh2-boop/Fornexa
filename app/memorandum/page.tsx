import type { Metadata } from "next";
import Link from "next/link";
import FornexaLogo from "../components/FornexaLogo";
import {
  memorandumCommitCoverage,
  memorandumPending,
  memorandumReleases,
  memorandumUpdatedAt,
} from "@/lib/memorandum";
import styles from "./memorandum.module.css";

export const metadata: Metadata = {
  title: "Memorándum",
  description: "Evolución, prioridades y registro público de producto de FORNEXA.",
};

const surfaceClass = {
  Web: styles.web,
  Mobile: styles.mobile,
  Plataforma: styles.platform,
};

export default function MemorandumPage() {
  return (
    <main className={styles.page} id="top">
      <header className={styles.topbar}>
        <Link href="/" aria-label="Ir al inicio de FORNEXA" className={styles.brand}>
          <FornexaLogo className={styles.logo} />
        </Link>
        <nav aria-label="Secciones del memorándum">
          <a href="#pendientes">Pendientes</a>
          <a href="#historial">Historial</a>
          <Link href="/login">Acceso</Link>
        </nav>
      </header>

      <section className={styles.hero}>
        <div className={styles.heroCopy}>
          <p className={styles.eyebrow}>MEMORÁNDUM PÚBLICO · {memorandumUpdatedAt.toUpperCase()}</p>
          <h1>Evolución, foco y próximos pasos.</h1>
          <p className={styles.lead}>Registro ejecutivo de cómo FORNEXA convierte operación logística compleja en control verificable.</p>
        </div>
        <div className={styles.heroIndex} aria-label="Resumen del memorándum">
          <div><strong>{memorandumReleases.length}</strong><span>hitos documentados</span></div>
          <div><strong>Web + Mobile</strong><span>una evolución conectada</span></div>
          <div><strong>{memorandumCommitCoverage}</strong><span>cambios revisados</span></div>
          <div><strong>Diaria</strong><span>revisión si hay actividad</span></div>
        </div>
      </section>

      <section className={styles.context} aria-label="Propósito del documento">
        <p>Este documento comparte dirección y progreso sin exponer información operativa, personal o de seguridad.</p>
        <div><span>01</span> Producto</div>
        <div><span>02</span> Plataforma</div>
        <div><span>03</span> Ejecución</div>
      </section>

      <section className={styles.section} id="pendientes">
        <div className={styles.sectionHeading}>
          <div><p className={styles.eyebrow}>FOCO ACTUAL</p><h2>Pendientes</h2></div>
          <p>Decisiones abiertas y siguientes acciones, expresadas en su forma mínima.</p>
        </div>
        <div className={styles.pendingGrid}>
          {memorandumPending.map((item, index) => (
            <article className={styles.pendingCard} key={item.title}>
              <div className={styles.pendingMeta}>
                <span className={item.area === "Funcional" ? styles.functional : styles.technical}>{item.area}</span>
                <span>{item.priority}</span>
              </div>
              <p className={styles.number}>{String(index + 1).padStart(2, "0")}</p>
              <h3>{item.title}</h3>
              <p>{item.summary}</p>
              <footer><span>Estado</span><strong>{item.state}</strong></footer>
            </article>
          ))}
        </div>
      </section>

      <section className={`${styles.section} ${styles.historySection}`} id="historial">
        <div className={styles.sectionHeading}>
          <div><p className={styles.eyebrow}>REGISTRO DE PRODUCTO</p><h2>Historial</h2></div>
          <p>Hitos agrupados desde el historial completo del producto. Fecha, intención y resultado.</p>
        </div>
        <div className={styles.releaseList}>
          {memorandumReleases.map((release) => (
            <article className={styles.release} key={`${release.version}-${release.date}`}>
              <div className={styles.releaseIdentity}>
                <time>{release.date}</time>
                <strong>{release.version}</strong>
                <span className={styles.releaseStatus}>{release.status}</span>
              </div>
              <div className={styles.releaseBody}>
                <div className={styles.releaseTitleRow}>
                  <h3>{release.title}</h3>
                  <div className={styles.surfaces}>
                    {release.surface.map((surface) => <span className={surfaceClass[surface]} key={surface}>{surface}</span>)}
                  </div>
                </div>
                <dl>
                  <div><dt>Propósito</dt><dd>{release.purpose}</dd></div>
                  <div><dt>Resultado</dt><dd>{release.outcome}</dd></div>
                </dl>
              </div>
            </article>
          ))}
        </div>
      </section>

      <footer className={styles.footer}>
        <div><FornexaLogo className={styles.footerLogo} /><p>Supply Chain Suite</p></div>
        <p>Documento vivo · Revisión diaria condicionada a cambios · Sin información confidencial</p>
        <div className={styles.footerLinks}><Link href="/">fornexasc.com</Link><a href="#top">Volver arriba ↑</a></div>
      </footer>
    </main>
  );
}
