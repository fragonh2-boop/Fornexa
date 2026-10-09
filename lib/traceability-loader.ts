import type { SupabaseClient } from "@supabase/supabase-js";
import {
  TRACE_LIMIT,
  auditLabel,
  emptyTraceResult,
  isGtinLike,
  movementLabel,
  normalizeTraceQuery,
  sortTraceEvents,
  stopEvent,
  summarizePeople,
  transportEventLabel,
  type TraceEvent,
  type TraceProductMatch,
  type TraceResult,
} from "./traceability.ts";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Row = Record<string, any>;
type Client = SupabaseClient;

const uniq = <T,>(values: (T | null | undefined)[]) => [...new Set(values.filter((value): value is T => value !== null && value !== undefined && value !== ""))];

async function rows(promise: PromiseLike<{ data: Row[] | null; error: unknown }>, label: string, onLimit?: () => void): Promise<Row[]> {
  const { data, error } = await promise;
  if (error) throw new Error(`Trazabilidad: lectura de ${label} no disponible.`);
  if (onLimit && (data?.length ?? 0) >= TRACE_LIMIT) onLimit();
  return data ?? [];
}

/** ILIKE without wildcards is a case-insensitive exact match; escape "_" so it is not a one-character wildcard. */
function likeLiteral(value: string) {
  return value.replace(/_/g, "\\_");
}

function partyName(party: Row | undefined) {
  return party ? String(party.trade_name || party.legal_name || party.code || "—") : "—";
}

/**
 * Resolves an EAN/GTIN, SKU, article name, batch or serial number to a catalogue
 * article and follows every record that references it. Every query is scoped to
 * the caller's tenant; nothing is written.
 */
export async function loadTraceability(supabase: Client, tenantId: string, rawQuery: unknown, rawProductId?: unknown, options: { resolveUser?: (id: string) => string | undefined } = {}): Promise<TraceResult> {
  const query = normalizeTraceQuery(rawQuery);
  if (!query) return emptyTraceResult();
  const productId = typeof rawProductId === "string" && /^[0-9a-f-]{36}$/i.test(rawProductId) ? rawProductId : undefined;

  const productColumns = "id,sku,name,gtin,status,uom_base,hazard_status,owner_party_id,customer_id";
  let matchedBy = "";
  let lotFilter: string | undefined;
  let products: Row[] = [];

  if (isGtinLike(query)) {
    products = await rows(supabase.from("products").select(productColumns).eq("tenant_id", tenantId).eq("gtin", query).limit(20), "artículos");
    if (products.length) matchedBy = "EAN / GTIN";
  }
  if (!products.length) {
    products = await rows(supabase.from("products").select(productColumns).eq("tenant_id", tenantId).ilike("sku", likeLiteral(query)).limit(20), "artículos");
    if (products.length) matchedBy = "SKU";
  }
  if (!products.length) {
    const lots = await rows(supabase.from("inventory_movements").select("product_id").eq("tenant_id", tenantId).or(`batch_number.eq.${query},serial_number.eq.${query}`).limit(50), "lotes");
    const ids = uniq<string>(lots.map(item => item.product_id));
    if (ids.length) {
      products = await rows(supabase.from("products").select(productColumns).eq("tenant_id", tenantId).in("id", ids).limit(20), "artículos");
      matchedBy = "Lote / número de serie";
      lotFilter = query;
    }
  }
  if (!products.length && query.length >= 3) {
    products = await rows(supabase.from("products").select(productColumns).eq("tenant_id", tenantId).or(`name.ilike.*${likeLiteral(query)}*,sku.ilike.*${likeLiteral(query)}*,gtin.ilike.*${likeLiteral(query)}*`).order("sku").limit(20), "artículos");
    if (products.length) matchedBy = "Coincidencia parcial";
  }

  const ownerIds = uniq<string>(products.flatMap(item => [item.owner_party_id, item.customer_id]));
  const owners = ownerIds.length ? await rows(supabase.from("parties").select("id,code,trade_name,legal_name").eq("tenant_id", tenantId).in("id", ownerIds), "clientes") : [];
  const ownerById = new Map(owners.map(item => [item.id, item]));
  const matches: TraceProductMatch[] = products.map(item => ({
    id: item.id,
    sku: String(item.sku ?? ""),
    name: String(item.name ?? ""),
    gtin: String(item.gtin ?? ""),
    owner: partyName(ownerById.get(item.owner_party_id ?? item.customer_id)),
    status: item.status === "INACTIVE" ? "Inactivo" : "Activo",
  }));

  // Order lines may carry a free-text SKU that was never linked to the catalogue.
  const looseLines = !products.length
    ? await rows(supabase.from("order_lines").select("id").eq("tenant_id", tenantId).ilike("sku", likeLiteral(query)).limit(1), "líneas de partida")
    : [];
  if (!products.length && !looseLines.length) return { ...emptyTraceResult(query, "none") };

  const selected = productId ? products.find(item => item.id === productId) : products.length === 1 ? products[0] : undefined;
  if (products.length > 1 && !selected) return { ...emptyTraceResult(query, "choose"), matchedBy, matches };

  const result = emptyTraceResult(query, "found");
  const markTruncated = () => { result.truncated = true; };
  result.matchedBy = selected ? matchedBy : "SKU en líneas de partida";
  result.lotFilter = lotFilter;
  result.matches = matches;
  if (selected) {
    const match = matches.find(item => item.id === selected.id)!;
    result.product = { ...match, uom: String(selected.uom_base ?? "—"), hazard: String(selected.hazard_status ?? "UNKNOWN") };
  }

  const events: TraceEvent[] = [];
  const actorName = (id: string | null | undefined) => {
    if (!id) return undefined;
    return options.resolveUser?.(id) ?? "Usuario de la empresa";
  };

  // 1. Order lines → partidas.
  const sku = normalizeTraceQuery(selected?.sku ?? query) || query;
  const lines = selected
    ? await rows(supabase.from("order_lines").select("id,order_id,sku,description,packages,gross_weight,created_at").eq("tenant_id", tenantId).or(`product_id.eq.${selected.id},sku.ilike.${likeLiteral(sku)}`).limit(TRACE_LIMIT), "líneas de partida")
    : await rows(supabase.from("order_lines").select("id,order_id,sku,description,packages,gross_weight,created_at").eq("tenant_id", tenantId).ilike("sku", likeLiteral(query)).limit(TRACE_LIMIT), "líneas de partida");
  if (lines.length >= TRACE_LIMIT) result.truncated = true;
  const orderIds = uniq<string>(lines.map(item => item.order_id));
  const orders = orderIds.length ? await rows(supabase.from("orders").select("id,code,status,customer_id,customer_reference,created_at,launched_at").eq("tenant_id", tenantId).in("id", orderIds), "partidas") : [];
  const customerIds = uniq<string>(orders.map(item => item.customer_id));
  const customers = customerIds.length ? await rows(supabase.from("parties").select("id,code,trade_name,legal_name").eq("tenant_id", tenantId).in("id", customerIds), "clientes") : [];
  const customerById = new Map(customers.map(item => [item.id, item]));
  const orderById = new Map(orders.map(item => [item.id, item]));
  result.orders = orders.map(item => ({ code: item.code, customer: partyName(customerById.get(item.customer_id)), status: String(item.status ?? "—"), createdAt: item.created_at ?? null, reference: String(item.customer_reference ?? "") }));
  for (const line of lines) {
    const order = orderById.get(line.order_id);
    if (!order) continue;
    events.push({ id: `line-${line.id}`, at: order.launched_at ?? order.created_at ?? line.created_at ?? null, domain: "Partida", label: "Incluido en partida", reference: order.code, detail: [line.packages ? `${line.packages} bultos` : "", line.gross_weight ? `${line.gross_weight} kg` : "", line.description].filter(Boolean).join(" · "), place: partyName(customerById.get(order.customer_id)) });
  }

  // 2. Delivery notes and expeditions.
  const lineIds = uniq<string>(lines.map(item => item.id));
  const noteLines = lineIds.length ? await rows(supabase.from("delivery_note_lines").select("delivery_note_id,order_line_id").eq("tenant_id", tenantId).in("order_line_id", lineIds), "albaranes") : [];
  const noteIds = uniq<string>(noteLines.map(item => item.delivery_note_id));
  const notes = noteIds.length ? await rows(supabase.from("delivery_notes").select("id,code,status,created_at").eq("tenant_id", tenantId).in("id", noteIds), "albaranes") : [];
  const expeditionLinks = noteIds.length ? await rows(supabase.from("expedition_delivery_notes").select("expedition_id,delivery_note_id").eq("tenant_id", tenantId).in("delivery_note_id", noteIds), "expedientes") : [];
  const byOrder = orderIds.length ? await rows(supabase.from("expeditions").select("id").eq("tenant_id", tenantId).in("order_id", orderIds), "expedientes") : [];
  const expeditionIds = uniq<string>([...expeditionLinks.map(item => item.expedition_id), ...byOrder.map(item => item.id)]);
  const expeditions = expeditionIds.length ? await rows(supabase.from("expeditions").select("id,code,status,created_at,planned_departure").eq("tenant_id", tenantId).in("id", expeditionIds), "expedientes") : [];
  for (const note of notes) events.push({ id: `note-${note.id}`, at: note.created_at ?? null, domain: "Expediente", label: "Albarán generado", reference: note.code, detail: String(note.status ?? "") });
  for (const expedition of expeditions) events.push({ id: `exp-${expedition.id}`, at: expedition.created_at ?? null, domain: "Expediente", label: "Consolidado en expediente", reference: expedition.code, detail: String(expedition.status ?? "") });

  // 3. Trips, vehicles, drivers, loading and unloading stops.
  const tripLinks = expeditionIds.length ? await rows(supabase.from("trip_expeditions").select("trip_id,expedition_id").eq("tenant_id", tenantId).in("expedition_id", expeditionIds), "viajes") : [];
  const tripIds = uniq<string>(tripLinks.map(item => item.trip_id));
  const trips = tripIds.length ? await rows(supabase.from("trips").select("id,code,status,vehicle_id,driver_id,trailer_registration,planned_start,actual_start,actual_end,created_at").eq("tenant_id", tenantId).in("id", tripIds), "viajes") : [];
  const vehicleIds = uniq<string>(trips.map(item => item.vehicle_id));
  const driverIds = uniq<string>(trips.map(item => item.driver_id));
  const vehicles = vehicleIds.length ? await rows(supabase.from("vehicles").select("id,registration").eq("tenant_id", tenantId).in("id", vehicleIds), "vehículos") : [];
  const drivers = driverIds.length ? await rows(supabase.from("drivers").select("id,name,user_id").eq("tenant_id", tenantId).in("id", driverIds), "conductores") : [];
  const stops = tripIds.length ? await rows(supabase.from("trip_stops").select("id,trip_id,sequence,stop_type,company_name,full_address,status,arrived_at,completed_at,window_start").eq("tenant_id", tenantId).in("trip_id", tripIds).order("sequence"), "paradas") : [];
  const stopNotes = noteIds.length ? await rows(supabase.from("trip_stop_delivery_notes").select("trip_stop_id,delivery_note_id,operation").eq("tenant_id", tenantId).in("delivery_note_id", noteIds), "paradas") : [];
  const linkedStopIds = new Set(stopNotes.map(item => item.trip_stop_id));
  // A trip only narrows to its own stops linked to these delivery notes; without such a link every stop of that trip applies.
  const vehicleById = new Map(vehicles.map(item => [item.id, item]));
  const driverById = new Map(drivers.map(item => [item.id, item]));
  const expeditionCodeById = new Map(expeditions.map(item => [item.id, item.code]));
  for (const trip of trips) {
    const vehicle = [vehicleById.get(trip.vehicle_id)?.registration, trip.trailer_registration].filter(Boolean).join(" + ") || "—";
    const driver = driverById.get(trip.driver_id)?.name ?? "—";
    // When the stop ↔ delivery-note link exists use it; otherwise every stop of the trip applies.
    const allTripStops = stops.filter(stop => stop.trip_id === trip.id);
    const linkedTripStops = allTripStops.filter(stop => linkedStopIds.has(stop.id));
    const tripStops = linkedTripStops.length ? linkedTripStops : allTripStops;
    const load = tripStops.find(stop => String(stop.stop_type).toUpperCase() === "PICKUP");
    const unload = [...tripStops].reverse().find(stop => String(stop.stop_type).toUpperCase() === "DELIVERY");
    const href = `/viajes/${encodeURIComponent(trip.code)}`;
    result.trips.push({
      code: trip.code,
      status: String(trip.status ?? "—"),
      vehicle,
      driver,
      expeditions: tripLinks.filter(link => link.trip_id === trip.id).map(link => expeditionCodeById.get(link.expedition_id)).filter(Boolean) as string[],
      loadedAt: load?.completed_at ?? load?.arrived_at ?? null,
      loadPlace: load ? String(load.company_name || load.full_address || "—") : "—",
      unloadedAt: unload?.completed_at ?? unload?.arrived_at ?? null,
      unloadPlace: unload ? String(unload.company_name || unload.full_address || "—") : "—",
      href,
    });
    events.push({ id: `trip-${trip.id}`, at: trip.actual_start ?? trip.planned_start ?? trip.created_at ?? null, domain: "Viaje", label: trip.actual_start ? "Viaje iniciado" : "Asignado a viaje", reference: trip.code, place: vehicle, detail: driver !== "—" ? `Conductor: ${driver}` : undefined, href });
    for (const stop of tripStops) {
      const kind = stopEvent(stop.stop_type);
      events.push({ id: `stop-${stop.id}`, at: stop.completed_at ?? stop.arrived_at ?? stop.window_start ?? null, domain: kind.domain, label: stop.completed_at ? kind.label : `${kind.label} (previsto)`, reference: trip.code, place: [stop.company_name, stop.full_address].filter(Boolean).join(" · ") || undefined, detail: `Vehículo ${vehicle}`, actor: driver !== "—" ? driver : undefined, href });
    }
  }

  // 4. CMR documents and their transport events (signatures, POD, incidents).
  // cmr_expeditions has no tenant_id column (checked against the schema): it is queried only with
  // expedition ids already scoped to this tenant, and every CMR id it yields is re-read below
  // from cmr_documents filtered by tenant, so a foreign CMR can never be shown.
  const cmrLinks = expeditionIds.length ? await rows(supabase.from("cmr_expeditions").select("cmr_id,expedition_id").in("expedition_id", expeditionIds), "documentos") : [];
  const cmrIds = uniq<string>(cmrLinks.map(item => item.cmr_id));
  const cmrs = cmrIds.length ? await rows(supabase.from("cmr_documents").select("id,cmr_number,status,issued_at,created_at").eq("tenant_id", tenantId).in("id", cmrIds), "documentos") : [];
  const cmrById = new Map(cmrs.map(item => [item.id, item]));
  result.documents = cmrs.map(item => ({ number: item.cmr_number, status: String(item.status ?? "—"), issuedAt: item.issued_at ?? null, href: `/epod-cmr/${encodeURIComponent(item.cmr_number)}` }));
  const transport = cmrs.length ? await rows(supabase.from("transport_events").select("id,cmr_id,event_type,occurred_at,actor_user_id").eq("tenant_id", tenantId).in("cmr_id", cmrs.map(item => item.id)).order("occurred_at", { ascending: false }).limit(TRACE_LIMIT), "eventos de transporte", markTruncated) : [];
  for (const event of transport) {
    const cmr = cmrById.get(event.cmr_id);
    events.push({ id: `te-${event.id}`, at: event.occurred_at ?? null, domain: "Documento", label: transportEventLabel(event.event_type), reference: cmr?.cmr_number, actor: actorName(event.actor_user_id), href: cmr ? `/epod-cmr/${encodeURIComponent(cmr.cmr_number)}` : undefined });
  }

  // 5. Customs. Cases have no foreign key to orders, so they are related only by
  // an exact reference/MRN match with the codes found above or the article codes.
  const codes = uniq<string>([...orders.map(item => item.code), ...expeditions.map(item => item.code), ...trips.map(item => item.code), ...cmrs.map(item => item.cmr_number), selected?.sku, selected?.gtin]);
  if (codes.length) {
    const byReference = await rows(supabase.from("customs_cases").select("id,reference,mrn,direction,system,status,updated_at").eq("tenant_id", tenantId).in("reference", codes).limit(50), "aduanas");
    const byMrn = await rows(supabase.from("customs_cases").select("id,reference,mrn,direction,system,status,updated_at").eq("tenant_id", tenantId).in("mrn", codes).limit(50), "aduanas");
    const referenceMatches = new Set(byReference.map(item => item.id));
    const cases = [...new Map([...byReference, ...byMrn].map(item => [item.id, item])).values()];
    const caseEvents = cases.length ? await rows(supabase.from("customs_events").select("id,case_id,event_type,actor_id,created_at").eq("tenant_id", tenantId).in("case_id", cases.map(item => item.id)).limit(TRACE_LIMIT), "eventos de aduana", markTruncated) : [];
    for (const item of cases) {
      // Report the field that actually matched: reference first, otherwise the MRN.
      const linkedBy = referenceMatches.has(item.id) ? `Referencia ${item.reference}` : `MRN ${item.mrn}`;
      const href = `/registros/aduanas/${encodeURIComponent(item.reference)}`;
      result.customs.push({ reference: item.reference, mrn: String(item.mrn ?? "—"), direction: String(item.direction ?? "—"), system: String(item.system ?? "—"), status: String(item.status ?? "—"), updatedAt: item.updated_at ?? null, linkedBy, href });
      events.push({ id: `cc-${item.id}`, at: item.updated_at ?? null, domain: "Aduana", label: `Despacho ${String(item.direction ?? "").toLowerCase() || "aduanero"}`.trim(), reference: item.mrn || item.reference, detail: `${item.system ?? ""} · ${item.status ?? ""} · ${linkedBy}`, href });
    }
    for (const event of caseEvents) {
      const item = cases.find(entry => entry.id === event.case_id);
      events.push({ id: `ce-${event.id}`, at: event.created_at ?? null, domain: "Aduana", label: String(event.event_type ?? "Evento aduanero"), reference: item?.mrn || item?.reference, actor: actorName(event.actor_id) });
    }
  }

  // 6. Warehouse movements and current stock.
  if (selected) {
    const movements = await rows(supabase.from("inventory_movements").select("id,movement_number,movement_type,warehouse_id,source_bin_id,destination_bin_id,quantity,uom,batch_number,serial_number,operator_id,completed_at,started_at,created_at,status").eq("tenant_id", tenantId).eq("product_id", selected.id).or(lotFilter ? `batch_number.eq.${lotFilter},serial_number.eq.${lotFilter}` : "id.not.is.null").order("created_at", { ascending: false }).limit(TRACE_LIMIT), "movimientos de almacén");
    if (movements.length >= TRACE_LIMIT) result.truncated = true;
    const quants = await rows(supabase.from("inventory_quants").select("warehouse_id,bin_id,batch_number,quantity_on_hand,uom,stock_status").eq("tenant_id", tenantId).eq("product_id", selected.id).gt("quantity_on_hand", 0).or(lotFilter ? `batch_number.eq.${lotFilter},serial_number.eq.${lotFilter}` : "id.not.is.null").limit(TRACE_LIMIT), "stock", markTruncated);
    const warehouseIds = uniq<string>([...movements.map(item => item.warehouse_id), ...quants.map(item => item.warehouse_id)]);
    const binIds = uniq<string>([...movements.flatMap(item => [item.source_bin_id, item.destination_bin_id]), ...quants.map(item => item.bin_id)]);
    const warehouses = warehouseIds.length ? await rows(supabase.from("warehouses").select("id,code,name").eq("tenant_id", tenantId).in("id", warehouseIds), "almacenes") : [];
    const bins = binIds.length ? await rows(supabase.from("warehouse_bins").select("id,bin_code").eq("tenant_id", tenantId).in("id", binIds), "ubicaciones") : [];
    const warehouseName = (id: string) => { const item = warehouses.find(entry => entry.id === id); return item ? String(item.name || item.code) : "—"; };
    const binCode = (id: string | null) => (id ? bins.find(entry => entry.id === id)?.bin_code ?? "—" : "—");
    for (const movement of movements) {
      const operator = movement.operator_id ? (/^[0-9a-f-]{36}$/i.test(movement.operator_id) ? actorName(movement.operator_id) : String(movement.operator_id)) : undefined;
      const at = movement.completed_at ?? movement.started_at ?? movement.created_at ?? null;
      result.movements.push({ number: movement.movement_number, type: movementLabel(movement.movement_type), warehouse: warehouseName(movement.warehouse_id), from: binCode(movement.source_bin_id), to: binCode(movement.destination_bin_id), quantity: `${movement.quantity ?? "—"} ${movement.uom ?? ""}`.trim(), batch: String(movement.batch_number ?? "—"), serial: String(movement.serial_number ?? "—"), operator: operator ?? "—", at, status: String(movement.status ?? "—") });
      events.push({ id: `mv-${movement.id}`, at, domain: "Almacén", label: movementLabel(movement.movement_type), reference: movement.movement_number, place: `${warehouseName(movement.warehouse_id)} · ${binCode(movement.source_bin_id)} → ${binCode(movement.destination_bin_id)}`, detail: [movement.batch_number ? `Lote ${movement.batch_number}` : "", movement.serial_number ? `Serie ${movement.serial_number}` : "", `${movement.quantity ?? ""} ${movement.uom ?? ""}`.trim()].filter(Boolean).join(" · "), actor: operator });
    }
    result.stock = quants.map(item => ({ warehouse: warehouseName(item.warehouse_id), bin: binCode(item.bin_id), batch: String(item.batch_number ?? "—"), quantity: `${item.quantity_on_hand ?? 0} ${item.uom ?? ""}`.trim(), status: String(item.stock_status ?? "—") }));
  }

  // 7. Who created or changed the article and the records it travelled with.
  const auditIds = uniq<string>([selected?.id, ...orderIds, ...expeditionIds, ...tripIds]);
  const audits = auditIds.length ? await rows(supabase.from("audit_events").select("id,entity_type,entity_id,action,actor_user_id,occurred_at").eq("tenant_id", tenantId).in("entity_id", auditIds).order("occurred_at", { ascending: false }).limit(TRACE_LIMIT), "auditoría", markTruncated) : [];
  const referenceById = new Map<string, string>([...orders.map(item => [item.id, item.code] as [string, string]), ...expeditions.map(item => [item.id, item.code] as [string, string]), ...trips.map(item => [item.id, item.code] as [string, string])]);
  if (selected) referenceById.set(selected.id, String(selected.sku));
  for (const audit of audits) {
    events.push({ id: `au-${audit.id}`, at: audit.occurred_at ?? null, domain: "Registro", label: auditLabel(audit.entity_type, audit.action), reference: referenceById.get(audit.entity_id), actor: actorName(audit.actor_user_id) });
  }

  result.events = sortTraceEvents(events);
  result.people = summarizePeople(result.events);
  return result;
}
