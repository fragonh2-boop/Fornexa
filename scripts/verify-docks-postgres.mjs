// Local-only integration test. Driver path is external; no production credentials or URLs accepted.
// node scripts/verify-docks-postgres.mjs /absolute/path/to/pg/lib/index.js
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
const { default: pg } = await import(pathToFileURL(process.argv[2]).href);
const config = {
  host: "127.0.0.1",
  port: 55439,
  user: "postgres",
  password: "local-test-only",
  database: "postgres",
};
const db = new pg.Client(config);
await db.connect();
const tenant = "10000000-0000-4000-8000-000000000001",
  other = "10000000-0000-4000-8000-000000000002",
  actor = "20000000-0000-4000-8000-000000000001",
  warehouse = "30000000-0000-4000-8000-000000000001",
  dock = "40000000-0000-4000-8000-000000000001",
  rule = "50000000-0000-4000-8000-000000000001";
try {
  await db.query(`drop schema public cascade; create schema public; create schema if not exists auth;
 do $$ begin create role anon; exception when duplicate_object then null; end $$;
 do $$ begin create role authenticated; exception when duplicate_object then null; end $$;
 do $$ begin create role service_role bypassrls; exception when duplicate_object then null; end $$;
 create table if not exists auth.users(id uuid primary key);
 create table tenants(id uuid primary key);
 create table tenant_members(tenant_id uuid,user_id uuid,role text,status text);
 create function fornexa_has_tenant_access(t uuid) returns boolean language sql stable as $$ select t = nullif(current_setting('test.tenant',true),'')::uuid $$;
 create table parties(id uuid primary key,tenant_id uuid);
 create table party_addresses(id uuid primary key,tenant_id uuid);
 create table warehouses(id uuid primary key,tenant_id uuid,address_id uuid,status text);
 create table warehouse_zones(id uuid primary key,tenant_id uuid,warehouse_id uuid);
 create table trip_stops(id uuid primary key,tenant_id uuid,status text,arrived_at timestamptz,completed_at timestamptz,updated_at timestamptz);
 create table orders(id uuid primary key,tenant_id uuid);
 create table expeditions(id uuid primary key,tenant_id uuid);
 create table address_operational_profiles(address_id uuid primary key,tenant_id uuid,opening_hours jsonb,holiday_exceptions jsonb,requires_appointment boolean,has_dock boolean,updated_at timestamptz default now());
 create table transport_events(id uuid primary key default gen_random_uuid(),tenant_id uuid,cmr_id uuid not null,dock_dummy uuid,event_type text,actor_user_id uuid,occurred_at timestamptz,payload jsonb,idempotency_key text unique);
 create table audit_events(id bigint generated always as identity,tenant_id uuid,entity_type text,entity_id uuid,action text,actor_user_id uuid,source_channel text,before_data jsonb,after_data jsonb,reason text,occurred_at timestamptz default now());
 grant usage on schema public to anon,authenticated,service_role;
 grant all on all tables in schema public to service_role;
 grant all on all sequences in schema public to service_role;
 insert into tenants values('${tenant}'),('${other}'); insert into auth.users values('${actor}') on conflict do nothing;
 insert into tenant_members values('${tenant}','${actor}','ADMIN','ACTIVE');
 insert into warehouses values('${warehouse}','${tenant}',null,'ACTIVE');`);
  const migration = await readFile(
    new URL(
      "../supabase/migrations/20261014090324_muelles_v1_core.sql",
      import.meta.url,
    ),
    "utf8",
  );
  await db.query(migration);
  await db.query(`grant all on all sequences in schema public to service_role;
 insert into warehouse_docks(id,tenant_id,warehouse_id,code,name) values('${dock}','${tenant}','${warehouse}','M1','Test dock');
 insert into dock_appointment_rules(id,tenant_id,warehouse_id,code,direction,cargo_profile) values('${rule}','${tenant}','${warehouse}','R1','BOTH','DRY_PALLETIZED');`);
  const values = (start, end) => ({
    warehouse_id: warehouse,
    dock_id: dock,
    rule_id: rule,
    direction: "INBOUND",
    planned_start: start,
    planned_end: end,
    status: "CONFIRMED",
    booking_kind: "FIRM",
    priority: "NORMAL",
    metadata: {},
  });
  // Calling a composite-returning volatile function with .* repeats execution; use a FROM call.
  const reserveOnce = async (client, v) =>
    (
      await client.query(
        "select * from fornexa_write_dock_appointment($1,$2,null,null,$3,null)",
        [tenant, actor, v],
      )
    ).rows[0];
  const first = await reserveOnce(
    db,
    values("2026-10-14T08:00Z", "2026-10-14T09:00Z"),
  );
  await assert.rejects(
    () => reserveOnce(db, values("2026-10-14T09:00Z", "2026-10-14T10:00Z")),
    (e) => e.code === "23P01" || e.message === "DOCK_CAPACITY",
  );
  const second = await reserveOnce(
    db,
    values("2026-10-14T09:10Z", "2026-10-14T10:10Z"),
  );
  assert.ok(second.id);
  await assert.rejects(
    () =>
      db.query(
        `insert into dock_appointments(tenant_id,warehouse_id,dock_id,rule_id,direction,planned_start,planned_end,status) values('${tenant}','${warehouse}','${dock}','${rule}','INBOUND','2026-10-14T08:30Z','2026-10-14T09:30Z','CONFIRMED')`,
      ),
    (e) => e.code === "23P01",
  );
  // Two concurrent callers fight for exactly the same free window.
  const clients = [new pg.Client(config), new pg.Client(config)];
  await Promise.all(clients.map((c) => c.connect()));
  const race = await Promise.allSettled(
    clients.map((c) =>
      reserveOnce(c, values("2026-10-14T11:00Z", "2026-10-14T12:00Z")),
    ),
  );
  assert.equal(race.filter((r) => r.status === "fulfilled").length, 1);
  await Promise.all(clients.map((c) => c.end()));
  const before = (await db.query("select count(*)::int n from audit_events"))
    .rows[0].n;
  await assert.rejects(
    () =>
      db.query(
        "select * from fornexa_write_dock_appointment($1,$2,$3,$4,$5,null)",
        [
          tenant,
          actor,
          first.id,
          "2020-01-01",
          values("2026-10-14T13:00Z", "2026-10-14T14:00Z"),
        ],
      ),
    /DOCK_STALE/,
  );
  assert.equal(
    (await db.query("select count(*)::int n from audit_events")).rows[0].n,
    before,
  );
  let current = first;
  for (const action of [
    "DOCK_GATE_IN",
    "DOCK_CHECK_IN",
    "DOCK_OPERATION_START",
    "DOCK_OPERATION_END",
    "DOCK_CHECK_OUT",
  ]) {
    current = (
      await db.query("select * from fornexa_dock_action($1,$2,$3,$4,$5,null)", [
        tenant,
        actor,
        current.id,
        current.updated_at,
        action,
      ])
    ).rows[0];
  }
  assert.equal(current.status, "COMPLETED");
  assert.equal(
    (
      await db.query(
        "select count(*)::int n from transport_events where dock_appointment_id=$1 and actor_user_id=$2",
        [first.id, actor],
      )
    ).rows[0].n,
    5,
  );
  await db.query("set role authenticated");
  await db.query(`select set_config('test.tenant','${other}',false)`);
  assert.equal(
    (await db.query("select count(*)::int n from dock_appointments")).rows[0].n,
    0,
  );
  await assert.rejects(
    () =>
      db.query(
        `insert into warehouse_docks(tenant_id,warehouse_id,code,name) values('${other}','${warehouse}','cross','cross')`,
      ),
    (e) => e.code === "42501",
  );
  await assert.rejects(
    () =>
      db.query("select * from fornexa_dock_action($1,$2,$3,$4,$5,null)", [
        tenant,
        actor,
        current.id,
        current.updated_at,
        "DOCK_CHECK_OUT",
      ]),
    (e) => e.code === "42501",
  );
  await db.query("reset role");
  await assert.rejects(
    () =>
      db.query(
        `insert into warehouse_docks(tenant_id,warehouse_id,code,name) values('${other}','${warehouse}','cross','cross')`,
      ),
    (e) => e.code === "23503",
  );
  await assert.rejects(
    () =>
      db.query(
        `insert into transport_events(tenant_id,event_type,occurred_at,payload) values('${tenant}','DOCK_CHECK_IN',now(),'{}')`,
      ),
    (e) => e.code === "23514",
  );
  const configResult = (
    await db.query("select fornexa_dock_config($1,$2,$3,null,$4) item", [
      tenant,
      actor,
      "policy",
      { warehouse_id: warehouse },
    ])
  ).rows[0].item;
  assert.equal(Object.keys(configResult.parameters).length, 15);
  const policies = (
    await db.query(
      "select count(*)::int n from pg_policies where policyname='tenant_isolation' and tablename in ('warehouse_docks','dock_appointment_rules','dock_policies','dock_appointments')",
    )
  ).rows[0].n;
  assert.equal(policies, 4);
  console.log(
    "PASS: local PostgreSQL migration, buffered adjacency, concurrent capacity, exact tenant FKs/RLS, role denial, event author, audit rollback, stale write and fifteen defaults.",
  );
} finally {
  await db.end();
}
