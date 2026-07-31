import Link from "next/link";
import { serviceCatalog } from "../../../lib/service-catalog";
import styles from "./servicios.module.css";

const countries = Array.from(new Set(serviceCatalog.map((service) => service.country)));
const partners = Array.from(new Set(serviceCatalog.map((service) => service.partner)));

export default function ServicesPage() {
  return (
    <main className={styles.shell}>
      <aside className={styles.sidebar}>
        <Link href="/dashboard" className={styles.brand}>FORNEXA</Link>
        <nav className={styles.nav}>
          <Link href="/dashboard">Control Tower</Link>
          <Link href="/dashboard/decision-center">Decision Center</Link>
          <Link className={styles.active} href="/dashboard/servicios">Catálogo de servicios</Link>
          <Link href="/dashboard/partidas">Partidas</Link>
          <Link href="/dashboard/expediciones">Expediciones</Link>
          <Link href="/dashboard/viajes">Viajes</Link>
          <Link href="/dashboard/ofertas-tarifas">Ofertas y tarifas</Link>
          <Link href="/dashboard/clientes">Clientes</Link>
          <Link href="/dashboard/colaboradores">Colaboradores</Link>
          <Link href="/dashboard/almacenes">Almacenes</Link>
          <Link href="/dashboard/tracking">Tracking</Link>
          <Link href="/dashboard/epod-cmr">ePOD & CMR</Link>
          <Link href="/dashboard/informes">Informes</Link>
        </nav>
        <div className={styles.sidebarFooter}><span>Knowledge Engine</span><small>Coberturas y capacidades normalizadas</small></div>
      </aside>

      <section className={styles.content}>
        <header className={styles.header}>
          <div>
            <p className={styles.eyebrow}>KNOWLEDGE ENGINE</p>
            <h1>Catálogo de servicios</h1>
            <p>Coberturas, terminales, corresponsales, frecuencias y restricciones que alimentan las propuestas operativas.</p>
          </div>
          <div className={styles.headerActions}>
            <button className={styles.secondary}>Importar catálogo</button>
            <button>+ Nuevo servicio</button>
            <div className={styles.avatar}>FG</div>
          </div>
        </header>

        <section className={styles.metrics}>
          <article><span>Servicios activos</span><b>{serviceCatalog.filter((item) => item.active).length}</b><small>Disponibles para decisión</small></article>
          <article><span>Países</span><b>{countries.length}</b><small>Cobertura internacional</small></article>
          <article><span>Corresponsales</span><b>{partners.length}</b><small>Redes operativas</small></article>
          <article><span>Reglas de CP</span><b>{serviceCatalog.reduce((total, item) => total + item.postalCodeRules.length, 0)}</b><small>Rangos normalizados</small></article>
        </section>

        <section className={styles.grid}>
          <article className={styles.panel}>
            <div className={styles.panelHeading}>
              <div><p className={styles.eyebrow}>RED OPERATIVA</p><h2>Servicios configurados</h2></div>
              <span className={styles.source}>Fuente: DEPLIANT rev. 0152 · 09/03/2026</span>
            </div>
            <div className={styles.tableWrap}>
              <div className={`${styles.row} ${styles.head}`}>
                <span>País / zona</span><span>Cobertura CP</span><span>Terminal</span><span>Corresponsal</span><span>Servicio</span><span>Salidas</span><span>Tránsito</span><span>ADR</span>
              </div>
              {serviceCatalog.map((service) => (
                <div className={styles.row} key={service.id}>
                  <span><strong>{service.country}</strong><small>{service.zone}</small></span>
                  <span className={styles.code}>{service.postalCodeRules.join(", ")}</span>
                  <span><strong>{service.terminalPostalCode}</strong><small>{service.terminalCity}</small></span>
                  <span>{service.partner}</span>
                  <span><b className={styles.badge}>{service.serviceMode}</b></span>
                  <span>{service.departureDays.join(" · ")}</span>
                  <span>{service.estimatedTransitDays} días</span>
                  <span>{service.adr}</span>
                </div>
              ))}
            </div>
          </article>

          <aside className={styles.sideColumn}>
            <article className={styles.panel}>
              <p className={styles.eyebrow}>MOTOR DE PROPUESTA</p>
              <h2>Cómo interviene en una decisión</h2>
              <ol className={styles.flow}>
                <li><b>1</b><span><strong>Valida cobertura</strong><small>País, código postal y terminal asignada.</small></span></li>
                <li><b>2</b><span><strong>Filtra restricciones</strong><small>ADR, modalidad, capacidad y frecuencia.</small></span></li>
                <li><b>3</b><span><strong>Calcula alternativas</strong><small>Tránsito, coste, fiabilidad y consolidación.</small></span></li>
                <li><b>4</b><span><strong>Explica la propuesta</strong><small>Motivos, riesgos y datos utilizados.</small></span></li>
              </ol>
              <Link className={styles.action} href="/dashboard/decision-center">Ver propuestas en Decision Center</Link>
            </article>

            <article className={styles.panel}>
              <p className={styles.eyebrow}>GOBIERNO DEL DATO</p>
              <h2>Estado del catálogo</h2>
              <div className={styles.statusList}>
                <div><span>Fuente identificada</span><strong>100%</strong></div>
                <div><span>Registros estructurados</span><strong>{serviceCatalog.length}</strong></div>
                <div><span>Validación operativa</span><strong>Pendiente</strong></div>
                <div><span>Histórico de cambios</span><strong>Activado</strong></div>
              </div>
              <p className={styles.note}>Los datos importados se conservan como conocimiento operativo de referencia. Antes de automatizar una asignación, el sistema debe validar vigencia, restricciones y disponibilidad real.</p>
            </article>
          </aside>
        </section>
      </section>
    </main>
  );
}
