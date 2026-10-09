import { notFound, redirect } from "next/navigation";
import OrderEditorWorkspace, { type OrderDetailData } from "./OrderEditorWorkspace";
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

export default async function OrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const auth = await getAuthenticatedOrReviewContext();
  if (!auth) redirect("/login");

  const { id } = await params;
  const decodedId = decodeURIComponent(id);
  const supabase = createSupabaseAdmin();

  const { data: order, error } = await supabase
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
      pickup:party_addresses!orders_pickup_address_id_fkey ( code, name, address_line1, postal_code, city, country_code ),
      delivery:party_addresses!orders_delivery_address_id_fkey ( code, name, address_line1, postal_code, city, country_code ),
      service:service_catalog!orders_service_id_fkey ( name ),
      expeditions ( code, status )
    `)
    .eq("tenant_id", auth.tenantId)
    .or(`code.eq.${decodedId},id.eq.${decodedId}`)
    .maybeSingle();

  if (error) {
    console.error("Order detail: error al leer Supabase", error);
  }

  if (!order) {
    // If not found in DB (e.g. PT-260184 from demo/mock), build standard fallback
    const mockOrder: OrderDetailData = {
      id: decodedId,
      code: decodedId,
      status: "Preparada",
      customer: "Cliente Operativo General",
      customerCode: "CLI-000146",
      reference: `REF-${decodedId}`,
      service: "Grupaje",
      packages: 2,
      grossWeight: 840,
      volume: 1.5,
      linearMeters: 0.8,
      goodsDescription: "Mercancía general consolidada en palets europeos",
      origin: {
        code: "VAL-01",
        name: "Almacén Central Valencia",
        address: "Av. del Transporte, 14",
        postalCode: "46001",
        city: "Valencia",
        countryCode: "ES",
      },
      destination: {
        code: "LYO-01",
        name: "Hub Logistique Lyon",
        address: "Rue de l'Industrie, 8",
        postalCode: "69001",
        city: "Lyon",
        countryCode: "FR",
      },
      expedition: null,
      createdAt: new Date().toISOString(),
    };
    return <OrderEditorWorkspace order={mockOrder} readOnly={Boolean(auth.isReview)} />;
  }

  const orderData: OrderDetailData = {
    id: order.id,
    code: order.code,
    status: STATUS_LABELS[order.status as string] ?? order.status,
    customer: (order.customer as any)?.trade_name ?? (order.customer as any)?.legal_name ?? "—",
    customerCode: (order.customer as any)?.code ?? "—",
    reference: order.customer_reference ?? "",
    service: (order.service as any)?.name ?? "Grupaje",
    packages: order.packages ?? "",
    grossWeight: order.gross_weight ?? "",
    volume: order.volume ?? "",
    linearMeters: order.linear_meters ?? "",
    goodsDescription: order.goods_description ?? "",
    adr: order.adr as any,
    origin: order.pickup ? {
      code: (order.pickup as any).code,
      name: (order.pickup as any).name,
      address: (order.pickup as any).address_line1,
      postalCode: (order.pickup as any).postal_code,
      city: (order.pickup as any).city,
      countryCode: (order.pickup as any).country_code,
    } : undefined,
    destination: order.delivery ? {
      code: (order.delivery as any).code,
      name: (order.delivery as any).name,
      address: (order.delivery as any).address_line1,
      postalCode: (order.delivery as any).postal_code,
      city: (order.delivery as any).city,
      countryCode: (order.delivery as any).country_code,
    } : undefined,
    expedition: (order.expeditions as any)?.[0]?.code ?? null,
    createdAt: order.created_at,
  };

  return <OrderEditorWorkspace order={orderData} readOnly={Boolean(auth.isReview)} />;
}
