import ExpedicionesListView from "../../dashboard/expediciones/ExpedicionesListView";
import { DEMO_EXPEDICIONES } from "@/lib/demo-operational-lists";

export default function DemoExpedicionesPage() {
  return <ExpedicionesListView items={DEMO_EXPEDICIONES} basePath="/demo" />;
}
