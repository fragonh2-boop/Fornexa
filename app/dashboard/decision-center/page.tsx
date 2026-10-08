import { redirect } from "next/navigation";

// Decision Center was retired on 8 Oct 2026; old links land on Control Tower.
export default function RetiredDecisionCenterPage() {
  redirect("/dashboard");
}
