import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

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
