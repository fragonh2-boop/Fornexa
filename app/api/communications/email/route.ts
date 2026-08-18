import { NextResponse } from "next/server";
import { getAuthenticatedContext } from "@/lib/auth-context";
import { escapeEmailHtml, parseEmailList, sendEmail, validateEmailList, type EmailAttachment } from "../../../../lib/email-service";

export const runtime = "nodejs";

type Payload = {
  to?: string | string[];
  cc?: string | string[];
  bcc?: string | string[];
  subject?: string;
  message?: string;
  replyTo?: string;
  relatedType?: string;
  relatedId?: string;
  template?: string;
  attachments?: EmailAttachment[];
};

const maxAttachmentBytes = 8 * 1024 * 1024;

export async function POST(request: Request) {
  const auth = await getAuthenticatedContext();
  if (!auth) return NextResponse.json({ error: "No autorizado." }, { status: 401 });

  try {
    const payload = (await request.json()) as Payload;
    const to = parseEmailList(payload.to);
    const cc = parseEmailList(payload.cc);
    const bcc = parseEmailList(payload.bcc);
    const replyTo = parseEmailList(payload.replyTo)[0];
    const subject = payload.subject?.trim() ?? "";
    const message = payload.message?.trim() ?? "";
    const attachments = payload.attachments ?? [];

    if (!validateEmailList(to, true) || !validateEmailList(cc) || !validateEmailList(bcc) || (replyTo && !validateEmailList([replyTo]))) {
      return NextResponse.json({ error: "Revisa las direcciones de correo. Puedes separarlas por comas o punto y coma." }, { status: 400 });
    }
    if (!subject || !message) return NextResponse.json({ error: "El asunto y el mensaje son obligatorios." }, { status: 400 });
    if (to.length + cc.length + bcc.length > 50) return NextResponse.json({ error: "Se admiten como máximo 50 destinatarios por envío." }, { status: 400 });
    if (attachments.some(file => !file.filename || !file.content)) return NextResponse.json({ error: "Hay un adjunto incompleto." }, { status: 400 });
    const estimatedBytes = attachments.reduce((total, file) => total + Math.ceil(file.content.length * 0.75), 0);
    if (estimatedBytes > maxAttachmentBytes) return NextResponse.json({ error: "Los adjuntos superan el límite total de 8 MB." }, { status: 413 });

    const relatedType = escapeEmailHtml(payload.relatedType?.trim() || "CRM");
    const relatedId = escapeEmailHtml(payload.relatedId?.trim() || "Comunicación libre");
    const safeMessage = escapeEmailHtml(message).replaceAll("\n", "<br />");
    const result = await sendEmail({
      to,
      cc,
      bcc,
      subject,
      replyTo,
      attachments,
      tags: [
        { name: "source", value: "fornexa-crm" },
        { name: "entity", value: (payload.relatedType || "crm").toLowerCase().replace(/[^a-z0-9_-]/g, "-").slice(0, 40) },
      ],
      html: `<div style="background:#f4f7fb;padding:32px;font-family:Arial,sans-serif;color:#102033"><div style="max-width:680px;margin:auto;background:white;border-radius:16px;overflow:hidden;border:1px solid #dbe4ef"><div style="background:#07111f;color:white;padding:28px"><strong style="font-size:24px">FORNEXA</strong><p style="margin:8px 0 0;color:#66e6bd">Supply Chain Suite</p></div><div style="padding:30px;line-height:1.65"><p>${safeMessage}</p><div style="margin-top:28px;padding-top:16px;border-top:1px solid #e5eaf0;color:#66758a;font-size:12px">${relatedType} · ${relatedId}<br />Enviado desde el Connectivity Hub de FORNEXA.</div></div></div></div>`,
    });
    return NextResponse.json({ ...result, to, cc, bcc, attachmentCount: attachments.length });
  } catch (error) {
    const message = error instanceof Error ? error.message : "No se pudo enviar el correo.";
    const status = message.includes("configurado") ? 503 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
