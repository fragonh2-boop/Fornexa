import { redirect } from "next/navigation";
import { getAuthenticatedOrReviewContext } from "@/lib/auth-context";
import { createSupabaseAdmin } from "@/lib/supabase-admin";
import { emptyTraceResult, normalizeTraceQuery } from "@/lib/traceability";
import { loadTraceability } from "@/lib/traceability-loader";
import TraceabilityView from "./TraceabilityView";

export const dynamic = "force-dynamic";

async function userResolver(supabase: ReturnType<typeof createSupabaseAdmin>, tenantId: string) {
  // Names of the company's own users only; anyone else stays anonymous.
  const { data: members } = await supabase.from("tenant_members").select("user_id").eq("tenant_id", tenantId);
  const ids = new Set((members ?? []).map(member => member.user_id as string));
  if (!ids.size) return () => undefined;
  const names = new Map<string, string>();
  for (let page = 1; page <= 10 && names.size < ids.size; page += 1) {
    const { data } = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
    const users = data?.users ?? [];
    for (const user of users) if (ids.has(user.id)) names.set(user.id, String(user.user_metadata?.display_name ?? user.user_metadata?.full_name ?? user.email ?? "Usuario de la empresa"));
    if (users.length < 1000) break;
  }
  return (id: string) => names.get(id);
}

export default async function TraceabilityPage({ searchParams }: { searchParams: Promise<{ q?: string | string[]; p?: string | string[] }> }) {
  const auth = await getAuthenticatedOrReviewContext();
  if (!auth) redirect("/login");
  const params = await searchParams;
  const q = Array.isArray(params.q) ? params.q[0] : params.q;
  const p = Array.isArray(params.p) ? params.p[0] : params.p;
  const query = normalizeTraceQuery(q);
  if (!query) return <TraceabilityView result={emptyTraceResult()} />;

  let result;
  try {
    const supabase = createSupabaseAdmin();
    const resolveUser = auth.isReview ? () => undefined : await userResolver(supabase, auth.tenantId);
    result = await loadTraceability(supabase, auth.tenantId, query, p, { resolveUser });
  } catch (error) {
    console.error("Trazabilidad: consulta no disponible.", error instanceof Error ? error.message : "error");
    result = emptyTraceResult(query, "error");
  }
  return <TraceabilityView result={result} />;
}
