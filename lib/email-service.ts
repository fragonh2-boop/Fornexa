import "server-only";

export type EmailAttachment = {
  filename: string;
  content: string;
  contentType?: string;
};

export type SendEmailInput = {
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  html: string;
  replyTo?: string;
  attachments?: EmailAttachment[];
  tags?: { name: string; value: string }[];
};

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function parseEmailList(value: unknown): string[] {
  const source = Array.isArray(value) ? value.join(",") : String(value ?? "");
  return [...new Set(source.split(/[;,\n]/).map(item => item.trim().toLowerCase()).filter(Boolean))];
}

export function validateEmailList(values: string[], required = false) {
  if (required && values.length === 0) return false;
  return values.every(value => emailPattern.test(value));
}

export function escapeEmailHtml(value: string) {
  return value.replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[character] ?? character);
}

export async function sendEmail(input: SendEmailInput) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error("El servicio de email todavía no está configurado en Vercel.");

  const from = process.env.EMAIL_FROM || process.env.OFFERS_FROM_EMAIL || "FORNEXA <onboarding@resend.dev>";
  const replyTo = input.replyTo || process.env.EMAIL_REPLY_TO || process.env.OFFERS_REPLY_TO || "fragonh2@gmail.com";
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from,
      to: input.to,
      ...(input.cc?.length ? { cc: input.cc } : {}),
      ...(input.bcc?.length ? { bcc: input.bcc } : {}),
      reply_to: replyTo,
      subject: input.subject,
      html: input.html,
      ...(input.attachments?.length ? { attachments: input.attachments.map(file => ({ filename: file.filename, content: file.content, content_type: file.contentType })) } : {}),
      ...(input.tags?.length ? { tags: input.tags } : {}),
    }),
  });

  const result = (await response.json()) as { id?: string; message?: string; name?: string };
  if (!response.ok) throw new Error(result.message || "No se pudo enviar el correo.");
  return { id: result.id || crypto.randomUUID(), sentAt: new Date().toISOString(), from };
}
