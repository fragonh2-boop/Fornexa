import { notFound } from "next/navigation";
import { isDemoDataAllowed } from "@/lib/demo-mode";
import ModuleView, { isModuleKey } from "./ModuleView";

export const dynamic = "force-dynamic";
export default async function ModulePage({ params }: { params: Promise<{ module: string }> }) {
  const { module } = await params;
  if (!isModuleKey(module)) notFound();
  return <ModuleView module={module} demo={isDemoDataAllowed()} />;
}
