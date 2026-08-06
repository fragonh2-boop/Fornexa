import { NextResponse } from "next/server";

type SendOfferPayload = {
  to?: string;
  cc?: string;
  subject?: string;
  message?: string;
  reference?: string;
  customer?: string;
  route?: string;
  amount?: string;
  validUntil?: string;
};

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[character] ?? character);
}

export async function POST(request: Request) {
  const payload = (await request.json()) as SendOfferPayload;
  const to = payload.to?.trim() ?? "";
  const cc = payload.cc?.trim() ?? "";

  if (!emailPattern.test(to) || (cc && !emailPattern.test(cc))) {
    return NextResponse.json({ error: "Revisa las direcciones de correo." }, { status: 400 });
  }

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "El servicio de email todavía no está configurado en Vercel." }, { status: 503 });
  }

  const reference = escapeHtml(payload.reference?.trim() || "Oferta FORNEXA");
  const subject = payload.subject?.trim() || `${reference} · Propuesta comercial`;
  const message = escapeHtml(payload.message?.trim() || "Adjuntamos nuestra propuesta comercial.").replaceAll("\n", "<br />");
  const from = process.env.OFFERS_FROM_EMAIL || "FORNEXA Ofertas <onboarding@resend.dev>";
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from,
      to: [to],
      ...(cc ? { cc: [cc] } : {}),
      reply_to: process.env.OFFERS_REPLY_TO || "fragonh2@gmail.com",
      subject,
      html: `
        <div style="background:#f4f7fb;padding:32px;font-family:Arial,sans-serif;color:#102033">
          <div style="max-width:640px;margin:auto;background:white;border-radius:16px;overflow:hidden;border:1px solid #dbe4ef">
            <div style="background:#07111f;color:white;padding:28px"><strong style="font-size:24px">FORNEXA</strong><p style="margin:8px 0 0;color:#66e6bd">Oferta y tarifa logística</p></div>
            <div style="padding:28px"><p>${message}</p><table style="width:100%;border-collapse:collapse;margin:24px 0">
              <tr><td style="padding:10px;border-bottom:1px solid #e5eaf0;color:#66758a">Referencia</td><td style="padding:10px;border-bottom:1px solid #e5eaf0"><strong>${reference}</strong></td></tr>
              <tr><td style="padding:10px;border-bottom:1px solid #e5eaf0;color:#66758a">Cliente</td><td style="padding:10px;border-bottom:1px solid #e5eaf0">${escapeHtml(payload.customer || "—")}</td></tr>
              <tr><td style="padding:10px;border-bottom:1px solid #e5eaf0;color:#66758a">Ruta</td><td style="padding:10px;border-bottom:1px solid #e5eaf0">${escapeHtml(payload.route || "—")}</td></tr>
              <tr><td style="padding:10px;border-bottom:1px solid #e5eaf0;color:#66758a">Importe</td><td style="padding:10px;border-bottom:1px solid #e5eaf0"><strong>${escapeHtml(payload.amount || "—")}</strong></td></tr>
              <tr><td style="padding:10px;color:#66758a">Válida hasta</td><td style="padding:10px">${escapeHtml(payload.validUntil || "—")}</td></tr>
            </table><p style="color:#66758a;font-size:13px">Este correo ha sido enviado desde FORNEXA Supply Chain Suite.</p></div>
          </div>
        </div>`,
    }),
  });

  const result = (await response.json()) as { id?: string; message?: string };
  if (!response.ok) return NextResponse.json({ error: result.message || "No se pudo enviar el correo." }, { status: response.status });
  return NextResponse.json({ id: result.id, sentAt: new Date().toISOString() });
}
