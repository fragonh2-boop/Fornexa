import Link from "next/link";
import AppShell from "../../components/AppShell";
import SimulationButton from "../../components/SimulationButton";
import type { DashboardBasePath } from "../../components/DashboardNavigation";
import type { RouteFeasibility } from "../../../lib/telematics/providers";
import styles from "./decision-center.module.css";
import routeStyles from "./route-planning.module.css";

export type DecisionRecommendation = { priority: string; title: string; summary: string; action: string; confidence: number; impact: string; cost: string; reason: string[] };
export type DecisionCenterData = { routes: RouteFeasibility[]; recommendations: DecisionRecommendation[]; scenarios: string[][]; sourceCount: number; unauthorizedRoutes: number };

export default function DecisionCenterView({ data, basePath = "/dashboard", simulation = false }: { data?: DecisionCenterData; basePath?: DashboardBasePath; simulation?: boolean }) {
  const viable = data?.routes.filter(route => route.status === "VIABLE").length ?? 0;
  const risk = data?.routes.filter(route => route.status === "RIESGO").length ?? 0;
  const blocked = data?.routes.filter(route => route.status === "NO VIABLE").length ?? 0;

  return <AppShell><div className={styles.page}>
    <header className={styles.header}>
      <div><p className={styles.eyebrow}>DECISION INTELLIGENCE</p><h1>Centro de decisiones</h1><p>Información mínima para decidir rápido: viabilidad, riesgo, conducción disponible, ETA y bloqueos.</p></div>
      <div className={styles.headerActions}>
        <Link className={routeStyles.telematicsLink} href={`${basePath}/integraciones/telematica`} prefetch={simulation ? false : undefined}>Configurar telemática</Link>
        {data && <><SimulationButton className={styles.secondary} enabled={simulation}>Actualizar análisis</SimulationButton><div className={styles.avatar}>FG</div></>}
      </div>
    </header>
    {!data ? <article className={styles.panel}><p role="status">Todavía no hay análisis disponibles. Las recomendaciones y la viabilidad de rutas aparecerán cuando haya expediciones activas y una fuente telemática autorizada.</p></article> : <>
      <section className={styles.metrics}>
        <article><span>Rutas viables</span><b>{viable}</b><small className={styles.okText}>Con datos actuales</small></article>
        <article><span>En riesgo</span><b>{risk}</b><small className={styles.warnText}>Revisar antes de asignar</small></article>
        <article><span>No viables</span><b>{blocked}</b><small className={styles.blockText}>Bloqueo operativo</small></article>
        <article><span>Fuentes telemáticas</span><b>{data.sourceCount}</b><small>+ {data.unauthorizedRoutes} ruta sin autorización</small></article>
      </section>
      <article className={`${styles.panel} ${routeStyles.routePanel}`}>
        <div className={styles.panelHeading}><div><p className={styles.eyebrow}>PLANIFICACIÓN · TACÓGRAFO + ADR + ETA</p><h2>Viabilidad rápida de ruta</h2></div><span className={styles.live}>Modelo normalizado</span></div>
        <div className={routeStyles.routeTable}>
          <div className={`${routeStyles.routeRow} ${routeStyles.routeHead}`}><span>Expedición / ruta</span><span>Vehículo · conductor</span><span>Conducción</span><span>Pausa</span><span>ETA</span><span>ADR</span><span>Decisión</span></div>
          {data.routes.map(route => <div className={routeStyles.routeRow} key={route.expedition}>
            <span><strong>{route.expedition}</strong><small>{route.route}</small></span>
            <span><strong>{route.vehicle}</strong><small>{route.driver} · {route.provider}</small></span>
            <span><strong>{route.remainingDriving}</strong><small>restante</small></span>
            <span><strong>{route.nextBreak}</strong><small>hasta pausa</small></span>
            <span><strong>{route.adjustedEta}</strong><small>nav. {route.navigationEta}</small></span>
            <span><strong>{route.adr}</strong></span>
            <span><b className={`${routeStyles.status} ${route.status === "VIABLE" ? routeStyles.ok : route.status === "RIESGO" ? routeStyles.warn : routeStyles.blocked}`}>{route.status}</b><small>{route.reason}</small></span>
          </div>)}
        </div>
        <p className={routeStyles.routeNote}>* Si no hay datos telemáticos autorizados, FORNEXA mantiene la ETA de navegación pero la marca como no validada contra tiempos de conducción.</p>
      </article>
      <section className={styles.layout}>
        <div className={styles.mainColumn}><article className={styles.panel}>
          <div className={styles.panelHeading}><div><p className={styles.eyebrow}>EXCEPCIONES PRIORIZADAS</p><h2>Recomendaciones activas</h2></div></div>
          <div className={styles.recommendations}>{data.recommendations.map(item => <section className={styles.recommendation} key={item.title}>
            <div className={styles.recommendationTop}><span className={`${styles.priority} ${styles[item.priority.toLowerCase().replace("í", "i")]}`}>{item.priority}</span><span className={styles.confidence}>{item.confidence}% confianza</span></div>
            <h3>{item.title}</h3><p>{item.summary}</p>
            <div className={styles.impactRow}><strong>{item.impact}</strong><span>{item.cost}</span></div>
            <details><summary>Motivos</summary><ul>{item.reason.map(reason => <li key={reason}>{reason}</li>)}</ul></details>
            <div className={styles.cardActions}><SimulationButton enabled={simulation}>{item.action}</SimulationButton><SimulationButton className={styles.secondary} enabled={simulation}>Detalle</SimulationButton></div>
          </section>)}</div>
        </article></div>
        <aside className={styles.sideColumn}>
          <article className={styles.panel}>
            <div className={styles.panelHeading}><div><p className={styles.eyebrow}>WHAT-IF</p><h2>Escenarios</h2></div></div>
            <div className={styles.scenarios}>{data.scenarios.map(([name, service, cost, trips], index) => <section className={`${styles.scenario} ${index === 1 ? styles.recommended : ""}`} key={name}>
              <div className={styles.scenarioTitle}><h3>{name}</h3>{index === 1 && <span>Recomendado</span>}</div>
              <dl><div><dt>Servicio</dt><dd>{service}</dd></div><div><dt>Coste</dt><dd>{cost}</dd></div><div><dt>Viajes</dt><dd>{trips}</dd></div></dl>
            </section>)}</div>
          </article>
          <article className={styles.panel}>
            <div className={styles.panelHeading}><div><p className={styles.eyebrow}>GOBERNANZA</p><h2>Control humano</h2></div></div>
            <div className={styles.governance}><div><span>Sin telemática</span><strong>No bloquear; advertir</strong></div><div><span>ADR incompatible</span><strong>Bloqueo duro</strong></div><div><span>ETA recalculada</span><strong>Con pausa/descanso</strong></div><div><span>Decisiones trazadas</span><strong>100%</strong></div></div>
          </article>
        </aside>
      </section>
    </>}
  </div></AppShell>;
}
