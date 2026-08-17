import { NextRequest } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase-admin";
import { POST as createCmr } from "@/app/api/cmr/route";
import { GET as getCmr } from "@/app/api/cmr/[cmr]/route";
import { GET as getQr } from "@/app/api/cmr/[cmr]/qr/route";

export const dynamic = "force-static";
export const revalidate = false;

const ORIGIN = "https://fornexa.vercel.app";

export default async function CmrE2eProofV2Page() {
  const supabase = createSupabaseAdmin();
  await supabase.from("cmr_documents").delete().eq("source", "e2e-build-proof-v2");
  const { data: expedition, error: expeditionError } = await supabase.from("expeditions").select("id,code").limit(1).maybeSingle();
  if (expeditionError) return <pre>{JSON.stringify({ ok: false, stage: "load-expedition", error: expeditionError.message }, null, 2)}</pre>;

  const base = {
    source: "e2e-build-proof-v2", viaje: "VJ-E2E-BUILD-V2-001", customerIds: ["E2E-CUSTOMER"], expedidor: "FORNEXA E2E Sender, S.L.", destinatario: "FORNEXA E2E Consignee SAS", carga: "Valencia, España", entrega: "Lyon, Francia", transportista: "FORNEXA E2E Carrier, S.L.", matricula: "E2E-1234", remolque: "E2E-R-01", mercancia: "Mercancía de prueba E2E", bultos: "3", embalaje: "Palets EUR", peso: "780.5", volumen: "4.25", instrucciones: "Mantener seco", senderInstructions: "Avisar 30 minutos antes de la entrega", carrierReservations: "Sin reservas en origen", particularTerms: "Prueba canónica E2E", carriageCharges: { currency: "EUR", total: 321.45 }, cashOnDelivery: { amount: 0, currency: "EUR" }, establishedAt: "Valencia", establishedOn: "2026-08-18", adr: "S", adrRegime: "1.1.3.6", unNumber: "UN 1263", adrClass: "3", adrLabels: "3", packingGroup: "III", tunnelCode: "D/E", adrDescription: "PINTURA",
    goodsLines: [
      { marks: "E2E-ADR-1", packages: 2, packaging: "Bidones", description: "Pintura", statisticalNumber: "32089091", weight: 500.25, volume: 2.5, unNumber: "UN 1263", adrClass: "3", labels: "3", packingGroup: "III", tunnelCode: "D/E", adrDescription: "PINTURA" },
      { marks: "E2E-NONADR-2", packages: 1, packaging: "Palet", description: "Material auxiliar", statisticalNumber: "39269097", weight: 280.25, volume: 1.75 }
    ],
    attachedDocuments: [{ type: "packing_list", title: "Packing list E2E", reference: "PL-E2E-001" }, { type: "adr", title: "Declaración ADR E2E", reference: "ADR-E2E-001" }],
    successiveCarriers: [{ name: "Transport Sucesivo E2E SARL", taxId: "FR-E2E-001", address: "Paris, France", country: "FR" }]
  };

  try {
    const firstResult = await issueWithRetry(base);
    const secondResult = await issueWithRetry({ ...base, viaje: "VJ-E2E-BUILD-V2-002", expedicion: expedition?.code ?? undefined, senderInstructions: "Segunda prueba con expedición real" });
    const firstProof = await prove(firstResult.issued);
    const secondProof = await prove(secondResult.issued);
    return <pre id="cmr-e2e-proof-v2">{JSON.stringify({ ok: true, expeditionUsed: expedition ?? null, firstAttempts: firstResult.attempts, secondAttempts: secondResult.attempts, first: firstProof, second: secondProof }, null, 2)}</pre>;
  } catch (error) {
    return <pre id="cmr-e2e-proof-v2">{JSON.stringify({ ok: false, error: serializeError(error) }, null, 2)}</pre>;
  }
}

async function issueWithRetry(payload: Record<string, unknown>) {
  const attempts: Array<{ status: number; body: unknown }> = [];
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const request = new NextRequest(`${ORIGIN}/api/cmr`, { method: "POST", headers: { "content-type": "application/json", origin: ORIGIN }, body: JSON.stringify(payload) });
    const response = await createCmr(request);
    const body = await response.json();
    attempts.push({ status: response.status, body });
    if (response.ok) return { issued: body as { id: string; cmrNumber: string; cmrKey: string }, attempts };
    if (response.status !== 500) throw new Error(`POST /api/cmr ${response.status}: ${JSON.stringify(body)}`);
  }
  throw new Error(`POST /api/cmr did not succeed after ${attempts.length} attempts: ${JSON.stringify(attempts.slice(-3))}`);
}

async function prove(issued: { id: string; cmrNumber: string; cmrKey: string }) {
  const supabase = createSupabaseAdmin();
  const [parties, goods, attachments, clauses, stops, events, bridge] = await Promise.all([
    supabase.from("cmr_parties").select("role,sequence,legal_name,tax_id,address,country_code,metadata").eq("cmr_id", issued.id).order("role").order("sequence"),
    supabase.from("cmr_goods_lines").select("sequence,marks_numbers,packages,packaging_description,goods_description,statistical_number,gross_weight,volume,adr_declared,un_number,adr_class,labels,packing_group,tunnel_code,adr_description,metadata").eq("cmr_id", issued.id).order("sequence"),
    supabase.from("cmr_attachments").select("sequence,document_type,title,external_reference,metadata").eq("cmr_id", issued.id).order("sequence"),
    supabase.from("cmr_clauses").select("clause_type,sequence,text_value,source,metadata").eq("cmr_id", issued.id).order("clause_type").order("sequence"),
    supabase.from("transport_stops").select("sequence,stop_type,company,address,status").eq("cmr_id", issued.id).order("sequence"),
    supabase.from("transport_events").select("event_type,payload").eq("cmr_id", issued.id).order("occurred_at"),
    supabase.from("cmr_expeditions").select("expedition_id,sequence,metadata").eq("cmr_id", issued.id).order("sequence")
  ]);
  for (const result of [parties, goods, attachments, clauses, stops, events, bridge]) if (result.error) throw result.error;

  const detailRequest = new Request(`${ORIGIN}/api/cmr/${encodeURIComponent(issued.cmrNumber)}`, { headers: { "x-fornexa-key": issued.cmrKey } });
  const detailResponse = await getCmr(detailRequest, { params: Promise.resolve({ cmr: issued.cmrNumber }) });
  const detail = await detailResponse.json();

  const qrRequest = new Request(`${ORIGIN}/api/cmr/${encodeURIComponent(issued.cmrNumber)}/qr?key=${encodeURIComponent(issued.cmrKey)}`);
  const qrResponse = await getQr(qrRequest, { params: Promise.resolve({ cmr: issued.cmrNumber }) });
  const qrText = await qrResponse.text();

  return {
    issued,
    counts: { parties: parties.data?.length ?? 0, goods: goods.data?.length ?? 0, attachments: attachments.data?.length ?? 0, clauses: clauses.data?.length ?? 0, stops: stops.data?.length ?? 0, events: events.data?.length ?? 0, bridge: bridge.data?.length ?? 0 },
    rows: { parties: parties.data, goods: goods.data, attachments: attachments.data, clauses: clauses.data, stops: stops.data, events: events.data, bridge: bridge.data },
    projected: { status: detailResponse.status, canonicalParties: detail?.canonical?.parties?.length ?? null, canonicalGoods: detail?.canonical?.goodsLines?.length ?? null, canonicalAttachments: detail?.canonical?.attachments?.length ?? null, canonicalClauses: detail?.canonical?.clauses?.length ?? null, sender: detail?.document?.sender ?? null, firstGoodsDescription: detail?.document?.metadata?.cmr?.goodsLines?.[0]?.description ?? null, firstAdrUn: detail?.document?.metadata?.cmr?.goodsLines?.[0]?.adr?.unNumber ?? null },
    qr: { status: qrResponse.status, contentType: qrResponse.headers.get("content-type"), bytes: Buffer.byteLength(qrText), containsMobileRoute: qrText.includes("/api/mobile/cmr/") }
  };
}

function serializeError(error: unknown) {
  if (error instanceof Error) return { name: error.name, message: error.message, stack: error.stack?.split("\n").slice(0, 8) };
  try { return JSON.parse(JSON.stringify(error)); } catch { return String(error); }
}
