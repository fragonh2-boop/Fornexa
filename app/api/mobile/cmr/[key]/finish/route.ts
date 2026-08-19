import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { documentForAccessKey } from "@/lib/cmr-access";
import { createSupabaseAdmin } from "@/lib/supabase-admin";

export const runtime = "nodejs";

export async function POST(request: NextRequest, context: { params: Promise<{ key: string }> }) {
  const { key } = await context.params;
  const accessKey = request.headers.get("x-fornexa-key") ?? decodeURIComponent(key);
  const idempotencyKey = request.headers.get("x-idempotency-key") ?? randomUUID();

  try {
    const document = await documentForAccessKey(accessKey);
    if (!document) return NextResponse.json({ error: "CMR Key no válida o revocada." }, { status: 401 });
    const tenantId = String(document.tenant_id ?? "");
    if (!tenantId) throw new Error("El CMR no tiene tenant asociado.");
    if (document.status === "Cerrado") return NextResponse.json({ ok: true, alreadyFinished: true });

    const supabase = createSupabaseAdmin();
    const { data: stops, error: stopsError } = await supabase
      .from("transport_stops")
      .select("status")
      .eq("cmr_id", document.id)
      .eq("tenant_id", tenantId);
    if (stopsError) throw stopsError;
    if (!stops?.length || stops.some(stop => stop.status !== "Completada")) {
      return NextResponse.json({ error: "Todas las paradas deben estar completadas antes de finalizar el trabajo." }, { status: 422 });
    }

    const finishedAt = new Date().toISOString();
    const { error: eventError } = await supabase.from("transport_events").upsert({
      tenant_id: tenantId,
      cmr_id: document.id,
      event_type: "work_finished",
      occurred_at: finishedAt,
      payload: { actor: "FORNEXA Mobile", previousStatus: document.status },
      idempotency_key: idempotencyKey,
    }, { onConflict: "idempotency_key", ignoreDuplicates: true });
    if (eventError) throw eventError;

    const { error: updateError } = await supabase
      .from("cmr_documents")
      .update({ status: "Cerrado", updated_at: finishedAt })
      .eq("id", document.id)
      .eq("tenant_id", tenantId);
    if (updateError) throw updateError;

    return NextResponse.json({ ok: true, status: "Cerrado", finishedAt });
  } catch (error) {
    console.error("Mobile finish work error", error);
    return NextResponse.json({ error: "No se pudo finalizar el trabajo." }, { status: 500 });
  }
}
