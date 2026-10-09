export type SelectionMode = "single" | "multi";

export interface ComboOption {
  id: string;
  label: string;
  value: string;
}

export interface ComboConfig {
  id: string;
  name: string;
  description: string;
  options: ComboOption[];
  defaultValue: string;
  selectionMode: SelectionMode;
}

export const DEFAULT_COMBOS: Record<string, ComboConfig> = {
  order_service: {
    id: "order_service",
    name: "Tipo de Servicio (Órdenes)",
    description: "Modalidad de transporte y servicio logístico para pedidos de clientes",
    options: [
      { id: "directo", label: "Directo", value: "Directo" },
      { id: "grupaje", label: "Grupaje", value: "Grupaje" },
      { id: "ltl", label: "LTL", value: "LTL" },
      { id: "ftl", label: "FTL", value: "FTL" },
      { id: "dedicado", label: "Dedicado", value: "Dedicado" },
      { id: "express", label: "Express", value: "Express" },
      { id: "cross", label: "Cross-docking", value: "cross" },
      { id: "picking", label: "Picking", value: "picking" },
    ],
    defaultValue: "Grupaje",
    selectionMode: "single",
  },
  order_status: {
    id: "order_status",
    name: "Estado de la Orden",
    description: "Ciclo de vida y situación operativa de los pedidos",
    options: [
      { id: "draft", label: "Borrador", value: "Borrador" },
      { id: "ready", label: "Preparada", value: "Preparada" },
      { id: "partially_planned", label: "Parcialmente planificada", value: "Parcialmente planificada" },
      { id: "planned", label: "Planificada", value: "Planificada" },
      { id: "in_transit", label: "En tránsito", value: "En tránsito" },
      { id: "completed", label: "Completada", value: "Completada" },
      { id: "cancelled", label: "Cancelada", value: "Cancelada" },
    ],
    defaultValue: "Preparada",
    selectionMode: "single",
  },
  transport_mode: {
    id: "transport_mode",
    name: "Modalidad de Transporte",
    description: "Medio de transporte utilizado para las expediciones",
    options: [
      { id: "carretera", label: "Carretera", value: "Carretera" },
      { id: "maritimo", label: "Marítimo", value: "Marítimo" },
      { id: "aereo", label: "Aéreo", value: "Aéreo" },
      { id: "intermodal", label: "Intermodal", value: "Intermodal" },
      { id: "ferroviario", label: "Ferroviario", value: "Ferroviario" },
    ],
    defaultValue: "Carretera",
    selectionMode: "single",
  },
};

const STORAGE_PREFIX = "fornexa_combo_config_";
export const COMBO_UPDATED_EVENT = "fornexa-combo-config-updated";

export function getAllComboConfigs(): ComboConfig[] {
  return Object.keys(DEFAULT_COMBOS).map(id => getComboConfig(id));
}

export function getComboConfig(id: string): ComboConfig {
  const fallback = DEFAULT_COMBOS[id];
  if (!fallback) {
    return {
      id,
      name: id,
      description: "Campo configurable",
      options: [],
      defaultValue: "",
      selectionMode: "single",
    };
  }

  if (typeof window === "undefined" || !window.localStorage) {
    return fallback;
  }

  try {
    const raw = window.localStorage.getItem(`${STORAGE_PREFIX}${id}`);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as Partial<ComboConfig>;
    return {
      id: fallback.id,
      name: parsed.name ?? fallback.name,
      description: parsed.description ?? fallback.description,
      options: Array.isArray(parsed.options) && parsed.options.length ? parsed.options : fallback.options,
      defaultValue: parsed.defaultValue ?? fallback.defaultValue,
      selectionMode: parsed.selectionMode ?? fallback.selectionMode,
    };
  } catch {
    return fallback;
  }
}

export function saveComboConfig(id: string, updated: Partial<ComboConfig>): ComboConfig {
  const current = getComboConfig(id);
  const next: ComboConfig = {
    ...current,
    ...updated,
    id,
  };

  if (typeof window !== "undefined" && window.localStorage) {
    try {
      window.localStorage.setItem(`${STORAGE_PREFIX}${id}`, JSON.stringify(next));
      window.dispatchEvent(new CustomEvent(COMBO_UPDATED_EVENT, { detail: { id, config: next } }));
    } catch (e) {
      console.error("Error saving combo config to localStorage", e);
    }
  }

  return next;
}

export function resetComboConfig(id: string): ComboConfig {
  const fallback = DEFAULT_COMBOS[id];
  if (!fallback) return getComboConfig(id);

  if (typeof window !== "undefined" && window.localStorage) {
    try {
      window.localStorage.removeItem(`${STORAGE_PREFIX}${id}`);
      window.dispatchEvent(new CustomEvent(COMBO_UPDATED_EVENT, { detail: { id, config: fallback } }));
    } catch (e) {
      console.error("Error resetting combo config", e);
    }
  }

  return fallback;
}

export function getComboOptions(id: string): ComboOption[] {
  return getComboConfig(id).options;
}
