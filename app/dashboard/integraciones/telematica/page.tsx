import Link from "next/link";
import { telematicsProviders } from "../../../../lib/telematics/providers";
import styles from "./telematica.module.css";

export default function TelematicsHubPage(){
  const live = telematicsProviders.filter(p=>p.liveDriverTimes).length;
  const gps = telematicsProviders.filter(p=>p.gps).length;
  const ddd = telematicsProviders.filter(p=>p.tachographFiles).length;
  const pending = telematicsProviders.filter(p=>p.status==="Pendiente autorización").length;

  return <main className={styles.page}>
    <header className={styles.header}>
      <div>
        <Link href="/dashboard/integraciones" className={styles.back}>← Integraciones</Link>
        <p className={styles.eyebrow}>TELEMATICS HUB</p>
        <h1>Conectividad telemática</h1>
        <p>Adaptadores multi-proveedor para normalizar GPS, actividad, tiempos de conducción y ficheros de tacógrafo antes de enviarlos a planificación, tracking y Decision Center.</p>
      </div>
      <div className={styles.actions}><Link href="/dashboard/decision-center">Ver planificación →</Link></div>
    </header>

    <section className={styles.metrics}>
      <article><span>Proveedores preparados</span><strong>{telematicsProviders.length}</strong><small>Adaptadores previstos</small></article>
      <article><span>Driving times live</span><strong>{live}</strong><small>Capacidad declarada</small></article>
      <article><span>GPS</span><strong>{gps}</strong><small>Conectores compatibles</small></article>
      <article><span>DDD / Tacho files</span><strong>{ddd}</strong><small>Descarga disponible</small></article>
      <article><span>Pendientes autorización</span><strong>{pending}</strong><small>Sin credenciales productivas</small></article>
    </section>

    <section className={styles.panel}>
      <div className={styles.panelHead}><div><p className={styles.eyebrow}>PROVEEDORES</p><h2>Estado de conectividad</h2></div><span>Sin secretos almacenados en cliente</span></div>
      <div className={styles.tableWrap}>
        <table>
          <thead><tr><th>Proveedor</th><th>Autenticación</th><th>GPS</th><th>Conducción live</th><th>DDD</th><th>Webhooks</th><th>Estado</th></tr></thead>
          <tbody>{telematicsProviders.map(p=><tr key={p.id}>
            <td><strong>{p.name}</strong><small>{p.id} · {p.capabilities.join(" · ")}</small></td>
            <td>{p.auth}</td><td>{p.gps?"Sí":"No"}</td><td>{p.liveDriverTimes?"Sí":"—"}</td><td>{p.tachographFiles?"Sí":"—"}</td><td>{p.webhooks?"Sí":"—"}</td>
            <td><span className={`${styles.badge} ${p.status==="Pendiente autorización"?styles.pending:styles.idle}`}>{p.status}</span></td>
          </tr>)}</tbody>
        </table>
      </div>
    </section>

    <section className={styles.twoCols}>
      <article className={styles.panel}>
        <p className={styles.eyebrow}>MODELO CANÓNICO</p><h2>DriverStatus</h2>
        <div className={styles.fields}>{["provider","driverId","vehicleId","activity","remainingUntilBreakMin","remainingDailyDrivingMin","nextRequiredBreakMin","gpsLat / gpsLon","speedKmh","observedAt"].map(x=><code key={x}>{x}</code>)}</div>
        <p className={styles.note}>Decision Center consume este modelo, nunca el payload específico de Samsara, VDO, Webfleet u otro proveedor.</p>
      </article>
      <article className={styles.panel}>
        <p className={styles.eyebrow}>FLUJO</p><h2>De proveedor a decisión</h2>
        <div className={styles.flow}><span>Proveedor</span><b>→</b><span>Adapter</span><b>→</b><span>DriverStatus</span><b>→</b><span>ETA / viabilidad</span><b>→</b><span>Decision Center</span></div>
        <p className={styles.note}>Las credenciales, scopes, fleet IDs y webhooks se activarán proveedor a proveedor cuando existan autorizaciones reales.</p>
      </article>
    </section>
  </main>;
}
