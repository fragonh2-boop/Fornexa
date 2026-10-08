import ControlTowerView from "../components/ControlTowerView";
import { previewDemoOverview } from "@/lib/preview-demo-overview";

export default function DemoPage() {
  return <ControlTowerView data={previewDemoOverview} illustrative basePath="/demo" />;
}
