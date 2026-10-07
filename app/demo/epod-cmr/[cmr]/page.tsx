import { notFound } from "next/navigation";
import CmrDocumentWorkspace from "@/app/dashboard/epod-cmr/[cmr]/CmrDocumentWorkspace";
import { previewDemoCmrDocument } from "@/lib/preview-demo-cmr-document";

export default async function DemoCmrPage({ params }: { params: Promise<{ cmr: string }> }) {
  const { cmr } = await params;
  const demoData = previewDemoCmrDocument(cmr);
  if (!demoData) notFound();
  return <CmrDocumentWorkspace demoData={demoData} />;
}
