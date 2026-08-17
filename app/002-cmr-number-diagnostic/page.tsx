import { createSupabaseAdmin } from "@/lib/supabase-admin";

export const dynamic = "force-static";
export const revalidate = false;

export default async function CmrNumberDiagnosticPage() {
  const supabase = createSupabaseAdmin();
  const yy = String(new Date().getUTCFullYear()).slice(-2);
  const prefix = `CMR-${yy}`;
  const { data, error, count } = await supabase
    .from("cmr_documents")
    .select("cmr_number,source,issued_at", { count: "exact" })
    .like("cmr_number", `${prefix}%`)
    .order("cmr_number", { ascending: false })
    .limit(20);
  const result = { yy, prefix, count, error: error?.message ?? null, rows: data ?? [] };
  console.log("CMR_NUMBER_DIAGNOSTIC", JSON.stringify(result));
  return <pre id="cmr-number-diagnostic">{JSON.stringify(result, null, 2)}</pre>;
}
