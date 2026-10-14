// LOCAL ONLY, same disposable PostgreSQL as the core integration harness.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { createHash, randomBytes } from "node:crypto";
const driver = process.argv[2];
const core = spawnSync(
  process.execPath,
  ["scripts/verify-docks-postgres.mjs", driver],
  { stdio: "inherit" },
);
if (core.status !== 0) process.exit(1);
const { default: pg } = await import(pathToFileURL(driver).href),
  config = {
    host: "127.0.0.1",
    port: 55439,
    user: "postgres",
    password: "local-test-only",
    database: "postgres",
  };
const db = new pg.Client(config);
await db.connect();
const tenant = "10000000-0000-4000-8000-000000000001",
  actor = "20000000-0000-4000-8000-000000000001",
  warehouse = "30000000-0000-4000-8000-000000000001",
  carrier = "60000000-0000-4000-8000-000000000001";
const hash = (v) => createHash("sha256").update(v).digest("hex"),
  tokenHash = hash(randomBytes(32)),
  ipHash = hash(randomBytes(32));
try {
  await db.query(`alter table tenant_members add unique(tenant_id,user_id);
 alter table parties add column code text; alter table parties add column legal_name text;
 insert into parties(id,tenant_id,code,legal_name) values('${carrier}','${tenant}','[PRUEBA] C1','[PRUEBA] Carrier');
 alter table warehouses add column name text; update warehouses set name='[PRUEBA] Warehouse',address_id='70000000-0000-4000-8000-000000000001';
 insert into party_addresses(id,tenant_id) values('70000000-0000-4000-8000-000000000001','${tenant}');
 create table carrier_profiles(party_id uuid primary key,tenant_id uuid,qualification_status text,insurance_expiry_date date,adr_certified boolean);
 insert into carrier_profiles values('${carrier}','${tenant}','APPROVED',current_date+90,true);
 create table customer_blocks(id uuid default gen_random_uuid(),tenant_id uuid,party_id uuid,behavior text,released_at timestamptz);
 create table vehicles(id uuid primary key,tenant_id uuid,registration text,capacity_weight numeric,adr_enabled boolean,metadata jsonb default '{}');
 create table drivers(id uuid primary key,tenant_id uuid,adr_qualified boolean);
 create table trips(id uuid primary key,tenant_id uuid,carrier_id uuid,vehicle_id uuid,driver_id uuid,status text);
 alter table trip_stops add column trip_id uuid;alter table trip_stops add column address_id uuid;alter table trip_stops add column stop_type text;
 alter table address_operational_profiles add column adr_capable boolean default false;
 alter table orders add column code text;alter table orders add column customer_reference text;alter table orders add column adr jsonb default '{}';
 alter table expeditions add column code text;alter table expeditions add column order_id uuid;
 create table trip_expeditions(tenant_id uuid,trip_id uuid,expedition_id uuid);
 insert into vehicles values('80000000-0000-4000-8000-000000000001','${tenant}','1111-TEST',44000,true,'{}');
 insert into trips values('81000000-0000-4000-8000-000000000001','${tenant}','${carrier}','80000000-0000-4000-8000-000000000001',null,'PLANNED');
 insert into trip_stops(id,tenant_id,status,trip_id,address_id,stop_type) values('82000000-0000-4000-8000-000000000001','${tenant}','PENDING','81000000-0000-4000-8000-000000000001','70000000-0000-4000-8000-000000000001','DELIVERY');
 insert into orders(id,tenant_id,code) values('83000000-0000-4000-8000-000000000001','${tenant}','ORD1');
 insert into expeditions(id,tenant_id,code,order_id) values('84000000-0000-4000-8000-000000000001','${tenant}','EX1','83000000-0000-4000-8000-000000000001');
 insert into trip_expeditions values('${tenant}','81000000-0000-4000-8000-000000000001','84000000-0000-4000-8000-000000000001');
 create schema if not exists platform_telemetry;drop table if exists platform_telemetry.telemetry_auth_events cascade;
 create table platform_telemetry.telemetry_auth_events(id uuid default gen_random_uuid(),occurred_at timestamptz,event_type text not null check(event_type in ('LOGIN_ATTEMPT','LOGIN_SUCCESS','LOGIN_FAILURE','RECOVERY_REQUEST','FIRST_ACCESS_REQUEST')),session_id uuid,user_id uuid,email_hash text,ip inet,ip_hash text,path text,failure_code text);
 create or replace function platform_telemetry.run_retention_if_due() returns void language sql as $$select$$;
 grant usage on schema platform_telemetry to service_role; grant all on all tables in schema platform_telemetry to service_role;
 grant all on all tables in schema public to service_role;grant all on all sequences in schema public to service_role;`);
  const opening = {
    timezone: "Europe/Madrid",
    days: Object.fromEntries(
      ["mon", "tue", "wed", "thu", "fri", "sat", "sun"].map((d) => [
        d,
        [{ from: "06:00", to: "22:00" }],
      ]),
    ),
  };
  await db.query(
    "insert into address_operational_profiles(tenant_id,address_id,opening_hours,holiday_exceptions,requires_appointment) values($1,'70000000-0000-4000-8000-000000000001',$2,'[]',true)",
    [tenant, opening],
  );
  await db.query(
    await readFile(
      new URL(
        "../supabase/migrations/20261014094551_muelles_v1_portal.sql",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  const access = (
    await db.query(
      "select fornexa_manage_dock_portal_access($1,$2,$3,$4,$5,now()+interval '7 days',null) id",
      [tenant, actor, carrier, warehouse, tokenHash],
    )
  ).rows[0].id;
  const day = new Date(Date.now() + 86400000).toISOString().slice(0, 10),
    input = {
      plate: "1111-TEST",
      packages: 10,
      weight_kg: 1000,
      reference: "ORD1",
      notes: "[PRUEBA]",
      start: `${day}T08:00:00.000Z`,
      rule_code: "R1",
      direction: "INBOUND",
      idempotency_key: randomBytes(16).toString("hex"),
    };
  const reserve = async (c, v = input) =>
    (
      await c.query("select fornexa_reserve_dock_portal($1,$2,$3,$4) booking", [
        access,
        tokenHash,
        v,
        hash(JSON.stringify(v)),
      ])
    ).rows[0].booking;
  const badReference = { ...input, reference: "UNASSIGNED" };
  await assert.rejects(() => reserve(db, badReference), /PORTAL_REFERENCE/);
  // Retry race with the same idempotency key must return the same response and one audit.
  const clients = [new pg.Client(config), new pg.Client(config)];
  await Promise.all(clients.map((c) => c.connect()));
  const outcomes = await Promise.all(clients.map((c) => reserve(c)));
  assert.deepEqual(outcomes[0], outcomes[1]);
  await Promise.all(clients.map((c) => c.end()));
  assert.doesNotMatch(
    JSON.stringify(outcomes[0]),
    /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|tenant_id|carrier_party_id/,
  );
  assert.equal(
    (
      await db.query(
        "select count(*)::int n from audit_events where source_channel='PORTAL'",
      )
    ).rows[0].n,
    1,
  );
  assert.equal(
    (
      await db.query(
        "select count(*)::int n from dock_appointments where portal_access_id=$1",
        [access],
      )
    ).rows[0].n,
    1,
  );
  await assert.rejects(
    () => reserve(db, { ...input, weight_kg: 1001 }),
    /PORTAL_IDEMPOTENCY/,
  );
  await assert.rejects(
    () =>
      reserve(db, {
        ...input,
        idempotency_key: randomBytes(16).toString("hex"),
      }),
    /PORTAL_ALREADY_BOOKED/,
  );
  // A separate assigned order competes for the same last slot. Distinct keys must have one winner.
  await db.query(`insert into orders(id,tenant_id,code) values('83000000-0000-4000-8000-000000000002','${tenant}','ORD2');
    insert into expeditions(id,tenant_id,code,order_id) values('84000000-0000-4000-8000-000000000002','${tenant}','EX2','83000000-0000-4000-8000-000000000002');
    insert into trips values('81000000-0000-4000-8000-000000000002','${tenant}','${carrier}','80000000-0000-4000-8000-000000000001',null,'PLANNED');
    insert into trip_stops(id,tenant_id,status,trip_id,address_id,stop_type) values('82000000-0000-4000-8000-000000000002','${tenant}','PENDING','81000000-0000-4000-8000-000000000002','70000000-0000-4000-8000-000000000001','DELIVERY');
    insert into trip_expeditions values('${tenant}','81000000-0000-4000-8000-000000000002','84000000-0000-4000-8000-000000000002');
    update dock_appointments set status='CANCELLED',cancellation_reason='[PRUEBA] reset' where portal_access_id='${access}';`);
  await db.query(
    "insert into customer_blocks(tenant_id,party_id,behavior) values($1,$2,'WARNING')",
    [tenant, carrier],
  );
  const racers = [new pg.Client(config), new pg.Client(config)];
  await Promise.all(racers.map((c) => c.connect()));
  const race = await Promise.allSettled(
    racers.map((c, i) =>
      reserve(c, {
        ...input,
        reference: i ? "ORD2" : "ORD1",
        idempotency_key: randomBytes(16).toString("hex"),
      }),
    ),
  );
  await Promise.all(racers.map((c) => c.end()));
  assert.equal(race.filter((r) => r.status === "fulfilled").length, 1);
  assert.equal(race.find((r) => r.status === "fulfilled").value.warning, true);
  assert.match(
    race.find((r) => r.status === "rejected").reason.message,
    /PORTAL_CAPACITY/,
  );
  assert.equal(
    (
      await db.query(
        "select count(*)::int n from dock_appointments where portal_access_id=$1 and status='CONFIRMED'",
        [access],
      )
    ).rows[0].n,
    1,
  );
  await db.query("delete from customer_blocks");
  // Carrier-attributed no-shows suspend only the matching carrier and warehouse.
  await db.query(
    `update dock_appointments set status='NO_SHOW',planned_start=now()-interval '1 day',planned_end=now()-interval '1 day'+interval '1 hour',metadata='{"attributed_to":"CARRIER"}' where portal_access_id='${access}';`,
  );
  await assert.rejects(
    () =>
      reserve(db, {
        ...input,
        idempotency_key: randomBytes(16).toString("hex"),
      }),
    /PORTAL_SUSPENDED/,
  );
  await db.query(
    "update dock_appointments set status='CANCELLED',cancellation_reason='[PRUEBA] reset',metadata='{}' where portal_access_id=$1",
    [access],
  );
  await db.query("update address_operational_profiles set opening_hours=$1", [
    { mon_fri: "08:00-18:00" },
  ]);
  await assert.rejects(
    () =>
      reserve(db, {
        ...input,
        idempotency_key: randomBytes(16).toString("hex"),
      }),
    /PORTAL_CALENDAR/,
  );
  await db.query(
    "update address_operational_profiles set opening_hours=$1,holiday_exceptions=$2",
    [opening, JSON.stringify([{ date: day, closed: true }])],
  );
  await assert.rejects(
    () =>
      reserve(db, {
        ...input,
        idempotency_key: randomBytes(16).toString("hex"),
      }),
    /PORTAL_CALENDAR/,
  );
  await db.query(
    "update address_operational_profiles set holiday_exceptions='[]'",
  );
  await db.query("update warehouse_docks set max_vehicle_length_m=10");
  await assert.rejects(
    () =>
      reserve(db, {
        ...input,
        idempotency_key: randomBytes(16).toString("hex"),
      }),
    /PORTAL_CAPACITY/,
  );
  await db.query("update warehouse_docks set max_vehicle_length_m=null");
  await db.query(
    "insert into customer_blocks(tenant_id,party_id,behavior) values($1,$2,'HARD')",
    [tenant, carrier],
  );
  await assert.rejects(
    () =>
      reserve(db, {
        ...input,
        idempotency_key: randomBytes(16).toString("hex"),
      }),
    /PORTAL_SUSPENDED/,
  );
  await db.query("delete from customer_blocks");
  await db.query("update dock_portal_access set revoked_at=now() where id=$1", [
    access,
  ]);
  await assert.rejects(() => reserve(db), /PORTAL_ACCESS/);
  await db.query(
    "update dock_portal_access set revoked_at=null,created_at=now()-interval '2 days',expires_at=now()-interval '1 day' where id=$1",
    [access],
  );
  await assert.rejects(() => reserve(db), /PORTAL_ACCESS/);
  for (let i = 0; i < 20; i++)
    assert.equal(
      (
        await db.query("select fornexa_dock_portal_rate($1,$2,'REQUEST') ok", [
          tokenHash,
          ipHash,
        ])
      ).rows[0].ok,
      true,
    );
  assert.equal(
    (
      await db.query("select fornexa_dock_portal_rate($1,$2,'REQUEST') ok", [
        tokenHash,
        ipHash,
      ])
    ).rows[0].ok,
    false,
  );
  const failedToken = hash(randomBytes(32)),
    failedIp = hash(randomBytes(32));
  for (let i = 0; i < 5; i++)
    await db.query("select fornexa_dock_portal_rate($1,$2,'FAILURE')", [
      failedToken,
      failedIp,
    ]);
  assert.equal(
    (
      await db.query("select fornexa_dock_portal_rate($1,$2,'REQUEST') ok", [
        hash(randomBytes(32)),
        failedIp,
      ])
    ).rows[0].ok,
    false,
  );
  assert.equal(
    (
      await db.query(
        "select count(*)::int n from platform_telemetry.telemetry_auth_events where ip is not null",
      )
    ).rows[0].n,
    0,
  );
  await db.query("set role authenticated");
  await assert.rejects(
    () => db.query("select * from dock_portal_access"),
    (e) => e.code === "42501",
  );
  await assert.rejects(
    () =>
      db.query("select fornexa_dock_portal_rate($1,$2,'REQUEST')", [
        tokenHash,
        ipHash,
      ]),
    (e) => e.code === "42501",
  );
  await db.query("reset role");
  await assert.rejects(
    () =>
      db.query("select fornexa_capture_auth_telemetry($1)", [
        { event_type: "DOCK_PORTAL_FAILURE", session_id: access },
      ]),
    /Unsupported auth event/,
  );
  console.log(
    "PASS: local portal migration, tenant capability permissions, assigned journey/reference, concurrent idempotency, single audit, no UUID response, last-place race/WARNING/no-show/calendar/length/HARD/expiry/revocation, token/IP throttling, repeated failure block, no raw IP and unforgeable public capture.",
  );
} finally {
  await db.end();
}
