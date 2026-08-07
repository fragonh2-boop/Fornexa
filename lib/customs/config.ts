import type { CustomsEnvironment, CustomsReadiness, CustomsSystem } from "./types";

const systems: CustomsSystem[] = ["H1", "H7", "AES", "NCTS6", "G3", "G4", "G5", "EXS", "POUS", "DOCUMENTS"];

export function customsEnvironment(): CustomsEnvironment {
  const value = process.env.AEAT_ENVIRONMENT;
  return value === "preproduction" || value === "production" ? value : "mock";
}

export function endpointFor(system: CustomsSystem) {
  return process.env[`AEAT_${system}_ENDPOINT`]?.trim() || "";
}

export function transmissionEnabled() {
  return process.env.AEAT_TRANSMISSION_ENABLED === "true";
}

export function customsReadiness(): CustomsReadiness {
  const environment = customsEnvironment();
  const certificateConfigured = Boolean(process.env.AEAT_CERTIFICATE_PFX_BASE64 || (process.env.AEAT_CERTIFICATE_PEM && process.env.AEAT_PRIVATE_KEY_PEM));
  const endpointsConfigured = systems.filter((system) => Boolean(endpointFor(system)));
  const missing: string[] = [];
  if (environment !== "mock" && !certificateConfigured) missing.push("certificado electrónico AEAT");
  if (environment !== "mock" && endpointsConfigured.length === 0) missing.push("endpoints oficiales del entorno seleccionado");
  if (environment === "production" && !transmissionEnabled()) missing.push("activación explícita de transmisión a producción");
  return { environment, transmissionEnabled: transmissionEnabled(), certificateConfigured, endpointsConfigured, missing };
}
