import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedContext } from "@/lib/auth-context";
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
  source?: string; expedicion?: string; expediciones?: string[]; viaje?: string; customerIds?: string[]; expedidor?: string; destinatario?: string; carga?: string; entrega?: string; transportista?: string; matricula?: string; remolque?: string; mercancia?: string; bultos?: string; embalaje?: string; peso?: string; volumen?: string; instrucciones?: string; senderInstructions?: string; carrierReservations?: string; particularTerms?: string; attachedDocuments?: AttachmentInput[]; successiveCarriers?: SuccessiveCarrierInput[]; goodsLines?: GoodsLineInput[]; statisticalNumber?: string; carriageCharges?: Record<string, unknown>; cashOnDelivery?: Record<string, unknown>; establishedAt?: string; establishedOn?: string; adr?: string; adrRegime?: string; unNumber?: string; adrClass?: string; adrLabels?: string; packingGroup?: string; tunnelCode?: string; adrDescription?: string; stopDetails?: StopDetailInput[];
};

type CanonicalTrip = { id: string; code: string; status: string };
type CanonicalTripStopPair = { pickup?: string; delivery?: string; sequence: number };

const required: Array<[keyof CmrInput, string]> = [["expedidor", "Expedidor"], ["destinatario", "Destinatario"], ["carga", "Lugar de carga"], ["entrega", "Lugar de entrega"], ["transportista", "Transportista"], ["mercancia", "Mercancía"], ["peso", "Peso bruto"]];

export async function POST(request: NextRequest) {
  const auth = await getAuthenticatedContext();
  if (!auth) return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  if (!isSameOrigin(request)) return NextResponse.json({ error: "Origen no autorizado." }, { status: 403 });

  let input: CmrInput;
  try { input = await request.json(); }
  catch { return NextResponse.json({ error: "El cuerpo debe ser JSON válido." }, { status: 400 }); }

  const missing = required.filter(([key]) => !String(input[key] ?? "").trim()).map(([, label]) => label);
  if (!input.customerIds?.length) missing.push("Customer ID");
  if (input.adr === "S" && !input.adrRegime?.trim()) missing.push("Régimen ADR");
  if (missing.length) return NextResponse.json({ error: "El CMR está incompleto.", missing }, { status: 422 });

  const supabase = createSupabaseAdmin();
  const cmrKey = createCmrKey();
  const goodsLines = normalizeGoodsLines(input);
  const attachments = normalizeAttachments(input.attachedDocuments);
  const successiveCarriers = normalizeSuccessiveCarriers(input.successiveCarriers);
  const stopDetails = normalizeStopDetails(input);
  const senderInstructions = clean(input.senderInstructions, 4000) || clean(input.instrucciones, 4000);
  const carrierReservations = clean(input.carrierReservations, 4000);
  const particularTerms = clean(input.particularTerms, 4000);
  const expeditionRefs = normalizeExpeditionRefs(input);

  const expeditionRecords: Array<{ id: string; code: string }> = [];
  for (const expeditionRef of expeditionRefs) {
    let query = supabase.from("expeditions").select("id,code").eq("tenant_id", auth.tenantId);
    query = isUuid(expeditionRef) ? query.eq("id", expeditionRef) : query.eq("code", expeditionRef);
    const { data: expedition, error: expeditionError } = await query.maybeSingle();
    if (expeditionError) return failure(expeditionError);
    if (expedition?.id && !expeditionRecords.some(item => item.id === expedition.id)) expeditionRecords.push(expedition as { id: string; code: string });
  }

  let tripRecord: CanonicalTrip | null = null;
  let pickupTripStopId: string | null = null;
  let deliveryTripStopId: string | null = null;
  const tripRef = clean(input.viaje, 120);

  if (tripRef) {
    let tripQuery = supabase.from("trips").select("id,code,status").eq("tenant_id", auth.tenantId);
    tripQuery = isUuid(tripRef) ? tripQuery.eq("id", tripRef) : tripQuery.eq("code", tripRef);
    const { data: trip, error: tripError } = await tripQuery.maybeSingle();
    if (tripError) return failure(tripError);
    if (!trip) return NextResponse.json({ error: "El Viaje indicado no existe en este tenant." }, { status: 404 });
    if (["COMPLETED", "CANCELLED"].includes(trip.status)) {
      return NextResponse.json({ error: "No se puede emitir un CMR sobre un Viaje finalizado/cancelado." }, { status: 409 });
    }
    if (!expeditionRecords.length) {
      return NextResponse.json({ error: "Un CMR asociado a Viaje necesita al menos una Expedición canónica." }, { status: 422 });
    }
    tripRecord = trip as CanonicalTrip;

    const expeditionIds = expeditionRecords.map(item => item.id);
    const { data: links, error: linksError } = await supabase
      .from("trip_expeditions")
      .select("expedition_id,sequence")
      .eq("tenant_id", auth.tenantId)
      .eq("trip_id", tripRecord.id)
      .in("expedition_id", expeditionIds)
      .order("sequence", { ascending: true });
    if (linksError) return failure(linksError);
    if ((links ?? []).length !== expeditionIds.length) {
      return NextResponse.json({ error: "Alguna Expedición del CMR no pertenece al Viaje indicado." }, { status: 409 });
    }

    const pairByExpedition = new Map<string, CanonicalTripStopPair>();
    const { data: canonicalStops, error: canonicalStopsError } = await supabase
      .from("trip_stops")
      .select("id,sequence,stop_type,metadata")
      .eq("tenant_id", auth.tenantId)
      .eq("trip_id", tripRecord.id)
      .order("sequence", { ascending: true });
    if (canonicalStopsError) return failure(canonicalStopsError);

    for (const stop of canonicalStops ?? []) {
      const metadata = stop.metadata && typeof stop.metadata === "object" ? stop.metadata as Record<string, unknown> : {};
      const expeditionId = typeof metadata.expeditionId === "string" ? metadata.expeditionId : "";
      if (!expeditionId || !expeditionIds.includes(expeditionId)) continue;
      const pair = pairByExpedition.get(expeditionId) ?? { sequence: Number(stop.sequence) || 0 };
      pair.sequence = Math.min(pair.sequence || Number(stop.sequence) || 0, Number(stop.sequence) || 0);
      if (stop.stop_type === "PICKUP") pair.pickup = stop.id;
      if (stop.stop_type === "DELIVERY") pair.delivery = stop.id;
      pairByExpedition.set(expeditionId, pair);
    }

    const orderedExpeditionIds = (links ?? []).map(item => item.expedition_id).filter((id): id is string => typeof id === "string");
    const firstPair = pairByExpedition.get(orderedExpeditionIds[0] ?? "");
    const lastPair = pairByExpedition.get(orderedExpeditionIds.at(-1) ?? "");
    pickupTripStopId = firstPair?.pickup ?? null;
    deliveryTripStopId = lastPair?.delivery ?? null;
    if (!pickupTripStopId || !deliveryTripStopId) {
      return NextResponse.json({ error: "El Viaje no tiene las paradas canónicas necesarias para enlazar este CMR." }, { status: 409 });
    }
  }

  const primaryExpedition = expeditionRecords[0] ?? null;
  const documentPayload = {
    tenant_id: auth.tenantId,
    access_key: cmrKey,
    status: "Emitido",
    source: input.source || "expedicion",
    expedition_id: primaryExpedition?.code || expeditionRefs[0] || null,
    trip_id: tripRecord?.code || tripRef || null,
    expedition_record_id: primaryExpedition?.id ?? null,
    trip_record_id: tripRecord?.id ?? null,
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
    metadata: {
      schemaVersion: 3,
      expeditionRefs,
      actorUserId: auth.userId,
      canonicalExpeditionId: primaryExpedition?.id ?? null,
      canonicalTripId: tripRecord?.id ?? null,
    },
  };

  let document: { id: string; status: string; issued_at: string } | null = null;
  let cmrNumber = "";
  for (let attempt = 0; attempt < 10; attempt += 1) {
    try { cmrNumber = await nextPersistedCmrNumber(supabase); }
    catch (error) { return failure(error); }
    const { data, error } = await supabase.from("cmr_documents").insert({ ...documentPayload, cmr_number: cmrNumber }).select("id,status,issued_at").single();
    if (!error && data) { document = data; break; }
    if (!isCmrNumberCollision(error)) return failure(error);
  }
  if (!document || !cmrNumber) return failure(new Error("No se pudo reservar un número CMR único."));

  try {
    const partyRows = [
      { cmr_id: document.id, role: "sender", sequence: 1, customer_id: input.customerIds?.[0] || null, legal_name: input.expedidor!.trim(), address: input.carga!.trim(), metadata: {} },
      { cmr_id: document.id, role: "consignee", sequence: 1, legal_name: input.destinatario!.trim(), address: input.entrega!.trim(), metadata: {} },
      { cmr_id: document.id, role: "carrier", sequence: 1, legal_name: input.transportista!.trim(), metadata: { vehicleRegistration: input.matricula?.trim() || null, trailerRegistration: input.remolque?.trim() || null } },
      ...successiveCarriers.map(carrier => ({ cmr_id: document!.id, role: "successive_carrier", sequence: carrier.sequence, legal_name: carrier.name, tax_id: carrier.taxId || null, address: carrier.address || null, country_code: carrier.country || null, metadata: {} })),
    ];
    const { error: partiesError } = await supabase.from("cmr_parties").insert(partyRows);
    if (partiesError) throw partiesError;

    if (goodsLines.length) {
      const { error } = await supabase.from("cmr_goods_lines").insert(goodsLines.map(line => ({ cmr_id: document!.id, sequence: line.sequence, marks_numbers: line.marks || null, packages: line.packages == null ? null : Math.max(0, Math.trunc(line.packages)), packaging_description: line.packaging || null, goods_description: line.description, statistical_number: line.statisticalNumber || null, gross_weight: line.weight, volume: line.volume, adr_declared: Boolean(line.adr.declared), un_number: line.adr.unNumber || null, adr_class: line.adr.class || null, labels: line.adr.labels || null, packing_group: line.adr.packingGroup || null, tunnel_code: line.adr.tunnelCode || null, adr_description: line.adr.description || null, metadata: {} })));
      if (error) throw error;
    }

    if (attachments.length) {
      const { error } = await supabase.from("cmr_attachments").insert(attachments.map(item => ({ cmr_id: document!.id, sequence: item.sequence, document_type: item.type, title: item.title, external_reference: item.reference || null, metadata: {} })));
      if (error) throw error;
    }

    const clauses = [
      senderInstructions && { cmr_id: document.id, clause_type: "sender_instruction", sequence: 1, text_value: senderInstructions, source: "web", metadata: {} },
      carrierReservations && { cmr_id: document.id, clause_type: "carrier_reservation", sequence: 1, text_value: carrierReservations, source: "web", metadata: {} },
      particularTerms && { cmr_id: document.id, clause_type: "particular_term", sequence: 1, text_value: particularTerms, source: "web", metadata: {} },
    ].filter(Boolean);
    if (clauses.length) {
      const { error } = await supabase.from("cmr_clauses").insert(clauses);
      if (error) throw error;
    }

    if (expeditionRecords.length) {
      const { error } = await supabase.from("cmr_expeditions").insert(expeditionRecords.map((expedition, index) => ({ cmr_id: document!.id, expedition_id: expedition.id, sequence: index + 1, metadata: { code: expedition.code } })));
      if (error) throw error;
    }

    const { data: stops, error: stopsError } = await supabase.from("transport_stops").insert([
      { tenant_id: auth.tenantId, cmr_id: document.id, trip_stop_id: pickupTripStopId, sequence: 1, stop_type: "Recogida", company: input.expedidor, address: stopDetails[0].fullAddress || input.carga, window_start: stopDetails[0].windowStart || null, window_end: stopDetails[0].windowEnd || null, contact_name: stopDetails[0].contactName || null, contact_phone: stopDetails[0].contactPhone || null, operational_reference: stopDetails[0].reference || null },
      { tenant_id: auth.tenantId, cmr_id: document.id, trip_stop_id: deliveryTripStopId, sequence: 2, stop_type: "Entrega", company: input.destinatario, address: stopDetails[1].fullAddress || input.entrega, window_start: stopDetails[1].windowStart || null, window_end: stopDetails[1].windowEnd || null, contact_name: stopDetails[1].contactName || null, contact_phone: stopDetails[1].contactPhone || null, operational_reference: stopDetails[1].reference || null },
    ]).select("*").order("sequence");
    if (stopsError) throw stopsError;

    const { error: eventError } = await supabase.from("transport_events").insert({
      tenant_id: auth.tenantId,
      actor_user_id: auth.userId,
      cmr_id: document.id,
      event_type: "cmr_issued",
      payload: {
        cmrNumber,
        source: input.source || "expedicion",
        actor: "FORNEXA Web",
        schemaVersion: 3,
        goodsLines: goodsLines.length,
        attachments: attachments.length,
        successiveCarriers: successiveCarriers.length,
        expeditions: expeditionRecords.length,
        canonical: true,
        canonicalExpeditionId: primaryExpedition?.id ?? null,
        canonicalTripId: tripRecord?.id ?? null,
      },
    });
    if (eventError) throw eventError;

    const origin = request.nextUrl.origin;
    return NextResponse.json({ id: document.id, cmrNumber, cmrKey, status: document.status, issuedAt: document.issued_at, stops, expeditionIds: expeditionRecords.map(item => item.id), tripId: tripRecord?.id ?? null, detailUrl: `/dashboard/epod-cmr/${encodeURIComponent(cmrNumber)}`, qrUrl: `/api/cmr/${encodeURIComponent(cmrNumber)}/qr?key=${encodeURIComponent(cmrKey)}`, qrPayload: `${origin}/api/mobile/cmr/${encodeURIComponent(cmrKey)}` }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    await supabase.from("cmr_documents").delete().eq("id", document.id).eq("tenant_id", auth.tenantId);
    return failure(error);
  }
}

async function nextPersistedCmrNumber(supabase: ReturnType<typeof createSupabaseAdmin>) {
  const yy = String(new Date().getUTCFullYear()).slice(-2);
  const prefix = `CMR-${yy}`;
  const { data, error } = await supabase.from("cmr_documents").select("cmr_number").like("cmr_number", `${prefix}%`).order("cmr_number", { ascending: false }).limit(50);
  if (error) throw error;
  let maximum = 0;
  const pattern = new RegExp(`^CMR-${yy}(\\d{6})$`);
  for (const row of data ?? []) {
    const match = String(row.cmr_number ?? "").match(pattern);
    if (match) maximum = Math.max(maximum, Number(match[1]));
  }
  return `${prefix}${String(maximum + 1).padStart(6, "0")}`;
}

function isCmrNumberCollision(error: unknown) {
  const value = error as { code?: string; details?: string; message?: string } | null;
  return value?.code === "23505" && `${value.details ?? ""} ${value.message ?? ""}`.includes("cmr_number");
}

function normalizeExpeditionRefs(input: CmrInput) {
  const raw = [...(Array.isArray(input.expediciones) ? input.expediciones : []), input.expedicion];
  const refs: string[] = [];
  for (const value of raw) {
    const ref = clean(value, 120);
    if (ref && !refs.includes(ref)) refs.push(ref);
  }
  return refs.slice(0, 100);
}

function normalizeGoodsLines(input: CmrInput) {
  const raw = Array.isArray(input.goodsLines) && input.goodsLines.length ? input.goodsLines : [{ marks: input.expedicion || input.expediciones?.[0] || "", packages: input.bultos, packaging: input.embalaje, description: input.mercancia, statisticalNumber: input.statisticalNumber, weight: input.peso, volume: input.volumen, unNumber: input.unNumber, adrClass: input.adrClass, labels: input.adrLabels, packingGroup: input.packingGroup, tunnelCode: input.tunnelCode, adrDescription: input.adrDescription }];
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
