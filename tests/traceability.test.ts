import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { hasValidGtinCheckDigit, isGtinLike, normalizeTraceQuery, sortTraceEvents, summarizePeople, stopEvent, type TraceEvent } from "../lib/traceability.ts";
import { loadTraceability } from "../lib/traceability-loader.ts";
import { previewDemoTraceability } from "../lib/preview-demo-traceability.ts";

const TENANT = "11111111-1111-4111-8111-111111111111";

type Call = { table: string; ops: [string, ...unknown[]][] };

/** Minimal PostgREST double: records every chain and answers from fixtures keyed by table. */
function fakeClient(fixtures: Record<string, (call: Call) => Record<string, unknown>[]>) {
  const calls: Call[] = [];
  const client = {
    from(table: string) {
      const call: Call = { table, ops: [] };
      calls.push(call);
      const builder: Record<string, unknown> = {};
      for (const op of ["select", "eq", "ilike", "or", "in", "limit", "order", "gt"]) {
        builder[op] = (...args: unknown[]) => { call.ops.push([op, ...args]); return builder; };
      }
      builder.then = (resolve: (value: unknown) => unknown) => resolve({ data: (fixtures[table] ?? (() => []))(call), error: null });
      return builder;
    },
  };
  return { client: client as never, calls };
}

const has = (call: Call, op: string, ...args: unknown[]) => call.ops.some(([name, ...rest]) => name === op && args.every((arg, index) => rest[index] === arg));

test("queries are cleaned of PostgREST filter syntax and bounded", () => {
  assert.equal(normalizeTraceQuery("  SKU,1(2)*%:'\"  "), "SKU 1 2");
  assert.equal(normalizeTraceQuery("x".repeat(500)).length, 120);
  assert.equal(normalizeTraceQuery(undefined), "");
});

test("GTIN detection and GS1 check digit", () => {
  assert.ok(isGtinLike("8400000000017"));
  assert.ok(!isGtinLike("ABC123"));
  assert.ok(hasValidGtinCheckDigit("8400000000017"));
  assert.ok(!hasValidGtinCheckDigit("8400000000018"));
  assert.ok(hasValidGtinCheckDigit("96385074"));
});

test("timeline is newest first with undated events last, and people are grouped by actor", () => {
  const events: TraceEvent[] = [
    { id: "a", at: "2026-10-01T00:00:00Z", domain: "Partida", label: "Incluido en partida", actor: "Ana" },
    { id: "b", at: null, domain: "Registro", label: "Alta del artículo", actor: "Ana" },
    { id: "c", at: "2026-10-03T00:00:00Z", domain: "Carga", label: "Cargado en vehículo", actor: "Luis" },
  ];
  assert.deepEqual(sortTraceEvents(events).map(event => event.id), ["c", "a", "b"]);
  const people = summarizePeople(sortTraceEvents(events));
  assert.equal(people[0].name, "Luis");
  assert.deepEqual(people.find(person => person.name === "Ana")?.actions, ["Incluido en partida", "Alta del artículo"]);
  assert.equal(stopEvent("PICKUP").domain, "Carga");
  assert.equal(stopEvent("DELIVERY").domain, "Descarga");
});

test("an exact GTIN follows partida, expediente, viaje, carga/descarga and audit, always inside the tenant", async () => {
  const product = { id: "p1", sku: "SKU-1", name: "Caja", gtin: "8400000000017", status: "ACTIVE", uom_base: "UN", hazard_status: "UNKNOWN", owner_party_id: "c1" };
  const { client, calls } = fakeClient({
    products: () => [product],
    parties: () => [{ id: "c1", trade_name: "Cliente" }],
    order_lines: () => [{ id: "l1", order_id: "o1", packages: 2, created_at: "2026-10-01T08:00:00Z" }],
    orders: () => [{ id: "o1", code: "PT-1", status: "LAUNCHED", customer_id: "c1", created_at: "2026-10-01T08:00:00Z" }],
    expeditions: call => (has(call, "in", "order_id") ? [{ id: "e1" }] : [{ id: "e1", code: "EX-1", status: "PLANNED", created_at: "2026-10-01T09:00:00Z" }]),
    trip_expeditions: () => [{ trip_id: "t1", expedition_id: "e1" }],
    trips: () => [{ id: "t1", code: "VJ-1", status: "COMPLETED", vehicle_id: "v1", driver_id: "d1", actual_start: "2026-10-02T06:00:00Z" }],
    vehicles: () => [{ id: "v1", registration: "1234ABC" }],
    drivers: () => [{ id: "d1", name: "Conductor" }],
    trip_stops: () => [
      { id: "s1", trip_id: "t1", sequence: 1, stop_type: "PICKUP", company_name: "Origen", completed_at: "2026-10-02T07:00:00Z" },
      { id: "s2", trip_id: "t1", sequence: 2, stop_type: "DELIVERY", company_name: "Destino", completed_at: "2026-10-02T15:00:00Z" },
    ],
    audit_events: () => [{ id: 1, entity_type: "PRODUCT", entity_id: "p1", action: "CREATE", actor_user_id: "u1", occurred_at: "2026-09-30T10:00:00Z" }],
  });
  const result = await loadTraceability(client, TENANT, "8400000000017", undefined, { resolveUser: id => (id === "u1" ? "Marta" : undefined) });
  assert.equal(result.status, "found");
  assert.equal(result.matchedBy, "EAN / GTIN");
  assert.equal(result.trips[0].vehicle, "1234ABC");
  assert.equal(result.trips[0].loadPlace, "Origen");
  assert.equal(result.trips[0].unloadPlace, "Destino");
  assert.deepEqual(result.events.map(event => event.domain).slice(0, 3), ["Descarga", "Carga", "Viaje"]);
  assert.ok(result.people.some(person => person.name === "Marta"));
  assert.ok(result.people.some(person => person.name === "Conductor"));
  // cmr_expeditions has no tenant column; it is only queried with expedition ids already scoped to the tenant.
  for (const call of calls.filter(item => item.table !== "cmr_expeditions")) {
    assert.ok(has(call, "eq", "tenant_id", TENANT), `${call.table} must be filtered by tenant`);
  }
});

test("several partial matches ask the user to choose; nothing found says so", async () => {
  const many = fakeClient({ products: call => (has(call, "or") ? [{ id: "p1", sku: "A" }, { id: "p2", sku: "B" }] : []) });
  const choose = await loadTraceability(many.client, TENANT, "caja");
  assert.equal(choose.status, "choose");
  assert.equal(choose.matches.length, 2);
  const none = await loadTraceability(fakeClient({}).client, TENANT, "nada");
  assert.equal(none.status, "none");
});

test("customs cases are only related by exact reference or MRN, never guessed", () => {
  const loader = readFileSync(new URL("../lib/traceability-loader.ts", import.meta.url), "utf8");
  assert.match(loader, /from\("customs_cases"\)[^;]*\.in\("reference", codes\)/);
  assert.match(loader, /from\("customs_cases"\)[^;]*\.in\("mrn", codes\)/);
  assert.doesNotMatch(loader, /customs_cases"\)[^;]*ilike/);
  assert.doesNotMatch(loader, /\.(insert|update|upsert|delete)\(/, "traceability is read-only");
});

test("the demo resolves only synthetic codes and never reads the backend", () => {
  assert.equal(previewDemoTraceability("DEMO-CAJA-001").status, "found");
  assert.equal(previewDemoTraceability("8400000000017").matchedBy, "EAN / GTIN");
  assert.equal(previewDemoTraceability("demo").status, "choose");
  assert.equal(previewDemoTraceability("demo", "DEMO-PRODUCT-01").status, "found");
  assert.equal(previewDemoTraceability("REAL-123").status, "none");
  const fixture = readFileSync(new URL("../lib/preview-demo-traceability.ts", import.meta.url), "utf8");
  assert.doesNotMatch(fixture, /fetch\(|supabase|process\.env|localStorage/);
});

test("Trazabilidad has its own screen with the shared chrome and leaves the generic module grid", () => {
  const view = readFileSync(new URL("../app/dashboard/trazabilidad/TraceabilityView.tsx", import.meta.url), "utf8");
  assert.match(view, /<ScreenHeader eyebrow="TRAZABILIDAD"/);
  assert.match(view, /<MetricGrid /);
  assert.match(view, /method="get" role="search"/);
  const page = readFileSync(new URL("../app/dashboard/trazabilidad/page.tsx", import.meta.url), "utf8");
  assert.match(page, /getAuthenticatedOrReviewContext\(\)/);
  assert.match(page, /loadTraceability\(supabase, auth\.tenantId/);
  assert.doesNotMatch(readFileSync(new URL("../app/dashboard/[module]/ModuleView.tsx", import.meta.url), "utf8"), /trazabilidad:\{/);
});
