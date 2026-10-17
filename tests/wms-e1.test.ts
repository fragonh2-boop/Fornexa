import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import {
  DEFAULT_WMS_POLICY,
  WMS_ERROR_CODES,
  computePickAllocationProposals,
  computePutawayProposal,
  resolveEffectiveWmsPolicy,
  wmsRpcFailure,
  type WmsBin,
  type WmsHandlingUnit,
  type WmsPolicyRecord,
  type WmsProduct,
  type WmsQuant,
  type WmsZone,
} from "../lib/wms.ts";

const MIGRATION_PATH = resolve(
  import.meta.dirname,
  "../supabase/migrations/20261017110000_wms_e1_core.sql",
);
const SPEC_PATH = resolve(
  import.meta.dirname,
  "../docs/architecture/wms-fase2-20261017.md",
);

const sql = readFileSync(MIGRATION_PATH, "utf-8");
const spec = readFileSync(SPEC_PATH, "utf-8");

test("WMS E1 — crea únicamente las 6 tablas de E1 y no incluye las de E2 (replenishment_rules, wms_proposals)", () => {
  const createdTables = [
    ...sql.matchAll(/create\s+table\s+if\s+not\s+exists\s+public\.([a-z0-9_]+)/gi),
  ].map((m) => m[1]);

  assert.deepEqual(
    createdTables.sort(),
    [
      "handling_unit_contents",
      "handling_units",
      "stock_reservations",
      "warehouse_behavior_policies",
      "warehouse_resources",
      "warehouse_tasks",
    ].sort(),
  );
  assert.ok(!createdTables.includes("replenishment_rules"));
  assert.ok(!createdTables.includes("wms_proposals"));
});

test("WMS E1 — bloquea escritura directa en las 6 tablas nuevas y en inventory_quants e inventory_movements (MUST-D1 + C3)", () => {
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
    assert.ok(sql.includes(`'${tbl}'`), `falta tabla ${tbl} en bucle RLS`);
  }
  assert.ok(sql.includes("revoke insert, update, delete on public.%I from anon, authenticated"));
  assert.ok(
    sql.includes(
      "create policy tenant_read on public.%I for select to authenticated using (public.fornexa_has_tenant_access(tenant_id))",
    ),
  );
  assert.ok(
    sql.includes(
      "revoke all on function public.fornexa_wms_action(uuid, uuid, text, jsonb, text) from public, anon, authenticated;",
    ),
  );
  assert.ok(
    sql.includes(
      "grant execute on function public.fornexa_wms_action(uuid, uuid, text, jsonb, text) to service_role;",
    ),
  );
});

test("WMS E1 — paridad 1:1 de los 30 códigos WMS_* entre §3.1, migración SQL y lib/wms.ts", () => {
  const section31 =
    spec.split(/^### 3\.1 /m)[1]?.split(/^## 4\./m)[0] ?? "";
  const specCodes = [
    ...new Set(
      [...section31.matchAll(/^\|\s*`(WMS_[A-Z0-9_]+)`\s*\|/gm)].map((m) => m[1]),
    ),
  ].sort();

  const sqlRaisedCodes = [
    ...new Set(
      [...sql.matchAll(/raise\s+exception\s+'(WMS_[A-Z0-9_]+)'/gi)].map((m) => m[1]),
    ),
  ].sort();

  assert.deepEqual([...WMS_ERROR_CODES].sort(), specCodes);
  assert.deepEqual(sqlRaisedCodes, specCodes);
});

test("WMS E1 — resuelve herencia WAREHOUSE -> OWNER -> CATEGORY -> PRODUCT y blinda forbid_picking_unlocated = true", () => {
  const whId = "10000000-0000-4000-8000-000000000001";
  const ownerId = "20000000-0000-4000-8000-000000000001";
  const prodId = "30000000-0000-4000-8000-000000000001";

  const policies: WmsPolicyRecord[] = [
    {
      id: "p1",
      warehouse_id: whId,
      owner_party_id: null,
      scope: "WAREHOUSE",
      product_id: null,
      category_code: null,
      policy_version: 1,
      effective_from: "2026-10-01T00:00:00Z",
      superseded_at: null,
      params: {
        rotation: "FIFO",
        weight_tolerance_pct: 8,
        allow_mixed_lots_in_bin: true,
      },
    },
    {
      id: "p2",
      warehouse_id: whId,
      owner_party_id: ownerId,
      scope: "OWNER",
      product_id: null,
      category_code: null,
      policy_version: 1,
      effective_from: "2026-10-02T00:00:00Z",
      superseded_at: null,
      params: {
        rotation: "FEFO",
        allow_mixed_lots_in_bin: false,
      },
    },
    {
      id: "p3",
      warehouse_id: whId,
      owner_party_id: null,
      scope: "CATEGORY",
      product_id: null,
      category_code: "PHARMA",
      policy_version: 1,
      effective_from: "2026-10-03T00:00:00Z",
      superseded_at: null,
      params: {
        min_remaining_shelf_life_days: 60,
      },
    },
    {
      id: "p4",
      warehouse_id: whId,
      owner_party_id: ownerId,
      scope: "PRODUCT",
      product_id: prodId,
      category_code: null,
      policy_version: 2,
      effective_from: "2026-10-04T00:00:00Z",
      superseded_at: null,
      params: {
        weight_tolerance_pct: 2.5,
        forbid_picking_unlocated: false as unknown as true,
      },
    },
  ];

  const resolved = resolveEffectiveWmsPolicy(
    policies,
    whId,
    ownerId,
    prodId,
    "PHARMA",
  );

  assert.equal(resolved.rotation, "FEFO");
  assert.equal(resolved.allow_mixed_lots_in_bin, false);
  assert.equal(resolved.min_remaining_shelf_life_days, 60);
  assert.equal(resolved.weight_tolerance_pct, 2.5);
  assert.equal(resolved.forbid_picking_unlocated, true);
});

test("WMS E1 — motor interactivo de putaway respeta bloqueo, régimen térmico, capacidad y mezcla de lotes", () => {
  const whId = "10000000-0000-4000-8000-000000000001";
  const ownerId = "20000000-0000-4000-8000-000000000001";
  const prodId = "30000000-0000-4000-8000-000000000001";

  const zones: WmsZone[] = [
    {
      id: "z-amb",
      warehouse_id: whId,
      zone_code: "Z-AMB",
      zone_name: "Ambient",
      zone_type: "STORAGE",
      temperature_regime: "AMBIENT",
      is_active: true,
    },
    {
      id: "z-frz",
      warehouse_id: whId,
      zone_code: "Z-FRZ",
      zone_name: "Frozen",
      zone_type: "STORAGE",
      temperature_regime: "FROZEN",
      is_active: true,
    },
  ];

  const bins: WmsBin[] = [
    {
      id: "b-amb",
      warehouse_id: whId,
      zone_id: "z-amb",
      bin_code: "A-01-01",
      aisle: "A",
      rack: "01",
      shelf: "01",
      bin_position: "1",
      bin_type: "PALLET_RACK",
      max_weight_kg: 1000,
      max_volume_m3: 2.5,
      max_pallets: 1,
      is_blocked: false,
      block_reason: null,
      is_active: true,
    },
    {
      id: "b-frz-blocked",
      warehouse_id: whId,
      zone_id: "z-frz",
      bin_code: "F-01-01",
      aisle: "F",
      rack: "01",
      shelf: "01",
      bin_position: "1",
      bin_type: "PALLET_RACK",
      max_weight_kg: 1000,
      max_volume_m3: 2.5,
      max_pallets: 1,
      is_blocked: true,
      block_reason: "ICE",
      is_active: true,
    },
    {
      id: "b-frz-ok",
      warehouse_id: whId,
      zone_id: "z-frz",
      bin_code: "F-01-02",
      aisle: "F",
      rack: "01",
      shelf: "02",
      bin_position: "1",
      bin_type: "PALLET_RACK",
      max_weight_kg: 1000,
      max_volume_m3: 2.5,
      max_pallets: 2,
      is_blocked: false,
      block_reason: null,
      is_active: true,
    },
  ];

  const frozenProd: WmsProduct = {
    id: prodId,
    sku: "SKU-FRZ-01",
    name: "Frozen Fish",
    category_code: "FROZEN",
    uom_base: "UN",
    gross_weight_kg: 5,
    volume_m3: 0.01,
    is_hazardous: false,
    is_temperature_controlled: true,
    temp_min_c: -22,
    temp_max_c: -18,
    shelf_life_days: 180,
    is_batch_managed: true,
    is_serial_managed: false,
    owner_party_id: ownerId,
  };

  const hu: WmsHandlingUnit = {
    id: "hu-1",
    warehouse_id: whId,
    code: "WMS-TEST-HU-FRZ",
    code_type: "LPN",
    hu_type: "PALLET",
    state: "STAGING_CHECKED",
    current_bin_id: null,
    current_dock_id: null,
    owner_party_id: ownerId,
    parent_hu_id: null,
    gross_weight_kg: 450,
    volume_m3: 1.2,
    label_issued_at: null,
    is_active: true,
    created_at: "2026-10-17T08:00:00Z",
    updated_at: "2026-10-17T08:00:00Z",
  };

  const proposal = computePutawayProposal({
    hu,
    content: {
      id: "c1",
      handling_unit_id: hu.id,
      product_id: prodId,
      batch_number: "LOT-FRZ-01",
      serial_number: null,
      expiry_date: "2027-04-01",
      quantity: 90,
      uom: "UN",
    },
    product: frozenProd,
    bins,
    zones,
    quants: [],
    allHus: [hu],
    policy: DEFAULT_WMS_POLICY,
  });

  assert.equal(proposal.recommended_bin_id, "b-frz-ok");
  assert.equal(proposal.recommended_bin_code, "F-01-02");
  assert.equal(proposal.temperature_regime, "FROZEN");
});

test("WMS E1 — motor de asignación de picking aplica fail-closed sobre flow_state NULL y STAGING_* y ordena por FEFO", () => {
  const whId = "10000000-0000-4000-8000-000000000001";
  const prodId = "30000000-0000-4000-8000-000000000001";

  const bins: WmsBin[] = [
    {
      id: "b1",
      warehouse_id: whId,
      zone_id: null,
      bin_code: "A-01-01",
      aisle: "A",
      rack: "01",
      shelf: "01",
      bin_position: "1",
      bin_type: "PALLET_RACK",
      max_weight_kg: 1000,
      max_volume_m3: 2,
      max_pallets: 2,
      is_blocked: false,
      block_reason: null,
      is_active: true,
    },
  ];
  const products: WmsProduct[] = [
    {
      id: prodId,
      sku: "SKU-01",
      name: "Test Product",
      category_code: null,
      uom_base: "UN",
      gross_weight_kg: 1,
      volume_m3: 0.01,
      is_hazardous: false,
      is_temperature_controlled: false,
      temp_min_c: null,
      temp_max_c: null,
      shelf_life_days: 90,
      is_batch_managed: true,
      is_serial_managed: false,
      owner_party_id: null,
    },
  ];
  const quants: WmsQuant[] = [
    {
      id: "q-legacy-null",
      warehouse_id: whId,
      bin_id: "b1",
      product_id: prodId,
      owner_party_id: null,
      batch_number: "LOT-OLD",
      serial_number: null,
      expiry_date: "2026-11-01",
      quantity_on_hand: 500,
      quantity_reserved: 0,
      uom: "UN",
      stock_status: "AVAILABLE",
      flow_state: null,
      hu_id: null,
      updated_at: "2026-10-01T00:00:00Z",
    },
    {
      id: "q-staging",
      warehouse_id: whId,
      bin_id: "b1",
      product_id: prodId,
      owner_party_id: null,
      batch_number: "LOT-STG",
      serial_number: null,
      expiry_date: "2026-11-15",
      quantity_on_hand: 200,
      quantity_reserved: 0,
      uom: "UN",
      stock_status: "AVAILABLE",
      flow_state: "STAGING_CHECKED",
      hu_id: "hu-stg",
      updated_at: "2026-10-17T08:00:00Z",
    },
    {
      id: "q-stored-late",
      warehouse_id: whId,
      bin_id: "b1",
      product_id: prodId,
      owner_party_id: null,
      batch_number: "LOT-2027-06",
      serial_number: null,
      expiry_date: "2027-06-01",
      quantity_on_hand: 50,
      quantity_reserved: 0,
      uom: "UN",
      stock_status: "AVAILABLE",
      flow_state: "STORED",
      hu_id: "hu-2",
      updated_at: "2026-10-17T08:00:00Z",
    },
    {
      id: "q-stored-early",
      warehouse_id: whId,
      bin_id: "b1",
      product_id: prodId,
      owner_party_id: null,
      batch_number: "LOT-2027-01",
      serial_number: null,
      expiry_date: "2027-01-15",
      quantity_on_hand: 40,
      quantity_reserved: 0,
      uom: "UN",
      stock_status: "AVAILABLE",
      flow_state: "STORED",
      hu_id: "hu-1",
      updated_at: "2026-10-17T08:05:00Z",
    },
  ];

  const proposals = computePickAllocationProposals({
    warehouseId: whId,
    productId: prodId,
    requiredQty: 60,
    quants,
    bins,
    products,
    tasks: [],
    policy: DEFAULT_WMS_POLICY,
  });

  assert.deepEqual(
    proposals.map((p) => p.quant_id),
    ["q-stored-early", "q-stored-late"],
  );
  assert.equal(proposals[0].recommended_qty, 40);
  assert.equal(proposals[1].recommended_qty, 20);
});

test("WMS E1 — wmsRpcFailure mapea los 30 códigos cerrados de §3.1 a estatus HTTP determinista", () => {
  for (const code of WMS_ERROR_CODES) {
    const mapped = wmsRpcFailure({ message: `ERROR: ${code}` });
    assert.equal(mapped.code, code);
    assert.ok([403, 409, 422].includes(mapped.status));
  }
});
