import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  new URL("../supabase/migrations/20260903003000_t1_append_only_events.sql", import.meta.url),
  "utf8",
);

for (const table of ["transport_events", "operational_events"]) {
  test(`${table} keeps authenticated access read-only`, () => {
    assert.match(migration, new RegExp(`create policy ${table}_tenant_select[\\s\\S]*for select[\\s\\S]*to authenticated`, "i"));
    assert.doesNotMatch(migration, new RegExp(`create policy ${table}[^;]*(?:for update|for delete|for insert|for all)`, "i"));
  });

  test(`${table} grants service_role append-only access`, () => {
    assert.match(migration, new RegExp(`revoke all privileges on table public\\.${table} from anon, authenticated, service_role`, "i"));
    assert.match(migration, new RegExp(`grant select, insert on table public\\.${table} to service_role`, "i"));
    assert.doesNotMatch(migration, new RegExp(`grant[^;]*(?:update|delete|truncate)[^;]*${table}`, "i"));
  });

  test(`${table} has a mutation guard`, () => {
    assert.match(migration, new RegExp(`before update or delete on public\\.${table}`, "i"));
  });
}

test("browser roles cannot append event history directly", () => {
  assert.doesNotMatch(migration, /grant[^;]*insert[^;]*to\s+(?:anon|authenticated)/i);
});

test("truncate remains privilege-protected instead of relying on a row trigger", () => {
  assert.match(migration, /revoke all privileges on table public\.transport_events from anon, authenticated, service_role/i);
  assert.match(migration, /revoke all privileges on table public\.operational_events from anon, authenticated, service_role/i);
  assert.doesNotMatch(migration, /before\s+truncate/i);
});
