import { NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const OPS_TOKEN = "5f3d8c7b-6a7f-41aa-8d44-4c5dc9fd6db3";
const TARGET_ORIGIN = "https://fornexa-nlag8c62h-forexa.vercel.app";
const VERCEL_SHARE = "Ec5q0ziWIjHVh8LueGEDTOXZsZga0tbB";

export async function GET(request: Request) {
  const url = new URL(request.url);
  if (url.searchParams.get("token") !== OPS_TOKEN) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const supabase = createSupabaseAdmin();
  const { data: expedition, error: expeditionError } = await supabase.from("expeditions").select("id,code").limit(1).maybeSingle();
  if (expeditionError) return NextResponse.json({ error: expeditionError.message }, { status: 500 });

  const base = {
    source: "e2e-test", viaje: "VJ-E2E-001", customerIds: ["E2E-CUSTOMER"], expedidor: "FORNEXA E2E Sender, S.L.", destinatario: "FORNEXA E2E Consignee SAS", carga: "Valencia, España", entrega: "Lyon, Francia", transportista: "FORNEXA E2E Carrier, S.L.", matricula: "E2E-1234", remolque: "E2E-R-01", mercancia: "Mercancía de prueba E2E", bultos: "3", embalaje: "Palets EUR", peso: "780.5", volumen: "4.25", instrucciones: "Mantener seco", senderInstructions: "Avisar 30 minutos antes de la entrega", carrierReservations: "Sin reservas en origen", particularTerms: "Prueba canónica E2E", carriageCharges: { currency: "EUR", total: 321.45 }, cashOnDelivery: { amount: 0, currency: "EUR" }, establishedAt: "Valencia", establishedOn: "2026-08-18", adr: "S", adrRegime: "1.1.3.6", unNumber: "UN 1263", adrClass: "3", adrLabels: "3", packingGroup: "III", tunnelCode: "D/E", adrDescription: "PINTURA",
    goodsLines: [
      { marks: "E2E-ADR-1", packages: 2, packaging: "Bidones", description: "Pintura", statisticalNumber: "32089091", weight: 500.25, volume: 2.5, unNumber: "UN 1263", adrClass: "3", labels: "3", packingGroup: "III", tunnelCode: "D/E", adrDescription: "PINTURA" },
      { marks: "E2E-NONADR-2", packages: 1, packaging: "Palet", description: "Material auxiliar", statisticalNumber: "39269097", weight: 280.25, volume: 1.75 }
    ],
    attachedDocuments: [{ type: "packing_list", title: "Packing list E2E", reference: "PL-E2E-001" }, { type: "adr", title: "Declaración ADR E2E", reference: "ADR-E2E-001" }],
    successiveCarriers: [{ name: "Transport Sucesivo E2E SARL", taxId: "FR-E2E-001", address: "Paris, France", country: "FR" }]
  };

  const created: string[] = [];
  try {
    const first = await issue(base); created.push(first.id); const firstCheck = await inspect(supabase, first);
    const second = await issue({ ...base, viaje: "VJ-E2E-002", expedicion: expedition?.code ?? undefined, senderInstructions: "Segunda prueba con expedición real" }); created.push(second.id); const secondCheck = await inspect(supabase, second);
    return NextResponse.json({ targetOrigin: TARGET_ORIGIN, expeditionUsed: expedition ?? null, first: firstCheck, second: secondCheck });
  } finally { if (created.length) await supabase.from("cmr_documents").delete().in("id", created); }
}

function target(path: string) {
  const url = new URL(path, TARGET_ORIGIN);
  url.searchParams.set("_vercel_share", VERCEL_SHARE);
  return url.toString();
}

async function issue(payload: Record<string, unknown>) {
  const response = await fetch(target("/api/cmr"), { method: "POST", headers: { "content-type": "application/json", origin: TARGET_ORIGIN }, body: JSON.stringify(payload), cache: "no-store", redirect: "follow" });
  const text = await response.text();
  let json: unknown;
  try { json = JSON.parse(text); } catch { throw new Error(`POST /api/cmr ${response.status}: ${text.slice(0, 500)}`); }
  if (!response.ok) throw new Error(`POST /api/cmr ${response.status}: ${JSON.stringify(json)}`);
  return json as { id: string; cmrNumber: string; cmrKey: string };
}

async function inspect(supabase: ReturnType<typeof createSupabaseAdmin>, issued: { id: string; cmrNumber: string; cmrKey: string }) {
  const [parties, goods, attachments, clauses, stops, events, bridge] = await Promise.all([
    supabase.from("cmr_parties").select("role,sequence,legal_name,tax_id,address,country_code,metadata").eq("cmr_id", issued.id).order("role").order("sequence"),
    supabase.from("cmr_goods_lines").select("sequence,marks_numbers,packages,packaging_description,goods_description,statistical_number,gross_weight,volume,adr_declared,un_number,adr_class,labels,packing_group,tunnel_code,adr_description").eq("cmr_id", issued.id).order("sequence"),
    supabase.from("cmr_attachments").select("sequence,document_type,title,external_reference").eq("cmr_id", issued.id).order("sequence"),
    supabase.from("cmr_clauses").select("clause_type,sequence,text_value,source").eq("cmr_id", issued.id).order("clause_type").order("sequence"),
    supabase.from("transport_stops").select("sequence,stop_type,company,address,status").eq("cmr_id", issued.id).order("sequence"),
    supabase.from("transport_events").select("event_type,payload").eq("cmr_id", issued.id).order("occurred_at"),
    supabase.from("cmr_expeditions").select("expedition_id,sequence").eq("cmr_id", issued.id).order("sequence")
  ]);
  for (const result of [parties, goods, attachments, clauses, stops, events, bridge]) if (result.error) throw result.error;
  const detailUrl = new URL(`/api/cmr/${encodeURIComponent(issued.cmrNumber)}`, TARGET_ORIGIN); detailUrl.searchParams.set("_vercel_share", VERCEL_SHARE);
  const detailResponse = await fetch(detailUrl, { headers: { "x-fornexa-key": issued.cmrKey }, cache: "no-store", redirect: "follow" }); const detail = await detailResponse.json();
  const qrUrl = new URL(`/api/cmr/${encodeURIComponent(issued.cmrNumber)}/qr`, TARGET_ORIGIN); qrUrl.searchParams.set("key", issued.cmrKey); qrUrl.searchParams.set("_vercel_share", VERCEL_SHARE);
  const qrResponse = await fetch(qrUrl, { cache: "no-store", redirect: "follow" });
  const viewUrl = new URL(`/dashboard/epod-cmr/${encodeURIComponent(issued.cmrNumber)}`, TARGET_ORIGIN); viewUrl.searchParams.set("key", issued.cmrKey); viewUrl.searchParams.set("_vercel_share", VERCEL_SHARE);
  const viewResponse = await fetch(viewUrl, { cache: "no-store", redirect: "follow" }); const viewHtml = await viewResponse.text();
  return { issued, rows: { parties: parties.data, goods: goods.data, attachments: attachments.data, clauses: clauses.data, stops: stops.data, events: events.data, bridge: bridge.data }, projected: { status: detailResponse.status, body: detail }, qr: { status: qrResponse.status, contentType: qrResponse.headers.get("content-type"), bytes: (await qrResponse.arrayBuffer()).byteLength }, view: { status: viewResponse.status, containsCmrNumber: viewHtml.includes(issued.cmrNumber), containsCanonicalGoods: viewHtml.includes("Pintura") } };
}
