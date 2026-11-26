"use server";

import { after } from "next/server";
import { sendTicketEmail } from "@/lib/ticket-email";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getAuthenticatedContext } from "@/lib/auth-context";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  canManageTickets, ticketAreas, ticketAttachmentCount, ticketAttachmentError, ticketAttachmentIdPattern, ticketAttachmentLimit, ticketCategories,
  ticketIdPattern, ticketPriorities, ticketScreenshotMarker, ticketScreenshotTypes, ticketStatuses, ticketsPath,
  type TicketAttachment,
} from "@/lib/user-tickets";

type ActionResult = { error: string };

function field(form: FormData, key: string) {
  const value = form.get(key);
  return typeof value === "string" ? value.trim() : "";
}

export async function createTicket(_: ActionResult, form: FormData): Promise<ActionResult> {
  const auth = await getAuthenticatedContext();
  if (!auth) return { error: "Inicia sesión para crear un ticket." };

  const category = ticketCategories.find((value) => value === field(form, "category"));
  const area = ticketAreas.find((value) => value === field(form, "area"));
  const title = field(form, "title");
  const description = field(form, "description");
  const reference = field(form, "reference");

  if (!category || !area || !title || title.length > 160 || !description || description.length > 6000 || reference.length > 100) {
    return { error: "Revisa los campos obligatorios y sus límites de longitud." };
  }
  const standardFiles = form.getAll("attachment").filter((file) => !(file instanceof File && !file.name && !file.size));
  const files: [string, FormDataEntryValue][] = [
    ...standardFiles.map((file, index): [string, FormDataEntryValue] => [`attachment:f${index + 1}`, file]),
    ...[...form.entries()].filter(([key]) => /^(attachment|screenshot):/.test(key)),
  ];
  const attachments: TicketAttachment[] = [];
  const attachmentPayloads: Record<string, string> = {};
  let totalSize = 0;
  if (files.length > ticketAttachmentCount) return { error: ticketAttachmentError };

  for (const [key, file] of files) {
    if (!(file instanceof File) || !file.size || !file.name || file.name.length > 180) {
      return { error: "Revisa los archivos y sus nombres (hasta 180 caracteres)." };
    }
    const id = key.slice(key.indexOf(":") + 1);
    if (!ticketAttachmentIdPattern.test(id) || Object.hasOwn(attachmentPayloads, id)) {
      return { error: "Revisa los adjuntos del ticket." };
    }

    totalSize += file.size;
    if (totalSize > ticketAttachmentLimit) return { error: ticketAttachmentError };

    const bytes = Buffer.from(await file.arrayBuffer());
    const screenshot = key.startsWith("screenshot:");
    const imageType = screenshot ? ticketScreenshotTypes.find((type) => type === file.type) : undefined;
    if (screenshot && (!imageType || !description.includes(ticketScreenshotMarker(id)))) {
      return { error: "Revisa las capturas pegadas en la descripción." };
    }
    attachments.push({ id, name: file.name, ...(imageType ? { imageType } : {}) });
    attachmentPayloads[id] = bytes.toString("base64");
  }

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.from("user_tickets").insert({
    tenant_id: auth.tenantId, category, area, title, description, reference,
    ...(attachments.length ? { attachments, attachment_payloads: attachmentPayloads } : {}),
  }).select("id,number,created_at").single();

  if (error) return { error: "No se ha podido crear el ticket. Vuelve a intentarlo." };
  after(async () => {
    const files = attachments.map(({ id, name, imageType }) => ({
      filename: name,
      content: attachmentPayloads[id],
      contentType: imageType,
    }));
    try {
      await sendTicketEmail({ ...data, category, area, title, description, reference }, files);
    } catch {
      try {
        await sendTicketEmail({ ...data, category, area, title, description, reference }, files);
      } catch {
        console.error("No se pudo notificar a soporte el ticket", data.number);
      }
    }
  });
  revalidatePath(ticketsPath);
  redirect(`${ticketsPath}/${data.id}`);
}

export async function commentOnTicket(id: string, _: ActionResult, form: FormData): Promise<ActionResult> {
  const auth = await getAuthenticatedContext();
  if (!auth || !ticketIdPattern.test(id)) return { error: "Ticket no disponible." };

  const body = field(form, "body");
  if (!body || body.length > 4000) return { error: "Escribe un comentario de hasta 4.000 caracteres." };

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.from("user_ticket_activity").insert({ ticket_id: id, body });
  if (error) return { error: "No se ha podido enviar el comentario." };
  revalidatePath(ticketsPath);
  redirect(`${ticketsPath}/${id}`);
}

export async function manageTicket(id: string, expected: string, _: ActionResult, form: FormData): Promise<ActionResult> {
  const auth = await getAuthenticatedContext();
  if (!auth || !canManageTickets(auth.role) || !ticketIdPattern.test(id)) {
    return { error: "No tienes permiso para gestionar este ticket." };
  }

  const status = ticketStatuses.find((value) => value === field(form, "status"));
  const priority = ticketPriorities.find((value) => value === field(form, "priority"));
  const assignment = field(form, "assignment");
  if (!status || !priority || !["keep", "mine", "none"].includes(assignment)) {
    return { error: "Revisa los datos de gestión." };
  }

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.from("user_tickets").update({
    status, priority,
    ...(assignment === "keep" ? {} : { assignee_id: assignment === "mine" ? auth.userId : null }),
  }).eq("id", id).eq("tenant_id", auth.tenantId).eq("updated_at", expected).select("id").maybeSingle();

  if (error) return { error: "No se han podido guardar los cambios." };
  if (!data) return { error: "El ticket ha cambiado. Recarga la página antes de editarlo de nuevo." };
  revalidatePath(ticketsPath);
  redirect(`${ticketsPath}/${id}`);
}
