import CmrListView from "../../dashboard/epod-cmr/CmrListView";
import { DEMO_CMR_ROWS } from "@/lib/preview-demo-master-lists";

export default function DemoCmrPage() {
  return <CmrListView rows={DEMO_CMR_ROWS} basePath="/demo" />;
}
