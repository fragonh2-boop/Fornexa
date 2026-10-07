import ControlTowerView, { type ControlTowerOverview } from "../components/ControlTowerView";
import { getAuthenticatedOrReviewContext } from "@/lib/auth-context";
import { isDemoDataAllowed } from "@/lib/demo-mode";
import { createSupabaseAdmin } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";

// Illustrative content: rendered ONLY in preview/development (lib/demo-mode.ts).
const metrics = [["128","Expediciones activas","+8,4%"],["34","Entregas previstas hoy","92% a tiempo"],["7","Incidencias abiertas","2 críticas"],["62","Colaboradores disponibles","11 en ruta"]];
const shipments = [["EX-260071","Valencia → Lyon","3 partidas","En tránsito","Hoy 18:30","transit"],["EX-260070","Barcelona → Marseille","2 partidas","Planificada","Mañana 08:00","planned"],["EX-260069","Madrid → Toulouse","1 partida","Entregada","Hoy 11:42","delivered"]];
const parts = [["PT-260184","Mediterránea Retail","Valencia → Lyon","Preparada"],["PT-260183","Nova Distribution","Barcelona → Marseille","Pendiente"],["PT-260182","Atlas Components","Madrid → Toulouse","Asignada"]];
const trips = [["VJ-260041","2 expediciones","La Jonquera","En ruta"],["VJ-260040","1 expedición","Barcelona","Carga prevista"],["VJ-260039","1 expedición","Toulouse","Finalizado"]];

type Overview = ControlTowerOverview;

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
return <ControlTowerView data={data} illustrative={demo} />}
