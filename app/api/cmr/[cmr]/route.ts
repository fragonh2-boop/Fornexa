import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import {
  cmrViewSessionCookie,
  documentForAccessKey,
  documentForViewSession,
  publicDocument,
} from "@/lib/cmr-access";
import { createSupabaseAdmin } from "@/lib/supabase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ cmr: string }> }) {
  const { cmr } = await context.params;
  const cmrNumber = decodeURIComponent(cmr).toUpperCase();

  try {
    const headerKey = request.headers.get("x-fornexa-key") ?? "";
    const store = await cookies();
    const sessionToken = store.get(cmrViewSessionCookie(cmrNumber))?.value;
    const accessDocument = headerKey
      ? await documentForAccessKey(headerKey)
      : await documentForViewSession(sessionToken, cmrNumber);

    if (!accessDocument) return NextResponse.json({ error: "CMR Key o sesión no válida/revocada." }, { status: 401 });
    if (accessDocument.cmr_number !== cmrNumber) return NextResponse.json({ error: "La capability no pertenece al CMR." }, { status: 403 });
    const tenantId = String(accessDocument.tenant_id ?? "");
    if (!tenantId) throw new Error("El CMR no tiene tenant asociado.");
    const supabase = createSupabaseAdmin();

    const [
      { data: stops, error: stopsError },
      { data: events, error: eventsError },
      { data: expeditions, error: expeditionsError },
      { data: parties, error: partiesError },
      { data: goodsLines, error: goodsLinesError },
      { data: clauses, error: clausesError },
      { data: attachments, error: attachmentsError },
      { data: signatures, error: signaturesError },
    ] = await Promise.all([
      supabase.from("transport_stops").select("*").eq("cmr_id", accessDocument.id).eq("tenant_id", tenantId).order("sequence"),
      supabase.from("transport_events").select("*").eq("cmr_id", accessDocument.id).eq("tenant_id", tenantId).order("occurred_at", { ascending: false }),
      supabase.from("cmr_expeditions").select("sequence,expedition_id,expeditions(id,code,status)").eq("cmr_id", accessDocument.id).order("sequence"),
      supabase.from("cmr_parties").select("*").eq("cmr_id", accessDocument.id).order("role").order("sequence"),
      supabase.from("cmr_goods_lines").select("*").eq("cmr_id", accessDocument.id).order("sequence"),
      supabase.from("cmr_clauses").select("*").eq("cmr_id", accessDocument.id).order("clause_type").order("sequence"),
      supabase.from("cmr_attachments").select("*").eq("cmr_id", accessDocument.id).order("sequence"),
      supabase.from("cmr_signatures").select("*").eq("cmr_id", accessDocument.id).order("signed_at"),
    ]);

    const error = stopsError || eventsError || expeditionsError || partiesError || goodsLinesError || clausesError || attachmentsError || signaturesError;
    if (error) throw error;

    const canonical = {
      expeditions: expeditions ?? [],
      parties: parties ?? [],
      goodsLines: goodsLines ?? [],
      clauses: clauses ?? [],
      attachments: attachments ?? [],
      signatures: signatures ?? [],
    };
    const document = projectCanonicalDocument(publicDocument(accessDocument), canonical);
    const canonicalEvents = [
      ...(events ?? []).filter(event => event.event_type !== "signature_added"),
      ...canonical.signatures.map(signature => ({ event_type: "signature_added", occurred_at: signature.signed_at, payload: { role: signature.role, canonical: true } })),
    ];

    return NextResponse.json({ document, stops, events: canonicalEvents, canonical }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("CMR detail API error", error);
    return NextResponse.json({ error: "No se pudo cargar el CMR." }, { status: 500 });
  }
}

type Canonical = {
  expeditions: Array<Record<string, unknown>>;
  parties: Array<Record<string, unknown>>;
  goodsLines: Array<Record<string, unknown>>;
  clauses: Array<Record<string, unknown>>;
  attachments: Array<Record<string, unknown>>;
  signatures: Array<Record<string, unknown>>;
};

function projectCanonicalDocument(document: Record<string, unknown>, canonical: Canonical) {
  const hasCanonical = canonical.parties.length > 0 || canonical.goodsLines.length > 0 || canonical.clauses.length > 0 || canonical.attachments.length > 0;
  if (!hasCanonical) return document;

  const sender = canonical.parties.find(item => item.role === "sender");
  const consignee = canonical.parties.find(item => item.role === "consignee");
  const carrier = canonical.parties.find(item => item.role === "carrier");
  const successiveCarriers = canonical.parties.filter(item => item.role === "successive_carrier");
  const clause = (type: string) => canonical.clauses.find(item => item.clause_type === type)?.text_value;
  const previousMetadata = object(document.metadata);

  const cmr = {
    senderInstructions: text(clause("sender_instruction")) || text(document.sender_instructions),
    carrierReservations: text(clause("carrier_reservation")) || text(document.carrier_reservations),
    particularTerms: text(clause("particular_term")) || text(document.particular_terms),
    attachedDocuments: canonical.attachments.map(item => ({ type: text(item.document_type), title: text(item.title), reference: text(item.external_reference) })),
    successiveCarriers: successiveCarriers.map(item => ({ name: text(item.legal_name), taxId: text(item.tax_id), address: text(item.address), country: text(item.country_code) })),
    goodsLines: canonical.goodsLines.map(item => ({
      marks: text(item.marks_numbers),
      packages: item.packages,
      packaging: text(item.packaging_description) || text(item.packaging_code),
      description: text(item.goods_description),
      statisticalNumber: text(item.statistical_number),
      weight: item.gross_weight,
      volume: item.volume,
      adr: { declared: Boolean(item.adr_declared), unNumber: text(item.un_number), class: text(item.adr_class), labels: text(item.labels), packingGroup: text(item.packing_group), tunnelCode: text(item.tunnel_code), description: text(item.adr_description) },
    })),
    carriageCharges: object(document.carriage_charges),
    cashOnDelivery: object(document.cash_on_delivery),
    establishedAt: text(document.established_at),
    establishedOn: text(document.established_on),
  };

  return {
    ...document,
    sender: text(sender?.legal_name) || document.sender,
    recipient: text(consignee?.legal_name) || document.recipient,
    carrier: text(carrier?.legal_name) || document.carrier,
    pickup_location: text(sender?.address) || document.pickup_location,
    delivery_location: text(consignee?.address) || document.delivery_location,
    metadata: { ...previousMetadata, schemaVersion: 3, cmr },
  };
}

function object(value: unknown): Record<string, unknown> { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
function text(value: unknown) { return String(value ?? "").trim(); }
