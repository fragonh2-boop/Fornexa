import Link from "next/link";
import { dashboardHref, type DashboardBasePath } from "./DashboardNavigation";
import styles from "../dashboard/dashboard.module.css";

export type ControlTowerOverview = {
  metrics: string[][];
  shipments: string[][];
  parts: string[][];
  trips: string[][];
  readError?: boolean;
};

/** Pure presentation: the production loader and demo fixtures share this JSX. */
export default function ControlTowerView({ data, illustrative = false, basePath = "/dashboard" }: {
  data: ControlTowerOverview;
  illustrative?: boolean;
  basePath?: DashboardBasePath;
}) {
  const href = (suffix = "") => dashboardHref(basePath, suffix);
  const prefetch = basePath === "/demo" ? false : undefined;

  return (
    <main className={`${styles.shell} ${styles.sharedShell}`}>
      <section className={styles.content}>
        <header className={styles.header}>
          <div>
            <p className={styles.eyebrow}>CONTROL TOWER</p>
            <h1>Resumen operativo</h1>
            <p>Resumen operativo de tu cadena de suministro.</p>
          </div>
          <div className={styles.actions}>
            <Link href={href("/decision-center")} prefetch={prefetch} className={`${styles.actionButton} ${styles.secondary}`}>Decisiones IA</Link>
            <Link href={href("/importar")} prefetch={prefetch} className={`${styles.actionButton} ${styles.secondary}`}>Importar Excel</Link>
            <Link href={href("/nuevo/partida")} prefetch={prefetch} className={styles.actionButton}>+ Nueva partida</Link>
            <div className={styles.avatar}>FG</div>
          </div>
        </header>
        {data.readError && <p role="alert" className={styles.itemState}>No se han podido leer los datos operativos. Las cifras no están disponibles en este momento.</p>}
        <section className={styles.metrics}>
          {data.metrics.map(([value, label, note]) => (
            <article key={label}>
              <div className={styles.metricTop}><span>{label}</span><strong>{note}</strong></div>
              <b>{value}</b>
            </article>
          ))}
        </section>
        <section className={styles.operationsGrid}>
          <article className={styles.panel}>
            <div className={styles.panelTitle}>
              <div><p className={styles.eyebrow}>MIS PEDIDOS</p><h2>Últimas partidas</h2></div>
              <Link href={href("/partidas")} prefetch={prefetch} className={styles.textButton}>Ver todas</Link>
            </div>
            <div className={styles.table}>
              <div className={`${styles.rowFour} ${styles.head}`}><span>ID</span><span>Cliente</span><span>Ruta</span><span>Estado</span></div>
              {data.parts.length === 0 && <p className={styles.itemState}>Sin partidas registradas.</p>}
              {data.parts.map(([id, customer, route, status]) => (
                <Link href={illustrative ? href(`/registros/partidas/${id}`) : href("/partidas")} prefetch={prefetch} className={styles.rowFour} key={id}>
                  <strong>{id}</strong><span>{customer}</span><span>{route}</span><span className={styles.itemState}>{status}</span>
                </Link>
              ))}
            </div>
          </article>
          <article className={styles.panel}>
            <div className={styles.panelTitle}>
              <div><p className={styles.eyebrow}>OPERATIVA</p><h2>Últimas expediciones</h2></div>
              <Link href={href("/expediciones")} prefetch={prefetch} className={styles.textButton}>Ver todas</Link>
            </div>
            <div className={styles.table}>
              <div className={`${styles.row} ${styles.head}`}><span>ID</span><span>Ruta</span><span>Partidas</span><span>Estado</span><span>Previsión</span></div>
              {data.shipments.length === 0 && <p className={styles.itemState}>Sin expediciones registradas.</p>}
              {data.shipments.map(([id, route, count, status, eta, tone]) => (
                <Link href={illustrative ? href(`/registros/expediciones/${id}`) : href("/expediciones")} prefetch={prefetch} className={styles.row} key={id}>
                  <strong>{id}</strong><span>{route}</span><span>{count}</span><span className={`${styles.status} ${styles[tone]}`}>{status}</span><span>{eta}</span>
                </Link>
              ))}
            </div>
          </article>
          <article className={styles.panel}>
            <div className={styles.panelTitle}>
              <div><p className={styles.eyebrow}>TRANSPORTE</p><h2>Últimos viajes</h2></div>
              <Link href={href("/viajes")} prefetch={prefetch} className={styles.textButton}>Ver todos</Link>
            </div>
            <div className={styles.table}>
              <div className={`${styles.rowTrips} ${styles.head}`}><span>ID</span><span>Expediciones</span><span>{illustrative ? "Situación" : "Salida prevista"}</span><span>Estado</span></div>
              {data.trips.length === 0 && <p className={styles.itemState}>Sin viajes registrados.</p>}
              {data.trips.map(([id, count, location, status]) => (
                <Link href={illustrative ? href("/viajes") : href(`/viajes/${id}`)} prefetch={prefetch} className={styles.rowTrips} key={id}>
                  <strong>{id}</strong><span>{count}</span><span>{location}</span><span className={styles.itemState}>{status}</span>
                </Link>
              ))}
            </div>
          </article>
        </section>
      </section>
    </main>
  );
}
