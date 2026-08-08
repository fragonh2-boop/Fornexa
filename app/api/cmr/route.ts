import { NextRequest, NextResponse } from "next/server";
import { createCmrKey } from "@/lib/cmr-access";
import { createSupabaseAdmin, numericValue } from "@/lib/supabase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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
  adr?: string;
  adrRegime?: string;
  unNumber?: string;
  adrClass?: string;
  packingGroup?: string;
  tunnelCode?: string;
  adrDescription?: string;
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
  if (missing.length) {
    return NextResponse.json({ error: "El CMR está incompleto.", missing }, { status: 422 });
  }

  const supabase = createSupabaseAdmin();
  const { data: cmrNumber, error: numberError } = await supabase.rpc("next_cmr_number");
  if (numberError || !cmrNumber) return failure(numberError ?? new Error("No se pudo numerar el CMR."));

  const cmrKey = createCmrKey();
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
    instructions: input.instrucciones?.trim() || null,
    adr: {
      declared: input.adr || "",
      regime: input.adrRegime || "",
      unNumber: input.unNumber || "",
      class: input.adrClass || "",
      packingGroup: input.packingGroup || "",
      tunnelCode: input.tunnelCode || "",
      description: input.adrDescription || "",
    },
  };

  const { data: document, error: documentError } = await supabase
    .from("cmr_documents")
    .insert(documentPayload)
    .select("*")
    .single();
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
    payload: { cmrNumber, source: input.source || "expedicion", actor: "FORNEXA Web" },
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

function failure(error: unknown) {
  console.error("CMR API error", error);
  return NextResponse.json({ error: "No se pudo completar la operación CMR." }, { status: 500 });
}

function isSameOrigin(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  try { return new URL(origin).host === request.nextUrl.host; } catch { return false; }
}
