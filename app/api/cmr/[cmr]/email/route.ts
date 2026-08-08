import { NextResponse } from "next/server";
import { documentForAccessKey } from "@/lib/cmr-access";
import { createSupabaseAdmin } from "@/lib/supabase-admin";

export const runtime = "nodejs";

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

  const origin = new URL(request.url).origin;
  const detailUrl = `${origin}/dashboard/epod-cmr/${encodeURIComponent(cmrNumber)}?key=${encodeURIComponent(document.access_key)}`;
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
  await supabase.from("transport_events").insert({
    cmr_id: document.id,
    event_type: "cmr_emailed",
    payload: { to, providerId: provider.id, actor: "FORNEXA Web" },
  });

  return NextResponse.json({ ok: true, id: provider.id });
}

function escapeHtml(value: unknown) {
  return String(value ?? "").replace(/[&<>'"]/g, character => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;",
  })[character] ?? character);
}
