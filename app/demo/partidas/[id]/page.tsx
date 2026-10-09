import { notFound } from "next/navigation";
import OrderEditorWorkspace, { type OrderDetailData } from "@/app/components/OrderEditorWorkspace";
import { DEMO_PARTIDAS } from "@/lib/demo-operational-lists";

export default async function DemoOrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const decodedId = decodeURIComponent(id);
  const demoItem = DEMO_PARTIDAS.find(item => item.id === decodedId);

  const routeParts = demoItem?.route.split("→").map(s => s.trim()) ?? ["Ciudad de Muestra", "Villa de Pruebas"];

  const orderData: OrderDetailData = {
    id: decodedId,
    code: decodedId,
    status: demoItem?.status ?? "Preparada",
    customer: demoItem?.customer ?? "Cliente ficticio Aurora",
    customerCode: demoItem?.customerCode ?? "DEMO-C01",
    reference: demoItem?.reference ?? `REF-${decodedId}`,
    service: demoItem?.service ?? "Grupaje",
    packages: 12,
    grossWeight: 180,
    volume: 1.5,
    linearMeters: 0.8,
    goodsDescription: demoItem?.goods ?? "12 bultos · 180 kg · 1,5 m³",
    adr: demoItem?.adr ?? "No ADR",
    origin: {
      code: "REC-DEMO",
      name: routeParts[0] || "Origen",
      address: "Calle Ficticia de Origen, 10",
      postalCode: "00001",
      city: routeParts[0] || "Ciudad de Muestra",
      countryCode: "ES",
    },
    destination: {
      code: "ENT-DEMO",
      name: routeParts[1] || "Destino",
      address: "Avenida de Entrega Ficticia, 20",
      postalCode: "00002",
      city: routeParts[1] || "Villa de Pruebas",
      countryCode: "ES",
    },
    expedition: demoItem?.expedition ?? null,
    createdAt: demoItem?.createdAt ?? "2026-10-07T08:00:00Z",
  };

  return <OrderEditorWorkspace order={orderData} basePath="/demo" simulation />;
}
