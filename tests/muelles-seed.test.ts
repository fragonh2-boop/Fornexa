import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { assertSessionModeEndpoint } from "../scripts/muelles/seed-guard.ts";

const ROOT = resolve(import.meta.dirname, "..");

function sha256File(relPath: string): string {
  const buf = readFileSync(resolve(ROOT, relPath));
  return createHash("sha256").update(buf).digest("hex");
}

test("MUELLES-SEED manifest, loader, compensation rollback and execution receipt are consistent and committed", () => {
  const manifest = JSON.parse(
    readFileSync(resolve(ROOT, "docs/verification/muelles-seed-manifest.json"), "utf8")
  );
  const receipt = JSON.parse(
    readFileSync(resolve(ROOT, "docs/verification/muelles-seed-execution-receipt.json"), "utf8")
  );

  assert.equal(manifest.batch_id, "MUELLES-SEED-PRODUCTION-20261017");
  assert.equal(manifest.tenant_id, "00000000-0000-4000-8000-000000000001");
  assert.equal(manifest.total_rows, 2031);

  const actualLoaderSha = sha256File("scripts/muelles/muelles-seed-loader.sql");
  const actualRollbackSha = sha256File("scripts/muelles/muelles-seed-rollback.sql");

  assert.equal(actualLoaderSha, manifest.loader_sql_sha256);
  assert.equal(actualRollbackSha, manifest.rollback_sql_sha256);

  assert.equal(receipt.status, "COMMITTED");
  assert.equal(receipt.batch_id, manifest.batch_id);
  assert.equal(receipt.tenant_id, manifest.tenant_id);
  assert.equal(receipt.loader_sql_sha256, manifest.loader_sql_sha256);
  assert.equal(receipt.rollback_sql_sha256, manifest.rollback_sql_sha256);
  assert.equal(receipt.total_rows_inserted, 2031);

  const expectedCounts: Record<string, number> = {
    warehouse_zones: 450,
    warehouse_docks: 800,
    dock_appointment_rules: 450,
    dock_policies: 150,
    dock_appointments: 150,
    transport_events: 31,
  };

  for (const [table, count] of Object.entries(expectedCounts)) {
    assert.equal(manifest.tables[table]?.count, count, `Manifest count mismatch for ${table}`);
    assert.equal(receipt.tables[table]?.inserted_count, count, `Receipt inserted_count mismatch for ${table}`);
    assert.equal(receipt.tables[table]?.ids?.length, count, `Receipt ids length mismatch for ${table}`);
  }

  // Ensure dock-loader .limit(1000) safety threshold is respected in production after load
  assert.ok(receipt.counts_after.warehouse_zones < 1000);
  assert.ok(receipt.counts_after.warehouse_docks < 1000);
  assert.ok(receipt.counts_after.dock_appointment_rules < 1000);
});

test("MUELLES-SEED endpoint guard rejects the transaction pooler before connecting", () => {
  // El lote va en una transacción con sentencias múltiples: solo vale el modo sesión.
  assert.deepEqual(assertSessionModeEndpoint("postgresql://u:p@aws-0-eu-central-1.pooler.supabase.com:5432/postgres"), {
    host: "aws-0-eu-central-1.pooler.supabase.com",
    port: "5432",
  });
  assert.equal(assertSessionModeEndpoint("postgresql://u:p@db.example.com/postgres").port, "5432");

  assert.throws(
    () => assertSessionModeEndpoint("postgresql://u:p@aws-0-eu-central-1.pooler.supabase.com:6543/postgres"),
    /pooler transaccional/,
  );
  assert.throws(() => assertSessionModeEndpoint("postgresql://u:p@db.example.com:5433/postgres"), /no reconocido/);
  assert.throws(() => assertSessionModeEndpoint("no-es-una-url"), /Endpoint inválido/);
});

test("MUELLES-SEED runner resolves pg from the project, not from a temp folder", () => {
  const runner = readFileSync(resolve(ROOT, "scripts/muelles/run_muelles_seed.ts"), "utf8");
  assert.doesNotMatch(runner, /\/private\/tmp\//, "el runner no puede depender de una ruta temporal absoluta");
  assert.match(runner, /from "\.\/seed-guard\.ts"/, "el runner debe usar el guard de endpoint");
  assert.match(runner, /require\("pg"\)/, "el runner debe resolver 'pg' como módulo del proyecto");

  const pkg = JSON.parse(readFileSync(resolve(ROOT, "package.json"), "utf8"));
  assert.ok(pkg.devDependencies?.pg, "'pg' debe estar declarado como dependencia de desarrollo");
});
