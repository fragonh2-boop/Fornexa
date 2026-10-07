import Link from "next/link";
import { getAuthenticatedOrReviewContext } from "@/lib/auth-context";
import { isDemoDataAllowed } from "@/lib/demo-mode";
import { createSupabaseAdmin } from "@/lib/supabase-admin";
import styles from "./dashboard.module.css";

export const dynamic = "force-dynamic";

// Illustrative content: rendered ONLY in preview/development (lib/demo-mode.ts).
const metrics = [["128","Expediciones activas","+8,4%"],["34","Entregas previstas hoy","92% a tiempo"],["7","Incidencias abiertas","2 críticas"],["62","Colaboradores disponibles","11 en ruta"]];
const shipments = [["EX-260071","Valencia → Lyon","3 partidas","En tránsito","Hoy 18:30","transit"],["EX-260070","Barcelona → Marseille","2 partidas","Planificada","Mañana 08:00","planned"],["EX-260069","Madrid → Toulouse","1 partida","Entregada","Hoy 11:42","delivered"]];
const parts = [["PT-260184","Mediterránea Retail","Valencia → Lyon","Preparada"],["PT-260183","Nova Distribution","Barcelona → Marseille","Pendiente"],["PT-260182","Atlas Components","Madrid → Toulouse","Asignada"]];
const trips = [["VJ-260041","2 expediciones","La Jonquera","En ruta"],["VJ-260040","1 expedición","Barcelona","Carga prevista"],["VJ-260039","1 expedición","Toulouse","Finalizado"]];

type Overview = { metrics: string[][]; shipments: string[][]; parts: string[][]; trips: string[][]; readError?: boolean };

const DEMO: Overview = { metrics, shipments, parts, trips };
const METRIC_LABELS = ["Expediciones activas","Partidas abiertas","Viajes en curso","CMR emitidos"];
const EMPTY: Overview = { metrics: METRIC_LABELS.map(label => ["0", label, ""]), shipments: [], parts: [], trips: [] };
// A read failure must never look like a real zero: show "—" and an explicit notice.
const UNAVAILABLE: Overview = { metrics: METRIC_LABELS.map(label => ["—", label, ""]), shipments: [], parts: [], trips: [], readError: true };

const ORDER_STATUS: Record<string,string> = { DRAFT:"Borrador", READY:"Preparada", PARTIALLY_PLANNED:"Parcialmente planificada", PLANNED:"Planificada", IN_TRANSIT:"En tránsito", COMPLETED:"Completada", CANCELLED:"Cancelada" };
const EXPEDITION_STATUS: Record<string,string> = { DRAFT:"Borrador", PLANNED:"Planificada", ASSIGNED:"Asignada", IN_TRANSIT:"En tránsito", DELIVERED:"Entregada", CLOSED:"Cerrada", CANCELLED:"Cancelada" };
const TRIP_STATUS: Record<string,string> = { DRAFT:"Borrador", PLANNED:"Planificado", READY:"Preparado", IN_PROGRESS:"En curso", COMPLETED:"Finalizado", CANCELLED:"Cancelado" };

function expeditionTone(status: string) {
  if (status === "IN_TRANSIT") return "transit";
  if (status === "DELIVERED" || status === "CLOSED") return "delivered";
  return "planned";
}

function plural(n: number, one: string, many: string) { return `${n} ${n === 1 ? one : many}`; }

async function readRealOverview(): Promise<Overview> {
  const auth = await getAuthenticatedOrReviewContext();
  if (!auth) return EMPTY;
  const supabase = createSupabaseAdmin();
  const tenant = auth.tenantId;
  const count = (table: string) => supabase.from(table).select("id", { count: "exact", head: true }).eq("tenant_id", tenant);

  const [activeExpeditions, openOrders, runningTrips, cmrs, lastOrders, lastExpeditions, lastTrips] = await Promise.all([
    count("expeditions").not("status", "in", "(DELIVERED,CLOSED,CANCELLED)"),
    count("orders").not("status", "in", "(COMPLETED,CANCELLED)"),
    count("trips").eq("status", "IN_PROGRESS"),
    count("cmr_documents"),
    supabase.from("orders").select("code,status,customer:parties!orders_customer_id_fkey(trade_name,legal_name),pickup:party_addresses!orders_pickup_address_id_fkey(city),delivery:party_addresses!orders_delivery_address_id_fkey(city)").eq("tenant_id", tenant).order("created_at", { ascending: false }).limit(3),
    supabase.from("expeditions").select("code,status,origin:party_addresses!expeditions_origin_address_id_fkey(city),destination:party_addresses!expeditions_destination_address_id_fkey(city),trip_expeditions(sequence)").eq("tenant_id", tenant).order("created_at", { ascending: false }).limit(3),
    supabase.from("trips").select("code,status,planned_start,trip_expeditions(sequence)").eq("tenant_id", tenant).order("created_at", { ascending: false }).limit(3),
  ]);

  const failed = [activeExpeditions, openOrders, runningTrips, cmrs, lastOrders, lastExpeditions, lastTrips].filter(result => result.error);
  if (failed.length > 0) {
    console.error("Control Tower: error al leer Supabase", { failedQueries: failed.length, codes: failed.map(result => result.error?.code ?? "unknown") });
    return UNAVAILABLE;
  }

  /* eslint-disable @typescript-eslint/no-explicit-any */
  const parts = ((lastOrders.data ?? []) as any[]).map(o => [
    String(o.code),
    o.customer?.trade_name || o.customer?.legal_name || "—",
    `${o.pickup?.city || "—"} → ${o.delivery?.city || "—"}`,
    ORDER_STATUS[o.status] ?? String(o.status ?? "—"),
  ]);
  const shipments = ((lastExpeditions.data ?? []) as any[]).map(e => [
    String(e.code),
    `${e.origin?.city || "—"} → ${e.destination?.city || "—"}`,
    e.trip_expeditions?.length ? plural(e.trip_expeditions.length, "viaje", "viajes") : "Sin viaje",
    EXPEDITION_STATUS[e.status] ?? String(e.status ?? "—"),
    "—",
    expeditionTone(String(e.status)),
  ]);
  const trips = ((lastTrips.data ?? []) as any[]).map(t => [
    String(t.code),
    plural(t.trip_expeditions?.length ?? 0, "expedición", "expediciones"),
    t.planned_start ? new Date(t.planned_start).toLocaleDateString("es-ES") : "—",
    TRIP_STATUS[t.status] ?? String(t.status ?? "—"),
  ]);
  /* eslint-enable @typescript-eslint/no-explicit-any */

  return {
    metrics: [
      [String(activeExpeditions.count ?? 0), "Expediciones activas", ""],
      [String(openOrders.count ?? 0), "Partidas abiertas", ""],
      [String(runningTrips.count ?? 0), "Viajes en curso", ""],
      [String(cmrs.count ?? 0), "CMR emitidos", ""],
    ],
    shipments, parts, trips,
  };
}

async function getRealOverview(): Promise<Overview> {
  try {
    return await readRealOverview();
  } catch (error) {
    console.error("Control Tower: lectura de datos no disponible", error instanceof Error ? error.name : "unknown");
    return UNAVAILABLE;
  }
}

export default async function DashboardPage(){
const demo = isDemoDataAllowed();
const data = demo ? DEMO : await getRealOverview();
return <main className={styles.shell}>
<aside className={styles.sidebar}><Link href="/dashboard" className={styles.brand}>FORNEXA</Link><nav className={styles.nav}><Link className={styles.active} href="/dashboard">Control Tower</Link><Link href="/dashboard/decision-center">Decision Center</Link><Link href="/dashboard/partidas">Partidas</Link><Link href="/dashboard/expediciones">Expediciones</Link><Link href="/dashboard/viajes">Viajes</Link><Link href="/dashboard/aduanas">Aduanas</Link><Link href="/dashboard/ofertas-tarifas">Ofertas y tarifas</Link><Link href="/dashboard/clientes">Clientes</Link><Link href="/dashboard/colaboradores">Colaboradores</Link><Link href="/dashboard/almacenes">Almacenes</Link><Link href="/dashboard/tracking">Tracking</Link><Link href="/dashboard/epod-cmr">ePOD & CMR</Link><Link href="/dashboard/integraciones">Integraciones</Link><Link href="/dashboard/informes">Informes</Link></nav><div className={styles.sidebarFooter}><span>FORNEXA Suite</span><small>{demo?"Entorno de demostración":"Datos reales"}</small></div></aside>
<section className={styles.content}><header className={styles.header}><div><p className={styles.eyebrow}>CONTROL TOWER</p><h1>{demo?"Buenos días, Fran":"Resumen operativo"}</h1><p>Resumen operativo de tu cadena de suministro.</p></div><div className={styles.actions}><Link href="/dashboard/decision-center"><button type="button" className={styles.secondary}>Decisiones IA</button></Link><Link href="/dashboard/importar"><button type="button" className={styles.secondary}>Importar Excel</button></Link><Link href="/dashboard/nuevo/partida"><button type="button">+ Nueva partida</button></Link><div className={styles.avatar}>FG</div></div></header>
{data.readError&&<p role="alert" className={styles.itemState}>No se han podido leer los datos operativos. Las cifras no están disponibles en este momento.</p>}<section className={styles.metrics}>{data.metrics.map(([v,l,n])=><article key={l}><div className={styles.metricTop}><span>{l}</span><strong>{n}</strong></div><b>{v}</b></article>)}</section>
<section className={styles.operationsGrid}>
<article className={styles.panel}><div className={styles.panelTitle}><div><p className={styles.eyebrow}>MIS PEDIDOS</p><h2>Últimas partidas</h2></div><Link href="/dashboard/partidas" className={styles.textButton}>Ver todas</Link></div><div className={styles.table}><div className={`${styles.rowFour} ${styles.head}`}><span>ID</span><span>Cliente</span><span>Ruta</span><span>Estado</span></div>{data.parts.length===0&&<p className={styles.itemState}>Sin partidas registradas.</p>}{data.parts.map(([id,c,r,s])=><Link href={demo?`/dashboard/registros/partidas/${id}`:"/dashboard/partidas"} className={styles.rowFour} key={id}><strong>{id}</strong><span>{c}</span><span>{r}</span><span className={styles.itemState}>{s}</span></Link>)}</div></article>
<article className={styles.panel}><div className={styles.panelTitle}><div><p className={styles.eyebrow}>OPERATIVA</p><h2>Últimas expediciones</h2></div><Link href="/dashboard/expediciones" className={styles.textButton}>Ver todas</Link></div><div className={styles.table}><div className={`${styles.row} ${styles.head}`}><span>ID</span><span>Ruta</span><span>Partidas</span><span>Estado</span><span>Previsión</span></div>{data.shipments.length===0&&<p className={styles.itemState}>Sin expediciones registradas.</p>}{data.shipments.map(([id,r,c,s,e,sc])=><Link href={demo?`/dashboard/registros/expediciones/${id}`:"/dashboard/expediciones"} className={styles.row} key={id}><strong>{id}</strong><span>{r}</span><span>{c}</span><span className={`${styles.status} ${styles[sc]}`}>{s}</span><span>{e}</span></Link>)}</div></article>
<article className={styles.panel}><div className={styles.panelTitle}><div><p className={styles.eyebrow}>TRANSPORTE</p><h2>Últimos viajes</h2></div><Link href="/dashboard/viajes" className={styles.textButton}>Ver todos</Link></div><div className={styles.table}><div className={`${styles.rowTrips} ${styles.head}`}><span>ID</span><span>Expediciones</span><span>{demo?"Situación":"Salida prevista"}</span><span>Estado</span></div>{data.trips.length===0&&<p className={styles.itemState}>Sin viajes registrados.</p>}{data.trips.map(([id,e,l,s])=><Link href={demo?"/dashboard/viajes":`/dashboard/viajes/${id}`} className={styles.rowTrips} key={id}><strong>{id}</strong><span>{e}</span><span>{l}</span><span className={styles.itemState}>{s}</span></Link>)}</div></article>
</section></section></main>}
