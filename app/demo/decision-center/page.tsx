import { redirect } from "next/navigation";

// Decision Center was retired on 8 Oct 2026; old demo links land on the demo Control Tower.
export default function RetiredDemoDecisionCenterPage() {
  redirect("/demo");
}
