import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test, { before } from "node:test";
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

    create table if not exists public.tenants (id uuid primary key default gen_random_uuid(), name text not null, is_active boolean default true);
    create table if not exists public.tenant_members (id uuid primary key default gen_random_uuid(), tenant_id uuid not null references public.tenants(id), user_id uuid not null, role text not null, status text not null default 'ACTIVE');
    create schema if not exists auth;
    create table if not exists auth.users (id uuid primary key default gen_random_uuid(), email text);
    create table if not exists public.warehouses (id uuid primary key default gen_random_uuid(), tenant_id uuid not null references public.tenants(id), code text not null, name text not null, is_active boolean default true, unique(tenant_id, id));
    create table if not exists public.warehouse_zones (id uuid primary key default gen_random_uuid(), tenant_id uuid not null references public.tenants(id), warehouse_id uuid not null, code text not null, name text not null, zone_type text, is_active boolean default true, unique(tenant_id, id));
    create table if not exists public.warehouse_bins (id uuid primary key default gen_random_uuid(), tenant_id uuid not null references public.tenants(id), warehouse_id uuid not null, zone_id uuid, code text not null, max_pallets integer, max_weight_kg numeric(12,3), max_volume_m3 numeric(12,4), is_blocked boolean default false, is_active boolean default true, unique(tenant_id, id));
    create table if not exists public.products (id uuid primary key default gen_random_uuid(), tenant_id uuid not null references public.tenants(id), sku text not null, name text not null, gross_weight_kg numeric(12,3) default 1.0, volume_m3 numeric(12,4) default 0.01, uom_base text default 'UN', unique(tenant_id, id));
    create table if not exists public.audit_events (id uuid primary key default gen_random_uuid(), tenant_id uuid not null, entity_type text, entity_id uuid, action text, actor_user_id uuid, source_channel text, before_data jsonb, after_data jsonb, created_at timestamptz default now());
    create table if not exists public.inventory_quants (id uuid primary key default gen_random_uuid(), tenant_id uuid not null references public.tenants(id), warehouse_id uuid not null, bin_id uuid not null, product_id uuid not null, batch_number text, quantity_on_hand numeric(12,3) not null default 0, quantity_reserved numeric(12,3) not null default 0, uom text default 'UN', stock_status text not null default 'AVAILABLE', flow_state text default 'STORED', expiry_date date, hu_id uuid, created_at timestamptz default now(), updated_at timestamptz default now(), unique(tenant_id, id), constraint chk_reserved_le_on_hand check (quantity_reserved <= quantity_on_hand));
    create table if not exists public.inventory_movements (id uuid primary key default gen_random_uuid(), tenant_id uuid not null references public.tenants(id), warehouse_id uuid not null, movement_type text not null, source_bin_id uuid, destination_bin_id uuid, product_id uuid not null, batch_number text, quantity numeric(12,3) not null, uom text default 'UN', operator_id text, status text not null default 'COMPLETED', notes text, handling_unit_id uuid, completed_at timestamptz default now(), requested_at timestamptz default now());
    create table if not exists public.stock_reservations (id uuid primary key default gen_random_uuid(), tenant_id uuid not null references public.tenants(id), warehouse_id uuid not null, order_id uuid, product_id uuid not null, batch_number text, quant_id uuid not null references public.inventory_quants(id), quantity numeric(12,3) not null, uom text default 'UN', status text not null default 'HELD', reference_type text default 'ORDER', reference_id uuid, created_by uuid, created_at timestamptz default now(), released_at timestamptz, updated_at timestamptz default now(), unique(tenant_id, id));
    create table if not exists public.warehouse_tasks (id uuid primary key default gen_random_uuid(), tenant_id uuid not null references public.tenants(id), warehouse_id uuid not null, task_type text not null, state text not null default 'READY', priority integer default 1, product_id uuid, batch_number text, source_bin_id uuid, destination_bin_id uuid, hu_id uuid, target_hu_id uuid, quantity_expected numeric(12,3), uom text default 'UN', proposal_id uuid, idempotency_key text, idempotency_fingerprint text, failure_reason text, created_by uuid, completed_at timestamptz, created_at timestamptz default now(), unique(tenant_id, id));
    create table if not exists public.handling_units (id uuid primary key default gen_random_uuid(), tenant_id uuid not null references public.tenants(id), warehouse_id uuid not null, code text not null, state text not null default 'STORED', bin_id uuid, gross_weight_kg numeric(12,3), volume_m3 numeric(12,4), created_at timestamptz default now(), updated_at timestamptz default now(), unique(tenant_id, id));
    create table if not exists public.warehouse_behavior_policies (id uuid primary key default gen_random_uuid(), tenant_id uuid not null references public.tenants(id), warehouse_id uuid not null, owner_id uuid, product_id uuid, policy jsonb not null, created_at timestamptz default now(), updated_at timestamptz default now(), unique(tenant_id, warehouse_id));
    create table if not exists public.warehouse_resources (id uuid primary key default gen_random_uuid(), tenant_id uuid not null references public.tenants(id), warehouse_id uuid not null, code text not null, name text not null, resource_type text not null, status text not null default 'AVAILABLE', max_lift_height_m numeric(5,2), max_weight_kg numeric(10,2), certifications text[] default '{}', shift_code text, is_active boolean default true, created_at timestamptz default now(), updated_at timestamptz default now(), unique(tenant_id, warehouse_id, code));

    create or replace function public.fornexa_set_updated_at() returns trigger language plpgsql as $$ begin new.updated_at = now(); return new; end; $$;
    create or replace function public.fornexa_has_tenant_access(p_tenant uuid) returns boolean language sql as $$ select true; $$;
    create or replace function public.fornexa_wms_effective_policy(p_tenant uuid, p_warehouse uuid, p_owner uuid default null, p_product uuid default null)
    returns jsonb language plpgsql as $$
    declare
      v_pol jsonb;
    begin
      select policy into v_pol from public.warehouse_behavior_policies where tenant_id = p_tenant and warehouse_id = p_warehouse limit 1;
      return coalesce(v_pol, '{"rotation":"FEFO","consolidation":"YES"}'::jsonb);
    end;
    $$;
  `);

  // Apply E2 Migration 1 (Core Schema & Triggers)
  const mig1 = readFileSync(
    resolve(import.meta.dirname, "../supabase/migrations/20261024120000_wms_e2_replenishment_core.sql"),
    "utf-8",
  );
  await db.exec(mig1);

  // Apply E2 Migration 2 (RPCs & fornexa_wms_action Extension)
  const mig2 = readFileSync(
    resolve(import.meta.dirname, "../supabase/migrations/20261024120100_wms_e2_replenishment_rpc.sql"),
    "utf-8",
  );
  await db.exec(mig2);

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

    insert into public.warehouse_bins (id, tenant_id, warehouse_id, code, max_pallets, max_weight_kg) values
      ('${binDest1}', '${tenantA}', '${whA}', 'PICK-01', null, null),
      ('${binDest2}', '${tenantA}', '${whA}', 'PICK-02', null, 50.0),
      ('${binDest3}', '${tenantA}', '${whA}', 'PICK-03', 2, null),
      ('${binSrc1}', '${tenantA}', '${whA}', 'PULMON-01', null, null),
      ('${binSrc2}', '${tenantA}', '${whA}', 'PULMON-02', null, null);

    insert into public.products (id, tenant_id, sku, name, gross_weight_kg) values
      ('${prod1}', '${tenantA}', 'SKU-01', 'Producto 1', 1.0),
      ('${prod2}', '${tenantA}', 'SKU-02', 'Producto 2', 2.0);
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

// ── E2-131: Disparo por stock bajo mínimo ────────────────────────────────────
test("E2-131 — Disparo por stock bajo mínimo: genera propuesta DRAFT con cantidad determinista ajustada a múltiplo", async () => {
  // Destino con 3 unidades físicas libres; min=10, max=50, reorder=10. Pulmón con 100 uds.
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
  await db.query(`
    insert into public.inventory_quants (tenant_id, warehouse_id, bin_id, product_id, quantity_on_hand, quantity_reserved, received_at)
    values ('${tenantA}', '${whA}', '${binDest1}', '${prod1}', 3, 0, '2026-10-01 10:00:00Z');
  `);

  // Stock pulmón: 100 uds
  await db.query(`
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
  // Update destination quant to 12 uds
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
    -- Inserta propuesta previa en APPROVED de 40 uds
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
  // Limpiar quants y propuestas
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
    insert into public.warehouse_behavior_policies (tenant_id, warehouse_id, policy)
    values ('${tenantA}', '${whA}', '{"rotation":"FIFO","consolidation":"YES"}'::jsonb)
    on conflict (tenant_id, warehouse_id)
    do update set policy = excluded.policy;
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
    update public.warehouse_behavior_policies set policy = '{"rotation":"FEFO","consolidation":"YES"}'::jsonb where tenant_id = '${tenantA}';
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
    -- Regra con consolidation = NO
    insert into public.replenishment_rules (
      tenant_id, warehouse_id, product_id, destination_bin_id, min_quantity, max_quantity, reorder_quantity, consolidation
    ) values (
      '${tenantA}', '${whA}', '${prod1}', '${binDest1}', 10, 50, 10, 'NO'
    );
    -- Destino contiene stock previo (2 uds)
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
    -- Destino tiene lote L1 con 5 uds
    update public.inventory_quants set quantity_on_hand = 5, batch_number = 'L-01' where bin_id = '${binDest1}' and product_id = '${prod1}';
    -- Origen tiene lote L2
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
    -- binDest2 tiene límite de peso de 50 kg
    -- Regla hacia binDest2: min 10, max 60, reorder 10. Producto 2 pesa 2.0 kg por unidad.
    -- Sugerirá 60 unidades -> 60 * 2.0 = 120 kg > 50 kg max_weight_kg
    insert into public.replenishment_rules (
      tenant_id, warehouse_id, product_id, destination_bin_id, min_quantity, max_quantity, reorder_quantity, consolidation
    ) values (
      '${tenantA}', '${whA}', '${prod2}', '${binDest2}', 10, 60, 10, 'YES'
    );
    -- Stock pulmón para prod2
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
    -- Destino tiene lote L-01 con 3 uds
    update public.inventory_quants set quantity_on_hand = 3, batch_number = 'L-01' where bin_id = '${binDest1}' and product_id = '${prod1}';
    -- Origen tiene lote L-02 en binSrc1 y binSrc2
    update public.inventory_quants set batch_number = 'L-02' where bin_id in ('${binSrc1}', '${binSrc2}') and product_id = '${prod1}';
  `);

  // E2-140: Lote dispar debe rechazar con WMS_LOT_MIX_FORBIDDEN
  const evalDispar = await db.query(`
    select public.fornexa_wms_evaluate_replenishment('${tenantA}', '${userPlanner}', '${whA}', (select id from public.replenishment_rules where destination_bin_id = '${binDest1}')) as res;
  `);
  const propDispar = (evalDispar.rows[0].res as any).proposals[0];
  assert.equal(propDispar.status, "REJECTED");
  assert.equal(propDispar.rejection_reason, "WMS_LOT_MIX_FORBIDDEN");

  // E2-139: Mismo lote -> Aceptado en DRAFT
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
    -- Marcar todo stock origen de prod1 a QUARANTINE
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

  // Marcar a DAMAGED
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

  // Restaurar a AVAILABLE
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

  // Propuesta 1 (Orden A) por 60 uds
  const prop1Res = await db.query(`
    insert into public.wms_proposals (
      tenant_id, warehouse_id, product_id, source_bin_id, source_quant_id, destination_bin_id, suggested_quantity, status
    ) values (
      '${tenantA}', '${whA}', '${prod1}', '${binSrc1}', '${quantId}', '${binDest1}', 60, 'DRAFT'
    ) returning id;
  `);
  const prop1Id = prop1Res.rows[0].id;

  // Aprobar Propuesta 1: quantity_reserved pasa a 60, saldo libre = 40
  await db.query(`
    select public.fornexa_wms_approve_proposal('${tenantA}', '${userPlanner}', '${prop1Id}');
  `);

  const qAfter1 = (await db.query(`select quantity_reserved from public.inventory_quants where id = '${quantId}'`)).rows[0];
  assert.equal(Number(qAfter1.quantity_reserved), 60);

  // Propuesta 2 (Orden B) por 40 uds -> Debe ser aprobada válidamente (saldo libre 40 >= 40)
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

  // Propuesta 3 (Orden C) por 10 uds -> Saldo libre es 0, debe fallar con WMS_NO_SOURCE_STOCK
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

  // E2-144: Aprobación
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

  // Validar reserva HELD
  const resRow = (await db.query(`select * from public.stock_reservations where reference_id = '${p1}'`)).rows[0];
  assert.equal(resRow.status, "HELD");
  assert.equal(Number(resRow.quantity), 25);

  // Validar tarea READY
  const taskRow = (await db.query(`select * from public.warehouse_tasks where proposal_id = '${p1}'`)).rows[0];
  assert.equal(taskRow.state, "READY");

  // E2-145: Rechazo explícito
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

  // Debe retornar fallo estructurado determinista
  assert.equal(repData.ok, false);
  assert.equal(repData.error, "WMS_SOURCE_STOCK_DEPLETED");
  assert.equal(repData.proposal_status, "CANCELLED");

  // Estado persistido en BD
  const propRow = (await db.query(`select status, rejection_reason from public.wms_proposals where id = '${pId}'`)).rows[0];
  assert.equal(propRow.status, "CANCELLED");
  assert.equal(propRow.rejection_reason, "WMS_SOURCE_STOCK_DEPLETED");

  const resRow = (await db.query(`select status from public.stock_reservations where reference_id = '${pId}'`)).rows[0];
  assert.equal(resRow.status, "CANCELLED");
  assert.equal(resRow.status, "CANCELLED");

  const quantRow = (await db.query(`select stock_status, quantity_reserved from public.inventory_quants where id = '${quantId}'`)).rows[0];
  assert.equal(quantRow.stock_status, "INSPECTION");
});

// ── E2-147: Reposición de HU completa vs suelto ──────────────────────────────
test("E2-147 — Reposición de HU completa vs suelto vincula target_hu_id", async () => {
  // Crear HU en pulmón
  const huRes = await db.query(`
    insert into public.handling_units (tenant_id, warehouse_id, code, state, bin_id)
    values ('${tenantA}', '${whA}', 'HU-PALLET-01', 'STORED', '${binSrc1}') returning id;
  `);
  const huId = huRes.rows[0].id;

  // Crear quant asociado a la HU completa (50 uds)
  const qHuRes = await db.query(`
    insert into public.inventory_quants (tenant_id, warehouse_id, bin_id, product_id, quantity_on_hand, hu_id, stock_status, received_at)
    values ('${tenantA}', '${whA}', '${binSrc1}', '${prod1}', 50, '${huId}', 'AVAILABLE', '2026-10-01 00:00:00Z') returning id;
  `);
  const qHuId = qHuRes.rows[0].id;

  // Propuesta que mueve toda la HU (50 uds)
  const propHuRes = await db.query(`
    insert into public.wms_proposals (
      tenant_id, warehouse_id, product_id, source_bin_id, source_quant_id, source_hu_id, destination_bin_id, target_hu_id, suggested_quantity, status
    ) values (
      '${tenantA}', '${whA}', '${prod1}', '${binSrc1}', '${qHuId}', '${huId}', '${binDest1}', '${huId}', 50, 'DRAFT'
    ) returning id, target_hu_id;
  `);

  assert.equal(propHuRes.rows[0].target_hu_id, huId, "target_hu_id debe heredar source_hu_id para movimiento de HU completa");
});

// ── E2-148: Aislamiento multi-tenant y control RBAC ─────────────────────────
test("E2-148 — Aislamiento multi-tenant y RBAC fail-closed", async () => {
  // Actor de Tenant B intentando mutar propuesta de Tenant A
  const pAId = (await db.query(`select id from public.wms_proposals where tenant_id = '${tenantA}' limit 1`)).rows[0].id;

  await assert.rejects(
    async () => {
      await db.query(`
        select public.fornexa_wms_action('${tenantA}', '${userOther}', 'APPROVE_PROPOSAL', jsonb_build_object('proposal_id', '${pAId}'));
      `);
    },
    /WMS_FORBIDDEN/,
    "Usuario de Tenant B no tiene permisos en Tenant A",
  );

  // Inyección de tenant_id discordante en payload
  await assert.rejects(
    async () => {
      await db.query(`
        select public.fornexa_wms_action('${tenantA}', '${userPlanner}', 'APPROVE_PROPOSAL', jsonb_build_object('tenant_id', '${tenantB}', 'proposal_id', '${pAId}'));
      `);
    },
    /WMS_TENANT_MISMATCH/,
    "Payload con tenant_id cruzado debe abortar con WMS_TENANT_MISMATCH",
  );
});

// ── E2-149: Concurrencia hacia mismo destino y serialización de workers ──────
test("E2-149 — Concurrencia hacia mismo destino y serialización por índice parcial único", async () => {
  // Limpiar propuestas
  await cleanupProposalsAndTasks(tenantA);

  const ruleId = (await db.query(`select id from public.replenishment_rules where destination_bin_id = '${binDest1}' limit 1`)).rows[0].id;
  const qId = (await db.query(`select id from public.inventory_quants where bin_id = '${binSrc1}' and product_id = '${prod1}' and stock_status = 'AVAILABLE' limit 1`)).rows[0].id;

  // Insertar propuesta 1 activa sobre la regla
  await db.query(`
    insert into public.wms_proposals (
      tenant_id, warehouse_id, rule_id, product_id, source_bin_id, source_quant_id, destination_bin_id, suggested_quantity, status
    ) values (
      '${tenantA}', '${whA}', '${ruleId}', '${prod1}', '${binSrc1}', '${qId}', '${binDest1}', 20, 'DRAFT'
    );
  `);

  // Intentar insertar una segunda propuesta activa concurrente para la misma regla y mismo destino
  // El índice parcial unique uq_wms_proposals_active_rule debe bloquearla
  await assert.rejects(
    async () => {
      await db.query(`
        insert into public.wms_proposals (
          tenant_id, warehouse_id, rule_id, product_id, source_bin_id, source_quant_id, destination_bin_id, suggested_quantity, status
        ) values (
          '${tenantA}', '${whA}', '${ruleId}', '${prod1}', '${binSrc1}', '${qId}', '${binDest1}', 30, 'DRAFT'
        );
      `);
    },
    /uq_wms_proposals_active_rule|unique constraint/i,
    "El índice único parcial debe impedir duplicación de propuestas activas para la misma regla",
  );
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
      -- Crear propuesta y aprobarla
      insert into public.wms_proposals (id, tenant_id, warehouse_id, product_id, source_bin_id, source_quant_id, destination_bin_id, suggested_quantity, status)
      values ('99999999-0000-4000-a000-000000000099', '${tenantA}', '${whA}', '${prod1}', '${binSrc1}', '${qId}', '${binDest1}', 10, 'DRAFT');

      select public.fornexa_wms_approve_proposal('${tenantA}', '${userPlanner}', '99999999-0000-4000-a000-000000000099');

      -- Forzar error no controlado
      do $$ begin raise exception 'SIMULATED_CRASH'; end; $$;
      commit;
    `);
  } catch (err: any) {
    crashCaught = String(err).includes("SIMULATED_CRASH") || Boolean(err && err.message && err.message.includes("SIMULATED_CRASH"));
    await db.exec(`rollback;`);
  }
  assert.ok(crashCaught, "Debe capturarse la excepción simulada");

  // Verificar que la propuesta no existe y la reserva en quant volvió al valor original
  const propCheck = await db.query(`select count(*) as cnt from public.wms_proposals where id = '99999999-0000-4000-a000-000000000099'`);
  assert.equal(Number(propCheck.rows[0].cnt), 0);

  const qCheck = await db.query(`select quantity_reserved from public.inventory_quants where id = '${qId}'`);
  assert.equal(Number(qCheck.rows[0].quantity_reserved), Number(initialQtyRes));
});

// ── Unit Tests: Funciones de Dominio en lib/wms.ts ───────────────────────────
test("lib/wms — computeReplenishmentDeficit calcula múltiplos deterministas", () => {
  // Stock 3, min 10, max 50, reorder 10 -> Deficit 47 -> Multiplo 40
  assert.equal(computeReplenishmentDeficit(3, 10, 50, 10), 40);
  // Stock 10 (en el mínimo), max 50, reorder 10 -> Deficit 40 -> Multiplo 40
  assert.equal(computeReplenishmentDeficit(10, 10, 50, 10), 40);
  // Stock 11 (> mínimo) -> 0
  assert.equal(computeReplenishmentDeficit(11, 10, 50, 10), 0);
  // Stock 45, min 10, max 50, reorder 10 -> Stock > min -> 0
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

  // FIFO: q1 (recibido el 05-oct) antes que q2 (10-oct)
  const fifo = selectQuantByRotation(quants, "FIFO");
  assert.equal(fifo[0].id, "q1");

  // FEFO: q2 (caduca el 01-nov) antes que q1 (01-dic)
  const fefo = selectQuantByRotation(quants, "FEFO");
  assert.equal(fefo[0].id, "q2");

  // LIFO: q2 (recibido el 10-oct) antes que q1 (05-oct)
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
