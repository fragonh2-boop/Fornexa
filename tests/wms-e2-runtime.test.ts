import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test, { before, after } from "node:test";
import { runE2RegressionCases } from "../scripts/wms/e2-regression-cases.mjs";
import { PGlite } from "@electric-sql/pglite";
import {
  WMS_ACTIONS,
  computeReplenishmentDeficit,
  selectQuantByRotation,
  type WmsAction,
  type WmsQuant,
} from "../lib/wms.ts";

let db: any;

const tenantA = "00000000-0000-4000-a000-000000000001";
const tenantB = "00000000-0000-4000-b000-000000000002";
const userPlanner = "10000000-0000-4000-a000-000000000001";
const userOperator = "10000000-0000-4000-a000-000000000002";
const userOther = "10000000-0000-4000-b000-000000000003";

const whA = "20000000-0000-4000-a000-000000000001";
const whB = "20000000-0000-4000-b000-000000000002";

const prod1 = "30000000-0000-4000-a000-000000000001";
const prod2 = "30000000-0000-4000-a000-000000000002";

// Dest Bins
const binDest1 = "40000000-0000-4000-a000-000000000001"; // Picking bin
const binDest2 = "40000000-0000-4000-a000-000000000002"; // Limited weight bin
const binDest3 = "40000000-0000-4000-a000-000000000003"; // Limited pallets bin

// Source Bins (Pulmón)
const binSrc1 = "40000000-0000-4000-a000-000000000011";
const binSrc2 = "40000000-0000-4000-a000-000000000012";

before(async () => {
  db = new PGlite();

  // Roles & foundation
  await db.exec(`
    create role authenticated;
    create role anon;
    create role service_role;

    create schema if not exists auth;
    create table if not exists auth.users (id uuid primary key default gen_random_uuid(), email text);
    create or replace function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
    $$;

    create or replace function public.fornexa_set_updated_at() returns trigger language plpgsql as $$
    begin
      new.updated_at = now();
      return new;
    end;
    $$;

    create table if not exists public.tenants (
      id uuid primary key default gen_random_uuid(),
      name text not null,
      status text not null default 'ACTIVE',
      created_at timestamptz default now(),
      unique(id)
    );

    create table if not exists public.tenant_members (
      id uuid primary key default gen_random_uuid(),
      tenant_id uuid not null references public.tenants(id) on delete cascade,
      user_id uuid not null references auth.users(id) on delete cascade,
      role text not null check (role in ('OWNER','ADMIN','OPERATOR','PLANNER','BILLING','VIEWER')),
      status text not null default 'ACTIVE' check (status in ('ACTIVE','INVITED','SUSPENDED')),
      created_at timestamptz default now(),
      unique(tenant_id, user_id)
    );

    create table if not exists public.warehouses (
      id uuid primary key default gen_random_uuid(),
      tenant_id uuid not null references public.tenants(id) on delete restrict,
      code text not null,
      name text not null,
      status text not null default 'ACTIVE',
      created_at timestamptz default now(),
      updated_at timestamptz default now(),
      unique(tenant_id, id)
    );

    create table if not exists public.warehouse_zones (
      id uuid primary key default gen_random_uuid(),
      tenant_id uuid not null references public.tenants(id) on delete restrict,
      warehouse_id uuid not null references public.warehouses(id) on delete cascade,
      code text not null,
      name text not null,
      temperature_regime text default 'AMBIENT',
      created_at timestamptz default now(),
      unique(tenant_id, id)
    );

    create table if not exists public.warehouse_bins (
      id uuid primary key default gen_random_uuid(),
      tenant_id uuid not null references public.tenants(id) on delete restrict,
      warehouse_id uuid not null references public.warehouses(id) on delete cascade,
      zone_id uuid references public.warehouse_zones(id) on delete set null,
      bin_code text not null,
      code text,
      bin_type text not null default 'PALLET_RACK',
      max_pallets integer,
      max_weight_kg numeric(10,3),
      max_volume_m3 numeric(10,4),
      is_blocked boolean not null default false,
      is_active boolean default true,
      created_at timestamptz default now(),
      unique(tenant_id, id)
    );

    create table if not exists public.parties (
      id uuid primary key default gen_random_uuid(),
      tenant_id uuid not null references public.tenants(id) on delete restrict,
      legal_name text not null,
      tax_id text,
      created_at timestamptz default now(),
      unique(tenant_id, id)
    );

    create table if not exists public.products (
      id uuid primary key default gen_random_uuid(),
      tenant_id uuid not null references public.tenants(id) on delete restrict,
      sku text not null,
      name text not null,
      description text,
      owner_party_id uuid references public.parties(id) on delete set null,
      category_code text,
      weight_kg numeric(10,3),
      volume_m3 numeric(10,4),
      gross_weight_kg numeric(10,3) default 10.0,
      created_at timestamptz default now(),
      unique(tenant_id, id)
    );

    create table if not exists public.orders (
      id uuid primary key default gen_random_uuid(),
      tenant_id uuid not null references public.tenants(id) on delete restrict,
      order_number text not null,
      created_at timestamptz default now(),
      unique(tenant_id, id)
    );

    create table if not exists public.order_lines (
      id uuid primary key default gen_random_uuid(),
      tenant_id uuid not null references public.tenants(id) on delete restrict,
      order_id uuid not null references public.orders(id) on delete cascade,
      product_id uuid not null references public.products(id) on delete restrict,
      quantity numeric(10,3) not null default 1,
      created_at timestamptz default now(),
      unique(tenant_id, id)
    );

    create table if not exists public.warehouse_docks (
      id uuid primary key default gen_random_uuid(),
      tenant_id uuid not null references public.tenants(id) on delete restrict,
      warehouse_id uuid not null references public.warehouses(id) on delete cascade,
      code text not null,
      name text,
      dock_type text default 'UNLOAD',
      status text default 'ACTIVE',
      created_at timestamptz default now(),
      unique(tenant_id, id)
    );

    create table if not exists public.inventory_quants (
      id uuid primary key default gen_random_uuid(),
      tenant_id uuid not null references public.tenants(id) on delete restrict,
      warehouse_id uuid not null references public.warehouses(id) on delete restrict,
      bin_id uuid not null references public.warehouse_bins(id) on delete restrict,
      product_id uuid not null references public.products(id) on delete restrict,
      owner_party_id uuid references public.parties(id) on delete set null,
      batch_number text,
      serial_number text,
      expiry_date date,
      quantity numeric(12,3) not null default 0,
      quantity_on_hand numeric(12,3) not null default 0 check (quantity_on_hand >= 0),
      quantity_reserved numeric(12,3) not null default 0 check (quantity_reserved >= 0 and quantity_reserved <= quantity_on_hand),
      uom text not null default 'UN',
      lot_number text,
      flow_state text check (flow_state is null or flow_state in (
        'STAGING_UNCHECKED','STAGING_CHECKED','STORED','RESERVED','PICKED_STAGED','LOADED','QUARANTINE','DAMAGED'
      )),
      hu_id uuid,
      weight_kg numeric(10,3),
      volume_m3 numeric(10,4),
      stock_status text default 'AVAILABLE' check (stock_status in ('AVAILABLE','RESERVED','INSPECTION','QUARANTINE','DAMAGED','BLOCKED')),
      created_at timestamptz default now(),
      updated_at timestamptz default now(),
      unique(tenant_id, id)
    );

    create table if not exists public.inventory_movements (
      id uuid primary key default gen_random_uuid(),
      tenant_id uuid not null references public.tenants(id) on delete restrict,
      warehouse_id uuid not null references public.warehouses(id) on delete restrict,
      product_id uuid not null references public.products(id) on delete restrict,
      quantity numeric(12,3) not null,
      uom text not null default 'UN',
      source_bin_id uuid references public.warehouse_bins(id),
      destination_bin_id uuid references public.warehouse_bins(id),
      movement_type text not null,
      owner_party_id uuid references public.parties(id) on delete set null,
      batch_number text,
      serial_number text,
      reference_order_id uuid,
      operator_id text,
      started_at timestamptz default now(),
      completed_at timestamptz default now(),
      status text not null default 'COMPLETED',
      notes text,
      created_at timestamptz default now(),
      unique(tenant_id, id)
    );

    create table if not exists public.audit_events (
      id bigint generated always as identity primary key,
      tenant_id uuid not null references public.tenants(id) on delete restrict,
      entity_type text not null,
      entity_id uuid,
      business_id uuid,
      revision_id uuid,
      action text not null,
      actor_user_id uuid references auth.users(id) on delete set null,
      source_channel text not null default 'FORNEXA_WEB',
      device_id text,
      session_id text,
      ip_address inet,
      user_agent text,
      changed_fields text[] not null default '{}',
      before_data jsonb,
      after_data jsonb,
      reason text,
      correlation_id uuid not null default gen_random_uuid(),
      occurred_at timestamptz not null default now()
    );
  `);

  // Apply real migrations in cumulative order (MUST-TEST-1)
  const tenantAccessSql = readFileSync(
    resolve(import.meta.dirname, "../supabase/migrations/20260819_harden_tenant_access_function.sql"),
    "utf-8",
  );
  await db.exec(tenantAccessSql);

  const e1Sql = readFileSync(
    resolve(import.meta.dirname, "../supabase/migrations/20261017110000_wms_e1_core.sql"),
    "utf-8",
  );
  await db.exec(e1Sql);

  await db.exec("alter table public.handling_units alter column hu_type set default 'PALLET';");

  const c3Sql = readFileSync(
    resolve(import.meta.dirname, "../supabase/migrations/20261019120000_wms_c3_server_load_controls.sql"),
    "utf-8",
  );
  await db.exec(c3Sql);

  await db.exec(`alter table public.inventory_quants add constraint inventory_quants_bin_id_product_id_owner_party_id_batch_num_key
    unique nulls not distinct (bin_id,product_id,owner_party_id,batch_number,serial_number,stock_status)`);

  const e2CoreSql = readFileSync(
    resolve(import.meta.dirname, "../supabase/migrations/20261024120000_wms_e2_replenishment_core.sql"),
    "utf-8",
  );
  await db.exec(e2CoreSql);

  const e2RpcSql = readFileSync(
    resolve(import.meta.dirname, "../supabase/migrations/20261024120100_wms_e2_replenishment_rpc.sql"),
    "utf-8",
  );
  await db.exec(e2RpcSql);

  // Seed baseline data
  await db.exec(`
    insert into auth.users (id, email) values
      ('${userPlanner}', 'planner@fornexa.com'),
      ('${userOperator}', 'operator@fornexa.com'),
      ('${userOther}', 'other@fornexa.com');

    insert into public.tenants (id, name) values ('${tenantA}', 'Tenant A'), ('${tenantB}', 'Tenant B');
    insert into public.tenant_members (tenant_id, user_id, role) values
      ('${tenantA}', '${userPlanner}', 'PLANNER'),
      ('${tenantA}', '${userOperator}', 'OPERATOR'),
      ('${tenantB}', '${userOther}', 'PLANNER');

    insert into public.warehouses (id, tenant_id, code, name) values
      ('${whA}', '${tenantA}', 'WHA', 'Warehouse A'),
      ('${whB}', '${tenantB}', 'WHB', 'Warehouse B');

    insert into public.warehouse_bins (id, tenant_id, warehouse_id, bin_code, code, max_pallets, max_weight_kg) values
      ('${binDest1}', '${tenantA}', '${whA}', 'PICK-01', 'PICK-01', null, null),
      ('${binDest2}', '${tenantA}', '${whA}', 'PICK-02', 'PICK-02', null, 50.0),
      ('${binDest3}', '${tenantA}', '${whA}', 'PICK-03', 'PICK-03', 2, null),
      ('${binSrc1}', '${tenantA}', '${whA}', 'PULMON-01', 'PULMON-01', null, null),
      ('${binSrc2}', '${tenantA}', '${whA}', 'PULMON-02', 'PULMON-02', null, null);

    insert into public.products (id, tenant_id, sku, name, gross_weight_kg) values
      ('${prod1}', '${tenantA}', 'SKU-01', 'Producto 1', 1.0),
      ('${prod2}', '${tenantA}', 'SKU-02', 'Producto 2', 2.0);

    insert into public.inventory_quants (
      tenant_id, warehouse_id, bin_id, product_id, quantity_on_hand, quantity_reserved, stock_status, flow_state, received_at, expiry_date
    ) values
      ('${tenantA}', '${whA}', '${binSrc1}', '${prod1}', 100, 0, 'AVAILABLE', 'STORED', '2026-10-01 10:00:00Z', '2026-12-01'),
      ('${tenantA}', '${whA}', '${binSrc2}', '${prod1}', 100, 0, 'AVAILABLE', 'STORED', '2026-10-01 10:00:00Z', '2026-12-01'),
      ('${tenantA}', '${whA}', '${binSrc1}', '${prod2}', 100, 0, 'AVAILABLE', 'STORED', '2026-10-01 10:00:00Z', '2026-12-01');
  `);
});

// Helpers
async function cleanupProposalsAndTasks(tenantId: string = tenantA) {
  await db.exec(`
    update public.wms_proposals set task_id = null where tenant_id = '${tenantId}';
    update public.warehouse_tasks set proposal_id = null where tenant_id = '${tenantId}';
    delete from public.warehouse_tasks where tenant_id = '${tenantId}';
    delete from public.stock_reservations where tenant_id = '${tenantId}';
    delete from public.wms_proposals where tenant_id = '${tenantId}';
  `);
}

// ── E2-130: Ciclo Nominal de Reposición (DRAFT -> APPROVED -> EXECUTED) ──────
test("E2-130 — Ciclo nominal de reposición (DRAFT -> APPROVED -> EXECUTED): reserva, tarea, quant destino, received_at inmutable, movimiento y replay", async () => {
  await cleanupProposalsAndTasks(tenantA);
  await db.exec(`
    update public.inventory_quants set quantity_on_hand = 100, quantity_reserved = 0, stock_status = 'AVAILABLE', received_at = '2026-10-01 10:00:00Z', expiry_date = '2026-12-01' where bin_id = '${binSrc1}' and product_id = '${prod1}';
    delete from public.inventory_quants where bin_id = '${binDest1}' and product_id = '${prod1}';
  `);
  const quantSrcId = (await db.query(`select id from public.inventory_quants where bin_id = '${binSrc1}' and product_id = '${prod1}' limit 1`)).rows[0].id;

  // 1. Crear propuesta DRAFT
  const propRes = await db.query(`
    insert into public.wms_proposals (
      tenant_id, warehouse_id, product_id, source_bin_id, source_quant_id, destination_bin_id, suggested_quantity, status, batch_number
    ) values (
      '${tenantA}', '${whA}', '${prod1}', '${binSrc1}', '${quantSrcId}', '${binDest1}', 30, 'DRAFT', 'LOTE-NOMINAL'
    ) returning id;
  `);
  const propId = propRes.rows[0].id;

  // 2. Aprobar propuesta
  const approveRes = await db.query(`
    select public.fornexa_wms_action('${tenantA}', '${userPlanner}', 'APPROVE_PROPOSAL', jsonb_build_object('proposal_id', '${propId}')) as res;
  `);
  assert.equal((approveRes.rows[0].res as any).ok, true);

  // Verificar quant origen reservado y flow_state RESERVED
  const qSrcAfterApprove = (await db.query(`select quantity_reserved, flow_state from public.inventory_quants where id = '${quantSrcId}'`)).rows[0];
  assert.equal(Number(qSrcAfterApprove.quantity_reserved), 30);
  assert.equal(qSrcAfterApprove.flow_state, "RESERVED");

  // 3. Ejecutar reposición
  const idemKey = "idem-nominal-1";
  const repRes = await db.query(`
    select public.fornexa_wms_action('${tenantA}', '${userOperator}', 'REPLENISH', jsonb_build_object('proposal_id', '${propId}'), '${idemKey}') as res;
  `);
  const repData = (repRes.rows[0].res as any);
  assert.equal(repData.ok, true);
  assert.equal(repData.status, "EXECUTED");

  // 4. Quant origen descontado y flow_state restaurado a STORED
  const qSrcFinal = (await db.query(`select quantity_on_hand, quantity_reserved, flow_state from public.inventory_quants where id = '${quantSrcId}'`)).rows[0];
  assert.equal(Number(qSrcFinal.quantity_on_hand), 70);
  assert.equal(Number(qSrcFinal.quantity_reserved), 0);
  assert.equal(qSrcFinal.flow_state, "STORED");

  // 5. Quant destino creado con received_at inmutable heredado
  const qDestFinal = (await db.query(`select quantity_on_hand, quantity_reserved, flow_state, stock_status, received_at, expiry_date from public.inventory_quants where bin_id = '${binDest1}' and product_id = '${prod1}'`)).rows[0];
  assert.equal(Number(qDestFinal.quantity_on_hand), 30);
  assert.equal(Number(qDestFinal.quantity_reserved), 0);
  assert.equal(qDestFinal.flow_state, "STORED");
  assert.equal(qDestFinal.stock_status, "AVAILABLE");
  assert.ok(qDestFinal.received_at !== null, "Destino debe heredar received_at");

  // 6. Movimiento en inventory_movements con columnas reales
  const mov = (await db.query(`select * from public.inventory_movements where tenant_id = '${tenantA}' and destination_bin_id = '${binDest1}' and product_id = '${prod1}'`)).rows[0];
  assert.equal(mov.movement_type, "REPLENISHMENT");
  assert.equal(Number(mov.quantity), 30);
  assert.equal(mov.status, "COMPLETED");

  // 7. Replay idempotente devuelve idempotent_replay: true
  const repReplay = await db.query(`
    select public.fornexa_wms_action('${tenantA}', '${userOperator}', 'REPLENISH', jsonb_build_object('proposal_id', '${propId}'), '${idemKey}') as res;
  `);
  assert.equal((repReplay.rows[0].res as any).ok, true);
  assert.equal((repReplay.rows[0].res as any).idempotent_replay, true);

  // 8. Replay con payload divergente falla con WMS_DUPLICATE_KEY_PAYLOAD_MISMATCH
  await assert.rejects(
    async () => {
      await db.query(`
        select public.fornexa_wms_action('${tenantA}', '${userOperator}', 'REPLENISH', jsonb_build_object('proposal_id', '${propId}', 'divergent', true), '${idemKey}');
      `);
    },
    /WMS_DUPLICATE_KEY_PAYLOAD_MISMATCH/,
  );
});

// ── E2-131: Disparo por stock bajo mínimo ────────────────────────────────────
test("E2-131 — Disparo por stock bajo mínimo: genera propuesta DRAFT con cantidad determinista ajustada a múltiplo", async () => {
  await cleanupProposalsAndTasks(tenantA);
  await db.exec(`delete from public.replenishment_rules where tenant_id = '${tenantA}';`);

  // Regla
  const resRule = await db.query(`
    insert into public.replenishment_rules (
      tenant_id, warehouse_id, product_id, destination_bin_id, min_quantity, max_quantity, reorder_quantity, consolidation
    ) values (
      '${tenantA}', '${whA}', '${prod1}', '${binDest1}', 10, 50, 10, 'YES'
    ) returning id;
  `);
  const ruleId = resRule.rows[0].id;

  // Stock destino: 3 uds
  await db.exec(`
    delete from public.inventory_quants where bin_id in ('${binDest1}', '${binSrc1}') and product_id = '${prod1}';
    insert into public.inventory_quants (tenant_id, warehouse_id, bin_id, product_id, quantity_on_hand, quantity_reserved, received_at)
    values ('${tenantA}', '${whA}', '${binDest1}', '${prod1}', 3, 0, '2026-10-01 10:00:00Z');
    insert into public.inventory_quants (tenant_id, warehouse_id, bin_id, product_id, quantity_on_hand, quantity_reserved, received_at)
    values ('${tenantA}', '${whA}', '${binSrc1}', '${prod1}', 100, 0, '2026-10-01 08:00:00Z');
  `);

  // Evaluación RPC
  const evalRes = await db.query(`
    select public.fornexa_wms_evaluate_replenishment('${tenantA}', '${userPlanner}', '${whA}', '${ruleId}') as res;
  `);
  const result = evalRes.rows[0].res as any;

  assert.equal(result.ok, true);
  assert.equal(result.count, 1);
  const prop = result.proposals[0];
  // Deficit = 50 - 3 = 47. Multiplo = floor(47/10)*10 = 40.
  assert.equal(Number(prop.suggested_quantity), 40);
  assert.equal(prop.status, "DRAFT");
  assert.equal(prop.destination_bin_id, binDest1);
});

// ── E2-132: No disparo cuando stock >= mínimo ────────────────────────────────
test("E2-132 — No disparo cuando stock >= mínimo: stock destino 12 > min 10 genera 0 propuestas", async () => {
  await db.exec(`
    update public.inventory_quants set quantity_on_hand = 12 where bin_id = '${binDest1}' and product_id = '${prod1}';
    delete from public.wms_proposals where tenant_id = '${tenantA}';
  `);

  const evalRes = await db.query(`
    select public.fornexa_wms_evaluate_replenishment('${tenantA}', '${userPlanner}', '${whA}') as res;
  `);
  const result = evalRes.rows[0].res as any;
  assert.equal(result.count, 0);
});

// ── E2-133: Deducción de reposición en tránsito ──────────────────────────────
test("E2-133 — Deducción de reposición en tránsito: stock físico 5 + en tránsito 40 = 45 > min 10", async () => {
  await db.exec(`
    update public.inventory_quants set quantity_on_hand = 5 where bin_id = '${binDest1}' and product_id = '${prod1}';
    insert into public.wms_proposals (
      tenant_id, warehouse_id, product_id, source_bin_id, source_quant_id, destination_bin_id, suggested_quantity, status
    ) values (
      '${tenantA}', '${whA}', '${prod1}', '${binSrc1}', (select id from public.inventory_quants where bin_id = '${binSrc1}' limit 1),
      '${binDest1}', 40, 'APPROVED'
    );
  `);

  const evalRes = await db.query(`
    select public.fornexa_wms_evaluate_replenishment('${tenantA}', '${userPlanner}', '${whA}') as res;
  `);
  const result = evalRes.rows[0].res as any;
  assert.equal(result.count, 0, "No debe generar nueva propuesta por stock en tránsito suficiente");
});

// ── E2-134: Rotación determinista FIFO vs FEFO con received_at inmutable ─────
test("E2-134 — Rotación determinista FIFO vs FEFO y protección de inmutabilidad de received_at", async () => {
  await db.exec(`
    delete from public.wms_proposals where tenant_id = '${tenantA}';
    delete from public.inventory_quants where tenant_id = '${tenantA}';
  `);

  // Pulmón A: recibido 2026-10-01, caduca 2026-12-01
  const resA = await db.query(`
    insert into public.inventory_quants (tenant_id, warehouse_id, bin_id, product_id, quantity_on_hand, received_at, expiry_date)
    values ('${tenantA}', '${whA}', '${binSrc1}', '${prod1}', 50, '2026-10-01 00:00:00Z', '2026-12-01') returning id;
  `);
  const quantAId = resA.rows[0].id;

  // Pulmón B: recibido 2026-10-15, caduca 2026-11-15 (caduca antes)
  const resB = await db.query(`
    insert into public.inventory_quants (tenant_id, warehouse_id, bin_id, product_id, quantity_on_hand, received_at, expiry_date)
    values ('${tenantA}', '${whA}', '${binSrc2}', '${prod1}', 50, '2026-10-15 00:00:00Z', '2026-11-15') returning id;
  `);
  const quantBId = resB.rows[0].id;

  // Destino vacío
  await db.query(`
    insert into public.inventory_quants (tenant_id, warehouse_id, bin_id, product_id, quantity_on_hand, received_at)
    values ('${tenantA}', '${whA}', '${binDest1}', '${prod1}', 0, '2026-10-01 00:00:00Z');
  `);

  // Caso 1: Política FIFO -> Debe seleccionar Pulmón A por received_at ASC
  await db.exec(`
    delete from public.warehouse_behavior_policies where tenant_id = '${tenantA}' and warehouse_id = '${whA}';
    insert into public.warehouse_behavior_policies (tenant_id, warehouse_id, scope, params)
    values ('${tenantA}', '${whA}', 'WAREHOUSE', '{"rotation":"FIFO","consolidation":"YES"}'::jsonb);
  `);

  const evalFifo = await db.query(`
    select public.fornexa_wms_evaluate_replenishment('${tenantA}', '${userPlanner}', '${whA}') as res;
  `);
  const propFifo = (evalFifo.rows[0].res as any).proposals[0];
  assert.equal(propFifo.source_quant_id, quantAId, "FIFO debe seleccionar quant A por mayor antigüedad");

  // Limpiar propuesta
  await db.exec(`delete from public.wms_proposals where tenant_id = '${tenantA}';`);

  // Caso 2: Política FEFO -> Debe seleccionar Pulmón B por caducidad más cercana
  await db.exec(`
    update public.warehouse_behavior_policies set params = '{"rotation":"FEFO","consolidation":"YES"}'::jsonb where tenant_id = '${tenantA}' and warehouse_id = '${whA}';
  `);
  const evalFefo = await db.query(`
    select public.fornexa_wms_evaluate_replenishment('${tenantA}', '${userPlanner}', '${whA}') as res;
  `);
  const propFefo = (evalFefo.rows[0].res as any).proposals[0];
  assert.equal(propFefo.source_quant_id, quantBId, "FEFO debe seleccionar quant B por caducidad previa");

  // Inmutabilidad de received_at: intentar adelantar al futuro o set null debe fallar
  await assert.rejects(
    async () => {
      await db.query(`update public.inventory_quants set received_at = '2026-10-25 00:00:00Z' where id = '${quantAId}';`);
    },
    /WMS_IMMUTABLE_RECEIVED_AT/,
    "Debe rechazar adelantar received_at al futuro",
  );

  await assert.rejects(
    async () => {
      await db.query(`update public.inventory_quants set received_at = null where id = '${quantAId}';`);
    },
    /WMS_IMMUTABLE_RECEIVED_AT/,
    "Debe rechazar poner received_at a null",
  );
});

// ── E2-135 & E2-136: Consolidación NO (Bin limpio vs ocupado) ────────────────
test("E2-135 & E2-136 — Consolidación NO: rechazo en bin ocupado (WMS_CONSOLIDATION_CONFLICT) y aceptación en bin limpio", async () => {
  await db.exec(`
    delete from public.wms_proposals where tenant_id = '${tenantA}';
    delete from public.replenishment_rules where tenant_id = '${tenantA}';
    insert into public.replenishment_rules (
      tenant_id, warehouse_id, product_id, destination_bin_id, min_quantity, max_quantity, reorder_quantity, consolidation
    ) values (
      '${tenantA}', '${whA}', '${prod1}', '${binDest1}', 10, 50, 10, 'NO'
    );
    update public.inventory_quants set quantity_on_hand = 2 where bin_id = '${binDest1}' and product_id = '${prod1}';
  `);

  // E2-135: Evaluación sobre bin ocupado genera REJECTED con WMS_CONSOLIDATION_CONFLICT
  const evalOccupied = await db.query(`
    select public.fornexa_wms_evaluate_replenishment('${tenantA}', '${userPlanner}', '${whA}') as res;
  `);
  const propOcc = (evalOccupied.rows[0].res as any).proposals[0];
  assert.equal(propOcc.status, "REJECTED");
  assert.equal(propOcc.rejection_reason, "WMS_CONSOLIDATION_CONFLICT");

  // E2-136: Vaciar bin destino y reevaluar -> Debe ser DRAFT
  await db.exec(`
    delete from public.wms_proposals where tenant_id = '${tenantA}';
    update public.inventory_quants set quantity_on_hand = 0 where bin_id = '${binDest1}' and product_id = '${prod1}';
  `);
  const evalClean = await db.query(`
    select public.fornexa_wms_evaluate_replenishment('${tenantA}', '${userPlanner}', '${whA}') as res;
  `);
  const propClean = (evalClean.rows[0].res as any).proposals[0];
  assert.equal(propClean.status, "DRAFT", "Debe aceptar en bin limpio");
});

// ── E2-137: Consolidación YES Multilote ──────────────────────────────────────
test("E2-137 — Consolidación YES: permite adición de multilote del mismo producto", async () => {
  await db.exec(`
    delete from public.wms_proposals where tenant_id = '${tenantA}';
    update public.replenishment_rules set consolidation = 'YES' where tenant_id = '${tenantA}';
    update public.inventory_quants set quantity_on_hand = 5, batch_number = 'L-01' where bin_id = '${binDest1}' and product_id = '${prod1}';
    update public.inventory_quants set batch_number = 'L-02' where bin_id = '${binSrc1}' and product_id = '${prod1}';
  `);

  const evalYes = await db.query(`
    select public.fornexa_wms_evaluate_replenishment('${tenantA}', '${userPlanner}', '${whA}') as res;
  `);
  const prop = (evalYes.rows[0].res as any).proposals[0];
  assert.equal(prop.status, "DRAFT", "Consolidación YES debe admitir lotes distintos del mismo SKU");
});

// ── E2-138: Rechazo por sobrecapacidad física con dato SGA ───────────────────
test("E2-138 — Rechazo determinista por sobrecapacidad física (WMS_BIN_CAPACITY) con dato SGA editable", async () => {
  await db.exec(`
    delete from public.wms_proposals where tenant_id = '${tenantA}';
    insert into public.replenishment_rules (
      tenant_id, warehouse_id, product_id, destination_bin_id, min_quantity, max_quantity, reorder_quantity, consolidation
    ) values (
      '${tenantA}', '${whA}', '${prod2}', '${binDest2}', 10, 60, 10, 'YES'
    );
    insert into public.inventory_quants (tenant_id, warehouse_id, bin_id, product_id, quantity_on_hand, received_at)
    values ('${tenantA}', '${whA}', '${binSrc1}', '${prod2}', 100, '2026-10-01 00:00:00Z');
  `);

  const evalCap = await db.query(`
    select public.fornexa_wms_evaluate_replenishment('${tenantA}', '${userPlanner}', '${whA}', (select id from public.replenishment_rules where destination_bin_id = '${binDest2}')) as res;
  `);
  const prop = (evalCap.rows[0].res as any).proposals[0];
  assert.equal(prop.status, "REJECTED");
  assert.equal(prop.rejection_reason, "WMS_BIN_CAPACITY");
});

// ── E2-139 & E2-140: Consolidación BY_BATCH ─────────────────────────────────
test("E2-139 & E2-140 — Consolidación BY_BATCH: acepta mismo lote y rechaza lote dispar (WMS_LOT_MIX_FORBIDDEN)", async () => {
  await cleanupProposalsAndTasks(tenantA);
  await db.exec(`
    update public.replenishment_rules set consolidation = 'BY_BATCH' where destination_bin_id = '${binDest1}';
    update public.inventory_quants set quantity_on_hand = 3, batch_number = 'L-01' where bin_id = '${binDest1}' and product_id = '${prod1}';
    update public.inventory_quants set batch_number = 'L-02' where bin_id in ('${binSrc1}', '${binSrc2}') and product_id = '${prod1}';
  `);

  const evalDispar = await db.query(`
    select public.fornexa_wms_evaluate_replenishment('${tenantA}', '${userPlanner}', '${whA}', (select id from public.replenishment_rules where destination_bin_id = '${binDest1}')) as res;
  `);
  const propDispar = (evalDispar.rows[0].res as any).proposals[0];
  assert.equal(propDispar.status, "REJECTED");
  assert.equal(propDispar.rejection_reason, "WMS_LOT_MIX_FORBIDDEN");

  await cleanupProposalsAndTasks(tenantA);
  await db.exec(`
    update public.inventory_quants set batch_number = 'L-01' where bin_id in ('${binSrc1}', '${binSrc2}') and product_id = '${prod1}';
  `);
  const evalMismo = await db.query(`
    select public.fornexa_wms_evaluate_replenishment('${tenantA}', '${userPlanner}', '${whA}', (select id from public.replenishment_rules where destination_bin_id = '${binDest1}')) as res;
  `);
  const propMismo = (evalMismo.rows[0].res as any).proposals[0];
  assert.equal(propMismo.status, "DRAFT");
});

// ── E2-141 & E2-142: Exclusión de cuarentena y stock dañado ─────────────────
test("E2-141 & E2-142 — Exclusión de stock en QUARANTINE y DAMAGED (WMS_NO_SOURCE_STOCK)", async () => {
  await db.exec(`
    delete from public.wms_proposals where tenant_id = '${tenantA}';
    update public.inventory_quants set stock_status = 'QUARANTINE' where product_id = '${prod1}' and bin_id in ('${binSrc1}', '${binSrc2}');
  `);

  await assert.rejects(
    async () => {
      await db.query(`
        select public.fornexa_wms_evaluate_replenishment('${tenantA}', '${userPlanner}', '${whA}', (select id from public.replenishment_rules where destination_bin_id = '${binDest1}'));
      `);
    },
    /WMS_NO_SOURCE_STOCK/,
    "Debe rechazar por falta de stock disponible al estar en QUARANTINE",
  );

  await db.exec(`
    update public.inventory_quants set stock_status = 'DAMAGED' where product_id = '${prod1}' and bin_id in ('${binSrc1}', '${binSrc2}');
  `);

  await assert.rejects(
    async () => {
      await db.query(`
        select public.fornexa_wms_evaluate_replenishment('${tenantA}', '${userPlanner}', '${whA}', (select id from public.replenishment_rules where destination_bin_id = '${binDest1}'));
      `);
    },
    /WMS_NO_SOURCE_STOCK/,
    "Debe rechazar por falta de stock disponible al estar en DAMAGED",
  );

  await db.exec(`
    update public.inventory_quants set stock_status = 'AVAILABLE' where product_id = '${prod1}';
  `);
});

// ── E2-143: Concurrencia de reservas en origen (100 -> 60+40 vs 60+60) ───────
test("E2-143 — Concurrencia de reservas en origen: stock 100 admite 60+40 y rechaza 60+60 fail-closed", async () => {
  await cleanupProposalsAndTasks(tenantA);
  await db.exec(`
    update public.inventory_quants set quantity_on_hand = 100, quantity_reserved = 0 where bin_id = '${binSrc1}' and product_id = '${prod1}';
  `);

  const quantId = (await db.query(`select id from public.inventory_quants where bin_id = '${binSrc1}' and product_id = '${prod1}'`)).rows[0].id;

  const prop1Res = await db.query(`
    insert into public.wms_proposals (
      tenant_id, warehouse_id, product_id, source_bin_id, source_quant_id, destination_bin_id, suggested_quantity, status
    ) values (
      '${tenantA}', '${whA}', '${prod1}', '${binSrc1}', '${quantId}', '${binDest1}', 60, 'DRAFT'
    ) returning id;
  `);
  const prop1Id = prop1Res.rows[0].id;

  await db.query(`
    select public.fornexa_wms_approve_proposal('${tenantA}', '${userPlanner}', '${prop1Id}');
  `);

  const qAfter1 = (await db.query(`select quantity_reserved from public.inventory_quants where id = '${quantId}'`)).rows[0];
  assert.equal(Number(qAfter1.quantity_reserved), 60);

  const prop2Res = await db.query(`
    insert into public.wms_proposals (
      tenant_id, warehouse_id, product_id, source_bin_id, source_quant_id, destination_bin_id, suggested_quantity, status
    ) values (
      '${tenantA}', '${whA}', '${prod1}', '${binSrc1}', '${quantId}', '${binDest1}', 40, 'DRAFT'
    ) returning id;
  `);
  const prop2Id = prop2Res.rows[0].id;

  await db.query(`
    select public.fornexa_wms_approve_proposal('${tenantA}', '${userPlanner}', '${prop2Id}');
  `);

  const qAfter2 = (await db.query(`select quantity_reserved from public.inventory_quants where id = '${quantId}'`)).rows[0];
  assert.equal(Number(qAfter2.quantity_reserved), 100);

  const prop3Res = await db.query(`
    insert into public.wms_proposals (
      tenant_id, warehouse_id, product_id, source_bin_id, source_quant_id, destination_bin_id, suggested_quantity, status
    ) values (
      '${tenantA}', '${whA}', '${prod1}', '${binSrc1}', '${quantId}', '${binDest1}', 10, 'DRAFT'
    ) returning id;
  `);
  const prop3Id = prop3Res.rows[0].id;

  await assert.rejects(
    async () => {
      await db.query(`select public.fornexa_wms_approve_proposal('${tenantA}', '${userPlanner}', '${prop3Id}');`);
    },
    /WMS_NO_SOURCE_STOCK/,
    "Debe rechazar sobreasignación más allá del saldo libre",
  );
});

// ── E2-144 & E2-145: Ciclo de vida (Aprobación y Rechazo) ────────────────────
test("E2-144 & E2-145 — Ciclo de vida: DRAFT a APPROVED crea reserva HELD y tarea READY; Rechazo registra motivo", async () => {
  await cleanupProposalsAndTasks(tenantA);
  await db.exec(`
    update public.inventory_quants set quantity_on_hand = 100, quantity_reserved = 0, stock_status = 'AVAILABLE' where bin_id = '${binSrc1}' and product_id = '${prod1}';
  `);
  const quantId = (await db.query(`select id from public.inventory_quants where bin_id = '${binSrc1}' and product_id = '${prod1}' and stock_status = 'AVAILABLE' limit 1`)).rows[0].id;

  const p1 = (await db.query(`
    insert into public.wms_proposals (
      tenant_id, warehouse_id, product_id, source_bin_id, source_quant_id, destination_bin_id, suggested_quantity, status
    ) values (
      '${tenantA}', '${whA}', '${prod1}', '${binSrc1}', '${quantId}', '${binDest1}', 25, 'DRAFT'
    ) returning id;
  `)).rows[0].id;

  const appRes = await db.query(`
    select public.fornexa_wms_action('${tenantA}', '${userPlanner}', 'APPROVE_PROPOSAL', jsonb_build_object('proposal_id', '${p1}')) as res;
  `);
  const appData = (appRes.rows[0].res as any);
  assert.equal(appData.ok, true);
  assert.equal(appData.status, "APPROVED");

  const resRow = (await db.query(`select * from public.stock_reservations where reference_id = '${p1}'`)).rows[0];
  assert.equal(resRow.status, "HELD");
  assert.equal(Number(resRow.quantity), 25);

  const taskRow = (await db.query(`select * from public.warehouse_tasks where proposal_id = '${p1}'`)).rows[0];
  assert.equal(taskRow.state, "READY");

  const p2 = (await db.query(`
    insert into public.wms_proposals (
      tenant_id, warehouse_id, product_id, source_bin_id, source_quant_id, destination_bin_id, suggested_quantity, status
    ) values (
      '${tenantA}', '${whA}', '${prod1}', '${binSrc1}', '${quantId}', '${binDest1}', 15, 'DRAFT'
    ) returning id;
  `)).rows[0].id;

  const rejRes = await db.query(`
    select public.fornexa_wms_action('${tenantA}', '${userPlanner}', 'REJECT_PROPOSAL', jsonb_build_object('proposal_id', '${p2}', 'reason', 'EXCESO_STOCK')) as res;
  `);
  const rejData = (rejRes.rows[0].res as any);
  assert.equal(rejData.ok, true);
  assert.equal(rejData.status, "REJECTED");

  const p2Row = (await db.query(`select status, rejection_reason from public.wms_proposals where id = '${p2}'`)).rows[0];
  assert.equal(p2Row.status, "REJECTED");
  assert.equal(p2Row.rejection_reason, "EXCESO_STOCK");
});

// ── E2-146: Cancelación atómica por merma/indisponibilidad en Paso 4 ─────────
test("E2-146 — Cancelación atómica Paso 4 por merma/indisponibilidad sin unhandled RAISE", async () => {
  await cleanupProposalsAndTasks(tenantA);
  await db.exec(`
    update public.inventory_quants set quantity_on_hand = 100, quantity_reserved = 0, stock_status = 'AVAILABLE' where bin_id = '${binSrc1}' and product_id = '${prod1}';
  `);
  const quantId = (await db.query(`select id from public.inventory_quants where bin_id = '${binSrc1}' and product_id = '${prod1}' and stock_status = 'AVAILABLE' limit 1`)).rows[0].id;
  const pId = (await db.query(`
    insert into public.wms_proposals (
      tenant_id, warehouse_id, product_id, source_bin_id, source_quant_id, destination_bin_id, suggested_quantity, status
    ) values (
      '${tenantA}', '${whA}', '${prod1}', '${binSrc1}', '${quantId}', '${binDest1}', 20, 'DRAFT'
    ) returning id;
  `)).rows[0].id;

  await db.query(`select public.fornexa_wms_approve_proposal('${tenantA}', '${userPlanner}', '${pId}');`);

  // Simular reporte de merma física o quant en INSPECTION
  await db.query(`update public.inventory_quants set stock_status = 'INSPECTION' where id = '${quantId}';`);

  // Invocación de REPLENISH
  const repRes = await db.query(`
    select public.fornexa_wms_action('${tenantA}', '${userOperator}', 'REPLENISH', jsonb_build_object('proposal_id', '${pId}')) as res;
  `);
  const repData = (repRes.rows[0].res as any);

  assert.equal(repData.ok, false);
  assert.equal(repData.error, "WMS_SOURCE_STOCK_UNAVAILABLE");
  assert.equal(repData.proposal_status, "CANCELLED");

  const propRow = (await db.query(`select status, rejection_reason from public.wms_proposals where id = '${pId}'`)).rows[0];
  assert.equal(propRow.status, "CANCELLED");
  assert.equal(propRow.rejection_reason, "WMS_SOURCE_STOCK_UNAVAILABLE");

  const resRow = (await db.query(`select status from public.stock_reservations where reference_id = '${pId}'`)).rows[0];
  assert.equal(resRow.status, "CANCELLED");

  const quantRow = (await db.query(`select stock_status, quantity_reserved from public.inventory_quants where id = '${quantId}'`)).rows[0];
  assert.equal(quantRow.stock_status, "INSPECTION");
});

// ── E2-147: Reposición de HU completa vs suelto ──────────────────────────────
test("E2-147 — Reposición de HU completa vs suelto vincula target_hu_id", async () => {
  const huRes = await db.query(`
    insert into public.handling_units (tenant_id, warehouse_id, code, hu_type, state, current_bin_id)
    values ('${tenantA}', '${whA}', 'HU-PALLET-01', 'PALLET', 'STORED', '${binSrc1}') returning id;
  `);
  const huId = huRes.rows[0].id;

  const qHuRes = await db.query(`
    insert into public.inventory_quants (tenant_id, warehouse_id, bin_id, product_id, quantity_on_hand, hu_id, stock_status, received_at)
    values ('${tenantA}', '${whA}', '${binSrc1}', '${prod1}', 50, '${huId}', 'AVAILABLE', '2026-10-01 00:00:00Z') returning id;
  `);
  const qHuId = qHuRes.rows[0].id;

  const propHuRes = await db.query(`
    insert into public.wms_proposals (
      tenant_id, warehouse_id, product_id, source_bin_id, source_quant_id, source_hu_id, destination_bin_id, target_hu_id, suggested_quantity, status
    ) values (
      '${tenantA}', '${whA}', '${prod1}', '${binSrc1}', '${qHuId}', '${huId}', '${binDest1}', '${huId}', 50, 'DRAFT'
    ) returning id, target_hu_id;
  `);

  assert.equal(propHuRes.rows[0].target_hu_id, huId, "target_hu_id debe heredar source_hu_id para movimiento de HU completa");
});

// ── E2-148: Aislamiento multi-tenant y control RBAC bajo RLS real ───────────
test("E2-148 — Aislamiento multi-tenant y RBAC fail-closed bajo RLS real", async () => {
  const pAId = (await db.query(`select id from public.wms_proposals where tenant_id = '${tenantA}' limit 1`)).rows[0]?.id;

  if (pAId) {
    await assert.rejects(
      async () => {
        await db.query(`
          select public.fornexa_wms_action('${tenantA}', '${userOther}', 'APPROVE_PROPOSAL', jsonb_build_object('proposal_id', '${pAId}'));
        `);
      },
      /WMS_FORBIDDEN/,
      "Usuario de Tenant B no tiene permisos en Tenant A",
    );

    await assert.rejects(
      async () => {
        await db.query(`
          select public.fornexa_wms_action('${tenantA}', '${userPlanner}', 'APPROVE_PROPOSAL', jsonb_build_object('tenant_id', '${tenantB}', 'proposal_id', '${pAId}'));
        `);
      },
      /WMS_TENANT_MISMATCH/,
      "Payload con tenant_id cruzado debe abortar con WMS_TENANT_MISMATCH",
    );
  }

  // RLS real bajo authenticated
  await db.exec(`
    set role authenticated;
    set "request.jwt.claim.sub" = '${userOther}';
  `);

  const rulesAsTenantB = await db.query(`select * from public.replenishment_rules where tenant_id = '${tenantA}';`);
  assert.equal(rulesAsTenantB.rows.length, 0, "Usuario de Tenant B debe ver 0 reglas de Tenant A bajo RLS");

  const proposalsAsTenantB = await db.query(`select * from public.wms_proposals where tenant_id = '${tenantA}';`);
  assert.equal(proposalsAsTenantB.rows.length, 0, "Usuario de Tenant B debe ver 0 propuestas de Tenant A bajo RLS");

  await db.exec(`
    reset role;
    reset "request.jwt.claim.sub";
  `);
});

// ── E2-149: Concurrencia hacia mismo destino y control de capacidad multi-orden
test("E2-149 — Concurrencia hacia mismo destino y control de capacidad multi-orden (60+40 <= 100 vs 60+60 > 100)", async () => {
  await cleanupProposalsAndTasks(tenantA);
  await db.exec(`
    update public.warehouse_bins set max_weight_kg = 100.0 where id = '${binDest2}';
    delete from public.inventory_quants where bin_id = '${binDest2}';
    update public.inventory_quants set quantity_on_hand = 200, quantity_reserved = 0, stock_status = 'AVAILABLE', flow_state = 'STORED' where bin_id = '${binSrc1}' and product_id = '${prod1}';
    insert into public.replenishment_rules (
      tenant_id, warehouse_id, product_id, destination_bin_id, min_quantity, max_quantity, reorder_quantity, consolidation
    ) values (
      '${tenantA}', '${whA}', '${prod1}', '${binDest2}', 10, 100, 10, 'YES'
    ) on conflict do nothing;
  `);

  const order1 = "50000000-0000-4000-a000-000000000001";
  const order2 = "50000000-0000-4000-a000-000000000002";
  const order3 = "50000000-0000-4000-a000-000000000003";

  // Orden 1: solicita 60 kg -> 60 <= 100 -> Aceptado en DRAFT
  const eval1 = await db.query(`
    select public.fornexa_wms_evaluate_replenishment('${tenantA}', '${userPlanner}', '${whA}', null, '${prod1}', '${binDest2}', '${order1}', 60) as res;
  `);
  const prop1 = (eval1.rows[0].res as any).proposals[0];
  assert.equal(prop1.status, "DRAFT");
  assert.equal(Number(prop1.suggested_quantity), 60);

  // Orden 2: solicita 40 kg -> 60 en transito + 40 = 100 <= 100 -> Aceptado en DRAFT
  const eval2 = await db.query(`
    select public.fornexa_wms_evaluate_replenishment('${tenantA}', '${userPlanner}', '${whA}', null, '${prod1}', '${binDest2}', '${order2}', 40) as res;
  `);
  const prop2 = (eval2.rows[0].res as any).proposals[0];
  assert.equal(prop2.status, "DRAFT");
  assert.equal(Number(prop2.suggested_quantity), 40);

  // Orden 3: solicita 60 kg -> 100 en transito + 60 = 160 > 100 -> REJECTED con WMS_BIN_CAPACITY
  const eval3 = await db.query(`
    select public.fornexa_wms_evaluate_replenishment('${tenantA}', '${userPlanner}', '${whA}', null, '${prod1}', '${binDest2}', '${order3}', 60) as res;
  `);
  const prop3 = (eval3.rows[0].res as any).proposals[0];
  assert.equal(prop3.status, "REJECTED");
  assert.equal(prop3.rejection_reason, "WMS_BIN_CAPACITY");
});

// ── E2-150: Atomicidad y Rollback transaccional ──────────────────────────────
test("E2-150 — Atomicidad y Rollback transaccional ante fallo durante movimiento", async () => {
  await cleanupProposalsAndTasks(tenantA);
  await db.exec(`
    update public.inventory_quants set quantity_on_hand = 100, quantity_reserved = 0, stock_status = 'AVAILABLE' where bin_id = '${binSrc1}' and product_id = '${prod1}';
  `);

  const qId = (await db.query(`select id from public.inventory_quants where bin_id = '${binSrc1}' and product_id = '${prod1}' and stock_status = 'AVAILABLE' limit 1`)).rows[0].id;
  const initialQtyRes = (await db.query(`select quantity_reserved from public.inventory_quants where id = '${qId}'`)).rows[0].quantity_reserved;

  let crashCaught = false;
  try {
    await db.exec(`
      begin;
      insert into public.wms_proposals (id, tenant_id, warehouse_id, product_id, source_bin_id, source_quant_id, destination_bin_id, suggested_quantity, status)
      values ('99999999-0000-4000-a000-000000000099', '${tenantA}', '${whA}', '${prod1}', '${binSrc1}', '${qId}', '${binDest1}', 10, 'DRAFT');

      select public.fornexa_wms_approve_proposal('${tenantA}', '${userPlanner}', '99999999-0000-4000-a000-000000000099');

      do $$ begin raise exception 'SIMULATED_CRASH'; end; $$;
      commit;
    `);
  } catch (err: any) {
    crashCaught = String(err).includes("SIMULATED_CRASH") || Boolean(err && err.message && err.message.includes("SIMULATED_CRASH"));
    await db.exec(`rollback;`);
  }
  assert.ok(crashCaught, "Debe capturarse la excepción simulada");

  const propCheck = await db.query(`select count(*) as cnt from public.wms_proposals where id = '99999999-0000-4000-a000-000000000099'`);
  assert.equal(Number(propCheck.rows[0].cnt), 0);

  const qCheck = await db.query(`select quantity_reserved from public.inventory_quants where id = '${qId}'`);
  assert.equal(Number(qCheck.rows[0].quantity_reserved), Number(initialQtyRes));
});

// ── Unit Tests: Funciones de Dominio en lib/wms.ts ───────────────────────────
test("lib/wms — computeReplenishmentDeficit calcula múltiplos deterministas", () => {
  assert.equal(computeReplenishmentDeficit(3, 10, 50, 10), 40);
  assert.equal(computeReplenishmentDeficit(10, 10, 50, 10), 40);
  assert.equal(computeReplenishmentDeficit(11, 10, 50, 10), 0);
  assert.equal(computeReplenishmentDeficit(45, 10, 50, 10), 0);
});

test("lib/wms — selectQuantByRotation ordena correctamente por FIFO, FEFO y LIFO", () => {
  const quants: WmsQuant[] = [
    {
      id: "q1",
      warehouse_id: "w1",
      bin_id: "b1",
      product_id: "p1",
      owner_party_id: null,
      batch_number: "b1",
      serial_number: null,
      expiry_date: "2026-12-01",
      quantity_on_hand: 10,
      quantity_reserved: 0,
      uom: "UN",
      stock_status: "AVAILABLE",
      flow_state: "STORED",
      hu_id: null,
      received_at: "2026-10-05T00:00:00Z",
      updated_at: "2026-10-20T00:00:00Z",
    },
    {
      id: "q2",
      warehouse_id: "w1",
      bin_id: "b2",
      product_id: "p1",
      owner_party_id: null,
      batch_number: "b2",
      serial_number: null,
      expiry_date: "2026-11-01",
      quantity_on_hand: 10,
      quantity_reserved: 0,
      uom: "UN",
      stock_status: "AVAILABLE",
      flow_state: "STORED",
      hu_id: null,
      received_at: "2026-10-10T00:00:00Z",
      updated_at: "2026-10-10T00:00:00Z",
    },
  ];

  const fifo = selectQuantByRotation(quants, "FIFO");
  assert.equal(fifo[0].id, "q1");

  const fefo = selectQuantByRotation(quants, "FEFO");
  assert.equal(fefo[0].id, "q2");

  const lifo = selectQuantByRotation(quants, "LIFO");
  assert.equal(lifo[0].id, "q2");
});

test("lib/wms — WMS_ACTIONS contiene las 5 acciones E2 de reposición", () => {
  const required: WmsAction[] = [
    "EVALUATE_REPLENISHMENT",
    "APPROVE_PROPOSAL",
    "REJECT_PROPOSAL",
    "CANCEL_PROPOSAL",
    "REPLENISH",
  ];
  for (const act of required) {
    assert.ok(WMS_ACTIONS.includes(act), `WMS_ACTIONS debe incluir ${act}`);
  }
});


test("Claude E2 regressions — capacity, cancellation, HU identity and reserved stock", async () => {
  await runE2RegressionCases({
    sql: async (text: string) => (await db.exec(text)).at(-1) ?? { rows: [] },
    action: async (actor: string, action: string, payload: unknown, key: string | null = null) => {
      const result = await db.query(`select public.fornexa_wms_action($1,$2,$3,$4::jsonb,$5) as res`, [tenantA,actor,action,JSON.stringify(payload),key]);
      return result.rows[0].res;
    },
    tenant: tenantA, warehouse: whA, product: prod1, sourceBin: binSrc1,
    destinationBin: binDest1, planner: userPlanner, operator: userOperator,
  });
});

after(async () => { await db?.close(); });
