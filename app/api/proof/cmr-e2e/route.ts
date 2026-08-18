import { NextRequest, NextResponse } from "next/server";

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

  const response = await fetch(`${origin}/api/cmr`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin,
    },
    body: JSON.stringify(payload),
    cache: "no-store",
  });

  const body = await response.json().catch(() => ({ error: "Invalid JSON response" }));
  return NextResponse.json({ status: response.status, ok: response.ok, body }, { status: response.ok ? 200 : 500 });
}
