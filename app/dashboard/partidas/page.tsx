import PartidasListView from "./PartidasListView";
import { getAuthenticatedOrReviewContext } from "@/lib/auth-context";
import { createSupabaseAdmin } from "@/lib/supabase-admin";

const STATUS_LABELS: Record<string, string> = {
  DRAFT: "Borrador",
  READY: "Preparada",
  PARTIALLY_PLANNED: "Parcialmente planificada",
  PLANNED: "Planificada",
  IN_TRANSIT: "En tránsito",
  COMPLETED: "Completada",
  CANCELLED: "Cancelada",
};

function adrLabel(value: unknown) {
  if (!value || typeof value !== "object") return "—";
  const adr = value as Record<string, unknown>;
  if (adr.declared === false) return "No ADR";
  if (adr.declared === true || String(adr.declared ?? "").toUpperCase() === "S") {
    const regime = String(adr.regime ?? "").trim();
    const un = String(adr.unNumber ?? "").trim();
    return ["ADR", regime, un].filter(Boolean).join(" · ");
  }
  return "Sin declarar";
}

async function getOrders() {
  const auth = await getAuthenticatedOrReviewContext();
  if (!auth) return [];

  const supabase = createSupabaseAdmin();
  const { data, error } = await supabase
    .from("orders")
    .select(`
      id,
      code,
      customer_reference,
      packages,
      gross_weight,
      volume,
      linear_meters,
      goods_description,
      adr,
      status,
      created_at,
      customer:parties!orders_customer_id_fkey ( code, trade_name, legal_name ),
      pickup:party_addresses!orders_pickup_address_id_fkey ( code, city, country_code ),
      delivery:party_addresses!orders_delivery_address_id_fkey ( code, city, country_code ),
      service:service_catalog!orders_service_id_fkey ( name ),
      expeditions ( code, status )
    `)
    .eq("tenant_id", auth.tenantId)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Partidas: error al leer Supabase", error);
    return [];
  }

  return (data ?? []).map((order: any) => {
    const customer = order.customer?.trade_name ?? order.customer?.legal_name ?? "—";
    const origin = order.pickup?.city ?? order.pickup?.code ?? "—";
    const destination = order.delivery?.city ?? order.delivery?.code ?? "—";
    const expedition = order.expeditions?.[0]?.code ?? null;
    const goods = [
      order.packages != null ? `${order.packages} bultos` : null,
      order.gross_weight != null ? `${Number(order.gross_weight).toLocaleString("es-ES")} kg` : null,
      order.volume != null ? `${Number(order.volume).toLocaleString("es-ES")} m³` : null,
    ].filter(Boolean).join(" · ");

    return {
      id: order.code as string,
      customer,
      customerCode: order.customer?.code ?? "—",
      reference: order.customer_reference ?? "—",
      route: `${origin} → ${destination}`,
      goods: goods || order.goods_description || "—",
      service: order.service?.name ?? "—",
      adr: adrLabel(order.adr),
      expedition,
      status: STATUS_LABELS[order.status as string] ?? order.status,
      createdAt: order.created_at as string,
    };
  });
}

export default async function PartidasPage() {
  const items = await getOrders();
  return <PartidasListView items={items} />;
}
