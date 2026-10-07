import IntegracionesClient from "../../dashboard/integraciones/IntegracionesClient";
import { previewDemoEmailHistory, previewDemoIntegrations } from "@/lib/preview-demo-specialized";

export default function DemoIntegrationsPage() {
  return <IntegracionesClient data={previewDemoIntegrations} basePath="/demo" simulation emailHistory={previewDemoEmailHistory} />;
}
