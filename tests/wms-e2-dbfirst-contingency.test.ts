// tests/wms-e2-dbfirst-contingency.test.ts
// Unit and static validation test for WMS E2 DB-First Contingency Package

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
// @ts-expect-error - import from local .mjs harness script
import { sha256, stripExteriorTx, validateIsolation, REQUIRED_CONFIRM_TOKEN } from "../scripts/wms/verify-e2-dbfirst-contingency.mjs";

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

test("E2 Rollback Script Safety and Non-Destructive Guardrails (MUST-G1..G4)", () => {
  const rollbackSql = readFileSync(resolve(ROOT, "scripts/wms/rollback-wms-e2-core.sql"), "utf8");

  assert.ok(rollbackSql.length > 0, "Rollback script must exist and not be empty");
  assert.ok(rollbackSql.includes("drop table if exists public.wms_proposals"), "Must drop wms_proposals");
  assert.ok(rollbackSql.includes("drop table if exists public.replenishment_rules"), "Must drop replenishment_rules");
  assert.ok(
    rollbackSql.includes("inventory_quants_bin_id_product_id_owner_party_id_batch_num_key"),
    "Must restore canonical pre-E2 unique key"
  );

  // MUST-G1: Pre-E2 columns must NOT be dropped
  assert.ok(
    !rollbackSql.includes("drop column if exists source_bin_id"),
    "MUST-G1: Must NOT drop warehouse_tasks.source_bin_id (pre-existing E1/C3 column)"
  );
  assert.ok(
    !rollbackSql.includes("drop column if exists destination_bin_id"),
    "MUST-G1: Must NOT drop warehouse_tasks.destination_bin_id (pre-existing E1/C3 column)"
  );
  assert.ok(
    !rollbackSql.includes("drop column if exists flow_state"),
    "MUST-G1: Must NOT drop inventory_quants.flow_state (pre-existing E1 core column)"
  );

  // MUST-G2: Invert all E2 stock_reservations additions
  assert.ok(
    rollbackSql.includes("drop column if exists reference_type"),
    "MUST-G2: Must drop stock_reservations.reference_type"
  );
  assert.ok(
    rollbackSql.includes("drop column if exists reference_id"),
    "MUST-G2: Must drop stock_reservations.reference_id"
  );
  assert.ok(
    rollbackSql.includes("drop constraint if exists chk_stock_reservations_reference_type"),
    "MUST-G2: Must drop chk_stock_reservations_reference_type constraint"
  );
  assert.ok(
    rollbackSql.includes("drop index if exists public.stock_reservations_ref_idx"),
    "MUST-G2: Must drop stock_reservations_ref_idx"
  );

  // MUST-G3: Multi-HU lot collision pre-flight before constraint restoration
  assert.ok(
    rollbackSql.includes("WMS_ROLLBACK_BLOCKED_COLLISION"),
    "MUST-G3: Must implement pre-flight collision check to fail-closed on split pallets"
  );

  // MUST-G4: Traceability protection on executed proposals
  assert.ok(
    rollbackSql.includes("WMS_ROLLBACK_BLOCKED"),
    "MUST-G4: Must abort fail-closed if executed proposals exist"
  );
  assert.ok(
    rollbackSql.includes("wms_proposals_archive"),
    "MUST-G4: Must archive executed proposals when explicitly overridden"
  );

  // Non-destructive data integrity
  assert.ok(!rollbackSql.toLowerCase().includes("delete from public.inventory_quants"), "Must NOT delete inventory quants");
  assert.ok(!rollbackSql.toLowerCase().includes("truncate public.inventory_quants"), "Must NOT truncate inventory quants");
  assert.ok(!rollbackSql.toLowerCase().includes("delete from public.inventory_movements"), "Must NOT delete inventory movements");
});

test("Harness Destructive Guardrails and Isolation (MUST-G5)", () => {
  // 1. Rejects unauthorized hosts
  assert.throws(
    () => validateIsolation({ host: "db.fornexa.internal", database: "fornexa_e2_test", confirmToken: REQUIRED_CONFIRM_TOKEN }),
    /\[SECURITY_FATAL MUST-G5\] Host 'db\.fornexa\.internal' is NOT an authorized loopback/,
    "Must throw on remote host"
  );

  // 2. Rejects unauthorized / production databases
  for (const forbiddenDb of ["postgres", "fornexa", "production", "defaultdb", "fornexa_prod"]) {
    assert.throws(
      () => validateIsolation({ host: "127.0.0.1", database: forbiddenDb, confirmToken: REQUIRED_CONFIRM_TOKEN }),
      /\[SECURITY_FATAL MUST-G5\] Database '.*' is NOT in the authorized disposable test allowlist/,
      `Must throw on forbidden database: ${forbiddenDb}`
    );
  }

  // 3. Rejects missing or wrong confirmation token
  assert.throws(
    () => validateIsolation({ host: "127.0.0.1", database: "fornexa_e2_test", confirmToken: "WRONG" }),
    /\[SECURITY_FATAL MUST-G5\] Missing or invalid confirmation token/,
    "Must throw on missing or invalid confirmation token"
  );

  // 4. Accepts valid loopback + disposable database + confirmation token
  assert.doesNotThrow(() => {
    validateIsolation({
      host: "127.0.0.1",
      database: "fornexa_e2_test",
      confirmToken: REQUIRED_CONFIRM_TOKEN,
    });
  }, "Must accept authorized disposable CI configuration");
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
    e2Job.includes("CONFIRM_DISPOSABLE_RUN: \"DISPOSABLE_PG17_CI_RUN\""),
    "verify-e2-pg17 must pass confirmation token for disposable test run"
  );
  assert.ok(
    e2Job.includes("receipt-e2-dbfirst-contingency-pg17"),
    "verify-e2-pg17 must upload receipt-e2-dbfirst-contingency-pg17 artifact"
  );
});
