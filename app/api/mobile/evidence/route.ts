import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { documentForAccessKey } from "@/lib/cmr-access";
import { createSupabaseAdmin } from "@/lib/supabase-admin";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const accessKey = request.headers.get("x-fornexa-key") ?? "";
  const idempotencyKey = request.headers.get("x-idempotency-key") ?? randomUUID();

  try {
    const document = await documentForAccessKey(accessKey);
    if (!document) return NextResponse.json({ error: "CMR Key no válida o revocada." }, { status: 401 });
    const tenantId = String(document.tenant_id ?? "");
    if (!tenantId) throw new Error("El CMR no tiene tenant asociado.");

    const formData = await request.formData();
    const stopId = String(formData.get("stopId") ?? "");
    const file = formData.get("photo");
    if (!stopId || !(file instanceof File)) {
      return NextResponse.json({ error: "La parada y la fotografía son obligatorias." }, { status: 422 });
    }
    if (!file.type.startsWith("image/") || file.size > 10 * 1024 * 1024) {
      return NextResponse.json({ error: "La evidencia debe ser una imagen de hasta 10 MB." }, { status: 422 });
    }

    const supabase = createSupabaseAdmin();
    const { data: stop, error: stopError } = await supabase
      .from("transport_stops")
      .select("id")
      .eq("id", stopId)
      .eq("cmr_id", document.id)
      .eq("tenant_id", tenantId)
      .maybeSingle();
    if (stopError) throw stopError;
    if (!stop) return NextResponse.json({ error: "La parada no pertenece a este CMR." }, { status: 403 });

    const extension = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
    const path = `${tenantId}/${document.id}/${stopId}/${Date.now()}-${randomUUID()}.${extension}`;
    const { error: uploadError } = await supabase.storage
      .from("transport-evidence")
      .upload(path, await file.arrayBuffer(), { contentType: file.type, upsert: false });
    if (uploadError) throw uploadError;

    const { data: evidence, error: evidenceError } = await supabase
      .from("transport_evidence")
      .insert({ tenant_id: tenantId, cmr_id: document.id, stop_id: stopId, storage_path: path, metadata: { fileName: file.name, size: file.size } })
      .select("id,stop_id,kind,captured_at")
      .single();
    if (evidenceError) throw evidenceError;

    const { error: eventError } = await supabase.from("transport_events").upsert({
      tenant_id: tenantId,
      cmr_id: document.id,
      stop_id: stopId,
      event_type: "pod_photo_added",
      payload: { evidenceId: evidence.id },
      idempotency_key: idempotencyKey,
    }, { onConflict: "idempotency_key", ignoreDuplicates: true });
    if (eventError) throw eventError;

    return NextResponse.json({ evidence }, { status: 201 });
  } catch (error) {
    console.error("Evidence upload error", error);
    return NextResponse.json({ error: "No se pudo guardar la evidencia." }, { status: 500 });
  }
}
