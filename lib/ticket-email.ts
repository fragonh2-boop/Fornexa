import "server-only";

import { escapeEmailHtml, sendEmail, type EmailAttachment } from "./email-service";
import { ticketCode, ticketsPath } from "./user-tickets";

const supportRecipient = "fornexa@fornexasc.com";

type TicketEmail = {
  id: string;
  number: number;
  category: string;
  area: string;
  title: string;
  description: string;
  reference: string;
  created_at: string;
};

const creationDate = new Intl.DateTimeFormat("es-ES", {
  timeZone: "Europe/Madrid",
  day: "2-digit", month: "2-digit", year: "numeric",
  hour: "2-digit", minute: "2-digit", second: "2-digit",
  timeZoneName: "short",
});

export async function sendTicketEmail(ticket: TicketEmail, attachments: EmailAttachment[]) {
  const code = ticketCode(ticket.number);
  const date = creationDate.format(new Date(ticket.created_at));
  const title = ticket.title.replace(/\s+/gu, " ").trim();
  const fields = [
    ["Ticket", code], ["Categoría", ticket.category], ["Módulo", ticket.area],
    ["Creado", date], ...(ticket.reference ? [["Referencia operativa", ticket.reference]] : []),
  ];
  const details = fields.map(([label, value]) =>
    `<tr><th scope="row" align="left">${label}</th><td>${escapeEmailHtml(value)}</td></tr>`).join("");
  const url = `https://fornexasc.com${ticketsPath}/${encodeURIComponent(ticket.id)}`;

  return sendEmail({
    to: [supportRecipient],
    replyTo: supportRecipient,
    subject: `${code} · ${ticket.category} · ${title} · ${date}`,
    html: `<h1>${escapeEmailHtml(ticket.title)}</h1><table cellpadding="5">${details}</table>
      <h2>Descripción</h2><p>${escapeEmailHtml(ticket.description).replace(/\r?\n/g, "<br>")}</p>
      <p><a href="${url}">Abrir ${code} en Fornexa</a></p>`,
    attachments,
    idempotencyKey: `support-ticket/${ticket.id}`,
  });
}
