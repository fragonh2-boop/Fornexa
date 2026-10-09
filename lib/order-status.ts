export const STATUS_LABELS: Record<string, string> = {
  DRAFT: "Borrador",
  READY: "Preparada",
  PARTIALLY_PLANNED: "Parcialmente planificada",
  PLANNED: "Planificada",
  IN_TRANSIT: "En tránsito",
  COMPLETED: "Completada",
  CANCELLED: "Cancelada",
};

export const STATUS_FROM_LABEL: Record<string, string> = {
  "Borrador": "DRAFT",
  "Preparada": "READY",
  "Parcialmente planificada": "PARTIALLY_PLANNED",
  "Planificada": "PLANNED",
  "En tránsito": "IN_TRANSIT",
  "Completada": "COMPLETED",
  "Cancelada": "CANCELLED",
  "DRAFT": "DRAFT",
  "READY": "READY",
  "PARTIALLY_PLANNED": "PARTIALLY_PLANNED",
  "PLANNED": "PLANNED",
  "IN_TRANSIT": "IN_TRANSIT",
  "COMPLETED": "COMPLETED",
  "CANCELLED": "CANCELLED",
};

export const ALLOWED_ORDER_TRANSITIONS: Record<string, string[]> = {
  DRAFT: ["READY", "CANCELLED"],
  READY: ["DRAFT", "PARTIALLY_PLANNED", "PLANNED", "CANCELLED"],
  PARTIALLY_PLANNED: ["READY", "PLANNED", "CANCELLED"],
  PLANNED: ["READY", "PARTIALLY_PLANNED", "IN_TRANSIT", "CANCELLED"],
  IN_TRANSIT: ["COMPLETED", "CANCELLED"],
  COMPLETED: [],
  CANCELLED: [],
};
