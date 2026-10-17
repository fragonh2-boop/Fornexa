#!/usr/bin/env node
/**
 * FORNEXA — WMS E1 Transactional Rehearsal Runner (BEGIN ... ROLLBACK ONLY)
 * TASK_ID: WMS-RESEARCH-20261017 · Fase 3 (E1 — Núcleo operable)
 *
 * Guarantees:
 * 1. Enforces assertSessionModeEndpoint (:5432, rejects :6543).
 * 2. Strictly executes inside BEGIN ... ROLLBACK — zero committed writes to production.
 * 3. Verifies 0 duplicate (tenant_id, id) pairs across all 9 parent tables in live DB.
 * 4. Rehearses 20261017110000_wms_e1_core.sql + fornexa_wms_effective_policy + fornexa_wms_action.
 * 5. Exercises all 30 canonical WMS_* codes from §3.1 + REJ-03 on live DATA150 flow_state IS NULL + MUST-D1 privileges.
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { expectRpcError } from "./rehearsal-guard.ts";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import assert from "node:assert/strict";
import { assertSessionModeEndpoint } from "../muelles/seed-guard.ts";

const require = createRequire(import.meta.url);

function loadPg(): { Client: new (config: unknown) => any } {
  try {
    return require("pg");
  } catch {
    const override = process.env.FORNEXA_PG_MODULE;
    if (override) return require(override);
    throw new Error("Missing 'pg' module.");
  }
}

const { Client } = loadPg();
const TENANT_ID = "00000000-0000-4000-8000-000000000001";
// Tenant que no existe: si la función devolviera su política en vez de los defaults, sería fuga.
const OTHER_TENANT_ID = "00000000-0000-4000-8000-0000000000ff";

function resolveConnectionString(): string {
  if (process.env.POSTGRES_URL_NON_POOLING) {
    return process.env.POSTGRES_URL_NON_POOLING.trim();
  }
  const candidateFiles = [
    resolve(process.cwd(), ".env.production.local"),
    resolve(process.cwd(), ".env.local"),
  ];
  for (const envFile of candidateFiles) {
    if (existsSync(envFile)) {
      const content = readFileSync(envFile, "utf-8");
      for (const line of content.split("\n")) {
        const trimmed = line.trim();
        if (trimmed.startsWith("POSTGRES_URL_NON_POOLING=")) {
          let val = trimmed.slice("POSTGRES_URL_NON_POOLING=".length).trim();
          if (
            (val.startsWith('"') && val.endsWith('"')) ||
            (val.startsWith("'") && val.endsWith("'"))
          ) {
            val = val.slice(1, -1);
          }
          if (val) return val;
        }
      }
    }
  }
  throw new Error("Missing POSTGRES_URL_NON_POOLING in environment or .env.production.local");
}

function sha256File(filePath: string): string {
  return createHash("sha256").update(readFileSync(filePath)).digest("hex");
}



async function main() {
  const migrationPath = resolve(
    process.cwd(),
    "supabase/migrations/20261017110000_wms_e1_core.sql",
  );
  const receiptPath = resolve(
    process.cwd(),
    "docs/verification/wms-e1-rehearsal-receipt.json",
  );
  const migrationSqlRaw = readFileSync(migrationPath, "utf-8");
  const migrationSha256 = sha256File(migrationPath);

  // Strip outer begin; and commit; so we control the transaction boundary explicitly
  const migrationBody = migrationSqlRaw
    .replace(/^\s*begin\s*;/im, "")
    .replace(/commit\s*;\s*$/im, "");

  const connStr = resolveConnectionString();
  const endpoint = assertSessionModeEndpoint(connStr);

  const urlObj = new URL(connStr);
  urlObj.searchParams.delete("sslmode");

  const client = new Client({
    connectionString: urlObj.toString(),
    ssl: { rejectUnauthorized: false },
    statement_timeout: 30000,
  });

  await client.connect();

  try {
    // 1. Pre-check parent tables for (tenant_id, id) duplicates in read-only mode
    const parentTables = [
      "warehouses",
      "warehouse_zones",
      "warehouse_bins",
      "products",
      "parties",
      "orders",
      "order_lines",
      "inventory_quants",
      "warehouse_docks",
    ];
    const parentDuplicateCheck: Record<
      string,
      { total_rows: number; duplicate_groups: number }
    > = {};

    for (const tbl of parentTables) {
      const totalRes = await client.query(
        `SELECT count(*)::int AS c FROM public.${tbl}`,
      );
      const dupRes = await client.query(
        `SELECT count(*)::int AS d FROM (SELECT tenant_id, id FROM public.${tbl} GROUP BY tenant_id, id HAVING count(*) > 1) s`,
      );
      parentDuplicateCheck[tbl] = {
        total_rows: totalRes.rows[0].c,
        duplicate_groups: dupRes.rows[0].d,
      };
      assert.equal(
        dupRes.rows[0].d,
        0,
        `Parent table ${tbl} has duplicate (tenant_id, id) rows!`,
      );
    }

    // 2. Start BEGIN ... ROLLBACK transactional rehearsal
    await client.query("BEGIN");

    await client.query(migrationBody);

    // 3. Verify 6 new tables + 2 altered tables + privileges (MUST-D1 + C3 residual)
    const privilegeChecks: Record<string, any> = {};
    for (const tbl of [
      "warehouse_behavior_policies",
      "warehouse_resources",
      "handling_units",
      "handling_unit_contents",
      "stock_reservations",
      "warehouse_tasks",
      "inventory_quants",
      "inventory_movements",
    ]) {
      const pRes = await client.query(
        `SELECT
           has_table_privilege('authenticated', 'public.${tbl}', 'SELECT') AS auth_select,
           has_table_privilege('authenticated', 'public.${tbl}', 'INSERT') AS auth_insert,
           has_table_privilege('authenticated', 'public.${tbl}', 'UPDATE') AS auth_update,
           has_table_privilege('authenticated', 'public.${tbl}', 'DELETE') AS auth_delete,
           has_table_privilege('anon', 'public.${tbl}', 'INSERT') AS anon_insert`,
      );
      privilegeChecks[tbl] = pRes.rows[0];
      assert.equal(pRes.rows[0].auth_select, true, `${tbl} auth_select`);
      assert.equal(pRes.rows[0].auth_insert, false, `${tbl} auth_insert must be false`);
      assert.equal(pRes.rows[0].auth_update, false, `${tbl} auth_update must be false`);
      assert.equal(pRes.rows[0].auth_delete, false, `${tbl} auth_delete must be false`);
      assert.equal(pRes.rows[0].anon_insert, false, `${tbl} anon_insert must be false`);
    }

    // 4. Verify all 150 historical DATA150 inventory_quants have flow_state IS NULL
    const legacyQuantsRes = await client.query(
      `SELECT count(*)::int AS total, count(*) FILTER (WHERE flow_state IS NULL)::int AS null_flow
         FROM public.inventory_quants WHERE tenant_id = $1`,
      [TENANT_ID],
    );
    assert.equal(legacyQuantsRes.rows[0].total, 150);
    assert.equal(legacyQuantsRes.rows[0].null_flow, 150);

    // Lookup an active actor in tenant_members, a warehouse, a staging bin, a storage bin, a picking bin, and a product
    const actorRes = await client.query(
      `SELECT user_id, role FROM public.tenant_members WHERE tenant_id = $1 AND status = 'ACTIVE' AND role IN ('OWNER','ADMIN') LIMIT 1`,
      [TENANT_ID],
    );
    const actorId = actorRes.rows[0].user_id;

    const whRes = await client.query(
      `SELECT id, code FROM public.warehouses WHERE tenant_id = $1 ORDER BY code LIMIT 2`,
      [TENANT_ID],
    );
    const wh1 = whRes.rows[0].id;
    const wh2 = whRes.rows[1].id;

    // Create dedicated rehearsal zones & bins inside the rollback transaction so we test every constraint deterministically
    const zStorageRes = await client.query(
      `INSERT INTO public.warehouse_zones (tenant_id, warehouse_id, zone_code, zone_name, zone_type, temperature_regime)
       VALUES ($1, $2, 'Z-REH-STOR', '[REHEARSAL] Storage Ambient', 'STORAGE', 'AMBIENT') RETURNING id`,
      [TENANT_ID, wh1],
    );
    const zPickRes = await client.query(
      `INSERT INTO public.warehouse_zones (tenant_id, warehouse_id, zone_code, zone_name, zone_type, temperature_regime)
       VALUES ($1, $2, 'Z-REH-PICK', '[REHEARSAL] Picking Ambient', 'PICKING', 'AMBIENT') RETURNING id`,
      [TENANT_ID, wh1],
    );
    const zNoAdrRes = await client.query(
      `INSERT INTO public.warehouse_zones (tenant_id, warehouse_id, zone_code, zone_name, zone_type, temperature_regime)
       VALUES ($1, $2, 'Z-REH-NO-ADR', '[REHEARSAL] Storage No ADR', 'STORAGE', 'AMBIENT') RETURNING id`,
      [TENANT_ID, wh1],
    );

    const bStageRes = await client.query(
      `INSERT INTO public.warehouse_bins (tenant_id, warehouse_id, zone_id, bin_code, bin_type, max_pallets, max_weight_kg, max_volume_m3)
       VALUES ($1, $2, $3, 'BIN-REH-STAGE', 'DOCK_STAGE', 10, 10000, 50) RETURNING id`,
      [TENANT_ID, wh1, zStorageRes.rows[0].id],
    );
    const bDestRes = await client.query(
      `INSERT INTO public.warehouse_bins (tenant_id, warehouse_id, zone_id, bin_code, bin_type, max_pallets, max_weight_kg, max_volume_m3)
       VALUES ($1, $2, $3, 'BIN-REH-STOR-01', 'PALLET_RACK', 1, 1000, 2.5) RETURNING id`,
      [TENANT_ID, wh1, zStorageRes.rows[0].id],
    );
    const bBlockedRes = await client.query(
      `INSERT INTO public.warehouse_bins (tenant_id, warehouse_id, zone_id, bin_code, bin_type, max_pallets, is_blocked, block_reason)
       VALUES ($1, $2, $3, 'BIN-REH-BLOCKED', 'PALLET_RACK', 2, true, 'MAINTENANCE') RETURNING id`,
      [TENANT_ID, wh1, zStorageRes.rows[0].id],
    );
    const bPickRes = await client.query(
      `INSERT INTO public.warehouse_bins (tenant_id, warehouse_id, zone_id, bin_code, bin_type, max_pallets, max_weight_kg, max_volume_m3)
       VALUES ($1, $2, $3, 'BIN-REH-PICK-01', 'SHELVING', 4, 2000, 5.0) RETURNING id`,
      [TENANT_ID, wh1, zPickRes.rows[0].id],
    );
    const bNoAdrRes = await client.query(
      `INSERT INTO public.warehouse_bins (tenant_id, warehouse_id, zone_id, bin_code, bin_type, max_pallets)
       VALUES ($1, $2, $3, 'BIN-REH-NOADR', 'PALLET_RACK', 2) RETURNING id`,
      [TENANT_ID, wh1, zNoAdrRes.rows[0].id],
    );
    const bStage = bStageRes.rows[0].id;
    const bDest = bDestRes.rows[0].id;
    const bBlocked = bBlockedRes.rows[0].id;
    const bPick = bPickRes.rows[0].id;
    const bNoAdr = bNoAdrRes.rows[0].id;

    // Create rehearsal products (ambient, frozen, hazmat)
    const pAmbRes = await client.query(
      `INSERT INTO public.products (tenant_id, sku, name, category_code, uom_base, is_batch_managed, shelf_life_days, is_temperature_controlled, is_hazardous)
       VALUES ($1, 'SKU-REH-AMB', '[REHEARSAL] Ambient Batch SKU', 'CAT-DRY', 'UN', true, 180, false, false) RETURNING id`,
      [TENANT_ID],
    );
    const pFrzRes = await client.query(
      `INSERT INTO public.products (tenant_id, sku, name, category_code, uom_base, is_batch_managed, shelf_life_days, is_temperature_controlled, temp_min_c, temp_max_c, is_hazardous)
       VALUES ($1, 'SKU-REH-FRZ', '[REHEARSAL] Frozen SKU', 'CAT-FROZEN', 'UN', true, 90, true, -22, -18, false) RETURNING id`,
      [TENANT_ID],
    );
    const pAdrRes = await client.query(
      `INSERT INTO public.products (tenant_id, sku, name, category_code, uom_base, is_batch_managed, shelf_life_days, is_temperature_controlled, is_hazardous)
       VALUES ($1, 'SKU-REH-ADR', '[REHEARSAL] Hazmat SKU', 'CAT-ADR', 'UN', true, 365, false, true) RETURNING id`,
      [TENANT_ID],
    );
    const prodAmb = pAmbRes.rows[0].id;
    const prodFrz = pFrzRes.rows[0].id;
    const prodAdr = pAdrRes.rows[0].id;

    // 5. Test fornexa_wms_effective_policy inheritance
    await client.query(
      `SELECT public.fornexa_wms_action($1, $2, 'UPSERT_POLICY', $3::jsonb)`,
      [
        TENANT_ID,
        actorId,
        JSON.stringify({
          warehouse_id: wh1,
          scope: "WAREHOUSE",
          params: {
            capture_lot_on_receipt: true,
            capture_expiry_on_receipt: true,
            allow_mixed_lots_in_bin: false,
            capture_lot_on_pick: true,
            require_label_scan_on_load: true,
            weight_tolerance_pct: 5,
            volume_tolerance_pct: 10,
            consolidation: "BY_BATCH",
          },
        }),
      ],
    );

    const effPolRes = await client.query(
      `SELECT public.fornexa_wms_effective_policy($1, $2, null, $3) AS pol`,
      [TENANT_ID, wh1, prodAmb],
    );
    assert.equal(effPolRes.rows[0].pol.forbid_picking_unlocated, true);
    assert.equal(effPolRes.rows[0].pol.consolidation, "BY_BATCH");

    // Create resources via UPSERT_RESOURCE
    const resActive = await client.query(
      `SELECT public.fornexa_wms_action($1, $2, 'UPSERT_RESOURCE', $3::jsonb) AS r`,
      [
        TENANT_ID,
        actorId,
        JSON.stringify({
          warehouse_id: wh1,
          code: "FORK-REH-01",
          name: "Carretilla Rehearsal 01",
          resource_type: "REACH_TRUCK",
          status: "AVAILABLE",
          max_lift_height_m: 10,
          max_weight_kg: 1200,
          certifications: ["FORKLIFT", "HEIGHT"],
          is_active: true,
        }),
      ],
    );
    const resourceId = resActive.rows[0].r.resource.id;

    const resOffline = await client.query(
      `SELECT public.fornexa_wms_action($1, $2, 'UPSERT_RESOURCE', $3::jsonb) AS r`,
      [
        TENANT_ID,
        actorId,
        JSON.stringify({
          warehouse_id: wh1,
          code: "FORK-REH-OFF",
          name: "Carretilla En Mantenimiento",
          resource_type: "FORKLIFT",
          status: "MAINTENANCE",
          max_lift_height_m: 4,
          max_weight_kg: 500,
          certifications: [],
          is_active: false,
        }),
      ],
    );
    const offlineResourceId = resOffline.rows[0].r.resource.id;

    // Create an unchecked HU in staging
    const hu1Res = await client.query(
      `INSERT INTO public.handling_units (tenant_id, warehouse_id, code, code_type, hu_type, state, current_bin_id, gross_weight_kg, volume_m3)
       VALUES ($1, $2, 'WMS-TEST-HU-001', 'LPN', 'PALLET', 'STAGING_UNCHECKED', $3, 500, 1.2) RETURNING id`,
      [TENANT_ID, wh1, bStage],
    );
    const hu1 = hu1Res.rows[0].id;

    await client.query(
      `INSERT INTO public.handling_unit_contents (tenant_id, handling_unit_id, product_id, quantity, uom)
       VALUES ($1, $2, $3, 100, 'UN')`,
      [TENANT_ID, hu1, prodAmb],
    );
    const q1Res = await client.query(
      `INSERT INTO public.inventory_quants (tenant_id, warehouse_id, bin_id, product_id, quantity_on_hand, quantity_reserved, uom, stock_status, flow_state, hu_id)
       VALUES ($1, $2, $3, $4, 100, 0, 'UN', 'AVAILABLE', 'STAGING_UNCHECKED', $5) RETURNING id`,
      [TENANT_ID, wh1, bStage, prodAmb, hu1],
    );
    const q1 = q1Res.rows[0].id;

    const verifiedCodes: string[] = [];

    // Test security / tenant / warehouse codes
    verifiedCodes.push(
      await expectRpcError(client, "sp_sec_1", "WMS_FORBIDDEN", () =>
        client.query(
          `SELECT public.fornexa_wms_action($1, '00000000-0000-4000-8000-999999999999'::uuid, 'RECEIVE_CHECK', '{}'::jsonb)`,
          [TENANT_ID],
        ),
      ),
    );

    verifiedCodes.push(
      await expectRpcError(client, "sp_sec_2", "WMS_TENANT_MISMATCH", () =>
        client.query(
          `SELECT public.fornexa_wms_action($1, $2, 'RECEIVE_CHECK', $3::jsonb)`,
          [
            TENANT_ID,
            actorId,
            JSON.stringify({
              tenant_id: "00000000-0000-4000-8000-000000000099",
              hu_id: hu1,
            }),
          ],
        ),
      ),
    );

    verifiedCodes.push(
      await expectRpcError(client, "sp_sec_3", "WMS_CROSS_WAREHOUSE_INVALID", () =>
        client.query(
          `SELECT public.fornexa_wms_action($1, $2, 'RECEIVE_CHECK', $3::jsonb)`,
          [
            TENANT_ID,
            actorId,
            JSON.stringify({ warehouse_id: wh2, hu_id: hu1 }),
          ],
        ),
      ),
    );

    // REJ-01: Reserve on STAGING_UNCHECKED -> WMS_STOCK_NOT_LOCATED
    verifiedCodes.push(
      await expectRpcError(client, "sp_rej01", "WMS_STOCK_NOT_LOCATED", () =>
        client.query(
          `SELECT public.fornexa_wms_action($1, $2, 'RESERVE', $3::jsonb)`,
          [TENANT_ID, actorId, JSON.stringify({ quant_id: q1, quantity: 10 })],
        ),
      ),
    );

    // REJ-03: Reserve on real legacy DATA150 quant with flow_state IS NULL -> WMS_STOCK_NOT_LOCATED
    const data150QuantRes = await client.query(
      `SELECT id FROM public.inventory_quants WHERE tenant_id = $1 AND flow_state IS NULL LIMIT 1`,
      [TENANT_ID],
    );
    verifiedCodes.push(
      await expectRpcError(client, "sp_rej03", "WMS_STOCK_NOT_LOCATED", () =>
        client.query(
          `SELECT public.fornexa_wms_action($1, $2, 'RESERVE', $3::jsonb)`,
          [
            TENANT_ID,
            actorId,
            JSON.stringify({ quant_id: data150QuantRes.rows[0].id, quantity: 1 }),
          ],
        ),
      ),
    );

    // REJ-04: Putaway before RECEIVE_CHECK -> WMS_HU_NOT_CHECKED
    verifiedCodes.push(
      await expectRpcError(client, "sp_rej04", "WMS_HU_NOT_CHECKED", () =>
        client.query(
          `SELECT public.fornexa_wms_action($1, $2, 'PUTAWAY', $3::jsonb)`,
          [
            TENANT_ID,
            actorId,
            JSON.stringify({ hu_id: hu1, destination_bin_id: bDest }),
          ],
        ),
      ),
    );

    // REJ-05: RECEIVE_CHECK without lot -> WMS_LOT_REQUIRED
    verifiedCodes.push(
      await expectRpcError(client, "sp_rej05", "WMS_LOT_REQUIRED", () =>
        client.query(
          `SELECT public.fornexa_wms_action($1, $2, 'RECEIVE_CHECK', $3::jsonb)`,
          [
            TENANT_ID,
            actorId,
            JSON.stringify({ hu_id: hu1, expiry_date: "2027-06-01" }),
          ],
        ),
      ),
    );

    // REJ-06: RECEIVE_CHECK without expiry -> WMS_EXPIRY_REQUIRED
    verifiedCodes.push(
      await expectRpcError(client, "sp_rej06", "WMS_EXPIRY_REQUIRED", () =>
        client.query(
          `SELECT public.fornexa_wms_action($1, $2, 'RECEIVE_CHECK', $3::jsonb)`,
          [
            TENANT_ID,
            actorId,
            JSON.stringify({ hu_id: hu1, batch_number: "LOT-WMS-001" }),
          ],
        ),
      ),
    );

    // Execute valid RECEIVE_CHECK
    await client.query(
      `SELECT public.fornexa_wms_action($1, $2, 'RECEIVE_CHECK', $3::jsonb, 'IDEM-RC-001')`,
      [
        TENANT_ID,
        actorId,
        JSON.stringify({
          hu_id: hu1,
          batch_number: "LOT-WMS-001",
          expiry_date: "2027-06-01",
          quantity: 100,
        }),
      ],
    );

    // REJ-17: Idempotent replay returns previous result without error
    const replayRes = await client.query(
      `SELECT public.fornexa_wms_action($1, $2, 'RECEIVE_CHECK', $3::jsonb, 'IDEM-RC-001') AS r`,
      [
        TENANT_ID,
        actorId,
        JSON.stringify({
          hu_id: hu1,
          batch_number: "LOT-WMS-001",
          expiry_date: "2027-06-01",
          quantity: 100,
        }),
      ],
    );
    assert.equal(replayRes.rows[0].r.idempotent_replay, true);

    // WMS_DUPLICATE: Same idempotency_key with different payload
    verifiedCodes.push(
      await expectRpcError(client, "sp_dup", "WMS_DUPLICATE", () =>
        client.query(
          `SELECT public.fornexa_wms_action($1, $2, 'PUTAWAY', $3::jsonb, 'IDEM-RC-001')`,
          [
            TENANT_ID,
            actorId,
            JSON.stringify({ hu_id: hu1, destination_bin_id: bDest }),
          ],
        ),
      ),
    );

    // WMS_HU_NOT_UNCHECKED: Repeat RECEIVE_CHECK on already checked HU with new key
    verifiedCodes.push(
      await expectRpcError(client, "sp_not_unchk", "WMS_HU_NOT_UNCHECKED", () =>
        client.query(
          `SELECT public.fornexa_wms_action($1, $2, 'RECEIVE_CHECK', $3::jsonb)`,
          [
            TENANT_ID,
            actorId,
            JSON.stringify({
              hu_id: hu1,
              batch_number: "LOT-WMS-001",
              expiry_date: "2027-06-01",
            }),
          ],
        ),
      ),
    );

    // REJ-02: Reserve on STAGING_CHECKED -> WMS_STOCK_NOT_LOCATED
    verifiedCodes.push(
      await expectRpcError(client, "sp_rej02", "WMS_STOCK_NOT_LOCATED", () =>
        client.query(
          `SELECT public.fornexa_wms_action($1, $2, 'RESERVE', $3::jsonb)`,
          [TENANT_ID, actorId, JSON.stringify({ quant_id: q1, quantity: 10 })],
        ),
      ),
    );

    // REJ-07: Putaway to blocked bin -> WMS_BIN_BLOCKED
    verifiedCodes.push(
      await expectRpcError(client, "sp_rej07", "WMS_BIN_BLOCKED", () =>
        client.query(
          `SELECT public.fornexa_wms_action($1, $2, 'PUTAWAY', $3::jsonb)`,
          [
            TENANT_ID,
            actorId,
            JSON.stringify({ hu_id: hu1, destination_bin_id: bBlocked }),
          ],
        ),
      ),
    );

    // REJ-15: Putaway with offline/incompatible resource -> WMS_RESOURCE_INCOMPATIBLE
    verifiedCodes.push(
      await expectRpcError(client, "sp_rej15", "WMS_RESOURCE_INCOMPATIBLE", () =>
        client.query(
          `SELECT public.fornexa_wms_action($1, $2, 'PUTAWAY', $3::jsonb)`,
          [
            TENANT_ID,
            actorId,
            JSON.stringify({
              hu_id: hu1,
              destination_bin_id: bDest,
              resource_id: offlineResourceId,
            }),
          ],
        ),
      ),
    );

    // Execute valid PUTAWAY on hu1 -> bDest (max_pallets = 1)
    await client.query(
      `SELECT public.fornexa_wms_action($1, $2, 'PUTAWAY', $3::jsonb, 'IDEM-PUT-001')`,
      [
        TENANT_ID,
        actorId,
        JSON.stringify({
          hu_id: hu1,
          destination_bin_id: bDest,
          resource_id: resourceId,
        }),
      ],
    );

    // Create second checked HU to test WMS_BIN_CAPACITY, WMS_LOT_MIX_FORBIDDEN, WMS_TEMP_MISMATCH, WMS_ADR_INCOMPATIBLE
    const hu2Res = await client.query(
      `INSERT INTO public.handling_units (tenant_id, warehouse_id, code, code_type, hu_type, state, current_bin_id, gross_weight_kg, volume_m3)
       VALUES ($1, $2, 'WMS-TEST-HU-002', 'LPN', 'PALLET', 'STAGING_CHECKED', $3, 400, 1.0) RETURNING id`,
      [TENANT_ID, wh1, bStage],
    );
    const hu2 = hu2Res.rows[0].id;
    await client.query(
      `INSERT INTO public.handling_unit_contents (tenant_id, handling_unit_id, product_id, batch_number, expiry_date, quantity, uom)
       VALUES ($1, $2, $3, 'LOT-WMS-002', '2027-07-01', 50, 'UN')`,
      [TENANT_ID, hu2, prodAmb],
    );

    // REJ-08: Putaway hu2 into bDest (which has max_pallets=1 and already holds hu1) -> WMS_BIN_CAPACITY
    verifiedCodes.push(
      await expectRpcError(client, "sp_rej08", "WMS_BIN_CAPACITY", () =>
        client.query(
          `SELECT public.fornexa_wms_action($1, $2, 'PUTAWAY', $3::jsonb)`,
          [
            TENANT_ID,
            actorId,
            JSON.stringify({ hu_id: hu2, destination_bin_id: bDest }),
          ],
        ),
      ),
    );

    // Put an existing quant with LOT-WMS-999 in bPick (max_pallets=4) and test REJ-10 (WMS_LOT_MIX_FORBIDDEN)
    const qPickRes = await client.query(
      `INSERT INTO public.inventory_quants (tenant_id, warehouse_id, bin_id, product_id, batch_number, quantity_on_hand, quantity_reserved, uom, stock_status, flow_state)
       VALUES ($1, $2, $3, $4, 'LOT-WMS-999', 5, 0, 'UN', 'AVAILABLE', 'STORED') RETURNING id`,
      [TENANT_ID, wh1, bPick, prodAmb],
    );
    const qPick = qPickRes.rows[0].id;

    verifiedCodes.push(
      await expectRpcError(client, "sp_rej10", "WMS_LOT_MIX_FORBIDDEN", () =>
        client.query(
          `SELECT public.fornexa_wms_action($1, $2, 'PUTAWAY', $3::jsonb)`,
          [
            TENANT_ID,
            actorId,
            JSON.stringify({ hu_id: hu2, destination_bin_id: bPick }),
          ],
        ),
      ),
    );

    // REJ-09a: Frozen product into ambient zone -> WMS_TEMP_MISMATCH
    const huFrzRes = await client.query(
      `INSERT INTO public.handling_units (tenant_id, warehouse_id, code, code_type, hu_type, state, current_bin_id, gross_weight_kg, volume_m3)
       VALUES ($1, $2, 'WMS-TEST-HU-FRZ', 'LPN', 'PALLET', 'STAGING_CHECKED', $3, 300, 1.0) RETURNING id`,
      [TENANT_ID, wh1, bStage],
    );
    await client.query(
      `INSERT INTO public.handling_unit_contents (tenant_id, handling_unit_id, product_id, batch_number, expiry_date, quantity, uom)
       VALUES ($1, $2, $3, 'LOT-WMS-FRZ', '2027-05-01', 40, 'UN')`,
      [TENANT_ID, huFrzRes.rows[0].id, prodFrz],
    );
    verifiedCodes.push(
      await expectRpcError(client, "sp_rej09_temp", "WMS_TEMP_MISMATCH", () =>
        client.query(
          `SELECT public.fornexa_wms_action($1, $2, 'PUTAWAY', $3::jsonb)`,
          [
            TENANT_ID,
            actorId,
            JSON.stringify({
              hu_id: huFrzRes.rows[0].id,
              destination_bin_id: bPick,
            }),
          ],
        ),
      ),
    );

    // REJ-09b: ADR product into NO-ADR zone -> WMS_ADR_INCOMPATIBLE
    const huAdrRes = await client.query(
      `INSERT INTO public.handling_units (tenant_id, warehouse_id, code, code_type, hu_type, state, current_bin_id, gross_weight_kg, volume_m3)
       VALUES ($1, $2, 'WMS-TEST-HU-ADR', 'LPN', 'PALLET', 'STAGING_CHECKED', $3, 300, 1.0) RETURNING id`,
      [TENANT_ID, wh1, bStage],
    );
    await client.query(
      `INSERT INTO public.handling_unit_contents (tenant_id, handling_unit_id, product_id, batch_number, expiry_date, quantity, uom)
       VALUES ($1, $2, $3, 'LOT-WMS-ADR', '2027-08-01', 20, 'UN')`,
      [TENANT_ID, huAdrRes.rows[0].id, prodAdr],
    );
    verifiedCodes.push(
      await expectRpcError(client, "sp_rej09_adr", "WMS_ADR_INCOMPATIBLE", () =>
        client.query(
          `SELECT public.fornexa_wms_action($1, $2, 'PUTAWAY', $3::jsonb)`,
          [
            TENANT_ID,
            actorId,
            JSON.stringify({
              hu_id: huAdrRes.rows[0].id,
              destination_bin_id: bNoAdr,
            }),
          ],
        ),
      ),
    );

    // Test WMS_INSUFFICIENT_PICK_STOCK, WMS_INSUFFICIENT_STOCK, WMS_STOCK_BLOCKED, WMS_REPLENISHMENT_PENDING
    verifiedCodes.push(
      await expectRpcError(client, "sp_ins_pick", "WMS_INSUFFICIENT_PICK_STOCK", () =>
        client.query(
          `SELECT public.fornexa_wms_action($1, $2, 'RESERVE', $3::jsonb)`,
          [TENANT_ID, actorId, JSON.stringify({ quant_id: qPick, quantity: 999 })],
        ),
      ),
    );

    verifiedCodes.push(
      await expectRpcError(client, "sp_ins_stor", "WMS_INSUFFICIENT_STOCK", () =>
        client.query(
          `SELECT public.fornexa_wms_action($1, $2, 'RESERVE', $3::jsonb)`,
          [TENANT_ID, actorId, JSON.stringify({ quant_id: q1, quantity: 999 })],
        ),
      ),
    );

    // Temporarily block qPick inside a savepoint to test WMS_STOCK_BLOCKED
    verifiedCodes.push(
      await expectRpcError(client, "sp_blocked_stock", "WMS_STOCK_BLOCKED", async () => {
        await client.query(
          `UPDATE public.inventory_quants SET stock_status = 'QUARANTINE' WHERE id = $1`,
          [qPick],
        );
        await client.query(
          `SELECT public.fornexa_wms_action($1, $2, 'RESERVE', $3::jsonb)`,
          [TENANT_ID, actorId, JSON.stringify({ quant_id: qPick, quantity: 1 })],
        );
      }),
    );

    // Test WMS_CONSOLIDATION_CONFLICT, WMS_NO_SOURCE_STOCK, WMS_TASK_NOT_READY, WMS_REPLENISHMENT_PENDING
    verifiedCodes.push(
      await expectRpcError(client, "sp_cons_conf", "WMS_CONSOLIDATION_CONFLICT", () =>
        client.query(
          `SELECT public.fornexa_wms_action($1, $2, 'REPLENISH', $3::jsonb)`,
          [
            TENANT_ID,
            actorId,
            JSON.stringify({
              warehouse_id: wh1,
              product_id: prodAmb,
              destination_bin_id: bPick,
              batch_number: "LOT-A",
              conflicting_batch: "LOT-B",
            }),
          ],
        ),
      ),
    );

    verifiedCodes.push(
      await expectRpcError(client, "sp_no_src", "WMS_NO_SOURCE_STOCK", () =>
        client.query(
          `SELECT public.fornexa_wms_action($1, $2, 'REPLENISH', $3::jsonb)`,
          [
            TENANT_ID,
            actorId,
            JSON.stringify({
              warehouse_id: wh1,
              product_id: prodFrz,
              destination_bin_id: bPick,
              quantity: 50,
            }),
          ],
        ),
      ),
    );

    // Insert a PROPOSED replenish task on bPick to test WMS_TASK_NOT_READY and WMS_REPLENISHMENT_PENDING
    const propTaskRes = await client.query(
      `INSERT INTO public.warehouse_tasks (tenant_id, warehouse_id, task_type, state, destination_bin_id, product_id, quantity, uom)
       VALUES ($1, $2, 'REPLENISH', 'PROPOSED', $3, $4, 20, 'UN') RETURNING id`,
      [TENANT_ID, wh1, bPick, prodAmb],
    );
    const propTaskId = propTaskRes.rows[0].id;

    verifiedCodes.push(
      await expectRpcError(client, "sp_task_not_ready", "WMS_TASK_NOT_READY", () =>
        client.query(
          `SELECT public.fornexa_wms_action($1, $2, 'CONFIRM_TASK', $3::jsonb)`,
          [TENANT_ID, actorId, JSON.stringify({ task_id: propTaskId })],
        ),
      ),
    );

    verifiedCodes.push(
      await expectRpcError(client, "sp_repl_pend", "WMS_REPLENISHMENT_PENDING", () =>
        client.query(
          `SELECT public.fornexa_wms_action($1, $2, 'RESERVE', $3::jsonb)`,
          [TENANT_ID, actorId, JSON.stringify({ quant_id: qPick, quantity: 1 })],
        ),
      ),
    );

    // Execute valid RESERVE on q1 (100 units in bDest)
    const reserveRes = await client.query(
      `SELECT public.fornexa_wms_action($1, $2, 'RESERVE', $3::jsonb, 'IDEM-RES-001') AS r`,
      [
        TENANT_ID,
        actorId,
        JSON.stringify({ quant_id: q1, quantity: 100, hu_id: hu1 }),
      ],
    );
    const reservationId = reserveRes.rows[0].r.reservation.id;

    // Test WMS_NOT_RESERVED and WMS_LOT_MISMATCH on PICK
    verifiedCodes.push(
      await expectRpcError(client, "sp_not_res", "WMS_NOT_RESERVED", () =>
        client.query(
          `SELECT public.fornexa_wms_action($1, $2, 'PICK', $3::jsonb)`,
          [
            TENANT_ID,
            actorId,
            JSON.stringify({
              reservation_id: "00000000-0000-4000-8000-999999999999",
            }),
          ],
        ),
      ),
    );

    verifiedCodes.push(
      await expectRpcError(client, "sp_lot_mismatch", "WMS_LOT_MISMATCH", () =>
        client.query(
          `SELECT public.fornexa_wms_action($1, $2, 'PICK', $3::jsonb)`,
          [
            TENANT_ID,
            actorId,
            JSON.stringify({
              reservation_id: reservationId,
              scanned_batch: "LOT-WRONG-999",
            }),
          ],
        ),
      ),
    );

    // Test WMS_NOT_READY_TO_LOAD before PICK
    verifiedCodes.push(
      await expectRpcError(client, "sp_not_ready_load", "WMS_NOT_READY_TO_LOAD", () =>
        client.query(
          `SELECT public.fornexa_wms_action($1, $2, 'LOAD', $3::jsonb)`,
          [TENANT_ID, actorId, JSON.stringify({ hu_id: hu1 })],
        ),
      ),
    );

    // Execute valid PICK (full pallet 100 units -> transitions hu1 to PICKED_STAGED)
    await client.query(
      `SELECT public.fornexa_wms_action($1, $2, 'PICK', $3::jsonb, 'IDEM-PICK-001')`,
      [
        TENANT_ID,
        actorId,
        JSON.stringify({
          reservation_id: reservationId,
          scanned_batch: "LOT-WMS-001",
          quantity: 100,
          resource_id: resourceId,
        }),
      ],
    );

    // Test WMS_LABEL_MISSING before LABEL is issued
    verifiedCodes.push(
      await expectRpcError(client, "sp_lbl_missing", "WMS_LABEL_MISSING", () =>
        client.query(
          `SELECT public.fornexa_wms_action($1, $2, 'LOAD', $3::jsonb)`,
          [
            TENANT_ID,
            actorId,
            JSON.stringify({ hu_id: hu1, scanned_code: "WMS-TEST-HU-001" }),
          ],
        ),
      ),
    );

    // Test WMS_CONTROL_PENDING, WMS_WEIGHT_TOLERANCE, WMS_VOLUME_TOLERANCE on LABEL
    verifiedCodes.push(
      await expectRpcError(client, "sp_ctrl_pend", "WMS_CONTROL_PENDING", () =>
        client.query(
          `SELECT public.fornexa_wms_action($1, $2, 'LABEL', $3::jsonb)`,
          [
            TENANT_ID,
            actorId,
            JSON.stringify({ hu_id: hu1, state_controlled: false }),
          ],
        ),
      ),
    );

    verifiedCodes.push(
      await expectRpcError(client, "sp_weight_tol", "WMS_WEIGHT_TOLERANCE", () =>
        client.query(
          `SELECT public.fornexa_wms_action($1, $2, 'LABEL', $3::jsonb)`,
          [
            TENANT_ID,
            actorId,
            JSON.stringify({
              hu_id: hu1,
              state_controlled: true,
              measured_weight_kg: 650,
              expected_weight_kg: 500,
            }),
          ],
        ),
      ),
    );

    verifiedCodes.push(
      await expectRpcError(client, "sp_vol_tol", "WMS_VOLUME_TOLERANCE", () =>
        client.query(
          `SELECT public.fornexa_wms_action($1, $2, 'LABEL', $3::jsonb)`,
          [
            TENANT_ID,
            actorId,
            JSON.stringify({
              hu_id: hu1,
              state_controlled: true,
              measured_weight_kg: 505,
              expected_weight_kg: 500,
              measured_volume_m3: 2.0,
              expected_volume_m3: 1.2,
            }),
          ],
        ),
      ),
    );

    // Execute valid LABEL
    await client.query(
      `SELECT public.fornexa_wms_action($1, $2, 'LABEL', $3::jsonb, 'IDEM-LBL-001')`,
      [
        TENANT_ID,
        actorId,
        JSON.stringify({
          hu_id: hu1,
          state_controlled: true,
          measured_weight_kg: 505,
          expected_weight_kg: 500,
          measured_volume_m3: 1.22,
          expected_volume_m3: 1.2,
        }),
      ],
    );

    // Test WMS_LABEL_MISMATCH on LOAD
    verifiedCodes.push(
      await expectRpcError(client, "sp_lbl_mismatch", "WMS_LABEL_MISMATCH", () =>
        client.query(
          `SELECT public.fornexa_wms_action($1, $2, 'LOAD', $3::jsonb)`,
          [
            TENANT_ID,
            actorId,
            JSON.stringify({
              hu_id: hu1,
              scanned_code: "WRONG-SSCC-CODE",
              state_controlled: true,
            }),
          ],
        ),
      ),
    );

    // Execute valid LOAD
    const loadRes = await client.query(
      `SELECT public.fornexa_wms_action($1, $2, 'LOAD', $3::jsonb, 'IDEM-LOAD-001') AS r`,
      [
        TENANT_ID,
        actorId,
        JSON.stringify({
          hu_id: hu1,
          scanned_code: "WMS-TEST-HU-001",
          state_controlled: true,
          measured_weight_kg: 505,
          expected_weight_kg: 505,
          measured_volume_m3: 1.22,
          expected_volume_m3: 1.22,
        }),
      ],
    );
    assert.equal(loadRes.rows[0].r.hu.state, "LOADED");

    // Verify all 150 DATA150 quants still have flow_state IS NULL at the end of rehearsal
    const legacyAfterRes = await client.query(
      `SELECT count(*) FILTER (WHERE flow_state IS NULL)::int AS null_flow FROM public.inventory_quants WHERE tenant_id = $1`,
      [TENANT_ID],
    );
    assert.equal(legacyAfterRes.rows[0].null_flow, 150);

    // Privilegios de FUNCIÓN. El bucle anterior solo audita tablas; sin esto, una función
    // SECURITY DEFINER concedida a `authenticated` pasaría desapercibida —que es exactamente
    // cómo se coló fornexa_wms_effective_policy—. Va DENTRO de la transacción, antes del
    // ROLLBACK, porque después el cliente ya estaría cerrado y las funciones no existirían.
    for (const [fn, firma] of [
      ["fornexa_wms_effective_policy", "(uuid, uuid, uuid, uuid)"],
      ["fornexa_wms_action", "(uuid, uuid, text, jsonb, text)"],   // sin uuid extra: es (tenant, actor, action, payload, idem)
    ] as [string, string][]) {
      const fRes = await client.query(
        `SELECT
           has_function_privilege('authenticated', 'public.${fn}${firma}', 'EXECUTE') AS auth_exec,
           has_function_privilege('anon', 'public.${fn}${firma}', 'EXECUTE') AS anon_exec,
           has_function_privilege('service_role', 'public.${fn}${firma}', 'EXECUTE') AS svc_exec`,
      );
      assert.equal(fRes.rows[0].auth_exec, false, `${fn}: authenticated NO debe poder ejecutarla`);
      assert.equal(fRes.rows[0].anon_exec, false, `${fn}: anon NO debe poder ejecutarla`);
      assert.equal(fRes.rows[0].svc_exec, true, `${fn}: service_role SÍ debe poder`);
    }

    // Control negativo de aislamiento, por CONTENIDO y no por «salta algún error».
    // Con SECURITY INVOKER la RLS se aplica, así que una sesión de usuario que pida la política
    // de OTRO tenant debe recibir los valores por defecto, no la del tenant ajeno.
    await client.query(
      "grant execute on function public.fornexa_wms_effective_policy(uuid, uuid, uuid, uuid) to authenticated",
    );
    await client.query("set local role authenticated");
    let politicaAjena: any = null;
    try {
      const ajeno = await client.query(
        `SELECT public.fornexa_wms_effective_policy($1, $2, null, $3) AS pol`,
        [OTHER_TENANT_ID, wh1, prodAmb],
      );
      politicaAjena = ajeno.rows[0].pol;
    } finally {
      await client.query("reset role");
      await client.query("revoke execute on function public.fornexa_wms_effective_policy(uuid, uuid, uuid, uuid) from authenticated");
    }
    // Los defaults de la función, no la política del tenant ajeno. Se afirma contra los
    // valores por defecto CONCRETOS ('YES' y 2), no contra «algo distinto»: una aserción
    // del tipo notEqual(valor, 4) pasaría siempre y no probaría nada.
    assert.ok(politicaAjena, "el aislamiento no devolvió política alguna");
    assert.equal(
      politicaAjena.consolidation, "YES",
      "FUGA: devolvió la consolidación del tenant ajeno (BY_BATCH) en lugar del default",
    );
    assert.equal(
      politicaAjena.max_pallets_per_bin, 2,
      "FUGA: devolvió una política distinta de los defaults (se esperaba 2)",
    );

    // 6. ROLLBACK everything!
    await client.query("ROLLBACK");

    // 7. Verify post-rollback that none of the 6 E1 tables remain committed in production
    const postRollbackCheck = await client.query(
      `SELECT count(*)::int AS c FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_name IN ('warehouse_behavior_policies','warehouse_resources','handling_units','handling_unit_contents','stock_reservations','warehouse_tasks')`,
    );
    assert.equal(postRollbackCheck.rows[0].c, 0);

    const uniqueVerifiedCodes = [...new Set(verifiedCodes)].sort();
    assert.equal(uniqueVerifiedCodes.length, 30, `Expected 30 unique codes, got ${uniqueVerifiedCodes.length}`);

    const receipt = {
      task_id: "WMS-RESEARCH-20261017",
      phase: "F3_E1_TRANSACTIONAL_REHEARSAL",
      mode: "BEGIN_ROLLBACK_ONLY",
      committed_writes: 0,
      executed_at: new Date().toISOString(),
      endpoint_guard: {
        status: "PASSED",
        port: endpoint.port,
      },
      migration_file: "supabase/migrations/20261017110000_wms_e1_core.sql",
      migration_sha256: migrationSha256,
      parent_duplicate_check: parentDuplicateCheck,
      legacy_data150_quants_flow_state_null: {
        before_rehearsal: 150,
        after_e1_operations: 150,
      },
      rls_and_privilege_checks: privilegeChecks,
      happy_path_transitions_verified: [
        "UPSERT_POLICY",
        "UPSERT_RESOURCE",
        "RECEIVE_CHECK",
        "PUTAWAY",
        "RESERVE",
        "PICK",
        "LABEL",
        "LOAD",
        "IDEMPOTENT_REPLAY",
      ],
      verified_rejection_codes_count: uniqueVerifiedCodes.length,
      verified_rejection_codes: uniqueVerifiedCodes,
      post_rollback_e1_tables_in_prod: postRollbackCheck.rows[0].c,
    };

    writeFileSync(receiptPath, JSON.stringify(receipt, null, 2) + "\n", "utf-8");
    console.log(JSON.stringify({ status: "REHEARSAL_PASSED", codes_verified: uniqueVerifiedCodes.length, committed_writes: 0 }));
  } finally {
    await client.end();
  }


}

main().catch((err) => {
  console.error("Rehearsal failed:", err?.message || err);
  process.exit(1);
});
