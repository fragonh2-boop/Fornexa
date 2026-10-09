import TraceabilityView from "@/app/dashboard/trazabilidad/TraceabilityView";
import { previewDemoTraceability } from "@/lib/preview-demo-traceability";

export default async function DemoTraceabilityPage({ searchParams }: { searchParams: Promise<{ q?: string | string[]; p?: string | string[] }> }) {
  const params = await searchParams;
  const q = Array.isArray(params.q) ? params.q[0] : params.q;
  const p = Array.isArray(params.p) ? params.p[0] : params.p;
  return <TraceabilityView result={previewDemoTraceability(q, p)} basePath="/demo" simulation />;
}
