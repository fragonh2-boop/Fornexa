import https from "node:https";
import { randomUUID } from "node:crypto";
import { endpointFor } from "../config";
import type { CustomsDispatchResult, CustomsMessage } from "../types";

function certificateOptions(): https.RequestOptions {
  if (process.env.AEAT_CERTIFICATE_PFX_BASE64) {
    return { pfx: Buffer.from(process.env.AEAT_CERTIFICATE_PFX_BASE64, "base64"), passphrase: process.env.AEAT_CERTIFICATE_PASSPHRASE };
  }
  if (process.env.AEAT_CERTIFICATE_PEM && process.env.AEAT_PRIVATE_KEY_PEM) {
    return { cert: process.env.AEAT_CERTIFICATE_PEM, key: process.env.AEAT_PRIVATE_KEY_PEM, passphrase: process.env.AEAT_CERTIFICATE_PASSPHRASE };
  }
  throw new Error("No hay certificado electrónico configurado para AEAT");
}

export function soapEnvelope(xml: string) {
  if (xml.includes("Envelope") && xml.includes("http://schemas.xmlsoap.org/soap/envelope/")) return xml;
  return `<?xml version="1.0" encoding="UTF-8"?><soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/"><soapenv:Header/><soapenv:Body>${xml}</soapenv:Body></soapenv:Envelope>`;
}

export async function dispatchSoap(message: CustomsMessage): Promise<CustomsDispatchResult> {
  const endpoint = endpointFor(message.system);
  if (!endpoint) throw new Error(`No se ha configurado el endpoint oficial para ${message.system}`);
  const correlationId = message.correlationId || randomUUID();
  const body = soapEnvelope(message.xml);

  return new Promise((resolve, reject) => {
    const url = new URL(endpoint);
    const request = https.request(url, {
      method: "POST",
      ...certificateOptions(),
      headers: { "Content-Type": "text/xml; charset=utf-8", "Content-Length": Buffer.byteLength(body), SOAPAction: message.messageType, "X-Fornexa-Correlation-Id": correlationId },
      timeout: 30_000,
      rejectUnauthorized: true,
    }, (response) => {
      const chunks: Buffer[] = [];
      response.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
      response.on("end", () => {
        const responseXml = Buffer.concat(chunks).toString("utf8");
        const httpStatus = response.statusCode || 500;
        resolve({ accepted: httpStatus >= 200 && httpStatus < 300 && !responseXml.includes("Fault"), environment: "production", correlationId, httpStatus, responseXml, errors: httpStatus >= 400 ? [`HTTP ${httpStatus}`] : [] });
      });
    });
    request.on("timeout", () => request.destroy(new Error("Tiempo de espera agotado al conectar con AEAT")));
    request.on("error", reject);
    request.end(body);
  });
}
