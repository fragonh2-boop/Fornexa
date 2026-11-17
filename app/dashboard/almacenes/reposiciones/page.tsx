import { notFound } from "next/navigation";
import { isWmsE2Enabled } from "../../../../lib/wms-e2-rollout";
import WmsWorkspace from "../WmsWorkspace";

export const dynamic = "force-dynamic";

export default function ReposicionesPage() {
  if (!isWmsE2Enabled()) notFound();
  return <WmsWorkspace defaultTab="Reposición Interna" />;
}
