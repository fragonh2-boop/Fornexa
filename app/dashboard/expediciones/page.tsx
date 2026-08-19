import Link from "next/link";
import AppShell from "../../components/AppShell";
import DataGrid from "../../components/DataGrid";
import { getAuthenticatedOrReviewContext } from "@/lib/auth-context";
import { createSupabaseAdmin } from "@/lib/supabase-admin";
import styles from "./expediciones.module.css";

const STATUS_LABELS: Record<string, string> = {
  DRAFT: "Borrador",
  PLANNED: "Planificado",
  ASSIGNED: "Asignado",
  IN_TRANSIT: "En tránsito",
  DELIVERED: "Entregado",
  CLOSED: "Cerrado",
  CANCELLED: "Cancelado",
};

async function getExpeditions() {
  const auth = await getAuthenticatedOrReviewContext();
  if (!auth) return [];

  const supabase = createSupabaseAdmin();
  const { data, error } = await supabase
    .from("expeditions")
    .select(`
      id,
      code,
      status,
      created_at,
      order:orders!expeditions_order_id_fkey ( code ),
      origin:party_addresses!expeditions_origin_address_id_fkey ( city, country_code ),
      destination:party_addresses!expeditions_destination_address_id_fkey ( city, country_code ),
      service:service_catalog!expeditions_service_id_fkey ( name ),
      expedition_delivery_notes ( delivery_note_id ),
      trip_expeditions (
        sequence,
        trip:trips!trip_expeditions_trip_id_fkey ( code, status )
      )
    `)
    .eq("tenant_id", auth.tenantId)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Expediciones: error al leer Supabase", error);
    return [];
  }

  return (data ?? []).map((expedition: any) => {
    const trips = [...(expedition.trip_expeditions ?? [])].sort((a: any, b: any) => (a.sequence ?? 0) - (b.sequence ?? 0));
    const currentTrip = [...trips].reverse().find((leg: any) => leg.trip?.status === "IN_PROGRESS") ?? trips[trips.length - 1];

    return {
      id: expedition.code as string,
      pedido: expedition.order?.code ?? null,
      albaranesCount: expedition.expedition_delivery_notes?.length ?? 0,
      origen: expedition.origin?.city ?? null,
      destino: expedition.destination?.city ?? null,
      servicio: expedition.service?.name ?? null,
      estado: STATUS_LABELS[expedition.status as string] ?? (expedition.status as string),
      viajesCount: trips.length,
      viajeActual: currentTrip?.trip?.code ?? null,
      createdAt: expedition.created_at as string,
    };
  });
}

export default async function ExpedicionesPage() {
  const items = await getExpeditions();

  const rows = items.map((item) => ({
    id: item.id,
    pedido: item.pedido || "—",
    albaranes: `${item.albaranesCount} ${item.albaranesCount === 1 ? "albarán" : "albaranes"}`,
    ruta: `${item.origen || "—"} → ${item.destino || "—"}`,
    viajes: item.viajesCount
      ? `${item.viajesCount} ${item.viajesCount === 1 ? "viaje" : "viajes"}${item.viajeActual ? ` · actual ${item.viajeActual}` : ""}`
      : "Sin asignar",
    servicio: item.servicio || "Varios",
    estado: item.estado || "Planificado",
  }));

  const groupedAlbaranes = items.reduce((total, item) => total + item.albaranesCount, 0);
  const multiTrip = items.filter((item) => item.viajesCount > 1).length;
  const activos = items.filter((item) => item.estado !== "Entregado" && item.estado !== "Cerrado").length;

  return (
    <AppShell>
      <div className={styles.page}>
        <header className={styles.header}>
          <div>
            <p className={styles.eyebrow}>EXPEDIENTE LOGÍSTICO</p>
            <h1>Expedientes</h1>
            <p>Unidad operativa persistente: nace de un pedido y puede recorrer uno o varios viajes.</p>
          </div>
          <div className={styles.actions}>
            <button className={styles.secondary}>Importar Excel</button>
            <Link href="/dashboard/nuevo/expedicion" className={styles.primary}>+ Nuevo expediente</Link>
            <div className={styles.avatar}>FG</div>
          </div>
        </header>

        <section className={styles.metrics}>
          <article><span>Activos</span><strong>{activos}</strong></article>
          <article><span>Albaranes consolidados</span><strong>{groupedAlbaranes}</strong></article>
          <article><span>Multiviaje</span><strong>{multiTrip}</strong></article>
          <article><span>Último expediente</span><strong className={styles.lastId}>{items[0]?.id ?? "—"}</strong></article>
        </section>

        <section className={styles.panel}>
          <DataGrid
            storageKey="expediciones"
            columns={[
              { key: "id", label: "Expediente" },
              { key: "pedido", label: "Pedido" },
              { key: "albaranes", label: "Albaranes" },
              { key: "ruta", label: "Ruta" },
              { key: "viajes", label: "Viajes / tramo actual" },
              { key: "servicio", label: "Servicio" },
              { key: "estado", label: "Estado" },
            ]}
            rows={rows}
            searchPlaceholder="Buscar por expediente, pedido, viaje, ruta, servicio o estado"
            emptyMessage="No hay expedientes todavía. Se crean automáticamente al consolidar albaranes de un pedido."
          />
        </section>
      </div>
    </AppShell>
  );
}
