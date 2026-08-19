import type { NextRequest } from "next/server";

import { documentForAccessKey } from "@/lib/cmr-access";
import { mobileTripAccessForToken } from "@/lib/mobile-trip-access";
import { createSupabaseAdmin } from "@/lib/supabase-admin";

export type MobileTransportAuthorization = {
  tenantId: string;
  document: any;
  stop: any;
  mode: "cmr" | "trip";
  tripId?: string | null;
};

export async function authorizeMobileStop(
  request: NextRequest,
  stopId: string,
): Promise<MobileTransportAuthorization | null> {
  const accessKey = request.headers.get("x-fornexa-key") ?? "";
  if (accessKey) {
    const document = await documentForAccessKey(accessKey);
    if (!document) return null;
    const tenantId = String(document.tenant_id ?? "");
    if (!tenantId) return null;

    const supabase = createSupabaseAdmin();
    const { data: stop, error } = await supabase
      .from("transport_stops")
      .select("*")
      .eq("id", stopId)
      .eq("cmr_id", document.id)
      .eq("tenant_id", tenantId)
      .maybeSingle();
    if (error || !stop) return null;
    return {
      tenantId,
      document,
      stop,
      mode: "cmr",
      tripId: document.trip_record_id ?? null,
    };
  }

  const tripToken = request.headers.get("x-fornexa-trip-token") ?? "";
  const access = await mobileTripAccessForToken(tripToken);
  if (!access) return null;

  const supabase = createSupabaseAdmin();
  const { data: stop, error: stopError } = await supabase
    .from("transport_stops")
    .select("*")
    .eq("id", stopId)
    .eq("tenant_id", access.tenant_id)
    .maybeSingle();
  if (stopError || !stop) return null;

  const { data: document, error: documentError } = await supabase
    .from("cmr_documents")
    .select("*")
    .eq("id", stop.cmr_id)
    .eq("tenant_id", access.tenant_id)
    .eq("trip_record_id", access.trip_id)
    .maybeSingle();
  if (documentError || !document?.expedition_record_id) return null;

  const { data: link, error: linkError } = await supabase
    .from("trip_expeditions")
    .select("id")
    .eq("tenant_id", access.tenant_id)
    .eq("trip_id", access.trip_id)
    .eq("expedition_id", document.expedition_record_id)
    .maybeSingle();
  if (linkError || !link) return null;

  if (stop.trip_stop_id) {
    const { data: tripStop, error: tripStopError } = await supabase
      .from("trip_stops")
      .select("id")
      .eq("id", stop.trip_stop_id)
      .eq("tenant_id", access.tenant_id)
      .eq("trip_id", access.trip_id)
      .maybeSingle();
    if (tripStopError || !tripStop) return null;
  }

  return {
    tenantId: access.tenant_id,
    document,
    stop,
    mode: "trip",
    tripId: access.trip_id,
  };
}
