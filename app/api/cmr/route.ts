import { NextRequest, NextResponse } from "next/server";
import { createCmrKey } from "@/lib/cmr-access";
import { createSupabaseAdmin, numericValue } from "@/lib/supabase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type GoodsLineInput = { marks?: string; packages?: string | number; packaging?: string; description?: string; statisticalNumber?: string; weight?: string | number; volume?: string | number; unNumber?: string; adrClass?: string; labels?: string; packingGroup?: string; tunnelCode?: string; adrDescription?: string };
type SuccessiveCarrierInput = { name?: string; taxId?: string; address?: string; country?: string };
type AttachmentInput = { type?: string; title?: string; reference?: string };
type StopOrderInput = { id?: string; customerId?: string; description?: string; packages?: string | number; weight?: string | number };
type StopDetailInput = { sequence?: number; contactName?: string; contactPhone?: string; reference?: string; fullAddress?: string; windowStart?: string; windowEnd?: string; orders?: StopOrderInput[] };
type CmrInput = {
  source?: string; expedicion?: string; viaje?: string; customerIds?: string[]; expedidor?: string; destinatario?: string; carga?: string; entrega?: string; transportista?: string; matricula?: string; remolque?: string; mercancia?: string; bultos?: string; embalaje?: string; peso?: string; volumen?: string; instrucciones?: string; senderInstructions?: string; carrierReservations?: string; particularTerms?: string; attachedDocuments?: AttachmentInput[]; successiveCarriers?: SuccessiveCarrierInput[]; goodsLines?: GoodsLineInput[]; statisticalNumber?: string; carriageCharges?: Record<string, unknown>; cashOnDelivery?: Record<string, unknown>; establishedAt?: string; establishedOn?: string; adr?: string; adrRegime?: string; unNumber?: string; adrClass?: string; adrLabels?: string; packingGroup?: string; tunnelCode?: string; adrDescription?: string; stopDetails?: StopDetailInput[];
};

const required: Array<[keyof CmrInput, string]> = [["expedidor", "Expedidor"], ["destinatario", "Destinatario"], ["carga", "Lugar de carga"], ["entrega", "Lugar de entrega"], ["transportista", "Transportista"], ["mercancia", "Mercancía"], ["peso", "Peso bruto"]];

export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) return NextResponse.json({ error: "Origen no autorizado." }, { status: 403 });
  let input: CmrInput;
  try { input = await request.json(); } catch { return NextResponse.json({ error: "El cuerpo debe ser JSON válido." }, { status: 400 }); }

  const missing = required.filter(([key]) => !String(input[key] ?? "").trim()).map(([, label]) => label);
  if (!input.customerIds?.length) missing.push("Customer ID");
  if (input.adr === "S" && !input.adrRegime?.trim()) missing.push("Régimen ADR");
  if (missing.length) return NextResponse.json({ error: "El CMR está incompleto.", missing }, { status: 422 });

  const supabase = createSupabaseAdmin();
  const { data: cmrNumber, error: numberError } = await supabase.rpc("next_cmr_number");
  if (numberError || !cmrNumber) return failure(numberError ?? new Error("No se pudo numerar el CMR."));

  const cmrKey = createCmrKey();
  const goodsLines = normalizeGoodsLines(input);
  const attachments = normalizeAttachments(input.attachedDocuments);
  const successiveCarriers = normalizeSuccessiveCarriers(input.successiveCarriers);
  const stopDetails = normalizeStopDetails(input);
  const senderInstructions = clean(input.senderInstructions, 4000) || clean(input.instrucciones, 4000);
  const carrierReservations = clean(input.carrierReservations, 4000);
  const particularTerms = clean(input.particularTerms, 4000);

  let expeditionRecordId: string | null = null;
  if (clean(input.expedicion, 120)) {
    const expeditionRef = clean(input.expedicion, 120);
    let query = supabase.from("expeditions").select("id");
    query = isUuid(expeditionRef) ? query.eq("id", expeditionRef) : query.eq("code", expeditionRef);
    const { data: expedition, error: expeditionError } = await query.maybeSingle();
    if (expeditionError) return failure(expeditionError);
    expeditionRecordId = expedition?.id ?? null;
  }

  const documentPayload = {
    cmr_number: cmrNumber,
    access_key: cmrKey,
    status: "Emitido",
    source: input.source || "expedicion",
    expedition_id: input.expedicion || null,
    trip_id: input.viaje || null,
    customer_ids: input.customerIds,
    sender: input.expedidor!.trim(),
    recipient: input.destinatario!.trim(),
    pickup_location: input.carga!.trim(),
    delivery_location: input.entrega!.trim(),
    carrier: input.transportista!.trim(),
    vehicle_registration: input.matricula?.trim() || null,
    trailer_registration: input.remolque?.trim() || null,
    goods_description: input.mercancia!.trim(),
    packages: Math.max(0, Math.trunc(numericValue(input.bultos) ?? 0)) || null,
    packaging: input.embalaje?.trim() || null,
    gross_weight: numericValue(input.peso),
    volume: numericValue(input.volumen),
    instructions: clean(input.instrucciones, 4000) || null,
    adr: { declared: input.adr || "", regime: input.adrRegime || "", unNumber: input.unNumber || "", class: input.adrClass || "", labels: input.adrLabels || "", packingGroup: input.packingGroup || "", tunnelCode: input.tunnelCode || "", description: input.adrDescription || "" },
    sender_instructions: senderInstructions || null,
    carrier_reservations: carrierReservations || null,
    particular_terms: particularTerms || null,
    carriage_charges: sanitizeObject(input.carriageCharges),
    cash_on_delivery: sanitizeObject(input.cashOnDelivery),
    established_at: clean(input.establishedAt, 180) || null,
    established_on: clean(input.establishedOn, 40) || null,
    metadata: { schemaVersion: 3 },
  };

  const { data: document, error: documentError } = await supabase.from("cmr_documents").insert(documentPayload).select("*").single();
  if (documentError) return failure(documentError);

  try {
    const partyRows = [
      { cmr_id: document.id, role: "sender", sequence: 1, customer_id: input.customerIds?.[0] || null, legal_name: input.expedidor!.trim(), address: input.carga!.trim() },
      { cmr_id: document.id, role: "consignee", sequence: 1, legal_name: input.destinatario!.trim(), address: input.entrega!.trim() },
      { cmr_id: document.id, role: "carrier", sequence: 1, legal_name: input.transportista!.trim(), metadata: { vehicleRegistration: input.matricula?.trim() || null, trailerRegistration: input.remolque?.trim() || null } },
      ...successiveCarriers.map(carrier => ({ cmr_id: document.id, role: "successive_carrier", sequence: carrier.sequence, legal_name: carrier.name, tax_id: carrier.taxId || null, address: carrier.address || null, country_code: carrier.country || null })),
    ];
    const { error: partiesError } = await supabase.from("cmr_parties").insert(partyRows);
    if (partiesError) throw partiesError;

    if (goodsLines.length) {
      const { error } = await supabase.from("cmr_goods_lines").insert(goodsLines.map(line => ({ cmr_id: document.id, sequence: line.sequence, marks_numbers: line.marks || null, packages: line.packages == null ? null : Math.max(0, Math.trunc(line.packages)), packaging_description: line.packaging || null, goods_description: line.description, statistical_number: line.statisticalNumber || null, gross_weight: line.weight, volume: line.volume, adr_declared: Boolean(line.adr.declared), un_number: line.adr.unNumber || null, adr_class: line.adr.class || null, labels: line.adr.labels || null, packing_group: line.adr.packingGroup || null, tunnel_code: line.adr.tunnelCode || null, adr_description: line.adr.description || null })));
      if (error) throw error;
    }

    if (attachments.length) {
      const { error } = await supabase.from("cmr_attachments").insert(attachments.map(item => ({ cmr_id: document.id, sequence: item.sequence, document_type: item.type, title: item.title, external_reference: item.reference || null })));
      if (error) throw error;
    }

    const clauses = [
      senderInstructions && { cmr_id: document.id, clause_type: "sender_instruction", sequence: 1, text_value: senderInstructions, source: "web" },
      carrierReservations && { cmr_id: document.id, clause_type: "carrier_reservation", sequence: 1, text_value: carrierReservations, source: "web" },
      particularTerms && { cmr_id: document.id, clause_type: "particular_term", sequence: 1, text_value: particularTerms, source: "web" },
    ].filter(Boolean);
    if (clauses.length) {
      const { error } = await supabase.from("cmr_clauses").insert(clauses);
      if (error) throw error;
    }

    if (expeditionRecordId) {
      const { error } = await supabase.from("cmr_expeditions").insert({ cmr_id: document.id, expedition_id: expeditionRecordId, sequence: 1 });
      if (error) throw error;
    }

    const { data: stops, error: stopsError } = await supabase.from("transport_stops").insert([
      { cmr_id: document.id, sequence: 1, stop_type: "Recogida", company: input.expedidor, address: stopDetails[0].fullAddress || input.carga, window_start: stopDetails[0].windowStart || null, window_end: stopDetails[0].windowEnd || null, contact_phone: stopDetails[0].contactPhone || null },
      { cmr_id: document.id, sequence: 2, stop_type: "Entrega", company: input.destinatario, address: stopDetails[1].fullAddress || input.entrega, window_start: stopDetails[1].windowStart || null, window_end: stopDetails[1].windowEnd || null, contact_phone: stopDetails[1].contactPhone || null },
    ]).select("*").order("sequence");
    if (stopsError) throw stopsError;

    const { error: eventError } = await supabase.from("transport_events").insert({ cmr_id: document.id, event_type: "cmr_issued", payload: { cmrNumber, source: input.source || "expedicion", actor: "FORNEXA Web", schemaVersion: 3, goodsLines: goodsLines.length, attachments: attachments.length, successiveCarriers: successiveCarriers.length, canonical: true } });
    if (eventError) throw eventError;

    const origin = request.nextUrl.origin;
    return NextResponse.json({ id: document.id, cmrNumber, cmrKey, status: document.status, issuedAt: document.issued_at, stops, detailUrl: `/dashboard/epod-cmr/${encodeURIComponent(cmrNumber)}`, qrUrl: `/api/cmr/${encodeURIComponent(cmrNumber)}/qr?key=${encodeURIComponent(cmrKey)}`, qrPayload: `${origin}/api/mobile/cmr/${encodeURIComponent(cmrKey)}` }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    await supabase.from("cmr_documents").delete().eq("id", document.id);
    return failure(error);
  }
}

function normalizeGoodsLines(input: CmrInput) {
  const raw = Array.isArray(input.goodsLines) && input.goodsLines.length ? input.goodsLines : [{ marks: input.expedicion || "", packages: input.bultos, packaging: input.embalaje, description: input.mercancia, statisticalNumber: input.statisticalNumber, weight: input.peso, volume: input.volumen, unNumber: input.unNumber, adrClass: input.adrClass, labels: input.adrLabels, packingGroup: input.packingGroup, tunnelCode: input.tunnelCode, adrDescription: input.adrDescription }];
  return raw.slice(0, 100).map((line, index) => ({ sequence: index + 1, marks: clean(line.marks, 120), packages: numericValue(line.packages), packaging: clean(line.packaging, 120), description: clean(line.description, 500), statisticalNumber: clean(line.statisticalNumber, 120), weight: numericValue(line.weight), volume: numericValue(line.volume), adr: { declared: input.adr === "S" || Boolean(line.unNumber || line.adrClass), unNumber: clean(line.unNumber, 20), class: clean(line.adrClass, 40), labels: clean(line.labels, 80), packingGroup: clean(line.packingGroup, 20), tunnelCode: clean(line.tunnelCode, 20), description: clean(line.adrDescription, 500) } })).filter(line => line.description);
}
function normalizeAttachments(value?: AttachmentInput[]) { if (!Array.isArray(value)) return []; return value.slice(0, 100).map((item, index) => ({ sequence: index + 1, type: clean(item.type, 80) || "document", title: clean(item.title, 200), reference: clean(item.reference, 200) })).filter(item => item.title); }
function normalizeSuccessiveCarriers(value?: SuccessiveCarrierInput[]) { if (!Array.isArray(value)) return []; return value.slice(0, 20).map((item, index) => ({ sequence: index + 1, name: clean(item.name, 180), taxId: clean(item.taxId, 80), address: clean(item.address, 240), country: clean(item.country, 80) })).filter(item => item.name); }
function normalizeStopDetails(input: CmrInput) { return [1, 2].map(sequence => { const source = input.stopDetails?.find(item => item.sequence === sequence); const orders = Array.isArray(source?.orders) ? source.orders.slice(0, 100).map(order => ({ id: clean(order.id, 80), customerId: clean(order.customerId, 80), description: clean(order.description, 160), packages: numericValue(order.packages), weight: numericValue(order.weight) })).filter(order => order.id) : []; return { sequence, contactName: clean(source?.contactName, 120), contactPhone: clean(source?.contactPhone, 40), reference: clean(source?.reference, 120), fullAddress: clean(source?.fullAddress, 240) || (sequence === 1 ? input.carga!.trim() : input.entrega!.trim()), windowStart: clean(source?.windowStart, 60), windowEnd: clean(source?.windowEnd, 60), orders }; }); }
function sanitizeObject(value: unknown) { if (!value || typeof value !== "object" || Array.isArray(value)) return {}; return JSON.parse(JSON.stringify(value)); }
function clean(value: unknown, maximum: number) { return String(value ?? "").trim().slice(0, maximum); }
function isUuid(value: string) { return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value); }
function failure(error: unknown) { console.error("CMR API error", error); return NextResponse.json({ error: "No se pudo completar la operación CMR." }, { status: 500 }); }
function isSameOrigin(request: NextRequest) { const origin = request.headers.get("origin"); if (!origin) return false; try { return new URL(origin).host === request.nextUrl.host; } catch { return false; } }
