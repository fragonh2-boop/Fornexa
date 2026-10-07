import { notFound } from "next/navigation";
import { isDemoDataAllowed } from "@/lib/demo-mode";
import VelocityClient from "./VelocityClient";

export const dynamic = "force-dynamic";

// Illustrative collaborator tariff sheet: available only in preview/development.
export default function VelocityPage() {
  if (!isDemoDataAllowed()) notFound();
  return <VelocityClient />;
}
