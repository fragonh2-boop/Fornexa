import NewExpeditionView from "../../../dashboard/nuevo/expedicion/NewExpeditionView";
import { DEMO_AVAILABLE_ORDERS } from "@/lib/demo-operational-forms";

export default function DemoNewExpeditionPage() {
  return <NewExpeditionView orders={DEMO_AVAILABLE_ORDERS} simulation basePath="/demo" />;
}
