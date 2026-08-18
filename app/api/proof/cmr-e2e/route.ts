import { NextRequest, NextResponse } from "next/server";
import { POST as createCmr } from "@/app/api/cmr/route";
import { GET as readCmr } from "@/app/api/cmr/[cmr]/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PROOF_TOKEN = "fornexa-e2e-20260818-x7p4";

export async function GET(request: NextRequest) {
  if (request.nextUrl.searchParams.get("token") !== PROOF_TOKEN) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const origin = request.nextUrl.origin;
  const payload = {
    source: "e2e-proof",
    expediciones: ["EX-26000001", "EX-26000002"],
    viaje: "VJ-26000001",
    customerIds: ["CLI-000039"],
    expedidor: "FORNEXA E2E Shipper Valencia",
    destinatario: "FORNEXA E2E Consignee Hamburg",
    carga: "Valencia, España",
    entrega: "Hamburg, Deutschland",
    transportista: "FORNEXA E2E Carrier",
    matricula: "E2E-2608",
    remolque: "TRL-E2E",
    mercancia: "Componentes industriales de prueba E2E",
    bultos: "10",
    embalaje: "Palets EUR",
    peso: "1250",
    volumen: "4.8",
    senderInstructions: "Prueba E2E canónica FORNEXA 2026-08-18",
    carrierReservations: "Sin reservas - prueba técnica",
    particularTerms: "Documento de prueba técnica",
    goodsLines: [
      { marks: "EX-26000001", packages: 6, packaging: "Palets EUR", description: "E2E line A", weight: 750, volume: 2.8 },
      { marks: "EX-26000002", packages: 4, packaging: "Palets EUR", description: "E2E line B", weight: 500, volume: 2.0 }
    ],
    attachedDocuments: [{ type: "proof", title: "E2E canonical proof", reference: "E2E-20260818" }],
    stopDetails: [
      { sequence: 1, contactName: "E2E Origin", contactPhone: "+34000000001", reference: "E2E-PICKUP", fullAddress: "Valencia, España" },
      { sequence: 2, contactName: "E2E Destination", contactPhone: "+49000000002", reference: "E2E-DELIVERY", fullAddress: "Hamburg, Deutschland" }
    ]
  };

  const createRequest = new NextRequest(new URL("/api/cmr", request.url), {
    method: "POST",
    headers: { "content-type": "application/json", origin },
    body: JSON.stringify(payload),
  });
  const createResponse = await createCmr(createRequest);
  const created = await createResponse.json().catch(() => ({ error: "Invalid JSON response" })) as Record<string, unknown>;
  if (!createResponse.ok) {
    return NextResponse.json({ create: { status: createResponse.status, body: created } }, { status: 500 });
  }

  const cmrNumber = String(created.cmrNumber ?? "");
  const cmrKey = String(created.cmrKey ?? "");
  const readRequest = new Request(new URL(`/api/cmr/${encodeURIComponent(cmrNumber)}`, request.url), {
    headers: { "x-fornexa-key": cmrKey },
  });
  const readResponse = await readCmr(readRequest, { params: Promise.resolve({ cmr: cmrNumber }) });
  const detail = await readResponse.json().catch(() => ({ error: "Invalid JSON response" })) as Record<string, unknown>;

  const canonical = (detail.canonical ?? {}) as Record<string, unknown>;
  const list = (key: string) => Array.isArray(canonical[key]) ? canonical[key] as unknown[] : [];
  const document = (detail.document ?? {}) as Record<string, unknown>;

  return NextResponse.json({
    create: { status: createResponse.status, id: created.id, cmrNumber, expeditionIds: created.expeditionIds },
    read: {
      status: readResponse.status,
      cmrNumber: document.cmr_number,
      schemaVersion: ((document.metadata ?? {}) as Record<string, unknown>).schemaVersion,
      expeditions: list("expeditions").length,
      parties: list("parties").length,
      goodsLines: list("goodsLines").length,
      clauses: list("clauses").length,
      attachments: list("attachments").length,
      signatures: list("signatures").length,
      stops: Array.isArray(detail.stops) ? detail.stops.length : 0,
      events: Array.isArray(detail.events) ? detail.events.length : 0,
    },
    ok: readResponse.ok,
  }, { status: readResponse.ok ? 200 : 500 });
}
