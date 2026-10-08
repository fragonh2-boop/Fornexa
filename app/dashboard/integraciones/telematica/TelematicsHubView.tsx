import Link from "next/link";
import type { DashboardBasePath } from "../../../components/DashboardNavigation";
import type { TelematicsProvider } from "../../../../lib/telematics/providers";
import { MetricGrid, ScreenHeader, screenBackClass } from "../../../components/ScreenChrome";
import styles from "./telematica.module.css";

export type TelematicsReadiness = { slug: string; configured: boolean; missingEnv: string[] };

export default function TelematicsHubView({ providers, readiness, basePath = "/dashboard", simulation = false }: { providers: TelematicsProvider[]; readiness: TelematicsReadiness[]; basePath?: DashboardBasePath; simulation?: boolean }) {
  const live = providers.filter(p=>p.liveDriverTimes).length;
  const ddd = providers.filter(p=>p.tachographFiles).length;
  const publicEndpoints = providers.reduce((sum,p)=>sum+p.endpoints.filter(e=>e.publicDocumented).length,0);
  const configured = readiness.filter(r=>r.configured).length;

  return <main className={styles.page}>
    <ScreenHeader
      eyebrow="TELEMATICS HUB"
      title="Conectividad telemática"
      description="Contratos técnicos normalizados para GPS, actividad, conducción/descanso y ficheros de tacógrafo. Los conectores usan solo documentación pública hasta que cada proveedor autorice credenciales y contrato tenant."
      back={<Link href={`${basePath}/integraciones`} prefetch={simulation ? false : undefined} className={screenBackClass}>← Configuración</Link>}
    />

    <MetricGrid items={[
      { label: "Proveedores preparados", value: providers.length, detail: "Registro unificado" },
      { label: "Endpoints públicos", value: publicEndpoints, detail: "Codificados sin inventar rutas" },
      { label: "Driving times live", value: live, detail: "Capacidad documentada" },
      { label: "DDD / Tacho files", value: ddd, detail: "Capacidad documentada" },
      { label: "Con credenciales", value: configured, detail: simulation ? "Sin conexión en demo" : "Detectado en servidor" },
    ]} />

    <section className={styles.panel}>
      <div className={styles.panelHead}><div><p className={styles.eyebrow}>PROVEEDORES</p><h2>Readiness técnica</h2></div><span>Secretos solo server-side</span></div>
      <div className={styles.tableWrap}>
        <table>
          <thead><tr><th>Proveedor</th><th>Contrato público</th><th>Autenticación</th><th>GPS</th><th>Conducción live</th><th>DDD</th><th>Endpoints</th><th>Configuración</th></tr></thead>
          <tbody>{providers.map(p=>{ const r=readiness.find(x=>x.slug===p.slug) ?? { configured: false, missingEnv: [] }; return <tr key={p.id}>
            <td><strong>{p.name}</strong><small>{p.id} · {p.capabilities.join(" · ")}</small></td>
            <td>{p.readiness==="PUBLIC_ENDPOINTS"?"Endpoints públicos":p.readiness==="PUBLIC_MODEL"?"Modelo/API pública":"Contrato comercial"}</td>
            <td>{p.auth}</td><td>{p.gps?"Sí":"No"}</td><td>{p.liveDriverTimes?"Sí":"—"}</td><td>{p.tachographFiles?"Sí":"—"}</td><td>{p.endpoints.length||"Partner"}</td>
            <td><span className={`${styles.badge} ${r.configured?styles.idle:styles.pending}`}>{simulation ? "Simulación sin conexión" : r.configured ? "Configurado" : "Faltan credenciales"}</span><small>{!r.configured && r.missingEnv.length? r.missingEnv.join(" · "):""}</small></td>
          </tr>})}</tbody>
        </table>
      </div>
    </section>

    <section className={styles.twoCols}>
      <article className={styles.panel}>
        <p className={styles.eyebrow}>ENDPOINTS INTERNOS</p><h2>Interfaces ya desplegables</h2>
        <div className={styles.fields}>{["GET /api/telematics/health","GET /api/telematics/health?provider=samsara&probe=1","GET /api/telematics/live?provider=samsara"].map(x=><code key={x}>{x}</code>)}</div>
        <p className={styles.note}>Health nunca expone valores secretos. Live devuelve DriverStatus normalizado y queda en 428 hasta disponer del token correspondiente.</p>
      </article>
      <article className={styles.panel}>
        <p className={styles.eyebrow}>MODELO OPERATIVO</p><h2>DriverStatus</h2>
        <div className={styles.fields}>{["provider","driverId","vehicleId","activity","remainingUntilBreakMin","remainingDailyDrivingMin","nextRequiredBreakMin","gpsLat / gpsLon","speedKmh","observedAt"].map(x=><code key={x}>{x}</code>)}</div>
        <p className={styles.note}>La planificación consume este modelo normalizado, nunca el payload específico del proveedor.</p>
      </article>
    </section>

    <section className={styles.panel}>
      <div className={styles.panelHead}><div><p className={styles.eyebrow}>CONTRATOS PÚBLICOS</p><h2>Endpoints preparados</h2></div></div>
      <div className={styles.tableWrap}><table><thead><tr><th>Proveedor</th><th>Clave</th><th>Método</th><th>Path</th><th>Uso</th></tr></thead><tbody>
        {providers.flatMap(p=>p.endpoints.map(e=><tr key={`${p.id}-${e.key}`}><td><strong>{p.name}</strong></td><td>{e.key}</td><td>{e.method}</td><td><code>{e.path}</code></td><td>{e.capability}</td></tr>))}
      </tbody></table></div>
      <p className={styles.note}>Para VDO, Webfleet, Volvo, Scania y MAN se parametriza la base URL/credenciales y no se codifican rutas no verificadas públicamente.</p>
    </section>
  </main>;
}
