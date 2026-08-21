export const ONBOARDING_LANGUAGES = [
  { value: "es", label: "Español" },
  { value: "en", label: "English" },
  { value: "fr", label: "Français" },
] as const;

export const ONBOARDING_TIMEZONES = [
  { value: "Europe/Madrid", label: "Madrid (UTC+1 / UTC+2)" },
  { value: "Europe/Lisbon", label: "Lisboa (UTC / UTC+1)" },
  { value: "Europe/Paris", label: "París (UTC+1 / UTC+2)" },
  { value: "Europe/London", label: "Londres (UTC / UTC+1)" },
  { value: "UTC", label: "UTC" },
] as const;

export type OnboardingLanguage = (typeof ONBOARDING_LANGUAGES)[number]["value"];
export type OnboardingTimezone = (typeof ONBOARDING_TIMEZONES)[number]["value"];

export type OnboardingPreferences = {
  displayName: string;
  language: OnboardingLanguage;
  timezone: OnboardingTimezone;
  operationalEmailNotifications: boolean;
};

export type OnboardingValidation =
  | { ok: true; data: OnboardingPreferences }
  | { ok: false; error: string };

const languages = new Set<string>(ONBOARDING_LANGUAGES.map(({ value }) => value));
const timezones = new Set<string>(ONBOARDING_TIMEZONES.map(({ value }) => value));

function metadataString(metadata: Record<string, unknown>, key: string) {
  const value = metadata[key];
  return typeof value === "string" ? value.trim() : "";
}

export function onboardingPreferencesFromMetadata(
  metadata: Record<string, unknown>,
  email: string,
): OnboardingPreferences {
  const emailName = email.split("@")[0]?.replace(/[._-]+/g, " ").trim() ?? "";
  const displayName = metadataString(metadata, "display_name")
    || metadataString(metadata, "full_name")
    || metadataString(metadata, "name")
    || emailName;
  const rawLanguage = metadataString(metadata, "locale");
  const rawTimezone = metadataString(metadata, "timezone");

  return {
    displayName,
    language: languages.has(rawLanguage) ? rawLanguage as OnboardingLanguage : "es",
    timezone: timezones.has(rawTimezone) ? rawTimezone as OnboardingTimezone : "Europe/Madrid",
    operationalEmailNotifications: metadata.operational_email_notifications !== false,
  };
}

export function validateOnboardingPreferences(value: unknown): OnboardingValidation {
  if (!value || typeof value !== "object") {
    return { ok: false, error: "No se han recibido las preferencias de configuración." };
  }

  const input = value as Record<string, unknown>;
  const displayName = typeof input.displayName === "string"
    ? input.displayName.replace(/\s+/g, " ").trim()
    : "";

  if (displayName.length < 2 || displayName.length > 80) {
    return { ok: false, error: "El nombre visible debe contener entre 2 y 80 caracteres." };
  }
  if (typeof input.language !== "string" || !languages.has(input.language)) {
    return { ok: false, error: "Selecciona un idioma disponible." };
  }
  if (typeof input.timezone !== "string" || !timezones.has(input.timezone)) {
    return { ok: false, error: "Selecciona una zona horaria disponible." };
  }
  if (typeof input.operationalEmailNotifications !== "boolean") {
    return { ok: false, error: "La preferencia de avisos no es válida." };
  }

  return {
    ok: true,
    data: {
      displayName,
      language: input.language as OnboardingLanguage,
      timezone: input.timezone as OnboardingTimezone,
      operationalEmailNotifications: input.operationalEmailNotifications,
    },
  };
}

const roleCatalog: Record<string, { label: string; summary: string; capabilities: string[] }> = {
  OWNER: {
    label: "Propietario",
    summary: "Control total del espacio de trabajo y su configuración.",
    capabilities: ["Administración de usuarios", "Configuración de la organización", "Acceso operativo completo"],
  },
  ADMIN: {
    label: "Administrador",
    summary: "Administración del equipo y de la operativa diaria.",
    capabilities: ["Gestión de usuarios", "Configuración operativa", "Acceso a todos los módulos"],
  },
  PLANNER: {
    label: "Planificador",
    summary: "Planificación y coordinación de operaciones de transporte.",
    capabilities: ["Planificación de expediciones", "Gestión de viajes", "Seguimiento operativo"],
  },
  OPERATOR: {
    label: "Operador logístico",
    summary: "Ejecución y seguimiento de la operativa asignada.",
    capabilities: ["Gestión operativa", "Seguimiento de expediciones", "Documentación de transporte"],
  },
  DRIVER: {
    label: "Conductor",
    summary: "Acceso a viajes, paradas y documentación asignada.",
    capabilities: ["Viajes asignados", "Actualización de paradas", "Pruebas de entrega"],
  },
  VIEWER: {
    label: "Consulta",
    summary: "Acceso de solo lectura a la información autorizada.",
    capabilities: ["Consulta de operaciones", "Seguimiento", "Documentación disponible"],
  },
};

export function onboardingRoleDetails(role: string) {
  return roleCatalog[role] ?? {
    label: role,
    summary: "Permisos asociados por el administrador de la organización.",
    capabilities: ["Acceso según permisos asignados"],
  };
}
