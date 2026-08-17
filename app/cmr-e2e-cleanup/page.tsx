import { createSupabaseAdmin } from "@/lib/supabase-admin";

export const dynamic = "force-static";
export const revalidate = false;

export default async function CmrE2eCleanupPage() {
  const supabase = createSupabaseAdmin();
  const sources = ["e2e-build-proof", "e2e-build-proof-v2", "e2e-final-proof", "e2e-test"];
  const { data: deletedCmrs, error: cmrError } = await supabase.from("cmr_documents").delete().in("source", sources).select("id,cmr_number,source");
  const { data: deletedExpeditions, error: expeditionError } = await supabase.from("expeditions").delete().eq("code", "EX-E2E-FINAL").select("id,code");
  const result = {
    ok: !cmrError && !expeditionError,
    deletedCmrs: deletedCmrs ?? [],
    deletedExpeditions: deletedExpeditions ?? [],
    cmrError: cmrError?.message ?? null,
    expeditionError: expeditionError?.message ?? null
  };
  console.log("CMR_E2E_CLEANUP", JSON.stringify(result));
  return <pre>{JSON.stringify(result, null, 2)}</pre>;
}
