export const ticketCategories = ["Incidencia", "Consulta", "Mejora"] as const;
export const ticketAreas = ["TMS web", "Android", "Integraciones / EDI", "Documentos", "Accesos", "Otra"] as const;
export const ticketStatuses = ["Nuevo", "En curso", "Pendiente del usuario", "Resuelto", "Cerrado"] as const;
export const ticketPriorities = ["Baja", "Normal", "Alta", "Urgente"] as const;

export const ticketsPath = "/dashboard/tickets";
export const ticketAttachmentLimit = 3 * 1024 * 1024;
export const ticketIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function canManageTickets(role: string) {
  return role === "OWNER" || role === "ADMIN";
}

export function ticketCode(number: number) {
  return `TKT-${String(number).padStart(5, "0")}`;
}

export function ticketDate(value: string) {
  return new Intl.DateTimeFormat("es-ES", {
    dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Madrid",
  }).format(new Date(value));
}

export const ticketAttachmentIdPattern = /^f[1-9][0-9]{0,5}$/;
export const ticketAttachmentCount = 10;
export const ticketAttachmentError = "Puedes añadir hasta 10 archivos, con un máximo de 3 MB en total.";
export const ticketScreenshotTypes = ["image/png", "image/jpeg", "image/webp"] as const;
export type TicketScreenshotType = typeof ticketScreenshotTypes[number];

export type TicketAttachment = {
  id: string;
  name: string;
  imageType?: TicketScreenshotType;
};

export function ticketScreenshotMarker(id: string) {
  return `[Captura ${id.slice(1)}]`;
}
