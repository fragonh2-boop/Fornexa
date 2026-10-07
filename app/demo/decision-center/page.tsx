import DecisionCenterView from "../../dashboard/decision-center/DecisionCenterView";
import { previewDemoDecisions } from "@/lib/preview-demo-specialized";

export default function DemoDecisionCenterPage() {
  return <DecisionCenterView data={previewDemoDecisions} basePath="/demo" simulation />;
}
