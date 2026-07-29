import Link from "next/link";
import styles from "./decision-center.module.css";

const recommendations = [
  {
    priority: "Crítica",
    title: "Reasignar la expedición EX-260071",
    summary: "El colaborador actual acumula 2 h 15 min de retraso y compromete la entrega en Lyon.",
    action: "Asignar a Velocity Transport",
    confidence: 94,
    impact: "+8 puntos OTIF",
    cost: "+86 €",
    reason: ["Disponibilidad confirmada", "98% puntualidad en esta ruta", "Capacidad ADR válida", "Entrega estimada hoy 19:10"],
  },
  {
    priority: "Alta",
    title: "Consolidar dos expediciones a Marseille",
    summary: "EX-260070 y EX-260074 comparten corredor, ventana de entrega y compatibilidad de mercancía.",
    action: "Crear viaje consolidado",
    confidence: 89,
    impact: "-312 € de coste",
    cost: "-146 km",
    reason: ["Ocupación prevista 87%", "Sin desvío superior a 18 min", "Mismo colaborador preferente", "Reducción estimada de CO₂: 11%"],
  },
  {
    priority: "Media",
    title: "Solicitar POD pendiente",
    summary: "La expedición EX-260069 figura entregada, pero falta la prueba documental del destinatario.",
    action: "Enviar solicitud automática",
    confidence: 99,
    impact: "Cierre documental",
    cost: "0 €",
    reason: ["Entrega confirmada por tracking", "Sin POD adjunto", "SLA documental: 4 horas", "Contacto operativo disponible"],
  },
];

const scenarios = [
  ["Servicio prioritario", "96,4%", "12.840 €", "31 viajes", "Protege entregas críticas"],
  ["Equilibrado", "94,1%", "11.920 €", "29 viajes", "Mejor balance global"],
  ["Coste mínimo", "90,8%", "11.310 €", "27 viajes", "Ahorro máximo"],
];

export default function DecisionCenterPage() {
  return (
    <main className={styles.shell}>
      <aside className={styles.sidebar}>
        <Link href="/dashboard" className={styles.brand}>FORNEXA</Link>
        <nav className={styles.nav}>
          <Link href="/dashboard">Control Tower</Link>
          <Link className={styles.active} href="/dashboard/decision-center">Decision Center</Link>
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
        <div className={styles.sidebarFooter}><span>FORNEXA Intelligence</span><small>Decisiones explicables y supervisadas</small></div>
      </aside>

      <section className={styles.content}>
        <header className={styles.header}>
          <div>
            <p className={styles.eyebrow}>DECISION INTELLIGENCE</p>
            <h1>Centro de decisiones</h1>
            <p>Prioriza excepciones, compara escenarios y aprueba acciones con trazabilidad completa.</p>
          </div>
          <div className={styles.headerActions}>
            <button className={styles.secondary}>Actualizar análisis</button>
            <button>Ejecutar plan recomendado</button>
            <div className={styles.avatar}>FG</div>
          </div>
        </header>

        <section className={styles.metrics}>
          <article><span>Decisiones pendientes</span><b>7</b><small>2 requieren atención inmediata</small></article>
          <article><span>Ahorro identificado</span><b>1.284 €</b><small>Próximas 24 horas</small></article>
          <article><span>Riesgo OTIF</span><b>3,6%</b><small>-1,2 puntos tras optimización</small></article>
          <article><span>Confianza del plan</span><b>92%</b><small>Basada en datos operativos actuales</small></article>
        </section>

        <section className={styles.layout}>
          <div className={styles.mainColumn}>
            <article className={styles.panel}>
              <div className={styles.panelHeading}>
                <div><p className={styles.eyebrow}>EXCEPCIONES PRIORIZADAS</p><h2>Recomendaciones activas</h2></div>
                <span className={styles.live}>Análisis en tiempo real</span>
              </div>
              <div className={styles.recommendations}>
                {recommendations.map((item) => (
                  <section className={styles.recommendation} key={item.title}>
                    <div className={styles.recommendationTop}>
                      <span className={`${styles.priority} ${styles[item.priority.toLowerCase().replace("í", "i")]}`}>{item.priority}</span>
                      <span className={styles.confidence}>{item.confidence}% confianza</span>
                    </div>
                    <h3>{item.title}</h3>
                    <p>{item.summary}</p>
                    <div className={styles.impactRow}><strong>{item.impact}</strong><span>{item.cost}</span></div>
                    <details>
                      <summary>Por qué recomienda esta acción</summary>
                      <ul>{item.reason.map((reason) => <li key={reason}>{reason}</li>)}</ul>
                    </details>
                    <div className={styles.cardActions}>
                      <button>{item.action}</button>
                      <button className={styles.secondary}>Revisar detalle</button>
                      <button className={styles.ghost}>Descartar</button>
                    </div>
                  </section>
                ))}
              </div>
            </article>
          </div>

          <aside className={styles.sideColumn}>
            <article className={styles.panel}>
              <div className={styles.panelHeading}><div><p className={styles.eyebrow}>WHAT-IF</p><h2>Escenarios</h2></div></div>
              <div className={styles.scenarios}>
                {scenarios.map(([name, service, cost, trips, note], index) => (
                  <section className={`${styles.scenario} ${index === 1 ? styles.recommended : ""}`} key={name}>
                    <div className={styles.scenarioTitle}><h3>{name}</h3>{index === 1 && <span>Recomendado</span>}</div>
                    <dl><div><dt>Servicio</dt><dd>{service}</dd></div><div><dt>Coste</dt><dd>{cost}</dd></div><div><dt>Viajes</dt><dd>{trips}</dd></div></dl>
                    <p>{note}</p>
                  </section>
                ))}
              </div>
            </article>

            <article className={styles.panel}>
              <div className={styles.panelHeading}><div><p className={styles.eyebrow}>GOBERNANZA</p><h2>Control humano</h2></div></div>
              <div className={styles.governance}>
                <div><span>Acciones automáticas</span><strong>Solo bajo 50 €</strong></div>
                <div><span>Cambios de proveedor</span><strong>Requieren aprobación</strong></div>
                <div><span>Decisiones trazadas</span><strong>100%</strong></div>
                <div><span>Última actualización</span><strong>Hace 2 min</strong></div>
              </div>
            </article>
          </aside>
        </section>
      </section>
    </main>
  );
}
