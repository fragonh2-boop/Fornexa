import TelematicsHubView from "../../../dashboard/integraciones/telematica/TelematicsHubView";
import { previewDemoTelematicsProviders, previewDemoTelematicsReadiness } from "@/lib/preview-demo-specialized";

export default function DemoTelematicsPage() {
  return <TelematicsHubView providers={previewDemoTelematicsProviders} readiness={previewDemoTelematicsReadiness} basePath="/demo" simulation />;
}
