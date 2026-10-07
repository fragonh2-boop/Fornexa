import { notFound } from "next/navigation";
import RecordEditor from "@/app/dashboard/registros/[module]/[id]/RecordEditor";

const modules = new Set(["partidas", "expediciones", "viajes", "clientes", "aduanas", "colaboradores", "ofertas-tarifas", "almacenes", "informes"]);
export default async function DemoRecordPage({ params }: { params: Promise<{ module: string; id: string }> }) {
  const { module, id } = await params;
  if (!modules.has(module)) notFound();
  return <RecordEditor key={`${module}:${id}`} module={module} id={id} simulation />;
}
