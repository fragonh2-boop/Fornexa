/**
 * Niveles de densidad de interfaz de FORNEXA.
 *
 * Tres niveles (cómoda, estándar, compacta) que se aplican como atributo
 * `data-density` en `<html>`, de modo que los tokens CSS de `globals.css`
 * cambien la escala sin tocar cada componente.
 *
 * La preferencia es una decisión de presentación del puesto: se guarda solo en
 * `localStorage` del navegador y está excluida de la sincronización de datos.
 */

export const UI_DENSITY_STORAGE_KEY = "fornexa-ui-density";
export const UI_DENSITY_ATTRIBUTE = "data-density";
export const UI_DENSITY_UPDATED_EVENT = "fornexa:ui-density-changed";

export const UI_DENSITIES = ["comfortable", "standard", "compact"] as const;
export type UiDensity = (typeof UI_DENSITIES)[number];

/** Fran prefiere la vista compacta para operación diaria. */
export const DEFAULT_UI_DENSITY: UiDensity = "compact";

export type UiDensityOption = {
  id: UiDensity;
  label: string;
  summary: string;
  detail: string;
};

export const UI_DENSITY_OPTIONS: readonly UiDensityOption[] = [
  {
    id: "comfortable",
    label: "Cómoda",
    summary: "Espaciado generoso.",
    detail: "Recomendado para pantallas táctiles, tablets o navegación relajada.",
  },
  {
    id: "standard",
    label: "Estándar",
    summary: "Equilibrio moderno.",
    detail: "Tamaño equilibrado entre datos e interfaz para ordenadores convencionales.",
  },
  {
    id: "compact",
    label: "Compacta",
    summary: "Alta densidad de datos.",
    detail: "Máximo número de filas y campos por pantalla (estilo ERP/TMS).",
  },
];

export function isUiDensity(value: unknown): value is UiDensity {
  return typeof value === "string" && (UI_DENSITIES as readonly string[]).includes(value);
}

/** Cualquier valor ausente o desconocido cae al nivel por defecto, nunca rompe. */
export function normalizeUiDensity(value: unknown): UiDensity {
  return isUiDensity(value) ? value : DEFAULT_UI_DENSITY;
}

export function getUiDensity(): UiDensity {
  if (typeof window === "undefined" || !window.localStorage) return DEFAULT_UI_DENSITY;
  try {
    return normalizeUiDensity(window.localStorage.getItem(UI_DENSITY_STORAGE_KEY));
  } catch {
    return DEFAULT_UI_DENSITY;
  }
}

type AttributeTarget = { setAttribute(name: string, value: string): void };

/** Aplica el nivel al elemento raíz. No depende de React y es testeable. */
export function applyUiDensity(density: unknown, root?: AttributeTarget): UiDensity {
  const next = normalizeUiDensity(density);
  const target = root ?? (typeof document === "undefined" ? undefined : document.documentElement);
  target?.setAttribute(UI_DENSITY_ATTRIBUTE, next);
  return next;
}

export function saveUiDensity(density: unknown): UiDensity {
  const next = normalizeUiDensity(density);
  if (typeof window !== "undefined" && window.localStorage) {
    try {
      window.localStorage.setItem(UI_DENSITY_STORAGE_KEY, next);
    } catch (error) {
      console.error("Error saving ui density to localStorage", error);
    }
  }
  applyUiDensity(next);
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(UI_DENSITY_UPDATED_EVENT, { detail: next }));
  }
  return next;
}

export function resetUiDensity(): UiDensity {
  if (typeof window !== "undefined" && window.localStorage) {
    try {
      window.localStorage.removeItem(UI_DENSITY_STORAGE_KEY);
    } catch (error) {
      console.error("Error resetting ui density", error);
    }
  }
  applyUiDensity(DEFAULT_UI_DENSITY);
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(UI_DENSITY_UPDATED_EVENT, { detail: DEFAULT_UI_DENSITY }));
  }
  return DEFAULT_UI_DENSITY;
}

/**
 * Script anti-FOUC: se ejecuta antes de pintar el cuerpo, así que el atributo
 * ya está puesto cuando el navegador aplica los estilos. Falla cerrado al
 * nivel por defecto si `localStorage` no está disponible.
 */
export const UI_DENSITY_BOOTSTRAP = `(function(){try{var d=localStorage.getItem(${JSON.stringify(UI_DENSITY_STORAGE_KEY)});if(d!=="comfortable"&&d!=="standard"&&d!=="compact"){d=${JSON.stringify(DEFAULT_UI_DENSITY)};}document.documentElement.setAttribute(${JSON.stringify(UI_DENSITY_ATTRIBUTE)},d);}catch(e){document.documentElement.setAttribute(${JSON.stringify(UI_DENSITY_ATTRIBUTE)},${JSON.stringify(DEFAULT_UI_DENSITY)});}})();`;

/** Tokens que cada nivel debe declarar. Lo consume el test de contrato. */
export const UI_DENSITY_TOKENS = [
  "--ui-density",
  "--ui-title-size",
  "--ui-eyebrow-size",
  "--ui-panel-padding",
  "--ui-panel-radius",
  "--ui-button-radius",
  "--ui-button-padding",
  "--ui-metric-size",
  "--ui-grid-cell-height",
  "--ui-grid-cell-padding",
  "--ui-grid-header-height",
  "--ui-page-padding",
  "--ui-input-padding",
] as const;
