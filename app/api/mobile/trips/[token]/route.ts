import { NextResponse } from "next/server";

import { mobileTripAccessForToken } from "@/lib/mobile-trip-access";
import { createSupabaseAdmin } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params;
  const access = await mobileTripAccessForToken(token);
  if (!access) return NextResponse.json({ error: "Viaje no disponible" }, { status: 404 });

  const supabase = createSupabaseAdmin();
  const { data: trip, error: tripError } = await supabase
    .from("trips")
    .select("id, code, status, planned_start, actual_start, planned_end, actual_end, trailer_registration, vehicle:vehicles(id,registration,vehicle_type), driver:drivers(id,name,phone)")
    .eq("id", access.trip_id)
    .eq("tenant_id", access.tenant_id)
    .maybeSingle();

  if (tripError || !trip) return NextResponse.json({ error: "Viaje no disponible" }, { status: 404 });

  const { data: legs, error: legsError } = await supabase
    .from("trip_expeditions")
    .select("id, sequence, expedition:expeditions(id,code,status,planned_departure,planned_arrival)")
    .eq("trip_id", access.trip_id)
    .eq("tenant_id", access.tenant_id)
    .order("sequence", { ascending: true });

  if (legsError) return NextResponse.json({ error: "No se pudo cargar el viaje" }, { status: 500 });

  const expeditionIds = (legs ?? [])
    .map((leg: any) => leg.expedition?.id)
    .filter((id: unknown): id is string => typeof id === "string");

  const { data: cmrs, error: cmrError } = expeditionIds.length
    ? await supabase
        .from("cmr_documents")
        .select("id, cmr_number, status, expedition_record_id, sender, recipient, pickup_location, delivery_location, goods_description, packages, packaging, gross_weight, volume, adr")
        .eq("tenant_id", access.tenant_id)
        .in("expedition_record_id", expeditionIds)
        .is("access_key_revoked_at", null)
    : { data: [], error: null };

  if (cmrError) return NextResponse.json({ error: "No se pudieron cargar los CMR" }, { status: 500 });

  const cmrIds = (cmrs ?? []).map((cmr: any) => cmr.id);
  const [{ data: stops, error: stopsError }, { data: evidence, error: evidenceError }] = cmrIds.length
    ? await Promise.all([
        supabase
          .from("transport_stops")
          .select("id, cmr_id, sequence, stop_type, company, address, window_start, window_end, contact_name, contact_phone, latitude, longitude, status, arrived_at, completed_at, operational_reference")
          .eq("tenant_id", access.tenant_id)
          .in("cmr_id", cmrIds)
          .order("sequence", { ascending: true }),
        supabase
          .from("transport_evidence")
          .select("id,stop_id")
          .eq("tenant_id", access.tenant_id)
          .in("cmr_id", cmrIds),
      ])
    : [{ data: [], error: null }, { data: [], error: null }];

  if (stopsError) return NextResponse.json({ error: "No se pudieron cargar las paradas" }, { status: 500 });
  if (evidenceError) return NextResponse.json({ error: "No se pudo cargar el estado POD" }, { status: 500 });

  const evidenceCount = new Map<string, number>();
  for (const item of evidence ?? []) evidenceCount.set(item.stop_id, (evidenceCount.get(item.stop_id) ?? 0) + 1);

  const cmrsByExpedition = new Map<string, any[]>();
  for (const cmr of cmrs ?? []) {
    const key = (cmr as any).expedition_record_id;
    if (!key) continue;
    const bucket = cmrsByExpedition.get(key) ?? [];
    bucket.push({
      ...cmr,
      stops: (stops ?? [])
        .filter((stop: any) => stop.cmr_id === (cmr as any).id)
        .map((stop: any) => ({
          ...stop,
          reference: stop.operational_reference,
          evidenceCount: evidenceCount.get(stop.id) ?? 0,
          contactMissing: !String(stop.contact_phone ?? "").trim(),
        })),
    });
    cmrsByExpedition.set(key, bucket);
  }

  return NextResponse.json({
    trip,
    expeditions: (legs ?? []).map((leg: any) => ({
      sequence: leg.sequence,
      ...leg.expedition,
      cmrs: leg.expedition?.id ? cmrsByExpedition.get(leg.expedition.id) ?? [] : [],
    })),
    capability: {
      expiresAt: access.expires_at,
      driverId: access.driver_id,
    },
  }, { headers: { "Cache-Control": "private, no-cache, no-store, max-age=0, must-revalidate" } });
}
