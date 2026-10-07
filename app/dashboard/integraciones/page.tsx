import { isDemoDataAllowed } from "@/lib/demo-mode";
import IntegracionesClient, { type IntegrationsData } from "./IntegracionesClient";

export const dynamic = "force-dynamic";

const EMPTY: IntegrationsData = { connectors: [], queue: [], mappings: [], eventsToday: null };

export default async function IntegracionesPage() {
  if (!isDemoDataAllowed()) return <IntegracionesClient data={EMPTY} />;
  const demo = await import("./demo-fixtures");
  return <IntegracionesClient data={{ connectors: demo.demoConnectors, queue: demo.demoQueue, mappings: demo.demoMappings, eventsToday: demo.demoEventsToday }} />;
}
