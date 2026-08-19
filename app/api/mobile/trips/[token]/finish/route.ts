import { NextResponse } from "next/server";

import { mobileTripAccessForToken } from "@/lib/mobile-trip-access";
import { createSupabaseAdmin } from "@/lib/supabase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(_request: Request, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params;
  const access = await mobileTripAccessForToken(token);
  if (!access) return NextResponse.json({ error: "Viaje no disponible." }, { status: 401 });

  const supabase = createSupabaseAdmin();
  const { data: trip, error: tripError } = await supabase
    .from("trips")
    .select("id,code,status")
    .eq("id", access.trip_id)
    .eq("tenant_id", access.tenant_id)
    .maybeSingle();
  if (tripError || !trip) return NextResponse.json({ error: "Viaje no disponible." }, { status: 404 });
  if (trip.status === "COMPLETED") return NextResponse.json({ ok: true, trip: trip.code, alreadyCompleted: true }, { headers: { "Cache-Control": "no-store" } });
  if (trip.status === "CANCELLED") return NextResponse.json({ error: "El viaje está cancelado." }, { status: 409 });

  const { data: links, error: linksError } = await supabase
    .from("trip_expeditions")
    .select("expedition_id")
    .eq("tenant_id", access.tenant_id)
    .eq("trip_id", access.trip_id);
  if (linksError) return NextResponse.json({ error: "No se pudo validar el viaje." }, { status: 500 });

  const expeditionIds = (links ?? []).map(item => item.expedition_id).filter(Boolean);
  const { data: cmrs, error: cmrError } = expeditionIds.length
    ? await supabase
        .from("cmr_documents")
        .select("id,status")
        .eq("tenant_id", access.tenant_id)
        .in("expedition_record_id", expeditionIds)
    : { data: [], error: null };
  if (cmrError) return NextResponse.json({ error: "No se pudieron validar los CMR." }, { status: 500 });

  const cmrIds = (cmrs ?? []).map(item => item.id);
  const { data: stops, error: stopsError } = cmrIds.length
    ? await supabase
        .from("transport_stops")
        .select("id,status")
        .eq("tenant_id", access.tenant_id)
        .in("cmr_id", cmrIds)
    : { data: [], error: null };
  if (stopsError) return NextResponse.json({ error: "No se pudieron validar las paradas." }, { status: 500 });
  if (!stops?.length) return NextResponse.json({ error: "El viaje no tiene paradas operativas." }, { status: 409 });

  const pending = stops.filter(stop => stop.status !== "Completada");
  if (pending.length) {
    return NextResponse.json({ error: `Quedan ${pending.length} parada(s) sin completar.` }, { status: 409 });
  }

  const now = new Date().toISOString();
  const { error: updateError } = await supabase
    .from("trips")
    .update({ status: "COMPLETED", actual_end: now, updated_at: now })
    .eq("id", access.trip_id)
    .eq("tenant_id", access.tenant_id);
  if (updateError) return NextResponse.json({ error: "No se pudo finalizar el viaje." }, { status: 500 });

  return NextResponse.json({ ok: true, trip: trip.code, completedAt: now }, { headers: { "Cache-Control": "no-store" } });
}
