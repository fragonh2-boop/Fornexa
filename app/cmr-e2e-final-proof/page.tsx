import { NextRequest } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase-admin";
import { POST as createCmr } from "@/app/api/cmr/route";
import { GET as getCmr } from "@/app/api/cmr/[cmr]/route";
import { GET as getQr } from "@/app/api/cmr/[cmr]/qr/route";

export const dynamic = "force-static";
export const revalidate = false;

const ORIGIN = "https://fornexa.vercel.app";
const SOURCE = "e2e-final-proof";
const EXPEDITION_CODE = "EX-E2E-FINAL";

export default async function CmrE2eFinalProofPage() {
  const supabase = createSupabaseAdmin();
  await supabase.from("cmr_documents").delete().in("source", ["e2e-build-proof", "e2e-build-proof-v2", SOURCE]);
  await supabase.from("expeditions").delete().eq("code", EXPEDITION_CODE);

  const { data: expedition, error: expeditionError } = await supabase
    .from("expeditions")
    .insert({ code: EXPEDITION_CODE, status: "PLANNED", metadata: { source: SOURCE, e2e: true } })
    .select("id,code,status,metadata")
    .single();

  if (expeditionError || !expedition) {
    const proof = { ok: false, stage: "create-expedition", error: expeditionError?.message ?? "Temporary expedition could not be created" };
    console.log("CMR_E2E_FINAL", JSON.stringify(proof));
    return <pre>{JSON.stringify(proof, null, 2)}</pre>;
  }

  const payload = {
    source: SOURCE, expedicion: expedition.code, viaje: "VJ-E2E-FINAL-001", customerIds: ["E2E-CUSTOMER"],
    expedidor: "FORNEXA E2E Sender, S.L.", destinatario: "FORNEXA E2E Consignee SAS", carga: "Valencia, España", entrega: "Lyon, Francia",
    transportista: "FORNEXA E2E Carrier, S.L.", matricula: "E2E-1234", remolque: "E2E-R-01", mercancia: "Mercancía de prueba E2E",
    bultos: "3", embalaje: "Palets EUR", peso: "780.5", volumen: "4.25", instrucciones: "Mantener seco",
    senderInstructions: "Avisar 30 minutos antes de la entrega", carrierReservations: "Sin reservas en origen", particularTerms: "Prueba canónica E2E",
    carriageCharges: { currency: "EUR", total: 321.45 }, cashOnDelivery: { amount: 0, currency: "EUR" }, establishedAt: "Valencia", establishedOn: "2026-08-18",
    adr: "S", adrRegime: "1.1.3.6", unNumber: "UN 1263", adrClass: "3", adrLabels: "3", packingGroup: "III", tunnelCode: "D/E", adrDescription: "PINTURA",
    goodsLines: [
      { marks: "E2E-ADR-1", packages: 2, packaging: "Bidones", description: "Pintura", statisticalNumber: "32089091", weight: 500.25, volume: 2.5, unNumber: "UN 1263", adrClass: "3", labels: "3", packingGroup: "III", tunnelCode: "D/E", adrDescription: "PINTURA" },
      { marks: "E2E-NONADR-2", packages: 1, packaging: "Palet", description: "Material auxiliar", statisticalNumber: "39269097", weight: 280.25, volume: 1.75 }
    ],
    attachedDocuments: [
      { type: "packing_list", title: "Packing list E2E", reference: "PL-E2E-001" },
      { type: "adr", title: "Declaración ADR E2E", reference: "ADR-E2E-001" }
    ],
    successiveCarriers: [{ name: "Transport Sucesivo E2E SARL", taxId: "FR-E2E-001", address: "Paris, France", country: "FR" }]
  };

  try {
    const request = new NextRequest(`${ORIGIN}/api/cmr`, { method: "POST", headers: { "content-type": "application/json", origin: ORIGIN }, body: JSON.stringify(payload) });
    const response = await createCmr(request);
    const issued = await response.json();
    if (!response.ok) throw new Error(`POST /api/cmr ${response.status}: ${JSON.stringify(issued)}`);

    const cmrId = String(issued.id), cmrNumber = String(issued.cmrNumber), cmrKey = String(issued.cmrKey);
    const [document, parties, goods, attachments, clauses, stops, events, bridge] = await Promise.all([
      supabase.from("cmr_documents").select("id,cmr_number,status,source,expedition_id,trip_id,customer_ids,sender,recipient,carrier,vehicle_registration,trailer_registration,gross_weight,volume,adr,metadata").eq("id", cmrId).single(),
      supabase.from("cmr_parties").select("role,sequence,legal_name,tax_id,address,country_code,metadata").eq("cmr_id", cmrId).order("role").order("sequence"),
      supabase.from("cmr_goods_lines").select("sequence,marks_numbers,packages,packaging_description,goods_description,statistical_number,gross_weight,volume,adr_declared,un_number,adr_class,labels,packing_group,tunnel_code,adr_description,metadata").eq("cmr_id", cmrId).order("sequence"),
      supabase.from("cmr_attachments").select("sequence,document_type,title,external_reference,metadata").eq("cmr_id", cmrId).order("sequence"),
      supabase.from("cmr_clauses").select("clause_type,sequence,text_value,source,metadata").eq("cmr_id", cmrId).order("clause_type").order("sequence"),
      supabase.from("transport_stops").select("sequence,stop_type,company,address,status").eq("cmr_id", cmrId).order("sequence"),
      supabase.from("transport_events").select("event_type,payload").eq("cmr_id", cmrId).order("occurred_at"),
      supabase.from("cmr_expeditions").select("expedition_id,sequence,metadata").eq("cmr_id", cmrId).order("sequence")
    ]);
    for (const result of [document, parties, goods, attachments, clauses, stops, events, bridge]) if (result.error) throw result.error;

    const detailResponse = await getCmr(new Request(`${ORIGIN}/api/cmr/${encodeURIComponent(cmrNumber)}`, { headers: { "x-fornexa-key": cmrKey } }), { params: Promise.resolve({ cmr: cmrNumber }) });
    const detail = await detailResponse.json();
    const qrResponse = await getQr(new Request(`${ORIGIN}/api/cmr/${encodeURIComponent(cmrNumber)}/qr?key=${encodeURIComponent(cmrKey)}`), { params: Promise.resolve({ cmr: cmrNumber }) });
    const qrText = await qrResponse.text();

    const checks = {
      fourParties: (parties.data?.length ?? 0) === 4,
      twoGoodsLines: (goods.data?.length ?? 0) === 2,
      twoAttachments: (attachments.data?.length ?? 0) === 2,
      threeClauses: (clauses.data?.length ?? 0) === 3,
      twoStops: (stops.data?.length ?? 0) === 2,
      issuedEvent: Boolean(events.data?.some((row) => row.event_type === "cmr_issued")),
      realExpeditionBridge: bridge.data?.[0]?.expedition_id === expedition.id,
      adrPersisted: goods.data?.[0]?.un_number === "UN 1263" && goods.data?.[0]?.adr_declared === true,
      canonicalDetail200: detailResponse.status === 200,
      canonicalGoodsProjected: detail?.document?.metadata?.cmr?.goodsLines?.[0]?.description === "Pintura",
      canonicalAdrProjected: detail?.document?.metadata?.cmr?.goodsLines?.[0]?.adr?.unNumber === "UN 1263",
      canonicalAttachmentsProjected: detail?.canonical?.attachments?.length === 2,
      qr200: qrResponse.status === 200,
      qrSvg: String(qrResponse.headers.get("content-type") ?? "").includes("image/svg+xml"),
      qrTargetsMobileCmr: qrText.includes("/api/mobile/cmr/")
    };

    const proof = { ok: Object.values(checks).every(Boolean), expeditionUsed: expedition, issued: { id: cmrId, cmrNumber, cmrKey, status: issued.status }, persisted: document.data,
      counts: { parties: parties.data?.length ?? 0, goods: goods.data?.length ?? 0, attachments: attachments.data?.length ?? 0, clauses: clauses.data?.length ?? 0, stops: stops.data?.length ?? 0, events: events.data?.length ?? 0, bridge: bridge.data?.length ?? 0 }, checks };
    console.log("CMR_E2E_FINAL", JSON.stringify(proof));
    return <pre id="cmr-e2e-final-proof">{JSON.stringify(proof, null, 2)}</pre>;
  } catch (error) {
    const proof = { ok: false, stage: "cmr", expeditionUsed: expedition, error: serializeError(error) };
    console.log("CMR_E2E_FINAL", JSON.stringify(proof));
    return <pre id="cmr-e2e-final-proof">{JSON.stringify(proof, null, 2)}</pre>;
  }
}

function serializeError(error: unknown) {
  if (error instanceof Error) return { name: error.name, message: error.message, stack: error.stack?.split("\n").slice(0, 8) };
  try { return JSON.parse(JSON.stringify(error)); } catch { return String(error); }
}
