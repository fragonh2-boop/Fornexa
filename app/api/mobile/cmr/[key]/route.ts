import { NextResponse } from "next/server";
import { documentForAccessKey, publicDocument } from "@/lib/cmr-access";
import { createSupabaseAdmin } from "@/lib/supabase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ key: string }> }) {
  const { key } = await context.params;

  try {
    const document = await documentForAccessKey(decodeURIComponent(key));
    if (!document) return NextResponse.json({ error: "CMR Key no válida o revocada." }, { status: 404 });
    const tenantId = String(document.tenant_id ?? "");
    if (!tenantId) throw new Error("El CMR no tiene tenant asociado.");

    const supabase = createSupabaseAdmin();
    const [{ data: stops, error: stopsError }, { data: events, error: eventsError }, { data: evidence, error: evidenceError }] = await Promise.all([
      supabase.from("transport_stops").select("*").eq("cmr_id", document.id).eq("tenant_id", tenantId).order("sequence"),
      supabase.from("transport_events").select("id,stop_id,event_type,occurred_at,latitude,longitude,payload").eq("cmr_id", document.id).eq("tenant_id", tenantId).order("occurred_at", { ascending: false }).limit(200),
      supabase.from("transport_evidence").select("id,stop_id,kind,captured_at").eq("cmr_id", document.id).eq("tenant_id", tenantId).order("captured_at", { ascending: false }),
    ]);
    if (stopsError) throw stopsError;
    if (eventsError) throw eventsError;
    if (evidenceError) throw evidenceError;

    const evidenceCount = new Map<string, number>();
    for (const item of evidence ?? []) evidenceCount.set(item.stop_id, (evidenceCount.get(item.stop_id) ?? 0) + 1);

    const metadata = asRecord(document.metadata);
    const stopDetails = Array.isArray(metadata.stopDetails) ? metadata.stopDetails.map(asRecord) : [];

    return NextResponse.json({
      document: publicDocument(document),
      stops: (stops ?? []).map(stop => {
        const detail = stopDetails.find(item => Number(item.sequence) === Number(stop.sequence)) ?? {};
        const contactPhone = text(detail.contactPhone) || stop.contact_phone || "";
        return {
          ...stop,
          address: text(detail.fullAddress) || stop.address,
          contact_name: text(detail.contactName),
          contact_phone: contactPhone,
          reference: text(detail.reference),
          window_start: text(detail.windowStart) || stop.window_start,
          window_end: text(detail.windowEnd) || stop.window_end,
          orders: Array.isArray(detail.orders) ? detail.orders : [],
          evidenceCount: evidenceCount.get(stop.id) ?? 0,
          contactMissing: !contactPhone,
        };
      }),
      events,
      sync: { serverTime: new Date().toISOString(), pollAfterSeconds: 15 },
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Mobile import error", error);
    return NextResponse.json({ error: "No se pudo importar el transporte." }, { status: 500 });
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}
