import { NextResponse } from "next/server";
import { documentForAccessKey } from "@/lib/cmr-access";
import { createSupabaseAdmin } from "@/lib/supabase-admin";

export const runtime = "nodejs";

const MAX_EMAILS_PER_HOUR = 20;

export async function POST(request: Request, context: { params: Promise<{ cmr: string }> }) {
  const { cmr } = await context.params;
  const cmrNumber = decodeURIComponent(cmr).toUpperCase();
  const { to, key } = await request.json().catch(() => ({ to: "", key: "" })) as { to?: string; key?: string };

  if (!to || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
    return NextResponse.json({ error: "Introduce una dirección de email válida." }, { status: 422 });
  }

  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM ?? "FORNEXA <fornexa@fornexasc.com>";
  if (!apiKey) return NextResponse.json({ error: "Resend no está configurado." }, { status: 500 });

  const supabase = createSupabaseAdmin();
  const document = await documentForAccessKey(key ?? "");
  if (!document) return NextResponse.json({ error: "CMR Key no válida o revocada." }, { status: 401 });
  if (document.cmr_number !== cmrNumber) return NextResponse.json({ error: "La clave no pertenece al CMR." }, { status: 403 });
  const tenantId = String(document.tenant_id ?? "");
  if (!tenantId) return NextResponse.json({ error: "El CMR no tiene tenant asociado." }, { status: 500 });

  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { count: recentEmails, error: rateError } = await supabase
    .from("transport_events")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", tenantId)
    .eq("cmr_id", document.id)
    .eq("event_type", "cmr_emailed")
    .gte("occurred_at", oneHourAgo);
  if (rateError) {
    console.error("CMR email rate-limit error", rateError);
    return NextResponse.json({ error: "No se pudo validar el límite de envío." }, { status: 503 });
  }
  if ((recentEmails ?? 0) >= MAX_EMAILS_PER_HOUR) {
    return NextResponse.json({ error: "Se ha alcanzado el límite temporal de reenvíos para este CMR." }, { status: 429, headers: { "Retry-After": "3600" } });
  }

  const origin = new URL(request.url).origin;
  const detailUrl = `${origin}/cmr/${encodeURIComponent(cmrNumber)}?key=${encodeURIComponent(document.access_key)}`;
  const driverUrl = `${origin}/api/mobile/cmr/${encodeURIComponent(document.access_key)}`;

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from,
      to: [to],
      subject: `${cmrNumber} · Carta de porte FORNEXA`,
      html: `<div style="font-family:Arial,sans-serif;color:#172033;line-height:1.5"><h1>${escapeHtml(cmrNumber)}</h1><p>Se ha emitido la carta de porte vinculada a la expedición <strong>${escapeHtml(document.expedition_id || "—")}</strong>.</p><p>${escapeHtml(document.sender)} → ${escapeHtml(document.recipient)}</p><p><a href="${detailUrl}">Ver y descargar el CMR</a></p><p><a href="${driverUrl}">Abrir en FORNEXA Driver</a></p><hr><small>Enviado desde FORNEXA Supply Chain Suite.</small></div>`,
    }),
  });

  if (!response.ok) {
    const providerError = await response.text();
    console.error("Resend CMR error", providerError);
    return NextResponse.json({ error: "Resend no pudo enviar el mensaje." }, { status: 502 });
  }

  const provider = await response.json();
  const { error: eventError } = await supabase.from("transport_events").insert({
    tenant_id: tenantId,
    cmr_id: document.id,
    event_type: "cmr_emailed",
    payload: { to, providerId: provider.id, actor: "FORNEXA Web" },
  });
  if (eventError) console.error("CMR email event error", eventError);

  return NextResponse.json({ ok: true, id: provider.id });
}

function escapeHtml(value: unknown) {
  return String(value ?? "").replace(/[&<>'"]/g, character => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;",
  })[character] ?? character);
}
