import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { authorizeMobileStop } from "@/lib/mobile-transport-auth";
import { createSupabaseAdmin } from "@/lib/supabase-admin";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const idempotencyKey = request.headers.get("x-idempotency-key") ?? randomUUID();

  try {
    const formData = await request.formData();
    const stopId = String(formData.get("stopId") ?? "");
    const file = formData.get("photo");
    if (!stopId || !(file instanceof File)) {
      return NextResponse.json({ error: "La parada y la fotografía son obligatorias." }, { status: 422 });
    }
    if (!file.type.startsWith("image/") || file.size > 10 * 1024 * 1024) {
      return NextResponse.json({ error: "La evidencia debe ser una imagen de hasta 10 MB." }, { status: 422 });
    }

    const authorization = await authorizeMobileStop(request, stopId);
    if (!authorization) return NextResponse.json({ error: "Credencial Mobile no válida para esta parada." }, { status: 401 });
    const { document, tenantId, tripId } = authorization;
    const supabase = createSupabaseAdmin();

    if (tripId) {
      const { data: trip, error: tripStateError } = await supabase
        .from("trips")
        .select("status")
        .eq("id", tripId)
        .eq("tenant_id", tenantId)
        .maybeSingle();
      if (tripStateError) throw tripStateError;
      if (!trip) return NextResponse.json({ error: "El Viaje asociado no está disponible." }, { status: 409 });
      if (["COMPLETED", "CANCELLED"].includes(trip.status)) {
        return NextResponse.json({ error: "El Viaje está cerrado y no admite nuevas evidencias Mobile." }, { status: 409 });
      }
    }

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

    return NextResponse.json({ evidence }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Evidence upload error", error);
    return NextResponse.json({ error: "No se pudo guardar la evidencia." }, { status: 500 });
  }
}
