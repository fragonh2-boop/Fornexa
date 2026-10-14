import { createHash, createHmac, randomBytes } from "node:crypto";
import { isIP } from "node:net";
import {
  CalendarValidationError,
  object,
  onlyKeys,
} from "./operational-calendar.ts";
import { boundedText, choice, instant, integer } from "./docks.ts";
export function generateDockPortalToken() {
  return randomBytes(32).toString("base64url");
}
export function dockPortalTokenIsValid(token: unknown): token is string {
  return typeof token === "string" && /^[A-Za-z0-9_-]{43}$/.test(token);
}
export function dockPortalTokenHash(token: string) {
  return createHash("sha256").update(token).digest("hex");
}
export function dockPortalIpHash(
  headers: Headers,
  secret = process.env.FORNEXA_DOCK_PORTAL_HASH_SECRET,
) {
  // Vercel overwrites this header. Other deployments must supply a trusted ingress; missing identity fails closed.
  const ip = (
    headers.get("x-vercel-forwarded-for") ?? headers.get("x-forwarded-for")
  )
    ?.split(",")[0]
    ?.trim();
  if (!secret || !/^[a-f0-9]{64}$/i.test(secret) || !ip || !isIP(ip))
    return null;
  return createHmac("sha256", Buffer.from(secret, "hex"))
    .update(`dock-portal-ip:${ip}`)
    .digest("hex");
}
export type PortalBookingInput = {
  plate: string;
  packages: number;
  weight_kg: number;
  reference: string;
  notes: string;
  start: string;
  rule_code: string;
  direction: string;
  idempotency_key: string;
};
export function validatePortalBooking(value: unknown): PortalBookingInput {
  const b = object(value);
  onlyKeys(b, [
    "plate",
    "packages",
    "weight_kg",
    "reference",
    "notes",
    "start",
    "rule_code",
    "direction",
    "idempotency_key",
  ]);
  if (typeof b.plate !== "string")
    throw new CalendarValidationError("Matrícula no válida.");
  const rawPlate = b.plate.trim();
  if (!/^[A-Za-z0-9-]{4,12}$/.test(rawPlate))
    throw new CalendarValidationError("Matrícula no válida.");
  const plate = rawPlate.toUpperCase();
  if (!/^[A-Z0-9-]{4,12}$/.test(plate))
    throw new CalendarValidationError("Matrícula no válida.");
  if (
    typeof b.reference !== "string" ||
    !/^[A-Za-z0-9._/-]{1,40}$/.test(b.reference)
  )
    throw new CalendarValidationError("Referencia no válida.");
  if (
    typeof b.weight_kg !== "number" ||
    !Number.isFinite(b.weight_kg) ||
    b.weight_kg < 1 ||
    b.weight_kg > 44000
  )
    throw new CalendarValidationError("Peso permitido: 1–44.000 kg.");
  if (
    typeof b.notes !== "string" ||
    b.notes.length > 500 ||
    /[\x00-\x1f\x7f-\x9f]/.test(b.notes)
  )
    throw new CalendarValidationError("Observaciones no válidas.");
  if (
    typeof b.idempotency_key !== "string" ||
    !/^[A-Za-z0-9_-]{16,128}$/.test(b.idempotency_key)
  )
    throw new CalendarValidationError("Clave de reserva no válida.");
  return {
    plate,
    packages: integer(b.packages, 1, 60),
    weight_kg: b.weight_kg,
    reference: b.reference,
    notes: b.notes,
    start: instant(b.start),
    rule_code: boundedText(b.rule_code, 40, true),
    direction: choice(b.direction, ["INBOUND", "OUTBOUND"]),
    idempotency_key: b.idempotency_key,
  };
}
export function portalRequestHash(value: PortalBookingInput) {
  return dockPortalTokenHash(JSON.stringify(value));
}

export async function readPortalJson(request: Request) {
  const reader = request.body?.getReader();
  if (!reader) throw new SyntaxError("JSON no válido.");
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let size = 0,
    text = "";
  try {
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) break;
      size += chunk.value.byteLength;
      if (size > 4096) {
        await reader.cancel();
        throw new SyntaxError("Solicitud demasiado grande.");
      }
      text += decoder.decode(chunk.value, { stream: true });
    }
    text += decoder.decode();
    return JSON.parse(text);
  } finally {
    reader.releaseLock();
  }
}
