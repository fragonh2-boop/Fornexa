import { notFound } from "next/navigation";
import CreationForm from "./CreationForm";

const allowed = ["partida", "expedicion", "viaje"] as const;
export type CreationType = (typeof allowed)[number];

export default async function NewOperationalEntityPage({ params }: { params: Promise<{ tipo: string }> }) {
  const { tipo } = await params;
  if (!allowed.includes(tipo as CreationType)) notFound();
  return <CreationForm type={tipo as CreationType} />;
}
