import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { authorizeMobileStop } from "@/lib/mobile-transport-auth";
import { createSupabaseAdmin, numericValue } from "@/lib/supabase-admin";

export const runtime = "nodejs";

const allowed = new Set(["arrival", "complete", "incident", "signature"]);

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id: stopId } = await context.params;
  const idempotencyKey = request.headers.get("x-idempotency-key") ?? randomUUID();
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const type = String(body.type ?? "");

  if (!allowed.has(type)) return NextResponse.json({ error: "Tipo de evento no válido." }, { status: 422 });

  try {
    const authorization = await authorizeMobileStop(request, stopId);
    if (!authorization) return NextResponse.json({ error: "Credencial Mobile no válida para esta parada." }, { status: 401 });
    const { document, stop, tenantId, tripId } = authorization;
    const supabase = createSupabaseAdmin();

    const overwriteArrival = body.overwrite === true;
    if (type === "arrival" && stop.arrived_at && !overwriteArrival) {
      return NextResponse.json({
        error: "La llegada ya estaba registrada.",
        code: "ARRIVAL_ALREADY_RECORDED",
        previousArrival: stop.arrived_at,
      }, { status: 409 });
    }

    if (type === "complete") {
      const { count, error: evidenceError } = await supabase
        .from("transport_evidence")
        .select("id", { count: "exact", head: true })
        .eq("stop_id", stopId)
        .eq("tenant_id", tenantId);
      if (evidenceError) throw evidenceError;
      if (!count) return NextResponse.json({ error: "Debes adjuntar una fotografía antes de completar la parada." }, { status: 422 });
    }

    const occurredAt = typeof body.occurredAt === "string" ? body.occurredAt : new Date().toISOString();
    const latitude = numericValue(body.latitude);
    const longitude = numericValue(body.longitude);
    const eventType = { arrival: "stop_arrived", complete: "stop_completed", incident: "incident_reported", signature: "signature_added" }[type];

    const payload = body.payload && typeof body.payload === "object" ? body.payload : {};
    const { error: eventError } = await supabase.from("transport_events").upsert({
      tenant_id: tenantId,
      cmr_id: document.id,
      stop_id: stopId,
      event_type: eventType,
      occurred_at: occurredAt,
      latitude,
      longitude,
      payload: type === "arrival"
        ? { ...payload, overwrite: overwriteArrival, previousArrival: overwriteArrival ? stop.arrived_at : null }
        : payload,
      idempotency_key: idempotencyKey,
    }, { onConflict: "idempotency_key", ignoreDuplicates: true });
    if (eventError) throw eventError;

    const stopUpdate = type === "arrival"
      ? { status: "Llegada", arrived_at: occurredAt }
      : type === "complete"
        ? { status: "Completada", completed_at: occurredAt }
        : type === "incident"
          ? { status: "Incidencia" }
          : {};

    if (Object.keys(stopUpdate).length) {
      const { error: updateError } = await supabase
        .from("transport_stops")
        .update(stopUpdate)
        .eq("id", stopId)
        .eq("tenant_id", tenantId);
      if (updateError) throw updateError;

      if (stop.trip_stop_id) {
        const tripStopUpdate = type === "arrival"
          ? { status: "ARRIVED", arrived_at: occurredAt, updated_at: occurredAt }
          : type === "complete"
            ? { status: "COMPLETED", completed_at: occurredAt, updated_at: occurredAt }
            : type === "incident"
              ? { status: "INCIDENT", updated_at: occurredAt }
              : {};
        const { error: tripStopError } = await supabase
          .from("trip_stops")
          .update(tripStopUpdate)
          .eq("id", stop.trip_stop_id)
          .eq("tenant_id", tenantId);
        if (tripStopError) throw tripStopError;
      }
    }

    let allStopsCompleted = false;
    if (type === "arrival") {
      await supabase.from("cmr_documents").update({ status: "En tránsito", updated_at: occurredAt }).eq("id", document.id).eq("tenant_id", tenantId);

      if (tripId) {
        const { data: currentTrip, error: tripError } = await supabase
          .from("trips")
          .select("status,actual_start")
          .eq("id", tripId)
          .eq("tenant_id", tenantId)
          .maybeSingle();
        if (tripError) throw tripError;
        if (currentTrip && !["COMPLETED", "CANCELLED"].includes(currentTrip.status)) {
          const { error: tripUpdateError } = await supabase
            .from("trips")
            .update({
              status: "IN_PROGRESS",
              actual_start: currentTrip.actual_start ?? occurredAt,
              updated_at: occurredAt,
            })
            .eq("id", tripId)
            .eq("tenant_id", tenantId);
          if (tripUpdateError) throw tripUpdateError;
        }
      }
    }
    if (type === "complete") {
      const { data: states, error: statesError } = await supabase.from("transport_stops").select("status").eq("cmr_id", document.id).eq("tenant_id", tenantId);
      if (statesError) throw statesError;
      allStopsCompleted = Boolean(states?.length && states.every(item => item.status === "Completada"));
      const status = allStopsCompleted ? "Entregado" : "En tránsito";
      await supabase.from("cmr_documents").update({ status, updated_at: occurredAt }).eq("id", document.id).eq("tenant_id", tenantId);
    }

    return NextResponse.json({ ok: true, eventType, overwritten: type === "arrival" && overwriteArrival, allStopsCompleted }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Mobile stop event error", error);
    return NextResponse.json({ error: "No se pudo registrar el evento." }, { status: 500 });
  }
}
