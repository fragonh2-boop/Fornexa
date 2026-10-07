import PartidasListView from "../../dashboard/partidas/PartidasListView";
import { DEMO_PARTIDAS } from "@/lib/demo-operational-lists";

export default function DemoPartidasPage() {
  return <PartidasListView items={DEMO_PARTIDAS} basePath="/demo" />;
}
