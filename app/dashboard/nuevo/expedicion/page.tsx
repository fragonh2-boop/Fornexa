import Link from "next/link";
import { redirect } from "next/navigation";
import { getAuthenticatedOrReviewContext } from "@/lib/auth-context";
import { createSupabaseAdmin } from "@/lib/supabase-admin";
import ExpeditionForm, { type AvailableOrder } from "./ExpeditionForm";
import styles from "./expedition-form.module.css";

export const dynamic = "force-dynamic";

function adrLabel(value: unknown) {
  if (!value || typeof value !== "object") return "Sin declarar";
  const adr = value as Record<string, unknown>;
  if (adr.declared === false) return "No ADR";
  if (adr.declared === true || String(adr.declared ?? "").toUpperCase() === "S") {
    return ["ADR", String(adr.regime ?? "").trim(), String(adr.unNumber ?? "").trim()].filter(Boolean).join(" · ");
  }
  return "Sin declarar";
}

export default async function NewExpeditionPage() {
  const auth = await getAuthenticatedOrReviewContext();
  if (!auth) redirect("/login");

  const supabase = createSupabaseAdmin();
  const { data, error } = await supabase
    .from("orders")
    .select(`
      code,status,packages,gross_weight,volume,adr,
      customer:parties!orders_customer_id_fkey(code,trade_name,legal_name),
      pickup:party_addresses!orders_pickup_address_id_fkey(city,code),
      delivery:party_addresses!orders_delivery_address_id_fkey(city,code),
      service:service_catalog!orders_service_id_fkey(name),
      expeditions(id,code)
    `)
    .eq("tenant_id", auth.tenantId)
    .not("status", "in", "(COMPLETED,CANCELLED)")
    .order("created_at", { ascending: false });

  if (error) console.error("Nueva expedición: error al cargar partidas", error);

  const orders: AvailableOrder[] = (data ?? [])
    .filter((order: any) => !(order.expeditions?.length))
    .map((order: any) => ({
      code: order.code,
      customerCode: order.customer?.code ?? "—",
      customer: order.customer?.trade_name ?? order.customer?.legal_name ?? "—",
      route: `${order.pickup?.city ?? order.pickup?.code ?? "—"} → ${order.delivery?.city ?? order.delivery?.code ?? "—"}`,
      service: order.service?.name ?? "—",
      goods: [
        order.packages != null ? `${order.packages} bultos` : null,
        order.gross_weight != null ? `${Number(order.gross_weight).toLocaleString("es-ES")} kg` : null,
        order.volume != null ? `${Number(order.volume).toLocaleString("es-ES")} m³` : null,
      ].filter(Boolean).join(" · ") || "—",
      adr: adrLabel(order.adr),
    }));

  return <main className={styles.page}>
    <header className={styles.header}>
      <div>
        <p>EXPEDIENTE LOGÍSTICO</p>
        <h1>Nuevo expediente</h1>
        <span>Cada Partida pertenece a un único Expediente. Los datos operativos se heredan del pedido para mantener una única fuente de verdad.</span>
      </div>
      <Link href="/dashboard/expediciones">Volver a expedientes</Link>
    </header>
    <ExpeditionForm orders={orders} readOnly={Boolean(auth.isReview)} />
  </main>;
}
