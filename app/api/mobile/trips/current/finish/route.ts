import { NextRequest, NextResponse } from "next/server";

import { mobileTripAccessForToken } from "@/lib/mobile-trip-access";
import { createSupabaseAdmin } from "@/lib/supabase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function noStore(body: unknown, init?: ResponseInit) {
  return NextResponse.json(body, {
    ...init,
    headers: {
      ...(init?.headers ?? {}),
      "Cache-Control": "private, no-cache, no-store, max-age=0, must-revalidate",
      Pragma: "no-cache",
      Expires: "0",
    },
  });
}

export async function POST(request: NextRequest) {
  const token = request.headers.get("x-fornexa-trip-token") ?? "";
  const access = await mobileTripAccessForToken(token);
  if (!access) return noStore({ error: "Viaje no disponible." }, { status: 401 });

  const supabase = createSupabaseAdmin();
  const { data: trip, error: tripError } = await supabase
    .from("trips")
    .select("id,code,status")
    .eq("id", access.trip_id)
    .eq("tenant_id", access.tenant_id)
    .maybeSingle();
  if (tripError || !trip) return noStore({ error: "Viaje no disponible." }, { status: 404 });
  if (trip.status === "COMPLETED") return noStore({ ok: true, trip: trip.code, alreadyCompleted: true });
  if (trip.status === "CANCELLED") return noStore({ error: "El viaje está cancelado." }, { status: 409 });

  const { data: links, error: linksError } = await supabase
    .from("trip_expeditions")
    .select("expedition_id")
    .eq("tenant_id", access.tenant_id)
    .eq("trip_id", access.trip_id);
  if (linksError) return noStore({ error: "No se pudo validar el viaje." }, { status: 500 });

  const expeditionIds = (links ?? []).map(item => item.expedition_id).filter(Boolean);
  const { data: cmrs, error: cmrError } = expeditionIds.length
    ? await supabase
        .from("cmr_documents")
        .select("id")
        .eq("tenant_id", access.tenant_id)
        .eq("trip_record_id", access.trip_id)
        .in("expedition_record_id", expeditionIds)
    : { data: [], error: null };
  if (cmrError) return noStore({ error: "No se pudieron validar los CMR." }, { status: 500 });

  const cmrIds = (cmrs ?? []).map(item => item.id);
  const { data: stops, error: stopsError } = cmrIds.length
    ? await supabase
        .from("transport_stops")
        .select("id,status,trip_stop_id")
        .eq("tenant_id", access.tenant_id)
        .in("cmr_id", cmrIds)
    : { data: [], error: null };
  if (stopsError) return noStore({ error: "No se pudieron validar las paradas." }, { status: 500 });
  if (!stops?.length) return noStore({ error: "El viaje no tiene paradas operativas." }, { status: 409 });

  const pending = stops.filter(stop => stop.status !== "Completada");
  if (pending.length) return noStore({ error: `Quedan ${pending.length} parada(s) sin completar.` }, { status: 409 });

  const { data: canonicalStops, error: canonicalError } = await supabase
    .from("trip_stops")
    .select("id,status")
    .eq("tenant_id", access.tenant_id)
    .eq("trip_id", access.trip_id)
    .order("sequence", { ascending: true });
  if (canonicalError) return noStore({ error: "No se pudieron validar las paradas operativas." }, { status: 500 });
  if (!canonicalStops?.length) return noStore({ error: "El viaje no tiene paradas operativas." }, { status: 409 });

  const pendingCanonical = canonicalStops.filter(stop => stop.status !== "COMPLETED");
  if (pendingCanonical.length) {
    return noStore({ error: `Quedan ${pendingCanonical.length} parada(s) operativa(s) sin completar.` }, { status: 409 });
  }

  const now = new Date().toISOString();
  const { error: updateError } = await supabase
    .from("trips")
    .update({ status: "COMPLETED", actual_end: now, updated_at: now })
    .eq("id", access.trip_id)
    .eq("tenant_id", access.tenant_id);
  if (updateError) return noStore({ error: "No se pudo finalizar el viaje." }, { status: 500 });

  const { error: revokeError } = await supabase
    .from("mobile_trip_access")
    .update({ revoked_at: now })
    .eq("tenant_id", access.tenant_id)
    .eq("trip_id", access.trip_id)
    .is("revoked_at", null);
  if (revokeError) {
    console.error("Trip completed but Mobile access revocation failed", revokeError);
    return noStore({ error: "El viaje se cerró, pero no se pudo revocar el acceso Mobile." }, { status: 500 });
  }

  return noStore({ ok: true, trip: trip.code, completedAt: now, accessRevoked: true });
}
