import { NextResponse } from "next/server";
import { documentForAccessKey, publicDocument } from "@/lib/cmr-access";
import { createSupabaseAdmin } from "@/lib/supabase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ cmr: string }> }) {
  const { cmr } = await context.params;
  const cmrNumber = decodeURIComponent(cmr).toUpperCase();

  try {
    const accessDocument = await documentForAccessKey(request.headers.get("x-fornexa-key") ?? "");
    if (!accessDocument) return NextResponse.json({ error: "CMR Key no válida o revocada." }, { status: 401 });
    if (accessDocument.cmr_number !== cmrNumber) return NextResponse.json({ error: "La clave no pertenece a este CMR." }, { status: 403 });
    const supabase = createSupabaseAdmin();
    const document = publicDocument(accessDocument);

    const [{ data: stops, error: stopsError }, { data: events, error: eventsError }] = await Promise.all([
      supabase.from("transport_stops").select("*").eq("cmr_id", accessDocument.id).order("sequence"),
      supabase.from("transport_events").select("*").eq("cmr_id", accessDocument.id).order("occurred_at", { ascending: false }),
    ]);
    if (stopsError) throw stopsError;
    if (eventsError) throw eventsError;

    return NextResponse.json({ document, stops, events }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("CMR detail API error", error);
    return NextResponse.json({ error: "No se pudo cargar el CMR." }, { status: 500 });
  }
}
