// tests/wms-e2-dbfirst-contingency.test.ts
// Unit and static validation test for WMS E2 DB-First Contingency Package

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
// @ts-expect-error - import from local .mjs harness script
import {
  sha256,
  stripExteriorTx,
  assertDisposableTarget,
  runContingencyHarness,
  DESTRUCTIVE_CONFIRM_ENV,
  DESTRUCTIVE_CONFIRM_TOKEN,
} from "../scripts/wms/verify-e2-dbfirst-contingency.mjs";

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

// SHOULD (02-nov): derive from the migration which columns E2 core adds, and require the rollback
// to drop exactly those — in both directions — instead of matching substrings by name.
test("E2 rollback drops exactly the columns E2 core adds (no pre-E2 loss, no residue)", () => {
  const coreSql = readFileSync(resolve(ROOT, "supabase/migrations/20261024120000_wms_e2_replenishment_core.sql"), "utf8");
  const rollbackSql = readFileSync(resolve(ROOT, "scripts/wms/rollback-wms-e2-core.sql"), "utf8");

  const columnsBy = (sql: string, verb: "add" | "drop") => {
    const out = new Set<string>();
    const blocks = sql.matchAll(/alter table (?:if exists )?public\.(\w+)([\s\S]*?);/gi);
    for (const [, table, body] of blocks) {
      const re = new RegExp(`${verb} column if (?:not )?exists (\\w+)`, "gi");
      for (const [, column] of body.matchAll(re)) out.add(`${table}.${column}`);
    }
    return [...out].sort();
  };

  const added = columnsBy(coreSql, "add");
  const dropped = columnsBy(rollbackSql, "drop");
  assert.deepEqual(dropped, added, "rollback column drops must equal E2 core column additions");
  for (const preE2 of ["warehouse_tasks.source_bin_id", "warehouse_tasks.destination_bin_id", "warehouse_tasks.target_hu_id", "inventory_quants.flow_state", "inventory_quants.hu_id"]) {
    assert.ok(!dropped.includes(preE2), `rollback must not drop pre-E2 column ${preE2}`);
  }
});

test("E2 rollback aborts (raise exception) on executed proposals and key collisions, and archives first", () => {
  const rollbackSql = readFileSync(resolve(ROOT, "scripts/wms/rollback-wms-e2-core.sql"), "utf8");
  assert.match(rollbackSql, /raise exception 'E2_ROLLBACK_BLOCKED_EXECUTED_PROPOSALS/);
  assert.match(rollbackSql, /raise exception 'E2_ROLLBACK_BLOCKED_KEY_COLLISION/);
  assert.ok(!/raise notice/i.test(rollbackSql), "a safety guard must never be a notice");
  const archiveAt = rollbackSql.indexOf("insert into private.wms_e2_rollback_archive");
  const dropAt = rollbackSql.indexOf("drop table if exists public.wms_proposals");
  assert.ok(archiveAt > 0 && archiveAt < dropAt, "proposals must be archived before wms_proposals is dropped");
});

// MUST-G5: the harness drops every non-system schema. It must refuse any target that is not a
// disposable loopback database confirmed by an explicit token, before the first query.
const CONFIRMED = { [DESTRUCTIVE_CONFIRM_ENV]: DESTRUCTIVE_CONFIRM_TOKEN };

test("MUST-G5: assertDisposableTarget accepts only loopback + disposable database + explicit token", () => {
  assert.doesNotThrow(() => assertDisposableTarget({ host: "127.0.0.1", database: "fornexa_e2_test" }, CONFIRMED));
  assert.throws(() => assertDisposableTarget({ host: "db.example.supabase.co", database: "fornexa_e2_test" }, CONFIRMED), /not loopback/);
  assert.throws(() => assertDisposableTarget({ host: "127.0.0.1", database: "postgres" }, CONFIRMED), /disposable allowlist/);
  assert.throws(() => assertDisposableTarget({ host: "127.0.0.1", database: "fornexa_e2_test" }, {}), /must equal/);
  assert.throws(() => assertDisposableTarget({ host: "127.0.0.1", database: "fornexa_e2_test" }, { [DESTRUCTIVE_CONFIRM_ENV]: "yes" }), /must equal/);
});

function fakeDriver(serverDatabase: string) {
  const calls: string[] = [];
  class Client {
    async connect() { calls.push("connect"); }
    async end() { calls.push("end"); }
    async query(sql: string) {
      calls.push(sql);
      if (/current_database\(\)/.test(sql)) return { rows: [{ db: serverDatabase }] };
      return { rows: [{ version: "PostgreSQL 17 (fake)" }] };
    }
  }
  return { driver: { Client }, calls };
}

test("MUST-G5: harness refuses a non-disposable target before connecting", async () => {
  const saved = { ...process.env };
  try {
    process.env.PGHOST = "127.0.0.1";
    process.env.PGDATABASE = "postgres";
    const { driver, calls } = fakeDriver("postgres");
    await assert.rejects(
      runContingencyHarness({ useRealPostgres: true, pgDriver: driver, env: CONFIRMED }),
      /SECURITY_FATAL MUST-G5/,
    );
    assert.deepEqual(calls, [], "no connection and no query may happen");
  } finally {
    process.env = saved;
  }
});

test("MUST-G5: harness refuses when the server is not a disposable database, before any drop", async () => {
  const saved = { ...process.env };
  try {
    process.env.PGHOST = "127.0.0.1";
    process.env.PGDATABASE = "fornexa_e2_test";
    const { driver, calls } = fakeDriver("postgres");
    await assert.rejects(
      runContingencyHarness({ useRealPostgres: true, pgDriver: driver, env: CONFIRMED }),
      /current_database\(\)='postgres'/,
    );
    assert.ok(!calls.some((q) => /drop schema/i.test(q)), "no schema may be dropped");
  } finally {
    process.env = saved;
  }
});
