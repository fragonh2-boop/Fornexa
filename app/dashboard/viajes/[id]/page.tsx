import Link from "next/link";
import styles from "./trip-detail.module.css";

const loads = [
  { part: "64018749", expedition: "EX-260071", client: "Soler H.", packages: "2 PAL", weight: 477, volume: 2.928, linear: 0.8, billing: "Peso", status: "Cargada" },
  { part: "64018761", expedition: "EX-260071", client: "Soler H.", packages: "1 PAL", weight: 185, volume: 0.672, linear: 0.2, billing: "Peso", status: "Cargada" },
  { part: "64018765", expedition: "EX-260071", client: "Soler H.", packages: "1 PAL", weight: 213, volume: 1.027, linear: 0.3, billing: "Volumen", status: "Cargada" },
  { part: "64018790", expedition: "EX-260072", client: "Vondom", packages: "2 PAL", weight: 168, volume: 4.21, linear: 1.2, billing: "Volumen", status: "Pendiente" },
  { part: "64018793", expedition: "EX-260072", client: "Vondom", packages: "1 PAL", weight: 29, volume: 1.344, linear: 0.4, billing: "Volumen", status: "Pendiente" },
  { part: "64018918", expedition: "EX-260073", client: "Textile", packages: "3 CRT", weight: 37, volume: 0.174, linear: 0.1, billing: "Mínimo", status: "Cargada" },
  { part: "64018932", expedition: "EX-260073", client: "Soler H.", packages: "1 PAL", weight: 90, volume: 0.768, linear: 0.3, billing: "Peso", status: "Cargada" },
];

const totalWeight = loads.reduce((sum, row) => sum + row.weight, 0);
const totalVolume = loads.reduce((sum, row) => sum + row.volume, 0);
const totalLinear = loads.reduce((sum, row) => sum + row.linear, 0);
const maxWeight = 24000;
const maxVolume = 90;
const maxLinear = 13.6;

function pct(value: number, max: number) {
  return Math.min(100, Math.round((value / max) * 100));
}

export default async function TripDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const weightPct = pct(totalWeight, maxWeight);
  const volumePct = pct(totalVolume, maxVolume);
  const linearPct = pct(totalLinear, maxLinear);
  const limiting = volumePct >= weightPct && volumePct >= linearPct ? "volumen" : weightPct >= linearPct ? "peso" : "metros lineales";

  return (
    <main className={styles.shell}>
      <aside className={styles.sidebar}>
        <Link href="/dashboard" className={styles.brand}>FORNEXA</Link>
        <nav>
          <Link href="/dashboard">Control Tower</Link>
          <Link href="/dashboard/partidas">Partidas</Link>
          <Link href="/dashboard/expediciones">Expediciones</Link>
          <Link className={styles.active} href="/dashboard/viajes">Viajes</Link>
          <Link href="/dashboard/ofertas-tarifas">Ofertas y tarifas</Link>
          <Link href="/dashboard/clientes">Clientes</Link>
          <Link href="/dashboard/colaboradores">Colaboradores</Link>
          <Link href="/dashboard/almacenes">Almacenes</Link>
          <Link href="/dashboard/tracking">Tracking</Link>
          <Link href="/dashboard/epod-cmr">ePOD & CMR</Link>
          <Link href="/dashboard/informes">Informes</Link>
        </nav>
      </aside>

      <section className={styles.content}>
        <header className={styles.header}>
          <div>
            <Link href="/dashboard/viajes" className={styles.back}>← Volver a viajes</Link>
            <p>VIAJE · {id}</p>
            <h1>Carga y optimización</h1>
            <span>Detalle consolidado por expediciones y partidas. El viaje nunca admite partidas sueltas.</span>
          </div>
          <div className={styles.tripMeta}>
            <strong>1234 LBC · Semirremolque lona</strong>
            <span>Valencia → Lyon</span>
            <span>Conductor: J. Martínez</span>
          </div>
        </header>

        <section className={styles.tabs}>
          <button>Resumen</button>
          <button>Expediciones</button>
          <button className={styles.tabActive}>Carga / optimización</button>
          <button>Ruta y paradas</button>
          <button>Costes</button>
          <button>Documentos</button>
        </section>

        <section className={styles.kpis}>
          {[
            ["Peso", totalWeight.toLocaleString("es-ES") + " / " + maxWeight.toLocaleString("es-ES") + " kg", weightPct],
            ["Volumen", totalVolume.toLocaleString("es-ES", { maximumFractionDigits: 3 }) + " / " + maxVolume + " m³", volumePct],
            ["Metros lineales", totalLinear.toLocaleString("es-ES", { maximumFractionDigits: 2 }) + " / " + maxLinear + " ml", linearPct],
          ].map(([label, value, percent]) => (
            <article key={String(label)}>
              <div><span>{label}</span><strong>{percent}%</strong></div>
              <b>{value}</b>
              <div className={styles.progress}><i style={{ width: `${percent}%` }} /></div>
            </article>
          ))}
          <article className={styles.score}>
            <div><span>Índice de ocupación</span><strong>{Math.max(weightPct, volumePct, linearPct)}%</strong></div>
            <b>Factor limitante: {limiting}</b>
            <small>Capacidad calculada con peso, volumen y metros lineales.</small>
          </article>
        </section>

        <section className={styles.insight}>
          <div>
            <p>RECOMENDACIÓN OPERATIVA</p>
            <h2>El camión está limitado principalmente por {limiting}</h2>
            <span>Quedan {(maxWeight-totalWeight).toLocaleString("es-ES")} kg, {(maxVolume-totalVolume).toLocaleString("es-ES", {maximumFractionDigits: 2})} m³ y {(maxLinear-totalLinear).toLocaleString("es-ES", {maximumFractionDigits: 2})} ml disponibles.</span>
          </div>
          <button>Buscar expediciones compatibles</button>
        </section>

        <section className={styles.panel}>
          <div className={styles.panelTitle}>
            <div><p>MANIFIESTO</p><h2>Contenido del viaje por expediciones</h2></div>
            <button>Exportar manifiesto</button>
          </div>
          <div className={styles.tableWrap}>
            <div className={`${styles.row} ${styles.head}`}>
              <span>Partida</span><span>Expedición</span><span>Cliente</span><span>Bultos</span><span>Peso</span><span>Volumen</span><span>M. lineal</span><span>Facturación</span><span>Estado</span>
            </div>
            {loads.map((row) => (
              <div className={styles.row} key={row.part}>
                <strong>{row.part}</strong><span>{row.expedition}</span><span>{row.client}</span><span>{row.packages}</span><span>{row.weight.toLocaleString("es-ES")} kg</span><span>{row.volume.toLocaleString("es-ES", {maximumFractionDigits: 3})} m³</span><span>{row.linear.toLocaleString("es-ES")} ml</span><span>{row.billing}</span><span className={row.status === "Cargada" ? styles.loaded : styles.pending}>{row.status}</span>
              </div>
            ))}
            <div className={`${styles.row} ${styles.total}`}>
              <strong>TOTALES</strong><span>3 expediciones</span><span>7 partidas</span><span>11 bultos</span><span>{totalWeight.toLocaleString("es-ES")} kg</span><span>{totalVolume.toLocaleString("es-ES", {maximumFractionDigits: 3})} m³</span><span>{totalLinear.toLocaleString("es-ES")} ml</span><span>—</span><span>—</span>
            </div>
          </div>
        </section>
      </section>
    </main>
  );
}
