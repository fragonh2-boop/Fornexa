// tests/wms-e2-dbfirst-contingency.test.ts
// Unit and static validation test for WMS E2 DB-First Contingency Package

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
// @ts-expect-error - import from local .mjs harness script
import { sha256, stripExteriorTx } from "../scripts/wms/verify-e2-dbfirst-contingency.mjs";

const ROOT = resolve(import.meta.dirname, "..");

test("E2 DB-First Source Hashes and Statement Decomposition", () => {
  const coreSql = readFileSync(
    resolve(ROOT, "supabase/migrations/20261024120000_wms_e2_replenishment_core.sql"),
    "utf8"
  );
  const rpcSql = readFileSync(
    resolve(ROOT, "supabase/migrations/20261024120100_wms_e2_replenishment_rpc.sql"),
    "utf8"
  );

  const coreSha = sha256(coreSql);
  const rpcSha = sha256(rpcSql);

  assert.equal(coreSha, "ec8dff4ada02a7b1e9be54baf690e2128f9c79507ab5bd6c32277c82941b8d2e");
  assert.equal(rpcSha, "b26a2cd2b3cf9198d53aa5aab22574904c97cb4ae79b7378802a3d904d477fdc");

  const coreStripped = stripExteriorTx(coreSql);
  const rpcStripped = stripExteriorTx(rpcSql);

  assert.equal(coreStripped.totalStatements, 43, "Core total statements including outer BEGIN/COMMIT");
  assert.equal(coreStripped.innerStatementCount, 41, "Core interior statements count must be 41");

  assert.equal(rpcStripped.totalStatements, 20, "RPC total statements including outer BEGIN/COMMIT");
  assert.equal(rpcStripped.innerStatementCount, 18, "RPC interior statements count must be 18");
});

test("E2 Rollback Script Safety and Non-Destructive Guardrails", () => {
  const rollbackSql = readFileSync(resolve(ROOT, "scripts/wms/rollback-wms-e2-core.sql"), "utf8");

  assert.ok(rollbackSql.length > 0, "Rollback script must exist and not be empty");
  assert.ok(rollbackSql.includes("drop table if exists public.wms_proposals"), "Must drop wms_proposals");
  assert.ok(rollbackSql.includes("drop table if exists public.replenishment_rules"), "Must drop replenishment_rules");
  assert.ok(
    rollbackSql.includes("inventory_quants_bin_id_product_id_owner_party_id_batch_num_key"),
    "Must restore canonical pre-E2 unique key"
  );

  // Critical non-destructive guard: must NOT drop flow_state which was introduced in E1
  assert.ok(
    !rollbackSql.includes("drop column if exists flow_state"),
    "Must NOT drop flow_state (belongs to E1 core domain)"
  );
  // Must NOT touch quants data
  assert.ok(!rollbackSql.toLowerCase().includes("delete from public.inventory_quants"), "Must NOT delete inventory quants");
  assert.ok(!rollbackSql.toLowerCase().includes("truncate public.inventory_quants"), "Must NOT truncate inventory quants");
  assert.ok(!rollbackSql.toLowerCase().includes("delete from public.inventory_movements"), "Must NOT delete inventory movements");
});

test("CI Workflow Wiring for WMS E2 DB-First Contingency", () => {
  const workflow = readFileSync(resolve(ROOT, ".github/workflows/ci.yml"), "utf8");
  const e2Job = workflow.split("  verify-e2-pg17:\n")[1]?.split(/\n  [a-z][\w-]+:\n/)[0];
  assert.ok(e2Job, "verify-e2-pg17 job must exist in CI");

  assert.ok(
    e2Job.includes("node scripts/wms/verify-e2-dbfirst-contingency.mjs"),
    "verify-e2-pg17 must run verify-e2-dbfirst-contingency.mjs"
  );
  assert.ok(
    e2Job.includes("receipt-e2-dbfirst-contingency-pg17"),
    "verify-e2-pg17 must upload receipt-e2-dbfirst-contingency-pg17 artifact"
  );
});
