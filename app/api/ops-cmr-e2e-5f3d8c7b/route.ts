import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase-admin";
import { POST as createCmr } from "@/app/api/cmr/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const OPS_TOKEN = "5f3d8c7b-6a7f-41aa-8d44-4c5dc9fd6db3";

export async function GET(request: Request) {
  const url = new URL(request.url);
  if (url.searchParams.get("token") !== OPS_TOKEN) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const supabase = createSupabaseAdmin();

  const deleteIds = url.searchParams.get("delete")?.split(",").map(v => v.trim()).filter(Boolean) ?? [];
  if (deleteIds.length) {
    const { error } = await supabase.from("cmr_documents").delete().in("id", deleteIds);
    return NextResponse.json({ ok: !error, deleted: deleteIds, error: error?.message ?? null });
  }

  let stage = "init";
  const created: string[] = [];
  const persist = url.searchParams.get("persist") === "1";
  try {
    stage = "load-expedition";
    const { data: expedition, error: expeditionError } = await supabase.from("expeditions").select("id,code").limit(1).maybeSingle();
    if (expeditionError) throw expeditionError;

    const base = {
      source: "e2e-test", viaje: "VJ-E2E-001", customerIds: ["E2E-CUSTOMER"], expedidor: "FORNEXA E2E Sender, S.L.", destinatario: "FORNEXA E2E Consignee SAS", carga: "Valencia, España", entrega: "Lyon, Francia", transportista: "FORNEXA E2E Carrier, S.L.", matricula: "E2E-1234", remolque: "E2E-R-01", mercancia: "Mercancía de prueba E2E", bultos: "3", embalaje: "Palets EUR", peso: "780.5", volumen: "4.25", instrucciones: "Mantener seco", senderInstructions: "Avisar 30 minutos antes de la entrega", carrierReservations: "Sin reservas en origen", particularTerms: "Prueba canónica E2E", carriageCharges: { currency: "EUR", total: 321.45 }, cashOnDelivery: { amount: 0, currency: "EUR" }, establishedAt: "Valencia", establishedOn: "2026-08-18", adr: "S", adrRegime: "1.1.3.6", unNumber: "UN 1263", adrClass: "3", adrLabels: "3", packingGroup: "III", tunnelCode: "D/E", adrDescription: "PINTURA",
      goodsLines: [
        { marks: "E2E-ADR-1", packages: 2, packaging: "Bidones", description: "Pintura", statisticalNumber: "32089091", weight: 500.25, volume: 2.5, unNumber: "UN 1263", adrClass: "3", labels: "3", packingGroup: "III", tunnelCode: "D/E", adrDescription: "PINTURA" },
        { marks: "E2E-NONADR-2", packages: 1, packaging: "Palet", description: "Material auxiliar", statisticalNumber: "39269097", weight: 280.25, volume: 1.75 }
      ],
      attachedDocuments: [{ type: "packing_list", title: "Packing list E2E", reference: "PL-E2E-001" }, { type: "adr", title: "Declaración ADR E2E", reference: "ADR-E2E-001" }],
      successiveCarriers: [{ name: "Transport Sucesivo E2E SARL", taxId: "FR-E2E-001", address: "Paris, France", country: "FR" }]
    };

    stage = "issue-first";
    const first = await issue(url.origin, base); created.push(first.id);
    stage = "inspect-first";
    const firstCheck = await inspect(supabase, first);

    stage = "issue-second";
    const second = await issue(url.origin, { ...base, viaje: "VJ-E2E-002", expedicion: expedition?.code ?? undefined, senderInstructions: "Segunda prueba con expedición real" }); created.push(second.id);
    stage = "inspect-second";
    const secondCheck = await inspect(supabase, second);

    return NextResponse.json({ ok: true, persist, expeditionUsed: expedition ?? null, first: firstCheck, second: secondCheck });
  } catch (error) {
    return NextResponse.json({ ok: false, stage, created, error: serializeError(error) }, { status: 500 });
  } finally {
    if (!persist && created.length) await supabase.from("cmr_documents").delete().in("id", created);
  }
}

async function issue(origin: string, payload: Record<string, unknown>) {
  const request = new NextRequest(`${origin}/api/cmr`, {
    method: "POST",
    headers: { "content-type": "application/json", origin },
    body: JSON.stringify(payload),
  });
  const response = await createCmr(request);
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
  return { issued, rows: { parties: parties.data, goods: goods.data, attachments: attachments.data, clauses: clauses.data, stops: stops.data, events: events.data, bridge: bridge.data } };
}

function serializeError(error: unknown) {
  if (error instanceof Error) return { name: error.name, message: error.message, stack: error.stack?.split("\n").slice(0, 8) };
  try { return JSON.parse(JSON.stringify(error)); } catch { return String(error); }
}
