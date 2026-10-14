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
  const statesBefore = (
    await db.query("select count(*)::int n from audit_events")
  ).rows[0].n;
  await assert.rejects(
    () =>
      db.query(
        "select * from fornexa_write_dock_appointment($1,$2,$3,$4,$5,null)",
        [
          tenant,
          actor,
          second.id,
          second.updated_at,
          {
            ...values(second.planned_start, second.planned_end),
            status: "CHECKED_IN",
          },
        ],
      ),
    /DOCK_STATE/,
  );
  assert.equal(
    (await db.query("select count(*)::int n from audit_events")).rows[0].n,
    statesBefore,
  );
  assert.equal(
    (
      await db.query(
        "select count(*)::int n from transport_events where dock_appointment_id=$1",
        [second.id],
      )
    ).rows[0].n,
    0,
  );
  await db.query(
    "update tenant_members set role='PLANNER' where tenant_id=$1 and user_id=$2",
    [tenant, actor],
  );
  const future = new Date(Date.now()+2*86400000); future.setUTCHours(14,0,0,0);
  const planner = await reserveOnce(db, values(future.toISOString(),new Date(future.getTime()+3600000).toISOString()));
  assert.equal(planner.status, "CONFIRMED");
  await assert.rejects(
    () =>
      db.query("select fornexa_dock_config($1,$2,'policy',null,$3)", [
        tenant,
        actor,
        { warehouse_id: warehouse },
      ]),
    /DOCK_FORBIDDEN/,
  );
  await db.query(
    "update tenant_members set role='ADMIN' where tenant_id=$1 and user_id=$2",
    [tenant, actor],
  );
  await assert.rejects(
    () =>
      db.query("select fornexa_dock_config($1,$2,'dock',$3,$4)", [
        tenant,
        actor,
        dock,
        { warehouse_id: warehouse, status: "MAINTENANCE" },
      ]),
    /DOCK_FUTURE_APPOINTMENTS/,
  );
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
  await db.query("update tenant_members set role='PLANNER' where tenant_id=$1 and user_id=$2",[tenant,actor]);
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
  await db.query("update tenant_members set role='ADMIN' where tenant_id=$1 and user_id=$2",[tenant,actor]);
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
  const historical = (
    await db.query(
      "select occupied_range::text,buffer_minutes from dock_appointments where id=$1",
      [first.id],
    )
  ).rows[0];
  await db.query("select fornexa_dock_config($1,$2,'dock',$3,$4)", [
    tenant,
    actor,
    dock,
    { warehouse_id: warehouse, buffer_minutes: 20 },
  ]);
  assert.deepEqual(
    (
      await db.query(
        "select occupied_range::text,buffer_minutes from dock_appointments where id=$1",
        [first.id],
      )
    ).rows[0],
    historical,
  );
  assert.equal(
    (
      await db.query(
        "select buffer_minutes from dock_appointments where id=$1",
        [second.id],
      )
    ).rows[0].buffer_minutes,
    20,
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
  // Known legacy and empty profiles normalize atomically with exact before images.
  const addressIds = [
    "70000000-0000-4000-8000-000000000011",
    "70000000-0000-4000-8000-000000000012",
    "70000000-0000-4000-8000-000000000013",
  ];
  for (const id of addressIds)
    await db.query("insert into party_addresses(id,tenant_id) values($1,$2)", [
      id,
      tenant,
    ]);
  const canonical = {
    timezone: "Europe/Madrid",
    days: Object.fromEntries(
      ["mon", "tue", "wed", "thu", "fri", "sat", "sun"].map((d) => [d, []]),
    ),
  };
  for (let i = 0; i < addressIds.length; i++)
    await db.query(
      "insert into address_operational_profiles(address_id,tenant_id,opening_hours,holiday_exceptions) values($1,$2,$3,'[]')",
      [
        addressIds[i],
        tenant,
        i === 0 ? { mon_fri: "08:00-18:00" } : i === 1 ? {} : canonical,
      ],
    );
  const preimages = (
    await db.query(
      "select to_jsonb(p.*) row from address_operational_profiles p order by address_id",
    )
  ).rows.map((r) => r.row);
  const normalization = await readFile(
    new URL(
      "../supabase/migrations/20261014103035_muelles_calendar_normalization.sql",
      import.meta.url,
    ),
    "utf8",
  );
  await db.query(normalization);
  const images = (
    await db.query(
      "select before_data,after_data from audit_events where action='NORMALIZE_CALENDAR' order by entity_id",
    )
  ).rows;
  assert.equal(images.length, 2);
  assert.deepEqual(
    images.map((r) => r.before_data),
    preimages.slice(0, 2),
  );
  assert.equal(images[0].after_data.opening_hours.days.mon[0].from, "08:00");
  assert.deepEqual(images[1].after_data.opening_hours.days.sun, []);
  assert.deepEqual(
    (
      await db.query(
        "select opening_hours from address_operational_profiles where address_id=$1",
        [addressIds[2]],
      )
    ).rows[0].opening_hours,
    canonical,
  );
  await db.query(normalization);
  assert.equal(
    (
      await db.query(
        "select count(*)::int n from audit_events where action='NORMALIZE_CALENDAR'",
      )
    ).rows[0].n,
    2,
  );
  const defaultHours = (
    await db.query(
      "select column_default from information_schema.columns where table_schema='public' and table_name='address_operational_profiles' and column_name='opening_hours'",
    )
  ).rows[0].column_default;
  assert.match(defaultHours, /timezone/);
  assert.match(defaultHours, /sun/);
  console.log(
    "PASS: local PostgreSQL migration, buffered adjacency, concurrent capacity, exact tenant FKs/RLS, role denial, event author, audit rollback, stale write and fifteen defaults, immutable terminal buffer, maintenance denial, PLANNER scope, state-machine rejection and atomic legacy normalization/preimages.",
  );
} finally {
  await db.end();
}
