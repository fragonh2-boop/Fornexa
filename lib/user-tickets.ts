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
