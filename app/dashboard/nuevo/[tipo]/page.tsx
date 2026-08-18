import { notFound } from "next/navigation";
import CreationForm from "./CreationForm";
import PartidaHotkeys from "./PartidaHotkeys";

const allowed = ["partida", "expedicion", "viaje"] as const;
export type CreationType = (typeof allowed)[number];

export default async function NewOperationalEntityPage({ params }: { params: Promise<{ tipo: string }> }) {
  const { tipo } = await params;
  if (!allowed.includes(tipo as CreationType)) notFound();
  const type = tipo as CreationType;
  return <>{type === "partida" && <PartidaHotkeys />}<CreationForm type={type} /></>;
}
