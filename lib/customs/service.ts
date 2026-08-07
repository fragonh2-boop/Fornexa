import { randomUUID } from "node:crypto";
import { customsEnvironment, customsReadiness, transmissionEnabled } from "./config";
import { dispatchSoap } from "./aeat/soap";
import { aeatSystems } from "./aeat/registry";
import type { CustomsDispatchResult, CustomsMessage } from "./types";

export function validateCustomsMessage(message: CustomsMessage) {
  const errors: string[] = [];
  if (!message.caseId?.trim()) errors.push("caseId es obligatorio");
  if (!aeatSystems[message.system]) errors.push("sistema aduanero no soportado");
  if (!message.messageType?.trim()) errors.push("messageType es obligatorio");
  if (!message.xml?.trim().startsWith("<")) errors.push("xml no contiene un mensaje XML válido");
  return errors;
}

export async function processCustomsMessage(message: CustomsMessage): Promise<CustomsDispatchResult> {
  const errors = validateCustomsMessage(message);
  const environment = customsEnvironment();
  const correlationId = message.correlationId || randomUUID();
  if (errors.length) return { accepted: false, environment, correlationId, httpStatus: 400, errors };
  if (environment === "mock") return { accepted: true, environment, correlationId, httpStatus: 202, responseXml: `<FornexaMockAck correlationId="${correlationId}"/>`, errors: [] };
  const readiness = customsReadiness();
  if (readiness.missing.length) return { accepted: false, environment, correlationId, httpStatus: 503, errors: readiness.missing };
  if (!transmissionEnabled()) return { accepted: false, environment, correlationId, httpStatus: 423, errors: ["La transmisión está bloqueada hasta su activación explícita"] };
  const result = await dispatchSoap({ ...message, correlationId });
  return { ...result, environment };
}
