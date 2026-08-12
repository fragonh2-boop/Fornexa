import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseAdmin, numericValue } from "@/lib/supabase-admin";
import {
  FORNEXA_LOCAL_STORAGE_MAX_BYTES,
  FORNEXA_LOCAL_STORAGE_PREFIX,
  stableStringify,
  type LocalStorageEntry,
  type LocalStorageMigrationRequest,
} from "@/lib/local-storage-migration";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const TENANT_ID = "00000000-0000-4000-8000-000000000001";
const MAX_KEYS = 500;

type JsonRecord = Record<string, unknown>;
type PartyCandidate = JsonRecord & { code: string; legal_name: string };
type AddressCandidate = JsonRecord & { party_code: string; code: string };

export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) return NextResponse.json({ error: "Origen no autorizado." }, { status: 403 });
  const raw = await request.text();
  if (raw.length > FORNEXA_LOCAL_STORAGE_MAX_BYTES) return NextResponse.json({ error: "El almacenamiento local supera el límite de migración." }, { status: 413 });

  let input: LocalStorageMigrationRequest;
  try { input = JSON.parse(raw) as LocalStorageMigrationRequest; }
  catch { return NextResponse.json({ error: "El cuerpo debe ser JSON válido." }, { status: 400 }); }

  const entries = validEntries(input.entries);
  if (!entries.length) return NextResponse.json({ error: "No hay datos de FORNEXA para migrar." }, { status: 422 });
  if (entries.length > MAX_KEYS) return NextResponse.json({ error: "Hay demasiadas claves locales para una sola migración." }, { status: 413 });

  const sourceOrigin = request.nextUrl.origin;
  const supabase = createSupabaseAdmin();
  const { data: run, error: runError } = await supabase.from("local_storage_sync_runs").insert({
    tenant_id: TENANT_ID,
    source_origin: sourceOrigin,
    storage_keys: entries.length,
    source_items: entries.reduce((total, entry) => total + itemCount(entry.value), 0),
  }).select("id").single();
  if (runError || !run) return failure(runError ?? new Error("No se pudo iniciar la migración."));

  try {
    await archiveEntries(supabase, sourceOrigin, entries);
    const summary = await normalizeEntries(supabase, entries, run.id);
    const normalizedRecords = Object.entries(summary).filter(([key]) => key !== "archivedKeys").reduce((total, [, count]) => total + count, 0);
    const { error: finishError } = await supabase.from("local_storage_sync_runs").update({
      status: "COMPLETED",
      normalized_records: normalizedRecords,
      summary,
      completed_at: new Date().toISOString(),
    }).eq("id", run.id);
    if (finishError) throw finishError;

    return NextResponse.json({
      status: "COMPLETED",
      runId: run.id,
      storageKeys: entries.length,
      sourceItems: entries.reduce((total, entry) => total + itemCount(entry.value), 0),
      normalizedRecords,
      summary,
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    await supabase.from("local_storage_sync_runs").update({
      status: "FAILED",
      error_message: errorMessage(error),
      completed_at: new Date().toISOString(),
    }).eq("id", run.id);
    return failure(error);
  }
}

async function archiveEntries(supabase: SupabaseClient, sourceOrigin: string, entries: LocalStorageEntry[]) {
  const rows = entries.map(entry => ({
    tenant_id: TENANT_ID,
    source_origin: sourceOrigin,
    storage_key: entry.key,
    item_key: "__root__",
    content_hash: hash(stableStringify(entry.value)),
    payload: jsonValue(entry.value),
    last_synced_at: new Date().toISOString(),
  }));
  const { error } = await supabase.from("local_storage_imports").upsert(rows, {
    onConflict: "tenant_id,source_origin,storage_key,item_key",
  });
  if (error) throw error;
}

async function normalizeEntries(supabase: SupabaseClient, entries: LocalStorageEntry[], runId: string) {
  const byKey = new Map(entries.map(entry => [entry.key, entry.value]));
  const parties = new Map<string, PartyCandidate>();
  const addresses = new Map<string, AddressCandidate>();
  const orders = records(byKey.get("fornexa-partidas"), byKey.get("fornexa-pedidos"));
  const expeditions = records(byKey.get("fornexa-expediciones"));
  const trips = records(byKey.get("fornexa-viajes"));
  const explicitNotes = records(byKey.get("fornexa-albaranes"));

  for (const item of records(byKey.get("fornexa-clientes"))) addParty(parties, item, "CUSTOMER");
  for (const item of records(byKey.get("fornexa-colaboradores"))) addParty(parties, item, "SUPPLIER");
  for (const item of records(byKey.get("fornexa-terceros-logisticos"))) addParty(parties, item, "LOGISTICS");

  for (const entry of entries) {
    const serviceKey = parseServiceAssignmentKey(entry.key);
    if (!serviceKey || parties.has(serviceKey.entityCode)) continue;
    addParty(parties, {
      code: serviceKey.entityCode,
      nombre: titleFromSlug(serviceKey.entityCode),
    }, serviceKey.entityType === "cliente" ? "CUSTOMER" : "SUPPLIER");
  }

  for (const entry of entries) {
    if (entry.key.startsWith("fornexa-party-") && asRecord(entry.value)) {
      addParty(parties, asRecord(entry.value)!, "PARTY", entry.key.slice("fornexa-party-".length));
      for (const address of records(asRecord(entry.value)!.addresses)) addAddress(addresses, address, clean(asRecord(entry.value)!.code) || entry.key.slice("fornexa-party-".length));
    }
  }

  for (const point of records(byKey.get("fornexa-puntos-recogida"))) {
    const partyCode = clean(point.partyCode) || clean(point.customerId) || clean(point.codigoCliente);
    addParty(parties, { ...point, code: partyCode, nombre: point.partyName ?? point.name }, "CUSTOMER");
    addAddress(addresses, { ...point, type: "Recogida", street: point.address }, partyCode);
  }
  for (const point of records(byKey.get("fornexa-puntos-entrega"))) {
    const partyCode = clean(point.partyCode) || clean(point.customerId) || clean(point.codigoCliente);
    addParty(parties, { ...point, code: partyCode, nombre: point.partyName ?? point.name }, "CUSTOMER");
    addAddress(addresses, { ...point, type: "Entrega", street: point.address }, partyCode);
  }

  for (const order of orders) {
    const code = customerCode(order);
    addParty(parties, { code, nombre: order.cliente || code }, "CUSTOMER");
    addOrderAddress(addresses, order, code, "PICKUP");
    addOrderAddress(addresses, order, code, "DELIVERY");
  }
  for (const note of explicitNotes) addParty(parties, { code: customerCode(note), nombre: note.cliente || customerCode(note) }, "CUSTOMER");

  if ((orders.length || explicitNotes.length) && !parties.has("FORNEXA-UNASSIGNED")) {
    addParty(parties, { code: "FORNEXA-UNASSIGNED", nombre: "Cliente pendiente de clasificar" }, "CUSTOMER");
  }

  const partyRows = [...parties.values()].map(candidate => withoutEmpty({ ...candidate, tenant_id: TENANT_ID }));
  const partyResult = await upsertReturning(supabase, "parties", partyRows, "tenant_id,code", "id,code");
  const partyIds = new Map(partyResult.map(row => [clean(row.code), clean(row.id)]));

  const addressRows = [...addresses.values()].flatMap(candidate => {
    const partyId = partyIds.get(candidate.party_code);
    if (!partyId) return [];
    const { party_code: _partyCode, ...row } = candidate;
    void _partyCode;
    return [{ ...withoutEmpty(row), tenant_id: TENANT_ID, party_id: partyId }];
  });
  const addressResult = await upsertReturning(supabase, "party_addresses", addressRows, "tenant_id,party_id,code", "id,party_id,code");
  const addressIds = new Map(addressResult.map(row => [`${clean(row.party_id)}:${clean(row.code)}`, clean(row.id)]));

  await applyAdrOverrides(supabase, entries, partyIds);
  const serviceIds = await ensureServices(supabase, entries, orders, expeditions);
  const assignments = await importServiceAssignments(supabase, entries, partyIds, serviceIds);

  const orderRows = orders.flatMap(item => {
    const code = clean(item.id) || clean(item.codigo) || localCode("PT", item);
    const customerId = partyIds.get(customerCode(item));
    if (!customerId) return [];
    const pickupCode = clean(item.codigoOrigen) || `${code}-PICKUP`;
    const deliveryCode = clean(item.codigoDestino) || `${code}-DELIVERY`;
    return [withoutEmpty({
      tenant_id: TENANT_ID,
      code,
      customer_id: customerId,
      customer_reference: clean(item.referencia),
      service_id: serviceIdFor(item.servicio, serviceIds),
      pickup_address_id: addressIds.get(`${customerId}:${pickupCode}`),
      delivery_address_id: addressIds.get(`${customerId}:${deliveryCode}`),
      requested_pickup_start: dateValue(item.fecha || item.fechaRecogida),
      requested_delivery_start: dateValue(item.fechaEntrega),
      packages: integerValue(item.bultos),
      gross_weight: numericValue(item.peso),
      volume: numericValue(item.volumen),
      linear_meters: numericValue(item.metros),
      goods_description: clean(item.mercancia) || clean(item.descripcion),
      adr: jsonValue({ declared: item.adr, regime: item.adrRegime, unNumber: item.unNumber, class: item.adrClass, packingGroup: item.packingGroup, tunnelCode: item.tunnelCode, description: item.adrDescription }),
      status: orderStatus(item.estado),
      metadata: legacyMetadata(item, runId),
    })];
  });
  const orderResult = await upsertReturning(supabase, "orders", orderRows, "tenant_id,code", "id,code,pickup_address_id,delivery_address_id");
  const orderIds = new Map(orderResult.map(row => [clean(row.code), clean(row.id)]));

  const lineRows = orders.flatMap(item => {
    const orderId = orderIds.get(clean(item.id) || clean(item.codigo));
    if (!orderId) return [];
    return [withoutEmpty({ tenant_id: TENANT_ID, order_id: orderId, line_number: 1, description: clean(item.mercancia) || clean(item.descripcion) || `Pedido ${clean(item.id)}`, packages: integerValue(item.bultos), gross_weight: numericValue(item.peso), volume: numericValue(item.volumen), adr: jsonValue({ declared: item.adr, regime: item.adrRegime }), metadata: legacyMetadata(item, runId) })];
  });
  await upsertReturning(supabase, "order_lines", lineRows, "order_id,line_number", "id");

  const noteCandidates = new Map<string, JsonRecord>();
  for (const item of orders) {
    const orderCode = clean(item.id) || clean(item.codigo);
    if (orderIds.has(orderCode)) noteCandidates.set(`ALB-${orderCode}`, { ...item, code: `ALB-${orderCode}`, orderCode, autoDerived: true });
  }
  for (const item of explicitNotes) {
    const code = clean(item.id) || clean(item.codigo) || localCode("ALB", item);
    const orderCode = clean(item.orderId) || clean(item.pedidoId) || clean(item.partidaId);
    if (orderIds.has(orderCode)) noteCandidates.set(code, { ...item, code, orderCode, autoDerived: false });
  }
  const noteRows = [...noteCandidates.values()].flatMap(item => {
    const orderId = orderIds.get(clean(item.orderCode));
    if (!orderId) return [];
    return [withoutEmpty({ tenant_id: TENANT_ID, code: clean(item.code), order_id: orderId, external_reference: clean(item.referencia) || clean(item.externalReference), pickup_address_id: orderResult.find(row => clean(row.id) === orderId)?.pickup_address_id, delivery_address_id: orderResult.find(row => clean(row.id) === orderId)?.delivery_address_id, packages: integerValue(item.bultos), gross_weight: numericValue(item.peso), volume: numericValue(item.volumen), goods_description: clean(item.mercancia) || clean(item.descripcion), status: noteStatus(item.estado), metadata: legacyMetadata(item, runId) })];
  });
  const noteResult = await upsertReturning(supabase, "delivery_notes", noteRows, "tenant_id,code", "id,code,order_id");
  const noteByOrder = new Map(noteResult.map(row => [clean(row.order_id), clean(row.id)]));

  const expeditionRows = expeditions.map(item => withoutEmpty({
    tenant_id: TENANT_ID,
    code: clean(item.id) || clean(item.codigo) || localCode("EX", item),
    service_id: serviceIdFor(item.servicio, serviceIds),
    planned_departure: dateValue(item.fecha),
    status: expeditionStatus(item.estado),
    metadata: legacyMetadata(item, runId),
  }));
  const expeditionResult = await upsertReturning(supabase, "expeditions", expeditionRows, "tenant_id,code", "id,code");
  const expeditionIds = new Map(expeditionResult.map(row => [clean(row.code), clean(row.id)]));

  const expeditionLinks: JsonRecord[] = [];
  for (const item of expeditions) {
    const expeditionId = expeditionIds.get(clean(item.id) || clean(item.codigo));
    if (!expeditionId) continue;
    for (const orderCode of stringList(item.partidas || item.pedidos)) {
      const orderId = orderIds.get(orderCode);
      const noteId = orderId ? noteByOrder.get(orderId) : undefined;
      if (noteId) expeditionLinks.push({ tenant_id: TENANT_ID, expedition_id: expeditionId, delivery_note_id: noteId });
    }
  }
  await upsertReturning(supabase, "expedition_delivery_notes", expeditionLinks, "expedition_id,delivery_note_id", "id");

  const vehicleIds = await ensureVehicles(supabase, trips, runId);
  const driverIds = await ensureDrivers(supabase, trips);
  const tripRows = trips.map(item => withoutEmpty({
    tenant_id: TENANT_ID,
    code: clean(item.id) || clean(item.codigo) || localCode("VJ", item),
    vehicle_id: vehicleIds.get(clean(item.vehiculo)),
    driver_id: driverIds.get(clean(item.conductor)),
    planned_start: dateValue(item.fecha),
    status: tripStatus(item.estado),
    metadata: legacyMetadata(item, runId),
  }));
  const tripResult = await upsertReturning(supabase, "trips", tripRows, "tenant_id,code", "id,code");
  const tripIds = new Map(tripResult.map(row => [clean(row.code), clean(row.id)]));
  const tripLinks: JsonRecord[] = [];
  for (const item of trips) {
    const tripId = tripIds.get(clean(item.id) || clean(item.codigo));
    if (!tripId) continue;
    stringList(item.expediciones).forEach((code, sequence) => {
      const expeditionId = expeditionIds.get(code);
      if (expeditionId) tripLinks.push({ tenant_id: TENANT_ID, trip_id: tripId, expedition_id: expeditionId, sequence: sequence + 1 });
    });
  }
  await upsertReturning(supabase, "trip_expeditions", tripLinks, "trip_id,expedition_id", "id");

  const cmrs = await importCmrDrafts(supabase, records(byKey.get("fornexa-cmr-documents")), runId);
  const communications = await importEmailHistory(supabase, records(byKey.get("fornexa-email-history")), runId);
  const warehouses = await importWarehouses(supabase, records(byKey.get("fornexa-almacenes")), partyIds, runId);
  const offers = await importOffers(supabase, records(byKey.get("fornexa-ofertas-tarifas")), partyIds, serviceIds, runId);

  const summary = {
    archivedKeys: entries.length,
    parties: partyRows.length,
    addresses: addressRows.length,
    serviceAssignments: assignments,
    orders: orderRows.length,
    orderLines: lineRows.length,
    deliveryNotes: noteRows.length,
    expeditions: expeditionRows.length,
    expeditionLinks: expeditionLinks.length,
    trips: tripRows.length,
    tripLinks: tripLinks.length,
    cmrDocuments: cmrs,
    communications,
    warehouses,
    offers,
  };
  await supabase.from("operational_events").insert({ tenant_id: TENANT_ID, entity_type: "LOCAL_STORAGE", event_type: "local_storage_migrated", source: "FORNEXA_WEB", data: { runId, summary } });
  return summary;
}

function addParty(target: Map<string, PartyCandidate>, item: JsonRecord, kind: "CUSTOMER" | "SUPPLIER" | "LOGISTICS" | "PARTY", fallbackCode = "") {
  const code = clean(item.code) || clean(item.codigo) || clean(item.id) || clean(item.customerId) || clean(item.customerCode) || fallbackCode;
  if (!code) return;
  const name = clean(item.legalName) || clean(item.razonSocial) || clean(item.nombre) || clean(item.tradeName) || clean(item.partyName) || code;
  const type = clean(item.partyType) || clean(item.type) || clean(item.tipo);
  const previous = target.get(code);
  const flags = {
    is_customer: kind === "CUSTOMER" || type.toLowerCase().includes("cliente") || previous?.is_customer === true,
    is_supplier: kind === "SUPPLIER" || type.toLowerCase().includes("proveedor") || previous?.is_supplier === true,
    is_carrier: kind === "LOGISTICS" || type.toLowerCase().includes("transport") || previous?.is_carrier === true,
  };
  target.set(code, withoutEmpty({
    ...previous,
    code,
    legal_name: name,
    trade_name: clean(item.tradeName) || clean(item.nombre) || clean(item.partyName) || previous?.trade_name || name,
    tax_id: clean(item.taxId) || clean(item.cif) || previous?.tax_id,
    country_code: country(item.country || item.countryCode || previous?.country_code),
    language: language(item.language || previous?.language),
    currency: clean(item.currency || previous?.currency) || "EUR",
    ...flags,
    adr_control: yes(item.adrControl) || previous?.adr_control === true,
    status: partyStatus(item.status || item.estado || previous?.status),
    metadata: jsonValue({ legacy: item }),
  }) as PartyCandidate);
}

function addAddress(target: Map<string, AddressCandidate>, item: JsonRecord, partyCode: string) {
  if (!partyCode) return;
  const code = clean(item.code) || clean(item.codigo) || clean(item.id) || `${partyCode}-DIR-${hash(stableStringify(item)).slice(0, 8).toUpperCase()}`;
  const street = clean(item.street) || clean(item.address) || clean(item.direccion);
  const city = clean(item.city) || clean(item.ciudad) || "Sin población";
  if (!street) return;
  const [windowStart, windowEnd] = scheduleTimes(item.schedule || item.horario);
  target.set(`${partyCode}:${code}`, withoutEmpty({
    party_code: partyCode,
    code,
    address_type: addressType(item.type || item.tipo),
    name: clean(item.name) || clean(item.nombre) || code,
    address_line1: street,
    postal_code: clean(item.postalCode) || clean(item.cp),
    city,
    region: clean(item.province) || clean(item.provincia),
    country_code: country(item.country || item.pais),
    latitude: numericValue(item.latitude || item.latitud),
    longitude: numericValue(item.longitude || item.longitud),
    contact_name: clean(item.contact) || clean(item.contactName) || clean(item.contacto),
    contact_phone: clean(item.phone) || clean(item.telefono),
    contact_email: clean(item.email),
    default_window_start: windowStart,
    default_window_end: windowEnd,
    instructions: clean(item.restrictions) || clean(item.instrucciones),
    is_active: item.active !== false && item.activo !== false,
  }) as AddressCandidate);
}

function addOrderAddress(target: Map<string, AddressCandidate>, item: JsonRecord, partyCode: string, operation: "PICKUP" | "DELIVERY") {
  const pickup = operation === "PICKUP";
  const code = clean(pickup ? item.codigoOrigen : item.codigoDestino) || `${clean(item.id) || localCode("PT", item)}-${operation}`;
  const full = clean(pickup ? item.direccionOrigen || item.direccionRecogida || item.origen : item.direccionDestino || item.direccionEntrega || item.destino);
  if (!full) return;
  addAddress(target, {
    code,
    type: pickup ? "Recogida" : "Entrega",
    name: pickup ? item.remitente || code : item.destinatario || code,
    street: full,
    postalCode: pickup ? item.cpOrigen : item.cpDestino,
    city: clean(pickup ? item.origen : item.destino) || "Sin población",
    country: pickup ? item.paisOrigen : item.paisDestino,
    contact: pickup ? item.contactoRecogida || item.contacto : item.contactoEntrega || item.contacto,
    phone: pickup ? item.telefonoRecogida || item.telefono : item.telefonoEntrega || item.telefono,
  }, partyCode);
}

async function applyAdrOverrides(supabase: SupabaseClient, entries: LocalStorageEntry[], partyIds: Map<string, string>) {
  for (const entry of entries) {
    if (!entry.key.startsWith("fornexa-customer-adr-") || entry.key.startsWith("fornexa-customer-adr-name-")) continue;
    const code = entry.key.slice("fornexa-customer-adr-".length);
    const id = partyIds.get(code);
    if (id && (entry.value === "S" || entry.value === "N")) {
      const { error } = await supabase.from("parties").update({ adr_control: entry.value === "S" }).eq("id", id);
      if (error) throw error;
    }
  }
}

async function ensureServices(supabase: SupabaseClient, entries: LocalStorageEntry[], orders: JsonRecord[], expeditions: JsonRecord[]) {
  const { data, error } = await supabase.from("service_catalog").select("id,code,name").eq("tenant_id", TENANT_ID);
  if (error) throw error;
  const ids = new Map<string, string>();
  for (const row of data ?? []) {
    ids.set(normalized(clean(row.code)), clean(row.id));
    ids.set(normalized(clean(row.name)), clean(row.id));
  }
  const missing = new Map<string, JsonRecord>();
  for (const item of [...orders, ...expeditions]) {
    const name = clean(item.servicio);
    if (name && !ids.has(normalized(name))) missing.set(serviceCode(name), { code: serviceCode(name), name, service_type: name.toUpperCase(), metadata: { source: "localStorage" } });
  }
  for (const entry of entries) {
    if (!parseServiceAssignmentKey(entry.key)) continue;
    const assignmentMap = asRecord(entry.value) ?? {};
    for (const [serviceCodeValue] of Object.entries(assignmentMap)) {
      if (!ids.has(normalized(serviceCodeValue))) missing.set(serviceCodeValue, { code: serviceCodeValue, name: serviceCodeValue, service_type: "LEGACY", metadata: { source: "localStorage assignment" } });
    }
  }
  if (missing.size) {
    const rows = [...missing.values()].map(row => ({ tenant_id: TENANT_ID, mode: "ROAD", is_active: true, ...row }));
    const created = await upsertReturning(supabase, "service_catalog", rows, "tenant_id,code", "id,code,name");
    for (const row of created) { ids.set(normalized(clean(row.code)), clean(row.id)); ids.set(normalized(clean(row.name)), clean(row.id)); }
  }
  return ids;
}

async function importServiceAssignments(supabase: SupabaseClient, entries: LocalStorageEntry[], partyIds: Map<string, string>, serviceIds: Map<string, string>) {
  const rows: JsonRecord[] = [];
  for (const entry of entries) {
    const serviceKey = parseServiceAssignmentKey(entry.key);
    if (!serviceKey) continue;
    const partyId = partyIds.get(serviceKey.entityCode) ?? [...partyIds.entries()].find(([code]) => normalized(code) === normalized(serviceKey.entityCode))?.[1];
    if (!partyId) continue;
    for (const [serviceCodeValue, raw] of Object.entries(asRecord(entry.value) ?? {})) {
      const assignment = asRecord(raw) ?? {};
      const serviceId = serviceIds.get(normalized(serviceCodeValue));
      if (!serviceId) continue;
      rows.push({ tenant_id: TENANT_ID, party_id: partyId, service_id: serviceId, relationship_type: serviceKey.entityType === "cliente" ? "CONTRACTED" : "OFFERED", reference: clean(assignment.reference), conditions: jsonValue({ status: assignment.status, notes: assignment.notes }), is_active: clean(assignment.status).toLowerCase() !== "inactivo" });
    }
  }
  await upsertReturning(supabase, "party_services", rows, "party_id,service_id,relationship_type", "id");
  return rows.length;
}

async function ensureVehicles(supabase: SupabaseClient, trips: JsonRecord[], runId: string) {
  const registrations = [...new Set(trips.map(item => clean(item.vehiculo)).filter(Boolean))];
  const rows = registrations.map(registration => ({ tenant_id: TENANT_ID, registration, status: "AVAILABLE", metadata: { source: "localStorage", runId } }));
  const result = await upsertReturning(supabase, "vehicles", rows, "tenant_id,registration", "id,registration");
  return new Map(result.map(row => [clean(row.registration), clean(row.id)]));
}

async function ensureDrivers(supabase: SupabaseClient, trips: JsonRecord[]) {
  const names = [...new Set(trips.map(item => clean(item.conductor)).filter(Boolean))];
  const rows = names.map(name => ({ tenant_id: TENANT_ID, code: `DRV-${hash(name).slice(0, 10).toUpperCase()}`, name, status: "ACTIVE" }));
  const result = await upsertReturning(supabase, "drivers", rows, "tenant_id,code", "id,name");
  return new Map(result.map(row => [clean(row.name), clean(row.id)]));
}

async function importCmrDrafts(supabase: SupabaseClient, items: JsonRecord[], runId: string) {
  if (!items.length) return 0;
  const numbers = items.map(item => clean(item.cmrNumber) || clean(item.id)).filter(Boolean);
  const { data, error } = numbers.length ? await supabase.from("cmr_documents").select("cmr_number").in("cmr_number", numbers) : { data: [], error: null };
  if (error) throw error;
  const existing = new Set((data ?? []).map(row => clean(row.cmr_number)));
  const rows = items.flatMap(item => {
    const cmrNumber = clean(item.cmrNumber) || clean(item.id);
    if (!cmrNumber || existing.has(cmrNumber)) return [];
    return [withoutEmpty({
      tenant_id: TENANT_ID,
      cmr_number: cmrNumber,
      access_key: clean(item.cmrKey) || `LOCAL-${hash(cmrNumber).slice(0, 20).toUpperCase()}`,
      status: cmrStatus(item.status),
      source: clean(item.source) || "localStorage",
      expedition_id: clean(item.expedicion),
      trip_id: clean(item.viaje),
      customer_ids: stringList(item.customerIds),
      sender: clean(item.expedidor) || "Pendiente",
      recipient: clean(item.destinatario) || "Pendiente",
      pickup_location: clean(item.carga) || "Pendiente",
      delivery_location: clean(item.entrega) || "Pendiente",
      carrier: clean(item.transportista) || "Pendiente",
      vehicle_registration: clean(item.matricula),
      trailer_registration: clean(item.remolque),
      goods_description: clean(item.mercancia) || "Pendiente",
      packages: integerValue(item.bultos),
      packaging: clean(item.embalaje),
      gross_weight: numericValue(item.peso),
      volume: numericValue(item.volumen),
      instructions: clean(item.instrucciones),
      adr: jsonValue({ declared: item.adr, regime: item.adrRegime }),
      metadata: jsonValue({ legacy: item, localStorageRunId: runId }),
      issued_at: dateValue(item.createdAt) || new Date().toISOString(),
    })];
  });
  if (rows.length) {
    const { error: insertError } = await supabase.from("cmr_documents").insert(rows);
    if (insertError) throw insertError;
  }
  return rows.length;
}

async function importEmailHistory(supabase: SupabaseClient, items: JsonRecord[], runId: string) {
  const rows = items.map(item => ({
    id: validUuid(item.id) ? clean(item.id) : deterministicUuid(`email:${stableStringify(item)}`),
    tenant_id: TENANT_ID,
    channel: "EMAIL",
    direction: "OUTBOUND",
    recipient: clean(item.to),
    subject: clean(item.subject),
    related_entity_type: clean(item.related),
    provider: "RESEND",
    status: clean(item.status).toLowerCase() === "enviado" ? "SENT" : "ERROR",
    payload: jsonValue({ legacy: item, localStorageRunId: runId }),
    error_message: clean(item.detail),
    sent_at: dateValue(item.sentAt),
  }));
  await upsertReturning(supabase, "communications", rows, "id", "id");
  return rows.length;
}

async function importWarehouses(supabase: SupabaseClient, items: JsonRecord[], partyIds: Map<string, string>, runId: string) {
  const rows = items.map(item => ({ tenant_id: TENANT_ID, code: clean(item.id) || clean(item.codigo) || localCode("ALM", item), name: clean(item.nombre) || clean(item.name) || "Almacén", owner_party_id: partyIds.get(clean(item.clienteId)), status: clean(item.estado).toLowerCase() === "inactivo" ? "INACTIVE" : "ACTIVE", capabilities: jsonValue({ legacy: item, localStorageRunId: runId }) }));
  await upsertReturning(supabase, "warehouses", rows, "tenant_id,code", "id");
  return rows.length;
}

async function importOffers(supabase: SupabaseClient, items: JsonRecord[], partyIds: Map<string, string>, serviceIds: Map<string, string>, runId: string) {
  const rows = items.flatMap(item => {
    const customerId = partyIds.get(clean(item.clienteId) || clean(item.customerId));
    if (!customerId) return [];
    return [{ tenant_id: TENANT_ID, code: clean(item.id) || clean(item.codigo) || clean(item.referencia) || localCode("OF", item), customer_id: customerId, service_id: serviceIdFor(item.servicio, serviceIds), status: offerStatus(item.estado), currency: clean(item.moneda) || "EUR", total: numericValue(item.total) || 0, conditions: clean(item.notas), metadata: legacyMetadata(item, runId) }];
  });
  await upsertReturning(supabase, "offers", rows, "tenant_id,code", "id");
  return rows.length;
}

async function upsertReturning(supabase: SupabaseClient, table: string, rows: JsonRecord[], onConflict: string, columns: string) {
  if (!rows.length) return [] as JsonRecord[];
  const result: JsonRecord[] = [];
  for (let index = 0; index < rows.length; index += 100) {
    const { data, error } = await supabase.from(table).upsert(rows.slice(index, index + 100), { onConflict }).select(columns);
    if (error) throw error;
    result.push(...((data ?? []) as unknown as JsonRecord[]));
  }
  return result;
}

function validEntries(value: unknown): LocalStorageEntry[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap(candidate => {
    const record = asRecord(candidate);
    const key = clean(record?.key);
    if (!record || !key.startsWith(FORNEXA_LOCAL_STORAGE_PREFIX) || key === "fornexa-local-storage-sync") return [];
    return [{ key, value: jsonValue(record.value) }];
  });
}

function records(...values: unknown[]): JsonRecord[] { return values.flatMap(value => Array.isArray(value) ? value.map(asRecord).filter((item): item is JsonRecord => Boolean(item)) : []); }
function asRecord(value: unknown): JsonRecord | null { return value !== null && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : null; }
function clean(value: unknown) { return String(value ?? "").trim(); }
function jsonValue(value: unknown): JsonRecord | unknown[] | string | number | boolean | null { return value == null || ["string", "number", "boolean"].includes(typeof value) ? value as string | number | boolean | null : JSON.parse(JSON.stringify(value)); }
function withoutEmpty<T extends JsonRecord>(record: T): T { return Object.fromEntries(Object.entries(record).filter(([, value]) => value !== "" && value !== undefined && value !== null)) as T; }
function hash(value: string) { return createHash("sha256").update(value).digest("hex"); }
function itemCount(value: unknown) { return Array.isArray(value) ? value.length : value && typeof value === "object" ? Object.keys(value).length : 1; }
function customerCode(item: JsonRecord) { return clean(item.customerId) || clean(item.codigoCliente) || clean(item.clienteId) || clean(item.customerCode) || (clean(item.cliente) ? `LOCAL-${hash(clean(item.cliente)).slice(0, 12).toUpperCase()}` : "FORNEXA-UNASSIGNED"); }
function localCode(prefix: string, value: unknown) { return `${prefix}-LOCAL-${hash(stableStringify(value)).slice(0, 12).toUpperCase()}`; }
function normalized(value: string) { return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, ""); }
function serviceCode(value: string) { return `LOCAL-${value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/[^A-Z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 50)}`; }
function serviceIdFor(value: unknown, ids: Map<string, string>) { return ids.get(normalized(clean(value))) ?? ids.get(normalized(serviceCode(clean(value)))); }
function parseServiceAssignmentKey(key: string) {
  const match = key.match(/^fornexa-(?:v1-)?(cliente|proveedor)-servicios-(.+)$/);
  return match ? { entityType: match[1] as "cliente" | "proveedor", entityCode: match[2].toUpperCase() } : null;
}
function titleFromSlug(value: string) { return value.toLowerCase().split(/[-_]+/).filter(Boolean).map(part => `${part[0]?.toUpperCase() ?? ""}${part.slice(1)}`).join(" ") || value; }
function country(value: unknown) { const result = clean(value).toUpperCase().slice(0, 2); return /^[A-Z]{2}$/.test(result) ? result : "ES"; }
function language(value: unknown) { const result = clean(value).toLowerCase(); return result.startsWith("fr") ? "fr" : result.startsWith("en") || result.startsWith("in") ? "en" : "es"; }
function yes(value: unknown) { return value === true || ["s", "si", "sí", "true", "1"].includes(clean(value).toLowerCase()); }
function integerValue(value: unknown) { const number = numericValue(value); return number == null ? null : Math.max(0, Math.trunc(number)); }
function stringList(value: unknown) { return Array.isArray(value) ? value.map(clean).filter(Boolean) : clean(value).split(/[,;|]/).map(item => item.trim()).filter(Boolean); }
function dateValue(value: unknown) { const raw = clean(value); if (!raw) return null; const date = new Date(raw.length === 10 ? `${raw}T12:00:00Z` : raw); return Number.isNaN(date.getTime()) ? null : date.toISOString(); }
function validUuid(value: unknown) { return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(clean(value)); }
function deterministicUuid(value: string) { const bytes = hash(value).slice(0, 32).split(""); bytes[12] = "5"; bytes[16] = ["8", "9", "a", "b"][parseInt(bytes[16], 16) % 4]; const hex = bytes.join(""); return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`; }
function legacyMetadata(item: JsonRecord, runId: string) { return jsonValue({ legacy: item, localStorageRunId: runId }); }
function scheduleTimes(value: unknown): [string | null, string | null] { const matches = clean(value).match(/([01]\d|2[0-3]):[0-5]\d/g) ?? []; return [matches[0] ?? null, matches[1] ?? null]; }

function addressType(value: unknown) { const status = normalized(clean(value)); if (status.includes("fiscal")) return "FISCAL"; if (status.includes("recogida")) return "PICKUP"; if (status.includes("entrega")) return "DELIVERY"; if (status.includes("almacen")) return "WAREHOUSE"; return "OPERATING"; }
function partyStatus(value: unknown) { const status = normalized(clean(value)); return status.includes("bloque") ? "BLOCKED" : status.includes("inactiv") ? "INACTIVE" : "ACTIVE"; }
function orderStatus(value: unknown) { const status = normalized(clean(value)); if (status.includes("cancel")) return "CANCELLED"; if (status.includes("complet") || status.includes("entreg")) return "COMPLETED"; if (status.includes("transit")) return "IN_TRANSIT"; if (status.includes("asign") || status.includes("plan")) return "PLANNED"; return status.includes("prepar") || status.includes("list") ? "READY" : "DRAFT"; }
function noteStatus(value: unknown) { const status = normalized(clean(value)); if (status.includes("cancel")) return "CANCELLED"; if (status.includes("entreg")) return "DELIVERED"; if (status.includes("recog")) return "PICKED_UP"; if (status.includes("plan") || status.includes("asign")) return "PLANNED"; return status.includes("prepar") || status.includes("list") ? "READY" : "DRAFT"; }
function expeditionStatus(value: unknown) { const status = normalized(clean(value)); if (status.includes("cancel")) return "CANCELLED"; if (status.includes("cerr")) return "CLOSED"; if (status.includes("entreg")) return "DELIVERED"; if (status.includes("transit")) return "IN_TRANSIT"; if (status.includes("asign")) return "ASSIGNED"; return status.includes("borr") ? "DRAFT" : "PLANNED"; }
function tripStatus(value: unknown) { const status = normalized(clean(value)); if (status.includes("cancel")) return "CANCELLED"; if (status.includes("complet") || status.includes("final")) return "COMPLETED"; if (status.includes("progreso") || status.includes("transit")) return "IN_PROGRESS"; if (status.includes("list")) return "READY"; return status.includes("borr") ? "DRAFT" : "PLANNED"; }
function cmrStatus(value: unknown) { const status = clean(value); return ["Borrador", "Emitido", "En tránsito", "Entregado", "Cerrado", "Anulado"].includes(status) ? status : "Borrador"; }
function offerStatus(value: unknown) { const status = normalized(clean(value)); if (status.includes("acept")) return "ACCEPTED"; if (status.includes("rechaz")) return "REJECTED"; if (status.includes("envi")) return "SENT"; if (status.includes("expir")) return "EXPIRED"; if (status.includes("cancel")) return "CANCELLED"; return "DRAFT"; }
function errorMessage(error: unknown) { return error instanceof Error ? error.message.slice(0, 1000) : String(error).slice(0, 1000); }
function failure(error: unknown) { console.error("Local storage migration error", error); return NextResponse.json({ error: "No se pudieron migrar los datos locales a Supabase." }, { status: 500 }); }
function isSameOrigin(request: NextRequest) { const origin = request.headers.get("origin"); if (!origin) return false; try { return new URL(origin).host === request.nextUrl.host; } catch { return false; } }
