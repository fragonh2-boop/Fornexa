import { NextRequest } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase-admin";
import { POST as createCmr } from "@/app/api/cmr/route";
import { GET as getCmr } from "@/app/api/cmr/[cmr]/route";

export const dynamic = "force-static";
export const revalidate = false;

const ORIGIN = "https://fornexa.vercel.app";
const SOURCE = "e2e-multiexp-proof";
const CODES = ["EX-E2E-MULTI-A", "EX-E2E-MULTI-B"];

export default async function MultiExpeditionCmrProofPage() {
  const supabase = createSupabaseAdmin();
  await supabase.from("cmr_documents").delete().eq("source", SOURCE);
  await supabase.from("expeditions").delete().in("code", CODES);

  const { data: expeditions, error: seedError } = await supabase
    .from("expeditions")
    .insert(CODES.map((code, index) => ({ code, status: "PLANNED", metadata: { source: SOURCE, index } })))
    .select("id,code")
    .order("code");

  if (seedError || !expeditions || expeditions.length !== 2) return finish({ ok: false, stage: "seed", error: seedError?.message ?? "Expected two expeditions" });

  let cmrId = "";
  try {
    const payload = {
      source: SOURCE,
      expediciones: CODES,
      viaje: "VJ-E2E-MULTI",
      customerIds: ["E2E-CUSTOMER"],
      expedidor: "FORNEXA Multi Sender, S.L.", destinatario: "FORNEXA Multi Consignee SAS",
      carga: "Valencia, España", entrega: "Lyon, Francia", transportista: "FORNEXA Multi Carrier, S.L.",
      mercancia: "Mercancía multi-expedición E2E", bultos: "2", embalaje: "Palets", peso: "1200.5", volumen: "6.75",
      senderInstructions: "Prueba N:M", adr: "N"
    };
    const request = new NextRequest(`${ORIGIN}/api/cmr`, { method: "POST", headers: { "content-type": "application/json", origin: ORIGIN }, body: JSON.stringify(payload) });
    const response = await createCmr(request);
    const issued = await response.json();
    if (!response.ok) throw new Error(`POST ${response.status}: ${JSON.stringify(issued)}`);
    cmrId = String(issued.id);

    const { data: bridge, error: bridgeError } = await supabase.from("cmr_expeditions").select("expedition_id,sequence,metadata").eq("cmr_id", cmrId).order("sequence");
    if (bridgeError) throw bridgeError;
    const { data: document, error: documentError } = await supabase.from("cmr_documents").select("cmr_number,expedition_id,metadata,gross_weight,volume").eq("id", cmrId).single();
    if (documentError) throw documentError;

    const detailResponse = await getCmr(new Request(`${ORIGIN}/api/cmr/${encodeURIComponent(issued.cmrNumber)}`, { headers: { "x-fornexa-key": String(issued.cmrKey) } }), { params: Promise.resolve({ cmr: String(issued.cmrNumber) }) });
    const detail = await detailResponse.json();
    const expectedIds = expeditions.map(item => item.id);
    const linkedIds = (bridge ?? []).map(item => item.expedition_id);
    const checks = {
      post201: response.status === 201,
      twoBridgeRows: bridge?.length === 2,
      orderedSequences: bridge?.[0]?.sequence === 1 && bridge?.[1]?.sequence === 2,
      bothExpeditionsLinked: expectedIds.every(id => linkedIds.includes(id)),
      legacyReferenceKeepsFirst: document?.expedition_id === CODES[0],
      metadataKeepsRefs: Array.isArray(document?.metadata?.expeditionRefs) && document.metadata.expeditionRefs.join("|") === CODES.join("|"),
      responseReturnsTwoIds: Array.isArray(issued.expeditionIds) && issued.expeditionIds.length === 2,
      detail200: detailResponse.status === 200,
      detailHasTwoExpeditions: Array.isArray(detail?.canonical?.expeditions) && detail.canonical.expeditions.length === 2,
      decimalsPreserved: Number(document?.gross_weight) === 1200.5 && Number(document?.volume) === 6.75
    };

    const proof = { ok: Object.values(checks).every(Boolean), issued: { id: cmrId, cmrNumber: issued.cmrNumber }, expeditions, bridge, checks };
    return finish(proof);
  } catch (error) {
    return finish({ ok: false, stage: "cmr", error: serializeError(error) });
  } finally {
    if (cmrId) await supabase.from("cmr_documents").delete().eq("id", cmrId);
    await supabase.from("expeditions").delete().in("code", CODES);
  }
}

function finish(value: unknown) {
  console.log("CMR_MULTIEXP_E2E", JSON.stringify(value));
  return <pre id="cmr-multiexp-proof">{JSON.stringify(value, null, 2)}</pre>;
}
function serializeError(error: unknown) {
  if (error instanceof Error) return { name: error.name, message: error.message, stack: error.stack?.split("\n").slice(0, 8) };
  try { return JSON.parse(JSON.stringify(error)); } catch { return String(error); }
}
