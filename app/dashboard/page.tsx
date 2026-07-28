import Link from "next/link";
import styles from "./dashboard.module.css";

const metrics = [
  ["128", "Expediciones activas", "+8,4%"],
  ["34", "Entregas previstas hoy", "92% a tiempo"],
  ["7", "Incidencias abiertas", "2 críticas"],
  ["62", "Colaboradores disponibles", "11 en ruta"],
];

const shipments = [
  ["FX-260071", "Valencia → Lyon", "Mediterránea Retail", "En tránsito", "Hoy 18:30", "transit"],
  ["FX-260070", "Barcelona → Marseille", "Nova Distribution", "Planificada", "Mañana 08:00", "planned"],
  ["FX-260069", "Madrid → Toulouse", "Atlas Components", "Entregada", "Hoy 11:42", "delivered"],
  ["FX-260068", "Alicante → Paris", "Nordic Home", "Incidencia", "Revisión", "incident"],
];

export default function DashboardPage() {
  return (
    <main className={styles.shell}>
      <aside className={styles.sidebar}>
        <Link href="/dashboard" className={styles.brand}>FORNEXA</Link>
        <nav className={styles.nav} aria-label="Navegación principal">
          <Link className={styles.active} href="/dashboard">Control Tower</Link>
          <a href="#">Expediciones</a>
          <a href="#">Ofertas y tarifas</a>
          <a href="#">Clientes</a>
          <a href="#">Colaboradores</a>
          <a href="#">Tracking</a>
          <a href="#">ePOD & CMR</a>
          <a href="#">Informes</a>
        </nav>
        <div className={styles.sidebarFooter}>
          <span>FORNEXA Suite</span>
          <small>Entorno de demostración</small>
        </div>
      </aside>

      <section className={styles.content}>
        <header className={styles.header}>
          <div>
            <p className={styles.eyebrow}>CONTROL TOWER</p>
            <h1>Buenos días, Fran</h1>
            <p>Resumen operativo de tu cadena de suministro.</p>
          </div>
          <div className={styles.actions}>
            <button type="button" className={styles.secondary}>Importar</button>
            <button type="button">+ Nueva expedición</button>
            <div className={styles.avatar} aria-label="Perfil de usuario">FG</div>
          </div>
        </header>

        <section className={styles.metrics} aria-label="Indicadores operativos">
          {metrics.map(([value, label, note]) => (
            <article key={label}>
              <div className={styles.metricTop}><span>{label}</span><strong>{note}</strong></div>
              <b>{value}</b>
            </article>
          ))}
        </section>

        <section className={styles.grid}>
          <article className={`${styles.panel} ${styles.wide}`}>
            <div className={styles.panelTitle}>
              <div><p className={styles.eyebrow}>OPERATIVA</p><h2>Últimas expediciones</h2></div>
              <button type="button" className={styles.textButton}>Ver todas</button>
            </div>
            <div className={styles.table}>
              <div className={`${styles.row} ${styles.head}`}><span>ID</span><span>Ruta</span><span>Cliente</span><span>Estado</span><span>Previsión</span></div>
              {shipments.map(([id, route, client, status, eta, statusClass]) => (
                <div className={styles.row} key={id}>
                  <strong>{id}</strong><span>{route}</span><span>{client}</span>
                  <span className={`${styles.status} ${styles[statusClass]}`}>{status}</span><span>{eta}</span>
                </div>
              ))}
            </div>
          </article>

          <article className={styles.panel}>
            <div className={styles.panelTitle}><div><p className={styles.eyebrow}>ALERTAS</p><h2>Prioridades</h2></div></div>
            <div className={styles.alerts}>
              <div><strong>2</strong><span>Entregas con riesgo de demora</span></div>
              <div><strong>3</strong><span>POD pendientes de validar</span></div>
              <div><strong>1</strong><span>Tarifa próxima a caducar</span></div>
            </div>
          </article>

          <article className={styles.panel}>
            <div className={styles.panelTitle}><div><p className={styles.eyebrow}>CAPACIDAD</p><h2>Red disponible</h2></div></div>
            <div className={styles.capacity}><span>Capacidad confirmada</span><strong>84%</strong><div><i /></div><small>52 de 62 colaboradores disponibles</small></div>
          </article>
        </section>
      </section>
    </main>
  );
}
