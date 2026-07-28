import Link from "next/link";
import styles from "./dashboard.module.css";

const metrics = [
  ["128", "Expediciones activas", "+8,4%"],
  ["34", "Entregas previstas hoy", "92% a tiempo"],
  ["7", "Incidencias abiertas", "2 críticas"],
  ["62", "Colaboradores disponibles", "11 en ruta"],
];

const expeditions = [
  ["EXP-260071", "Valencia → Lyon", "3 partidas", "En tránsito", "transit"],
  ["EXP-260070", "Barcelona → Marseille", "2 partidas", "Planificada", "planned"],
  ["EXP-260069", "Madrid → Toulouse", "4 partidas", "Entregada", "delivered"],
];

const myItems = [
  ["PT-640171", "Mediterránea Retail", "Valencia → Lyon", "En expedición"],
  ["PT-640170", "Nova Distribution", "Barcelona → Marseille", "Pendiente"],
  ["PT-640169", "Atlas Components", "Madrid → Toulouse", "En expedición"],
];

const trips = [
  ["VJ-260018", "Valencia → Lyon", "2 expediciones", "En ruta", "transit"],
  ["VJ-260017", "Barcelona → Marseille", "1 expedición", "Planificado", "planned"],
  ["VJ-260016", "Madrid → Toulouse", "3 expediciones", "Finalizado", "delivered"],
];

export default function DashboardPage() {
  return (
    <main className={styles.shell}>
      <aside className={styles.sidebar}>
        <Link href="/dashboard" className={styles.brand}>FORNEXA</Link>
        <nav className={styles.nav} aria-label="Navegación principal">
          <Link className={styles.active} href="/dashboard">Control Tower</Link>
          <a href="#">Partidas</a>
          <a href="#">Expediciones</a>
          <a href="#">Viajes</a>
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
            <button type="button">+ Nueva partida</button>
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

        <section className={styles.operationsGrid}>
          <article className={styles.panel}>
            <div className={styles.panelTitle}>
              <div><p className={styles.eyebrow}>OPERATIVA</p><h2>Últimas expediciones</h2></div>
              <button type="button" className={styles.textButton}>Ver todas</button>
            </div>
            <p className={styles.panelHint}>Agrupaciones de una o varias partidas de cliente.</p>
            <div className={styles.compactList}>
              {expeditions.map(([id, route, count, status, statusClass]) => (
                <div className={styles.compactRow} key={id}>
                  <div><strong>{id}</strong><span>{route}</span></div>
                  <span>{count}</span>
                  <span className={`${styles.status} ${styles[statusClass]}`}>{status}</span>
                </div>
              ))}
            </div>
          </article>

          <article className={styles.panel}>
            <div className={styles.panelTitle}>
              <div><p className={styles.eyebrow}>MIS PEDIDOS</p><h2>Últimas partidas</h2></div>
              <button type="button" className={styles.textButton}>Ver todas</button>
            </div>
            <p className={styles.panelHint}>Solo partidas grabadas por el usuario conectado.</p>
            <div className={styles.compactList}>
              {myItems.map(([id, client, route, status]) => (
                <div className={styles.compactRow} key={id}>
                  <div><strong>{id}</strong><span>{client}</span></div>
                  <span>{route}</span>
                  <span className={styles.itemState}>{status}</span>
                </div>
              ))}
            </div>
          </article>

          <article className={styles.panel}>
            <div className={styles.panelTitle}>
              <div><p className={styles.eyebrow}>PLANIFICACIÓN</p><h2>Últimos viajes</h2></div>
              <button type="button" className={styles.textButton}>Ver todos</button>
            </div>
            <p className={styles.panelHint}>Cada viaje contiene una o varias expediciones, nunca partidas sueltas.</p>
            <div className={styles.compactList}>
              {trips.map(([id, route, count, status, statusClass]) => (
                <div className={styles.compactRow} key={id}>
                  <div><strong>{id}</strong><span>{route}</span></div>
                  <span>{count}</span>
                  <span className={`${styles.status} ${styles[statusClass]}`}>{status}</span>
                </div>
              ))}
            </div>
          </article>
        </section>

        <section className={styles.grid}>
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
