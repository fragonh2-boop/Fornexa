import Link from "next/link";
import AppShell from "../../components/AppShell";
import { routeFeasibilityDemo } from "../../../lib/telematics/providers";
import styles from "./decision-center.module.css";
import routeStyles from "./route-planning.module.css";

const recommendations = [
  { priority:"Crítica", title:"Reasignar la expedición EX-260071", summary:"El colaborador actual compromete la entrega en Lyon.", action:"Revisar alternativa", confidence:94, impact:"+8 puntos OTIF", cost:"+86 €", reason:["Disponibilidad confirmada","Capacidad ADR válida","ETA ajustada por tacógrafo"] },
  { priority:"Alta", title:"Consolidar dos expediciones a Marseille", summary:"EX-260070 y EX-260074 comparten corredor y ventana.", action:"Crear viaje consolidado", confidence:89, impact:"-312 €", cost:"-146 km", reason:["Ocupación prevista 87%","Mismo corredor","Sin incompatibilidad de mercancía"] },
  { priority:"Media", title:"Solicitar POD pendiente", summary:"EX-260069 figura entregada sin prueba documental.", action:"Solicitar POD", confidence:99, impact:"Cierre documental", cost:"0 €", reason:["Entrega confirmada","Sin POD adjunto","SLA documental excedido"] },
];
const scenarios=[["Servicio prioritario","96,4%","12.840 €","31 viajes"],["Equilibrado","94,1%","11.920 €","29 viajes"],["Coste mínimo","90,8%","11.310 €","27 viajes"]];

export default function DecisionCenterPage(){
  const viable=routeFeasibilityDemo.filter(x=>x.status==="VIABLE").length;
  const risk=routeFeasibilityDemo.filter(x=>x.status==="RIESGO").length;
  const blocked=routeFeasibilityDemo.filter(x=>x.status==="NO VIABLE").length;
  return <AppShell><div className={styles.page}>
      <header className={styles.header}>
        <div><p className={styles.eyebrow}>DECISION INTELLIGENCE</p><h1>Centro de decisiones</h1><p>Información mínima para decidir rápido: viabilidad, riesgo, conducción disponible, ETA y bloqueos.</p></div>
        <div className={styles.headerActions}><Link className={routeStyles.telematicsLink} href="/dashboard/integraciones/telematica">Configurar telemática</Link><button className={styles.secondary}>Actualizar análisis</button><div className={styles.avatar}>FG</div></div>
      </header>
      <section className={styles.metrics}>
        <article><span>Rutas viables</span><b>{viable}</b><small className={styles.okText}>Con datos actuales</small></article>
        <article><span>En riesgo</span><b>{risk}</b><small className={styles.warnText}>Revisar antes de asignar</small></article>
        <article><span>No viables</span><b>{blocked}</b><small className={styles.blockText}>Bloqueo operativo</small></article>
        <article><span>Fuentes telemáticas</span><b>3</b><small>+ 1 ruta sin autorización</small></article>
      </section>
      <article className={`${styles.panel} ${routeStyles.routePanel}`}>
        <div className={styles.panelHeading}><div><p className={styles.eyebrow}>PLANIFICACIÓN · TACÓGRAFO + ADR + ETA</p><h2>Viabilidad rápida de ruta</h2></div><span className={styles.live}>Modelo normalizado</span></div>
        <div className={routeStyles.routeTable}><div className={`${routeStyles.routeRow} ${routeStyles.routeHead}`}><span>Expedición / ruta</span><span>Vehículo · conductor</span><span>Conducción</span><span>Pausa</span><span>ETA</span><span>ADR</span><span>Decisión</span></div>{routeFeasibilityDemo.map(r=><div className={routeStyles.routeRow} key={r.expedition}><span><strong>{r.expedition}</strong><small>{r.route}</small></span><span><strong>{r.vehicle}</strong><small>{r.driver} · {r.provider}</small></span><span><strong>{r.remainingDriving}</strong><small>restante</small></span><span><strong>{r.nextBreak}</strong><small>hasta pausa</small></span><span><strong>{r.adjustedEta}</strong><small>nav. {r.navigationEta}</small></span><span><strong>{r.adr}</strong></span><span><b className={`${routeStyles.status} ${r.status==="VIABLE"?routeStyles.ok:r.status==="RIESGO"?routeStyles.warn:routeStyles.blocked}`}>{r.status}</b><small>{r.reason}</small></span></div>)}</div>
        <p className={routeStyles.routeNote}>* Si no hay datos telemáticos autorizados, FORNEXA mantiene la ETA de navegación pero la marca como no validada contra tiempos de conducción.</p>
      </article>
      <section className={styles.layout}><div className={styles.mainColumn}><article className={styles.panel}><div className={styles.panelHeading}><div><p className={styles.eyebrow}>EXCEPCIONES PRIORIZADAS</p><h2>Recomendaciones activas</h2></div></div><div className={styles.recommendations}>{recommendations.map(item=><section className={styles.recommendation} key={item.title}><div className={styles.recommendationTop}><span className={`${styles.priority} ${styles[item.priority.toLowerCase().replace("í","i")]}`}>{item.priority}</span><span className={styles.confidence}>{item.confidence}% confianza</span></div><h3>{item.title}</h3><p>{item.summary}</p><div className={styles.impactRow}><strong>{item.impact}</strong><span>{item.cost}</span></div><details><summary>Motivos</summary><ul>{item.reason.map(x=><li key={x}>{x}</li>)}</ul></details><div className={styles.cardActions}><button>{item.action}</button><button className={styles.secondary}>Detalle</button></div></section>)}</div></article></div><aside className={styles.sideColumn}><article className={styles.panel}><div className={styles.panelHeading}><div><p className={styles.eyebrow}>WHAT-IF</p><h2>Escenarios</h2></div></div><div className={styles.scenarios}>{scenarios.map(([name,service,cost,trips],i)=><section className={`${styles.scenario} ${i===1?styles.recommended:""}`} key={name}><div className={styles.scenarioTitle}><h3>{name}</h3>{i===1&&<span>Recomendado</span>}</div><dl><div><dt>Servicio</dt><dd>{service}</dd></div><div><dt>Coste</dt><dd>{cost}</dd></div><div><dt>Viajes</dt><dd>{trips}</dd></div></dl></section>)}</div></article><article className={styles.panel}><div className={styles.panelHeading}><div><p className={styles.eyebrow}>GOBERNANZA</p><h2>Control humano</h2></div></div><div className={styles.governance}><div><span>Sin telemática</span><strong>No bloquear; advertir</strong></div><div><span>ADR incompatible</span><strong>Bloqueo duro</strong></div><div><span>ETA recalculada</span><strong>Con pausa/descanso</strong></div><div><span>Decisiones trazadas</span><strong>100%</strong></div></div></article></aside></section>
  </div></AppShell>;
}
