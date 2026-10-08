import ViajesListView from "../../dashboard/viajes/ViajesListView";
import { DEMO_VIAJES } from "@/lib/demo-operational-lists";

export default function DemoViajesPage() {
  return <ViajesListView items={DEMO_VIAJES} basePath="/demo" />;
}
