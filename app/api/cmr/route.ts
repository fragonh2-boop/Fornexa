import { NextRequest, NextResponse } from "next/server";
import { createCmrKey } from "@/lib/cmr-access";
import { createSupabaseAdmin, numericValue } from "@/lib/supabase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type GoodsLineInput = {
  marks?: string;
  packages?: string | number;
  packaging?: string;
  description?: string;
  statisticalNumber?: string;
  weight?: string | number;
  volume?: string | number;
  unNumber?: string;
  adrClass?: string;
  labels?: string;
  packingGroup?: string;
  tunnelCode?: string;
  adrDescription?: string;
};

type SuccessiveCarrierInput = {
  name?: string;
  taxId?: string;
  address?: string;
  country?: string;
};

type AttachmentInput = {
  type?: string;
  title?: string;
  reference?: string;
};

type CmrInput = {
  source?: string;
  expedicion?: string;
  viaje?: string;
  customerIds?: string[];
  expedidor?: string;
  destinatario?: string;
  carga?: string;
  entrega?: string;
  transportista?: string;
  matricula?: string;
  remolque?: string;
  mercancia?: string;
  bultos?: string;
  embalaje?: string;
  peso?: string;
  volumen?: string;
  instrucciones?: string;
  senderInstructions?: string;
  carrierReservations?: string;
  particularTerms?: string;
  attachedDocuments?: AttachmentInput[];
  successiveCarriers?: SuccessiveCarrierInput[];
  goodsLines?: GoodsLineInput[];
  statisticalNumber?: string;
  carriageCharges?: Record<string, unknown>;
  cashOnDelivery?: Record<string, unknown>;
  establishedAt?: string;
  establishedOn?: string;
  adr?: string;
  adrRegime?: string;
  unNumber?: string;
  adrClass?: string;
  adrLabels?: string;
  packingGroup?: string;
  tunnelCode?: string;
  adrDescription?: string;
  stopDetails?: StopDetailInput[];
};

type StopOrderInput = {
  id?: string;
  customerId?: string;
  description?: string;
  packages?: string | number;
  weight?: string | number;
};

type StopDetailInput = {
  sequence?: number;
  contactName?: string;
  contactPhone?: string;
  reference?: string;
  fullAddress?: string;
  windowStart?: string;
  windowEnd?: string;
  orders?: StopOrderInput[];
};

const required: Array<[keyof CmrInput, string]> = [
  ["expedidor", "Expedidor"],
  ["destinatario", "Destinatario"],
  ["carga", "Lugar de carga"],
  ["entrega", "Lugar de entrega"],
  ["transportista", "Transportista"],
  ["mercancia", "Mercancía"],
  ["peso", "Peso bruto"],
];

export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) return NextResponse.json({ error: "Origen no autorizado." }, { status: 403 });
  let input: CmrInput;
  try {
    input = await request.json();
  } catch {
    return NextResponse.json({ error: "El cuerpo debe ser JSON válido." }, { status: 400 });
  }

  const missing = required.filter(([key]) => !String(input[key] ?? "").trim()).map(([, label]) => label);
  if (!input.customerIds?.length) missing.push("Customer ID");
  if (input.adr === "S" && !input.adrRegime?.trim()) missing.push("Régimen ADR");
  if (missing.length) return NextResponse.json({ error: "El CMR está incompleto.", missing }, { status: 422 });

  const supabase = createSupabaseAdmin();
  const { data: cmrNumber, error: numberError } = await supabase.rpc("next_cmr_number");
  if (numberError || !cmrNumber) return failure(numberError ?? new Error("No se pudo numerar el CMR."));

  const cmrKey = createCmrKey();
  const goodsLines = normalizeGoodsLines(input);
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
    adr: {
      declared: input.adr || "",
      regime: input.adrRegime || "",
      unNumber: input.unNumber || "",
      class: input.adrClass || "",
      labels: input.adrLabels || "",
      packingGroup: input.packingGroup || "",
      tunnelCode: input.tunnelCode || "",
      description: input.adrDescription || "",
    },
    metadata: {
      schemaVersion: 2,
      stopDetails: normalizeStopDetails(input),
      cmr: {
        senderInstructions: clean(input.senderInstructions, 4000) || clean(input.instrucciones, 4000),
        carrierReservations: clean(input.carrierReservations, 4000),
        particularTerms: clean(input.particularTerms, 4000),
        attachedDocuments: normalizeAttachments(input.attachedDocuments),
        successiveCarriers: normalizeSuccessiveCarriers(input.successiveCarriers),
        goodsLines,
        statisticalNumber: clean(input.statisticalNumber, 120),
        carriageCharges: sanitizeObject(input.carriageCharges),
        cashOnDelivery: sanitizeObject(input.cashOnDelivery),
        establishedAt: clean(input.establishedAt, 180),
        establishedOn: clean(input.establishedOn, 40),
      },
    },
  };

  const { data: document, error: documentError } = await supabase.from("cmr_documents").insert(documentPayload).select("*").single();
  if (documentError) return failure(documentError);

  const { data: stops, error: stopsError } = await supabase
    .from("transport_stops")
    .insert([
      { cmr_id: document.id, sequence: 1, stop_type: "Recogida", company: input.expedidor, address: input.carga },
      { cmr_id: document.id, sequence: 2, stop_type: "Entrega", company: input.destinatario, address: input.entrega },
    ])
    .select("*")
    .order("sequence");

  if (stopsError) {
    await supabase.from("cmr_documents").delete().eq("id", document.id);
    return failure(stopsError);
  }

  const { error: eventError } = await supabase.from("transport_events").insert({
    cmr_id: document.id,
    event_type: "cmr_issued",
    payload: {
      cmrNumber,
      source: input.source || "expedicion",
      actor: "FORNEXA Web",
      schemaVersion: 2,
      goodsLines: goodsLines.length,
      attachments: normalizeAttachments(input.attachedDocuments).length,
      successiveCarriers: normalizeSuccessiveCarriers(input.successiveCarriers).length,
    },
  });
  if (eventError) return failure(eventError);

  const origin = request.nextUrl.origin;
  return NextResponse.json({
    id: document.id,
    cmrNumber,
    cmrKey,
    status: document.status,
    issuedAt: document.issued_at,
    stops,
    detailUrl: `/dashboard/epod-cmr/${encodeURIComponent(cmrNumber)}`,
    qrUrl: `/api/cmr/${encodeURIComponent(cmrNumber)}/qr?key=${encodeURIComponent(cmrKey)}`,
    qrPayload: `${origin}/api/mobile/cmr/${encodeURIComponent(cmrKey)}`,
  }, { status: 201, headers: { "Cache-Control": "no-store" } });
}

function normalizeGoodsLines(input: CmrInput) {
  const raw = Array.isArray(input.goodsLines) && input.goodsLines.length ? input.goodsLines : [{
    marks: input.expedicion || "",
    packages: input.bultos,
    packaging: input.embalaje,
    description: input.mercancia,
    statisticalNumber: input.statisticalNumber,
    weight: input.peso,
    volume: input.volumen,
    unNumber: input.unNumber,
    adrClass: input.adrClass,
    labels: input.adrLabels,
    packingGroup: input.packingGroup,
    tunnelCode: input.tunnelCode,
    adrDescription: input.adrDescription,
  }];
  return raw.slice(0, 100).map((line, index) => ({
    sequence: index + 1,
    marks: clean(line.marks, 120),
    packages: numericValue(line.packages),
    packaging: clean(line.packaging, 120),
    description: clean(line.description, 500),
    statisticalNumber: clean(line.statisticalNumber, 120),
    weight: numericValue(line.weight),
    volume: numericValue(line.volume),
    adr: {
      declared: input.adr === "S" || Boolean(line.unNumber || line.adrClass),
      unNumber: clean(line.unNumber, 20),
      class: clean(line.adrClass, 40),
      labels: clean(line.labels, 80),
      packingGroup: clean(line.packingGroup, 20),
      tunnelCode: clean(line.tunnelCode, 20),
      description: clean(line.adrDescription, 500),
    },
  })).filter(line => line.description);
}

function normalizeAttachments(value?: AttachmentInput[]) {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 100).map((item, index) => ({
    sequence: index + 1,
    type: clean(item.type, 80) || "document",
    title: clean(item.title, 200),
    reference: clean(item.reference, 200),
  })).filter(item => item.title);
}

function normalizeSuccessiveCarriers(value?: SuccessiveCarrierInput[]) {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 20).map((item, index) => ({
    sequence: index + 1,
    name: clean(item.name, 180),
    taxId: clean(item.taxId, 80),
    address: clean(item.address, 240),
    country: clean(item.country, 80),
  })).filter(item => item.name);
}

function normalizeStopDetails(input: CmrInput) {
  return [1, 2].map(sequence => {
    const source = input.stopDetails?.find(item => item.sequence === sequence);
    const orders = Array.isArray(source?.orders) ? source.orders.slice(0, 100).map(order => ({
      id: clean(order.id, 80),
      customerId: clean(order.customerId, 80),
      description: clean(order.description, 160),
      packages: numericValue(order.packages),
      weight: numericValue(order.weight),
    })).filter(order => order.id) : [];

    return {
      sequence,
      contactName: clean(source?.contactName, 120),
      contactPhone: clean(source?.contactPhone, 40),
      reference: clean(source?.reference, 120),
      fullAddress: clean(source?.fullAddress, 240) || (sequence === 1 ? input.carga!.trim() : input.entrega!.trim()),
      windowStart: clean(source?.windowStart, 60),
      windowEnd: clean(source?.windowEnd, 60),
      orders,
    };
  });
}

function sanitizeObject(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return JSON.parse(JSON.stringify(value));
}

function clean(value: unknown, maximum: number) {
  return String(value ?? "").trim().slice(0, maximum);
}

function failure(error: unknown) {
  console.error("CMR API error", error);
  return NextResponse.json({ error: "No se pudo completar la operación CMR." }, { status: 500 });
}

function isSameOrigin(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  try { return new URL(origin).host === request.nextUrl.host; } catch { return false; }
}
