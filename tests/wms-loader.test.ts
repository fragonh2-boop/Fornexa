import assert from "node:assert/strict";
import test, { beforeEach, mock } from "node:test";

type DbError = { code?: string; message: string };
type Result = { data: Record<string, unknown>[] | null; error: DbError | null };
type Query = { table: string; columns: string; filters: [string, unknown][] };
let results = new Map<string, Result[]>();
let queries: Query[] = [];

mock.module(new URL("../lib/supabase-admin.ts", import.meta.url).href, {
  namedExports: { createSupabaseAdmin: () => ({
    from(table: string) {
      const query: Query = { table, columns: "", filters: [] };
      queries.push(query);
      const builder = {
        select(columns: string) { query.columns = columns; return builder; },
        eq(column: string, value: unknown) { query.filters.push([column, value]); return builder; },
        order() { return builder; },
        limit() { return builder; },
        in() { return builder; },
        is() { return builder; },
        then(resolve: (value: Result) => unknown) {
          return Promise.resolve(results.get(table)?.shift() ?? { data: [], error: null }).then(resolve);
        },
      };
      return builder;
    },
  }) },
});
const { loadWmsData } = await import("../lib/wms-loader.ts");
const tenant = "10000000-0000-4000-8000-000000000001";
const e1Tables = ["warehouse_behavior_policies", "warehouse_resources", "handling_units", "handling_unit_contents", "stock_reservations", "warehouse_tasks"];
beforeEach(() => { results = new Map(); queries = []; });
function fail(table: string, error: DbError) { results.set(table, [{ data: null, error }]); }

test("WMS loader propagates RLS, authentication and network errors without empty-stock fallback", async () => {
  for (const table of ["inventory_quants", ...e1Tables]) {
    for (const code of ["42501", "PGRST301", "ETIMEDOUT"]) {
      queries = [];
      const error = { code, message: `cannot read ${table}, state_controlled_at unavailable` };
      fail(table, error);
      await assert.rejects(loadWmsData(tenant), (err: Error) => err.cause === error);
      assert.equal(queries.filter((q) => q.table === table).length, 1, `${table}/${code}: no retry`);
    }
  }
});

test("WMS loader only retries the expected missing inventory/C3 columns", async () => {
  for (const code of ["42703", "PGRST204"]) {
    queries = [];
    fail("inventory_quants", { code, message: "column inventory_quants.flow_state does not exist" });
    const legacy = await loadWmsData(tenant);
    assert.equal(legacy.schemaReady, false);
    assert.equal(queries.filter((q) => q.table === "inventory_quants").length, 2);
    queries = [];
    fail("handling_units", { code, message: "Could not find the 'measured_by' column of 'handling_units'" });
    assert.equal((await loadWmsData(tenant)).schemaReady, true);
    const huQueries = queries.filter((q) => q.table === "handling_units");
    assert.equal(huQueries.length, 2);
    assert.ok(!huQueries[1].columns.includes("measured_by"));
  }
  for (const table of ["inventory_quants", "handling_units"]) {
    const error = { code: "42703", message: "column unexpected_column does not exist" };
    fail(table, error);
    await assert.rejects(loadWmsData(tenant), (err: Error) => err.cause === error);
  }
});

test("WMS loader identifies missing E1 tables but never swallows a simultaneous permission failure", async () => {
  for (const code of ["42P01", "PGRST205"]) {
    fail("warehouse_tasks", { code, message: "relation public.warehouse_tasks does not exist" });
    assert.equal((await loadWmsData(tenant)).schemaReady, false);
  }
  fail("warehouse_tasks", { code: "42P01", message: "relation public.warehouse_tasks does not exist" });
  const denied = { code: "42501", message: "permission denied for warehouse_resources" };
  fail("warehouse_resources", denied);
  await assert.rejects(loadWmsData(tenant), (err: Error) => err.cause === denied);
});

test("WMS loader keeps tenant filters and loaded stock across all queries", async () => {
  results.set("inventory_quants", [{ data: [{ id: "quant", warehouse_id: "warehouse", quantity_on_hand: "5", quantity_reserved: "2" }], error: null }]);
  const data = await loadWmsData(tenant, "warehouse");
  assert.equal(data.schemaReady, true);
  assert.equal(data.quants[0].quantity_on_hand, 5);
  assert.equal(data.quants[0].quantity_reserved, 2);
  assert.equal(queries.length, 16);
  for (const query of queries) assert.ok(query.filters.some(([key, value]) => key === "tenant_id" && value === tenant), query.table);
});
