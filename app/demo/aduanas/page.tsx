import CustomsListView from "../../dashboard/aduanas/CustomsListView";
import { DEMO_CUSTOMS_CASES } from "@/lib/preview-demo-master-lists";

export default function DemoCustomsPage() {
  return <CustomsListView cases={DEMO_CUSTOMS_CASES} basePath="/demo" />;
}
