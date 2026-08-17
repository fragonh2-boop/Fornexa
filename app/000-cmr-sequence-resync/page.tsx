import { createSupabaseAdmin } from "@/lib/supabase-admin";

export const dynamic = "force-static";
export const revalidate = false;

export default async function CmrSequenceResyncPage() {
  const supabase = createSupabaseAdmin();
  const year = String(new Date().getUTCFullYear()).slice(-2);
  const prefix = `CMR-${year}`;
  const { data: latest, error } = await supabase
    .from("cmr_documents")
    .select("cmr_number")
    .like("cmr_number", `${prefix}%`)
    .order("cmr_number", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) return <pre>{JSON.stringify({ ok: false, error: error.message }, null, 2)}</pre>;

  const maxNumber = latest?.cmr_number ?? `${prefix}000000`;
  const maxSuffix = Number(maxNumber.slice(prefix.length)) || 0;
  const burned: string[] = [];
  let last = "";

  for (let attempt = 0; attempt < 500; attempt += 1) {
    const { data, error: rpcError } = await supabase.rpc("next_cmr_number");
    if (rpcError || !data) return <pre>{JSON.stringify({ ok: false, maxNumber, burned, error: rpcError?.message ?? "next_cmr_number returned empty" }, null, 2)}</pre>;
    last = String(data);
    burned.push(last);
    const suffix = Number(last.slice(prefix.length)) || 0;
    if (suffix >= maxSuffix) break;
  }

  return <pre id="cmr-sequence-resync">{JSON.stringify({ ok: true, maxNumber, maxSuffix, last, burnedCount: burned.length, nextExpectedSuffix: (Number(last.slice(prefix.length)) || 0) + 1 }, null, 2)}</pre>;
}
