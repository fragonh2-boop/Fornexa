"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getAuthenticatedContext } from "@/lib/auth-context";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  canManageTickets, ticketAreas, ticketAttachmentLimit, ticketCategories,
  ticketIdPattern, ticketPriorities, ticketStatuses, ticketsPath,
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
  const file = form.get("attachment");

  if (!category || !area || !title || title.length > 160 || !description || description.length > 6000 || reference.length > 100) {
    return { error: "Revisa los campos obligatorios y sus límites de longitud." };
  }
  const attachment = file instanceof File && file.size > 0 ? file : null;
  if (attachment && (attachment.size > ticketAttachmentLimit || attachment.name.length > 180)) {
    return { error: "El adjunto debe pesar como máximo 3 MB y su nombre debe tener hasta 180 caracteres." };
  }

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.from("user_tickets").insert({
    tenant_id: auth.tenantId, category, area, title, description, reference,
    ...(attachment ? {
      attachment_name: attachment.name,
      attachment_data: "\\x" + Buffer.from(await attachment.arrayBuffer()).toString("hex"),
    } : {}),
  }).select("id").single();

  if (error) return { error: "No se ha podido crear el ticket. Vuelve a intentarlo." };
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
