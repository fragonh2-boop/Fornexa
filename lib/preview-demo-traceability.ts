import { emptyTraceResult, normalizeTraceQuery, sortTraceEvents, summarizePeople, type TraceEvent, type TraceProductMatch, type TraceResult } from "./traceability.ts";

// Static, synthetic interface data for the Preview demo. Nothing here references backend records.
const DEMO_MATCHES: TraceProductMatch[] = [
  { id: "DEMO-PRODUCT-01", sku: "DEMO-CAJA-001", name: "Caja de muestra", gtin: "8400000000017", owner: "Cliente ficticio Aurora", status: "Activo" },
  { id: "DEMO-PRODUCT-02", sku: "DEMO-CAJA-002", name: "Caja de muestra grande", gtin: "8400000000024", owner: "Cliente ficticio Aurora", status: "Activo" },
];

const DEMO_EVENTS: TraceEvent[] = [
  { id: "DEMO-EV-01", at: "2026-10-01T07:40:00.000Z", domain: "Registro", label: "Alta del artículo", reference: "DEMO-CAJA-001", actor: "Usuaria ficticia Marta" },
  { id: "DEMO-EV-02", at: "2026-10-02T08:15:00.000Z", domain: "Almacén", label: "Entrada en almacén", reference: "DEMO-MOV-0001", place: "Almacén ficticio Norte · MUELLE-01 → A-01-02", detail: "Lote DEMO-L01 · 120 UN", actor: "Operario ficticio Luis" },
  { id: "DEMO-EV-03", at: "2026-10-03T09:30:00.000Z", domain: "Almacén", label: "Preparado (picking)", reference: "DEMO-MOV-0002", place: "Almacén ficticio Norte · A-01-02 → MUELLE-03", detail: "Lote DEMO-L01 · 40 UN", actor: "Operario ficticio Luis" },
  { id: "DEMO-EV-04", at: "2026-10-03T10:00:00.000Z", domain: "Partida", label: "Incluido en partida", reference: "DEMO-PT-0001", detail: "4 bultos · 60 kg", place: "Cliente ficticio Aurora", actor: "Usuaria ficticia Marta" },
  { id: "DEMO-EV-05", at: "2026-10-03T11:00:00.000Z", domain: "Expediente", label: "Consolidado en expediente", reference: "DEMO-EXP-001" },
  { id: "DEMO-EV-06", at: "2026-10-04T06:30:00.000Z", domain: "Viaje", label: "Viaje iniciado", reference: "DEMO-VJ-001", place: "DEMO-1234-ABC", detail: "Conductor: Conductor ficticio 01", href: "/viajes/DEMO-VJ-001" },
  { id: "DEMO-EV-07", at: "2026-10-04T07:05:00.000Z", domain: "Carga", label: "Cargado en vehículo", reference: "DEMO-VJ-001", place: "Almacén ficticio Norte · Valencia", detail: "Vehículo DEMO-1234-ABC", actor: "Conductor ficticio 01", href: "/viajes/DEMO-VJ-001" },
  { id: "DEMO-EV-08", at: "2026-10-04T07:10:00.000Z", domain: "Documento", label: "CMR emitido", reference: "DEMO-CMR-001", actor: "Usuaria ficticia Marta" },
  { id: "DEMO-EV-09", at: "2026-10-04T15:20:00.000Z", domain: "Aduana", label: "Despacho exportación", reference: "DEMO-MRN-0001", detail: "AES · Levante autorizado · Referencia DEMO-EXP-001" },
  { id: "DEMO-EV-10", at: "2026-10-05T09:45:00.000Z", domain: "Descarga", label: "Descargado del vehículo", reference: "DEMO-VJ-001", place: "Destino ficticio · Lyon", detail: "Vehículo DEMO-1234-ABC", actor: "Conductor ficticio 01", href: "/viajes/DEMO-VJ-001" },
  { id: "DEMO-EV-11", at: "2026-10-05T09:50:00.000Z", domain: "Documento", label: "Firma registrada", reference: "DEMO-CMR-001", actor: "Conductor ficticio 01" },
];

function demoFound(query: string, matchedBy: string): TraceResult {
  const result = emptyTraceResult(query, "found");
  const product = DEMO_MATCHES[0];
  result.matchedBy = matchedBy;
  result.matches = [product];
  result.product = { ...product, uom: "UN", hazard: "UNKNOWN" };
  result.events = sortTraceEvents(DEMO_EVENTS);
  result.people = summarizePeople(result.events);
  result.orders = [{ code: "DEMO-PT-0001", customer: "Cliente ficticio Aurora", status: "Lanzada", createdAt: "2026-10-03T10:00:00.000Z", reference: "DEMO-REF-77" }];
  result.trips = [{ code: "DEMO-VJ-001", status: "Finalizado", vehicle: "DEMO-1234-ABC", driver: "Conductor ficticio 01", expeditions: ["DEMO-EXP-001"], loadedAt: "2026-10-04T07:05:00.000Z", loadPlace: "Almacén ficticio Norte", unloadedAt: "2026-10-05T09:45:00.000Z", unloadPlace: "Destino ficticio · Lyon", href: "/viajes/DEMO-VJ-001" }];
  result.customs = [{ reference: "DEMO-EXP-001", mrn: "DEMO-MRN-0001", direction: "Exportación", system: "AES", status: "Levante autorizado", updatedAt: "2026-10-04T15:20:00.000Z", linkedBy: "Referencia DEMO-EXP-001" }];
  result.documents = [{ number: "DEMO-CMR-001", status: "Firmado", issuedAt: "2026-10-04T07:10:00.000Z" }];
  result.movements = [
    { number: "DEMO-MOV-0002", type: "Preparado (picking)", warehouse: "Almacén ficticio Norte", from: "A-01-02", to: "MUELLE-03", quantity: "40 UN", batch: "DEMO-L01", serial: "—", operator: "Operario ficticio Luis", at: "2026-10-03T09:30:00.000Z", status: "Completado" },
    { number: "DEMO-MOV-0001", type: "Entrada en almacén", warehouse: "Almacén ficticio Norte", from: "MUELLE-01", to: "A-01-02", quantity: "120 UN", batch: "DEMO-L01", serial: "—", operator: "Operario ficticio Luis", at: "2026-10-02T08:15:00.000Z", status: "Completado" },
  ];
  result.stock = [{ warehouse: "Almacén ficticio Norte", bin: "A-01-02", batch: "DEMO-L01", quantity: "80 UN", status: "Disponible" }];
  return result;
}

/** Demo search: only the synthetic codes above resolve; anything else returns "no results". */
export function previewDemoTraceability(rawQuery: unknown, productId?: unknown): TraceResult {
  const query = normalizeTraceQuery(rawQuery);
  if (!query) return emptyTraceResult();
  if (productId === "DEMO-PRODUCT-01" || productId === "DEMO-PRODUCT-02") return demoFound(query, "Coincidencia parcial");
  const upper = query.toUpperCase();
  if (upper === "DEMO-CAJA-001" || query === "8400000000017") return demoFound(query, query === "8400000000017" ? "EAN / GTIN" : "SKU");
  if (upper === "DEMO-L01") return demoFound(query, "Lote / número de serie");
  if (upper.startsWith("DEMO") || upper.includes("CAJA")) return { ...emptyTraceResult(query, "choose"), matchedBy: "Coincidencia parcial", matches: DEMO_MATCHES };
  return emptyTraceResult(query, "none");
}
