import { NextResponse } from "next/server";
import { getAuthenticatedContext } from "@/lib/auth-context";
import { escapeEmailHtml, parseEmailList, sendEmail, validateEmailList } from "../../../../lib/email-service";

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

export async function POST(request: Request) {
  const auth = await getAuthenticatedContext();
  if (!auth) return NextResponse.json({ error: "No autorizado." }, { status: 401 });

  const payload = (await request.json()) as SendOfferPayload;
  const to = parseEmailList(payload.to);
  const cc = parseEmailList(payload.cc);

  if (!validateEmailList(to, true) || !validateEmailList(cc)) {
    return NextResponse.json({ error: "Revisa las direcciones de correo." }, { status: 400 });
  }

  const reference = escapeEmailHtml(payload.reference?.trim() || "Oferta FORNEXA");
  const subject = payload.subject?.trim() || `${reference} · Propuesta comercial`;
  const message = escapeEmailHtml(payload.message?.trim() || "Adjuntamos nuestra propuesta comercial.").replaceAll("\n", "<br />");
  try {
    const result = await sendEmail({
      to,
      cc,
      subject,
      tags: [{ name: "source", value: "fornexa-offers" }],
      html: `
        <div style="background:#f4f7fb;padding:32px;font-family:Arial,sans-serif;color:#102033">
          <div style="max-width:640px;margin:auto;background:white;border-radius:16px;overflow:hidden;border:1px solid #dbe4ef">
            <div style="background:#07111f;color:white;padding:28px"><strong style="font-size:24px">FORNEXA</strong><p style="margin:8px 0 0;color:#66e6bd">Oferta y tarifa logística</p></div>
            <div style="padding:28px"><p>${message}</p><table style="width:100%;border-collapse:collapse;margin:24px 0">
              <tr><td style="padding:10px;border-bottom:1px solid #e5eaf0;color:#66758a">Referencia</td><td style="padding:10px;border-bottom:1px solid #e5eaf0"><strong>${reference}</strong></td></tr>
              <tr><td style="padding:10px;border-bottom:1px solid #e5eaf0;color:#66758a">Cliente</td><td style="padding:10px;border-bottom:1px solid #e5eaf0">${escapeEmailHtml(payload.customer || "—")}</td></tr>
              <tr><td style="padding:10px;border-bottom:1px solid #e5eaf0;color:#66758a">Ruta</td><td style="padding:10px;border-bottom:1px solid #e5eaf0">${escapeEmailHtml(payload.route || "—")}</td></tr>
              <tr><td style="padding:10px;border-bottom:1px solid #e5eaf0;color:#66758a">Importe</td><td style="padding:10px;border-bottom:1px solid #e5eaf0"><strong>${escapeEmailHtml(payload.amount || "—")}</strong></td></tr>
              <tr><td style="padding:10px;color:#66758a">Válida hasta</td><td style="padding:10px">${escapeEmailHtml(payload.validUntil || "—")}</td></tr>
            </table><p style="color:#66758a;font-size:13px">Este correo ha sido enviado desde FORNEXA Supply Chain Suite.</p></div>
          </div>
        </div>`,
    });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "No se pudo enviar el correo." }, { status: 400 });
  }
}
