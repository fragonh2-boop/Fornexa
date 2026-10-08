import { notFound } from "next/navigation";
import ModuleView, { isModuleKey } from "@/app/dashboard/[module]/ModuleView";

export default async function DemoModulePage({ params }: { params: Promise<{ module: string }> }) {
  const { module } = await params;
  if (!isModuleKey(module)) notFound();
  return <ModuleView module={module} demo basePath="/demo" />;
}
