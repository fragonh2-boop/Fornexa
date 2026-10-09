/**
 * Product traceability: shared types and pure helpers.
 *
 * The model follows the GS1 EPCIS questions (what, where, when, who and why):
 * every hop of an article (order line, expedition, trip stop, document,
 * customs case, warehouse movement, record change) becomes one event in a
 * single timeline, and each domain also keeps its own detailed list.
 */

export type TraceDomain = "Orden" | "Expediente" | "Viaje" | "Carga" | "Descarga" | "Documento" | "Aduana" | "Almacén" | "Registro";

export const TRACE_DOMAINS: TraceDomain[] = ["Orden", "Expediente", "Viaje", "Carga", "Descarga", "Documento", "Aduana", "Almacén", "Registro"];

export type TraceEvent = {
  id: string;
  at: string | null;
  domain: TraceDomain;
  /** What happened, in business words. */
  label: string;
  /** Reference of the record involved (orden, viaje, CMR, MRN…). */
  reference?: string;
  detail?: string;
  /** Where it happened (address, warehouse/bin, vehicle). */
  place?: string;
  /** Who did it, when the source records an actor. */
  actor?: string;
  href?: string;
};

export type TraceProductMatch = {
  id: string;
  sku: string;
  name: string;
  gtin: string;
  owner: string;
  status: string;
};

export type TraceTrip = {
  code: string;
  status: string;
  vehicle: string;
  driver: string;
  expeditions: string[];
  loadedAt: string | null;
  loadPlace: string;
  unloadedAt: string | null;
  unloadPlace: string;
  href?: string;
};

export type TraceCustoms = {
  reference: string;
  mrn: string;
  direction: string;
  system: string;
  status: string;
  updatedAt: string | null;
  /** How the case was related to the article; customs has no foreign key to orders. */
  linkedBy: string;
  href?: string;
};

export type TraceMovement = {
  number: string;
  type: string;
  warehouse: string;
  from: string;
  to: string;
  quantity: string;
  batch: string;
  serial: string;
  operator: string;
  at: string | null;
  status: string;
};

export type TraceStock = {
  warehouse: string;
  bin: string;
  batch: string;
  quantity: string;
  status: string;
};

export type TracePerson = {
  name: string;
  actions: string[];
  count: number;
  lastAt: string | null;
};

export type TraceResult = {
  query: string;
  status: "empty" | "none" | "choose" | "found" | "error";
  matchedBy?: string;
  /** When the search matched a batch or serial number, warehouse data is narrowed to it. */
  lotFilter?: string;
  matches: TraceProductMatch[];
  product?: TraceProductMatch & { uom: string; hazard: string };
  events: TraceEvent[];
  orders: { code: string; customer: string; status: string; createdAt: string | null; reference: string; href?: string }[];
  trips: TraceTrip[];
  customs: TraceCustoms[];
  movements: TraceMovement[];
  stock: TraceStock[];
  people: TracePerson[];
  documents: { number: string; status: string; issuedAt: string | null; href?: string }[];
  truncated: boolean;
};

export const TRACE_LIMIT = 200;

export function emptyTraceResult(query = "", status: TraceResult["status"] = "empty"): TraceResult {
  return { query, status, matches: [], events: [], orders: [], trips: [], customs: [], movements: [], stock: [], people: [], documents: [], truncated: false };
}

/** Clean user input: trims, collapses spaces and drops characters with meaning in PostgREST filters. */
export function normalizeTraceQuery(value: unknown): string {
  return String(value ?? "")
    .replace(/[\u0000-\u001f]/g, " ")
    .replace(/[,()*%:\\"']/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
}

/** EAN-8, UPC-A (12), EAN-13 and GTIN-14 are all-digit codes of these lengths. */
export function isGtinLike(query: string): boolean {
  return /^(?:\d{8}|\d{12,14})$/.test(query);
}

/** GS1 mod-10 check digit validation, used only to tell the user when a code looks mistyped. */
export function hasValidGtinCheckDigit(code: string): boolean {
  if (!isGtinLike(code)) return false;
  const digits = code.split("").map(Number);
  const check = digits.pop()!;
  const sum = digits.reverse().reduce((total, digit, index) => total + digit * (index % 2 === 0 ? 3 : 1), 0);
  return (10 - (sum % 10)) % 10 === check;
}

/** Newest first; undated events go last so they never hide recent activity. */
const timeOf = (value: string) => { const time = Date.parse(value); return Number.isNaN(time) ? 0 : time; };

export function sortTraceEvents(events: TraceEvent[]): TraceEvent[] {
  return [...events].sort((a, b) => {
    if (a.at && b.at) return timeOf(b.at) - timeOf(a.at) || a.id.localeCompare(b.id);
    if (a.at) return -1;
    if (b.at) return 1;
    return a.id.localeCompare(b.id);
  });
}

/** Groups who touched the article, from the actors recorded in each event. */
export function summarizePeople(events: TraceEvent[]): TracePerson[] {
  const people = new Map<string, TracePerson>();
  for (const event of events) {
    if (!event.actor) continue;
    const person = people.get(event.actor) ?? { name: event.actor, actions: [], count: 0, lastAt: null };
    person.count += 1;
    if (!person.actions.includes(event.label)) person.actions.push(event.label);
    if (event.at && (!person.lastAt || event.at > person.lastAt)) person.lastAt = event.at;
    people.set(event.actor, person);
  }
  return [...people.values()].sort((a, b) => (b.lastAt ?? "").localeCompare(a.lastAt ?? ""));
}

export function countByDomain(events: TraceEvent[]): Record<TraceDomain, number> {
  const counts = Object.fromEntries(TRACE_DOMAINS.map(domain => [domain, 0])) as Record<TraceDomain, number>;
  for (const event of events) counts[event.domain] += 1;
  return counts;
}

const dateFormatter = new Intl.DateTimeFormat("es-ES", { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Madrid" });

export function formatTraceDate(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : dateFormatter.format(date);
}

const STOP_LABELS: Record<string, { domain: TraceDomain; label: string }> = {
  PICKUP: { domain: "Carga", label: "Cargado en vehículo" },
  DELIVERY: { domain: "Descarga", label: "Descargado del vehículo" },
};

export function stopEvent(stopType: string | null | undefined) {
  return STOP_LABELS[String(stopType ?? "").toUpperCase()] ?? { domain: "Viaje" as TraceDomain, label: "Parada del viaje" };
}

const MOVEMENT_LABELS: Record<string, string> = {
  RECEIPT: "Entrada en almacén",
  INBOUND: "Entrada en almacén",
  PUTAWAY: "Ubicado",
  MOVE: "Movido de ubicación",
  TRANSFER: "Traspaso",
  PICK: "Preparado (picking)",
  PICKING: "Preparado (picking)",
  SHIPMENT: "Salida de almacén",
  OUTBOUND: "Salida de almacén",
  COUNT: "Recuento",
  ADJUSTMENT: "Ajuste de inventario",
};

export function movementLabel(type: string | null | undefined): string {
  const key = String(type ?? "").toUpperCase();
  return MOVEMENT_LABELS[key] ?? (key ? `Movimiento ${key.toLowerCase()}` : "Movimiento de almacén");
}

const TRANSPORT_EVENT_LABELS: Record<string, string> = {
  cmr_issued: "CMR emitido",
  stop_arrived: "Llegada a parada",
  stop_completed: "Parada completada",
  signature_added: "Firma registrada",
  pod_photo_added: "Foto de entrega (POD)",
  incident_reported: "Incidencia registrada",
  work_finished: "Trabajo finalizado",
};

export function transportEventLabel(type: string | null | undefined): string {
  return TRANSPORT_EVENT_LABELS[String(type ?? "")] ?? "Evento de transporte";
}

const AUDIT_LABELS: Record<string, string> = {
  CREATE: "Alta del registro",
  UPDATE: "Modificación del registro",
  DELETE: "Baja del registro",
  UPSERT: "Actualización del registro",
};

export function auditLabel(entity: string | null | undefined, action: string | null | undefined): string {
  const base = AUDIT_LABELS[String(action ?? "").toUpperCase()] ?? "Cambio registrado";
  const kind = String(entity ?? "").toUpperCase();
  if (kind === "PRODUCT") return base.replace("del registro", "del artículo");
  if (kind === "ORDER") return base.replace("del registro", "de la orden");
  if (kind === "EXPEDITION") return base.replace("del registro", "del expediente");
  if (kind === "TRIP") return base.replace("del registro", "del viaje");
  return base;
}
