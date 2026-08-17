import { createSupabaseAdmin } from "@/lib/supabase-admin";

export const dynamic = "force-static";
export const revalidate = false;

const PARTY_CODE = "TER-E2E-CARD";
const ORDER_CODE = "PT-E2E-CARD";
const EXP_CODES = ["EX-E2E-CARD-A", "EX-E2E-CARD-B"];

export default async function OrderExpeditionCardinalityProofPage() {
  const supabase = createSupabaseAdmin();
  let partyId = "";
  let orderId = "";
  try {
    await supabase.from("expeditions").delete().in("code", EXP_CODES);
    await supabase.from("orders").delete().eq("code", ORDER_CODE);
    await supabase.from("parties").delete().eq("code", PARTY_CODE);

    const { data: migration } = await supabase.from("fornexa_schema_migrations").select("version,applied_at").eq("version", "20260818_fix_order_expedition_cardinality").maybeSingle();

    const { data: party, error: partyError } = await supabase.from("parties").insert({ code: PARTY_CODE, legal_name: "E2E Cardinality Customer", tax_id: "E2E-CARD-20260818", country_code: "ES", is_customer: true, metadata: { e2e: true } }).select("id").single();
    if (partyError || !party) throw partyError ?? new Error("party seed failed");
    partyId = party.id;

    const { data: order, error: orderError } = await supabase.from("orders").insert({ code: ORDER_CODE, customer_id: partyId, status: "READY", goods_description: "Cardinality E2E", metadata: { e2e: true } }).select("id,code").single();
    if (orderError || !order) throw orderError ?? new Error("order seed failed");
    orderId = order.id;

    const { data: expeditions, error: expeditionError } = await supabase.from("expeditions").insert(EXP_CODES.map(code => ({ code, order_id: orderId, status: "PLANNED", metadata: { e2e: true } }))).select("id,code,order_id").order("code");

    const proof = {
      ok: !expeditionError && expeditions?.length === 2,
      migrationRecorded: Boolean(migration),
      migration,
      order: { id: orderId, code: ORDER_CODE },
      expeditions: expeditions ?? [],
      error: expeditionError ? { code: expeditionError.code, message: expeditionError.message, details: expeditionError.details } : null,
      checks: {
        twoExpeditionsSameOrderAccepted: !expeditionError && expeditions?.length === 2,
        bothPointToSameOrder: expeditions?.length === 2 && expeditions.every(item => item.order_id === orderId)
      }
    };
    console.log("ORDER_EXPEDITION_CARDINALITY", JSON.stringify(proof));
    return <pre id="order-expedition-cardinality-proof">{JSON.stringify(proof, null, 2)}</pre>;
  } catch (error) {
    const proof = { ok: false, stage: "setup", error: serializeError(error) };
    console.log("ORDER_EXPEDITION_CARDINALITY", JSON.stringify(proof));
    return <pre>{JSON.stringify(proof, null, 2)}</pre>;
  } finally {
    await supabase.from("expeditions").delete().in("code", EXP_CODES);
    if (orderId) await supabase.from("orders").delete().eq("id", orderId);
    if (partyId) await supabase.from("parties").delete().eq("id", partyId);
  }
}

function serializeError(error: unknown) {
  if (error instanceof Error) return { name: error.name, message: error.message };
  try { return JSON.parse(JSON.stringify(error)); } catch { return String(error); }
}
