import assert from "node:assert/strict";
import { readFileSync, writeFileSync, unlinkSync, existsSync, openSync, closeSync, mkdirSync, rmSync } from "node:fs";
import { spawn } from "node:child_process";
import test from "node:test";
import os from "node:os";
import path from "node:path";
import {
  loadReceipt,
  recordExecutionReceiptFromReturning,
  generateRollbackSqlFromExecutionReceipt,
  writeJsonAtomicallyWithFsync,
  executeData150Loader,
  computeSqlSha256,
  validateAndLoadDurableReceipt,
  validateReturnedRow,
  reconcileInFlightReceipt,
  DATA150_TENANT_ID,
  DATA150_BATCH_ID,
  withFileLock,
  safeReclaimOrphanLock,
  checkLiveProcessHoldingFd,
} from "../lib/data150-loader.ts";
import type { Data150ExecutionReceipt } from "../lib/data150-loader.ts";
import {
  generateOperationalRollback,
  validateExecutionReceiptForRollback,
} from "../scripts/data150/generate_rollback_from_receipt.ts";

const MANIFEST_PATH = "docs/verification/data150-manifest-20261009.json";
const LOADER_SQL_PATH = "scripts/data150/data150-loader.sql";
const ROLLBACK_SQL_PATH = "scripts/data150/data150-rollback.sql";
const MATRIX_PATH = "docs/verification/data150-table-inventory-and-coverage-matrix.md";
const DATASET_PATH = "docs/verification/data150-dataset.json";

const TENANT_ID = DATA150_TENANT_ID;
const BATCH_ID = DATA150_BATCH_ID;

test("DATA150 manifest exists and declares exact table coverage", () => {
  assert.ok(existsSync(MANIFEST_PATH), "Manifest must exist");
  const raw = readFileSync(MANIFEST_PATH, "utf8");
  const manifest = JSON.parse(raw);

  assert.equal(manifest.batch_id, BATCH_ID);
  assert.equal(manifest.tenant_id, TENANT_ID);

  const tables = Object.keys(manifest.tables);
  assert.equal(tables.length, 67, "Must cover exactly 67 business tables");

  for (const [table, meta] of Object.entries<any>(manifest.tables)) {
    assert.equal(meta.row_count, 150, `Table ${table} must have exactly 150 rows`);
  }
});

test("DATA150 loader SQL file is well-formed, transactional, idempotent, and uses RETURNING", () => {
  assert.ok(existsSync(LOADER_SQL_PATH), "Loader SQL must exist");
  const sql = readFileSync(LOADER_SQL_PATH, "utf8");

  assert.ok(sql.startsWith("-- FORNEXA"), "Must start with header");
  assert.ok(sql.includes("BEGIN;"), "Must begin transaction");
  assert.ok(sql.includes("COMMIT;"), "Must commit transaction");
  assert.ok(sql.includes(TENANT_ID), "Must explicitly include tenant_id");
  assert.ok(sql.includes(BATCH_ID), "Must explicitly identify batch");

  // Verify conflict handling and RETURNING clause for tables with PKs
  assert.ok(sql.includes("ON CONFLICT"), "Must use ON CONFLICT for idempotency");
  assert.ok(sql.includes("RETURNING"), "Must use RETURNING to capture effectively inserted rows only");

  // Verify WHERE NOT EXISTS with RETURNING for identity tables
  assert.ok(
    sql.includes("WHERE NOT EXISTS (SELECT 1 FROM public.operational_events") &&
      sql.includes("RETURNING id, entity_code"),
    "operational_events must use WHERE NOT EXISTS and RETURNING id, entity_code"
  );
  assert.ok(
    sql.includes("WHERE NOT EXISTS (SELECT 1 FROM public.customs_events") &&
      sql.includes("RETURNING id, case_id"),
    "customs_events must use WHERE NOT EXISTS and RETURNING id, case_id"
  );

  // Check lines count
  const lines = sql.split("\n");
  assert.ok(lines.length > 10000, "Must have over 10,000 lines of SQL statements");

  // Zero fabricated phones
  assert.ok(!sql.includes("+3491"), "Must not generate dialable Spanish phone prefixes");
  assert.ok(!sql.includes("+34900"), "Must not generate toll-free 900 commercial numbers");

  // RFC 2606 test domains for email
  assert.ok(sql.includes("@fornexatest.invalid"), "Must use reserved .invalid test domain");
});

test("DATA150 loader parses exactly 10,050 INSERT statements across all 67 tables (0 lost statements)", () => {
  const sql = readFileSync(LOADER_SQL_PATH, "utf8");
  const rawLines = sql.split("\n");
  const statements: string[] = [];
  let currentStmt = "";

  for (const line of rawLines) {
    const trimmed = line.trim();
    if (trimmed.startsWith("--") || trimmed === "BEGIN;" || trimmed === "COMMIT;" || trimmed === "") {
      continue;
    }
    currentStmt += (currentStmt ? " " : "") + trimmed;
    if (trimmed.endsWith(";")) {
      statements.push(currentStmt);
      currentStmt = "";
    }
  }

  assert.equal(statements.length, 10050, "Must extract all 10,050 statements without losing table headers");
  const tableMatches = statements.map((s) => s.match(/INSERT INTO public\.([a-z0-9_]+)/)?.[1]).filter(Boolean);
  const distinctTables = new Set(tableMatches);
  assert.equal(distinctTables.size, 67, "Must cover all 67 tables");
});

test("DATA150 rollback SQL file is a fail-closed stub that prevents speculative execution", () => {
  assert.ok(existsSync(ROLLBACK_SQL_PATH), "Rollback SQL stub must exist");
  const sql = readFileSync(ROLLBACK_SQL_PATH, "utf8");

  // Verify that the template does NOT contain speculative DELETE statements:
  assert.ok(!sql.includes("DELETE FROM public."), "Rollback stub must NOT contain speculative DELETE statements");

  // Verify that the file raises an exception in Postgres if executed directly:
  assert.ok(sql.includes("RAISE EXCEPTION"), "Rollback stub must raise exception if executed before dynamic generation");
  assert.ok(sql.includes("SEGURIDAD FAIL-CLOSED"), "Rollback stub must clearly declare fail-closed security");
});

test("DATA150 dynamic rollback SQL generation mirrors batch in reverse order and is fully scoped", () => {
  // Sample execution receipt representing confirmed keys
  const sampleReceipt: Data150ExecutionReceipt = {
    transport_events: {
      table: "transport_events",
      pk_type: "single",
      pk_col: "id",
      inserted_count: 2,
      inserted_keys: ["EVT-001", "EVT-002"],
    },
    cmr_expeditions: {
      table: "cmr_expeditions",
      pk_type: "composite",
      pks: ["cmr_id", "expedition_id"],
      inserted_count: 1,
      inserted_keys: [["CMR-001", "EXP-001"]],
    },
    tariff_zones: {
      table: "tariff_zones",
      pk_type: "single",
      pk_col: "id",
      inserted_count: 1,
      inserted_keys: ["ZONE-001"],
    },
  };

  const sql = generateRollbackSqlFromExecutionReceipt(sampleReceipt, TENANT_ID);

  assert.ok(sql.includes("BEGIN;"), "Must begin transaction");
  assert.ok(sql.includes("COMMIT;"), "Must commit transaction");
  assert.ok(sql.includes(TENANT_ID), "Must scope deletes to tenant");

  // Verify reverse topological order: transport_events should appear before tariff_zones
  const idxEvents = sql.indexOf("transport_events");
  const idxZones = sql.indexOf("tariff_zones");
  assert.ok(idxEvents < idxZones, "Rollback must delete leaf tables (transport_events) before root tables (tariff_zones)");

  // Verify composite PK handling for cmr_expeditions (table without tenant, proved via parent cmr_documents)
  assert.ok(
    sql.includes("DELETE FROM public.cmr_expeditions WHERE (cmr_id, expedition_id) IN (('CMR-001', 'EXP-001')) AND cmr_id IN (SELECT id FROM public.cmr_documents WHERE tenant_id = '00000000-0000-4000-8000-000000000001');"),
    "Rollback must delete cmr_expeditions using composite primary key and parent tenant check"
  );

  // Verify single PK handling scoped by tenant
  assert.ok(
    sql.includes("DELETE FROM public.tariff_zones WHERE \"id\" IN ('ZONE-001') AND tenant_id = '00000000-0000-4000-8000-000000000001';"),
    "Rollback must delete tariff_zones scoped by tenant"
  );
});

test("DATA150 addresses have 150 distinct and complete locations", () => {
  const sql = readFileSync(LOADER_SQL_PATH, "utf8");
  const addressInserts = sql.split("\n").filter((l) => l.includes("INSERT INTO public.party_addresses"));

  assert.equal(addressInserts.length, 150, "Must have exactly 150 address inserts");

  const addressLines = addressInserts.map((l) => {
    const valuesPart = l.split("VALUES (")[1];
    if (!valuesPart) return null;
    const parts = valuesPart.split("', '");
    return parts[6];
  }).filter(Boolean);

  assert.equal(addressLines.length, 150, "Must extract all 150 address lines");
  const uniqueStreets = new Set(addressLines);
  assert.equal(uniqueStreets.size, 150, "All 150 address lines must be distinct");
});

test("DATA150 classification matrix is complete and coherent", () => {
  assert.ok(existsSync(MATRIX_PATH), "Matrix document must exist");
  const doc = readFileSync(MATRIX_PATH, "utf8");

  assert.ok(doc.includes("Total tablas inspeccionadas: 89"), "Must inspect all 89 tables");
  assert.ok(doc.includes("Tablas de negocio objetivo (67 tablas)"), "Must document 67 business tables");
  assert.ok(doc.includes("Catálogos finitos estándar legítimos < 150 (3 tablas)"), "Must document 3 finite catalogs");
  assert.ok(doc.includes("Catálogos normativos ADR preservados y asignaciones dependientes (7 tablas)"), "Must document 7 ADR tables");
  assert.ok(
    doc.includes("Tablas Excluidas / en Cuarentena: Mandato Legal y Regulatorio — Firmas, Evidencias y Artefactos (3 tablas)"),
    "Must document 3 legal/regulatory quarantined tables"
  );
  assert.ok(doc.includes("Tablas Excluidas: Logs Técnicos, Despacho y Revisiones (2 tablas)"), "Must document 2 tech logs excluded tables");

  // No raw tenant UUID leaked in public matrix doc
  assert.ok(!doc.includes(TENANT_ID), "Matrix document must not leak raw tenant UUID");
});

test("DATA150 JSONB and ARRAY columns serialize correctly with type awareness", () => {
  const sql = readFileSync(LOADER_SQL_PATH, "utf8");

  // customs_messages.error_codes is jsonb -> must be '[]'::jsonb, not '{}'
  assert.ok(sql.includes("INSERT INTO public.customs_messages"));
  const cmLine = sql.split("\n").find((l) => l.includes("INSERT INTO public.customs_messages"));
  assert.ok(cmLine?.includes("'[]'::jsonb"), "customs_messages must serialize empty JSON list as '[]'::jsonb");
  assert.ok(!cmLine?.includes("'{}'"), "customs_messages must not serialize empty list as Postgres array '{}'");

  // party_adr_profiles.preferred_classes is ARRAY (_text) -> must be '{}'
  const padrLine = sql.split("\n").find((l) => l.includes("INSERT INTO public.party_adr_profiles"));
  assert.ok(padrLine?.includes("'{}'"), "party_adr_profiles must serialize empty text array as '{}'");
});

test("DATA150 fixtures are inert and regulatory entities quarantined", () => {
  const dataset = JSON.parse(readFileSync(DATASET_PATH, "utf8"));

  // Connectors must be DISABLED and marked inert
  const connectors = dataset.connectors;
  assert.equal(connectors.length, 150);
  for (const c of connectors) {
    assert.equal(c.status, "DISABLED", "Connectors must be DISABLED to ensure zero external effects");
    assert.equal(c.configuration.inert, true, "Connector config must declare inert fixture");
  }

  // Quarantined regulatory tables must NOT be present in dataset
  assert.equal(dataset.regulatory_document_artifacts, undefined, "regulatory_document_artifacts must be excluded from batch");
  assert.equal(dataset.cmr_signatures, undefined, "cmr_signatures must be excluded from batch");
  assert.equal(dataset.transport_evidence, undefined, "transport_evidence must be excluded from batch");
});

test("DATA150 durable receipt contains complete composite and correlation keys", () => {
  const receipt = loadReceipt();
  assert.ok(receipt, "Receipt must load successfully");

  // Single PK table
  assert.equal(receipt.parties.pk_type, "single");
  assert.equal(receipt.parties.keys.length, 150);

  // Composite PK table
  assert.equal(receipt.cmr_expeditions.pk_type, "composite");
  assert.deepEqual((receipt.cmr_expeditions as any).pks, ["cmr_id", "expedition_id"]);
  assert.equal(receipt.cmr_expeditions.keys.length, 150);

  // Identity tables
  assert.equal(receipt.operational_events.pk_type, "identity");
  assert.equal((receipt.operational_events as any).correlation_col, "entity_code");
  assert.equal((receipt.operational_events as any).correlation_keys.length, 150);

  assert.equal(receipt.customs_events.pk_type, "identity");
  assert.equal((receipt.customs_events as any).correlation_col, "case_id");
  assert.equal((receipt.customs_events as any).correlation_keys.length, 150);
});

test("collision preservation: RETURNING excludes pre-existing row and rollback preserves pre-existing row", () => {
  const preExistingAddressId = "00000000-0000-4000-8000-000000009999";

  const freshlyInsertedRows = [
    { id: "00000000-0000-4000-8000-000000000001" },
    { id: "00000000-0000-4000-8000-000000000002" },
    { id: "00000000-0000-4000-8000-000000000003" },
  ];

  const simulatedReturned = {
    party_addresses: freshlyInsertedRows,
  };

  const executionReceipt = recordExecutionReceiptFromReturning(simulatedReturned, {
    persistToFile: false,
  });
  assert.equal(executionReceipt.party_addresses.inserted_count, 3);
  assert.deepEqual(executionReceipt.party_addresses.inserted_keys, [
    "00000000-0000-4000-8000-000000000001",
    "00000000-0000-4000-8000-000000000002",
    "00000000-0000-4000-8000-000000000003",
  ]);
  assert.ok(
    !executionReceipt.party_addresses.inserted_keys.includes(preExistingAddressId),
    "Execution receipt must not contain pre-existing row ID"
  );

  const rollbackSql = generateRollbackSqlFromExecutionReceipt(executionReceipt, TENANT_ID);

  assert.ok(rollbackSql.includes("00000000-0000-4000-8000-000000000001"));
  assert.ok(rollbackSql.includes("00000000-0000-4000-8000-000000000002"));
  assert.ok(rollbackSql.includes("00000000-0000-4000-8000-000000000003"));
  assert.ok(
    !rollbackSql.includes(preExistingAddressId),
    "Rollback SQL must NEVER delete pre-existing or foreign rows that were not inserted by this batch"
  );
});

test("DATA150 atomic fsync receipt writer is durable and resilient to partial writes", () => {
  const tempTarget = `/tmp/data150-atomic-test-${Date.now()}.json`;
  const data1 = { test: "initial_data", timestamp: Date.now() };
  const data2 = { test: "updated_data", timestamp: Date.now() + 100 };

  try {
    // 1. Initial write
    writeJsonAtomicallyWithFsync(tempTarget, data1);
    assert.ok(existsSync(tempTarget));
    assert.deepEqual(JSON.parse(readFileSync(tempTarget, "utf8")), data1);

    // 2. Atomic replacement
    writeJsonAtomicallyWithFsync(tempTarget, data2);
    assert.deepEqual(JSON.parse(readFileSync(tempTarget, "utf8")), data2);

    // 3. Negative check: writing to invalid directory throws and does not leave stray files
    assert.throws(() => {
      writeJsonAtomicallyWithFsync("/nonexistent-dir/sub/test.json", { fail: true });
    });
  } finally {
    if (existsSync(tempTarget)) {
      unlinkSync(tempTarget);
    }
  }
});

test("DATA150 operational rollback generator strictly requires COMMITTED status and fails closed on all negative cases", () => {
  // Negative Case 1: unexecuted receipt in repo
  assert.throws(() => {
    generateOperationalRollback();
  }, /Receipt status is 'PENDING_EXECUTION', expected 'COMMITTED'/);

  // Negative Case 2: IN_TRANSACTION_PRE_COMMIT
  assert.throws(() => {
    validateExecutionReceiptForRollback({
      status: "IN_TRANSACTION_PRE_COMMIT",
      batch_id: BATCH_ID,
      tenant_id: TENANT_ID,
      executed_at: new Date().toISOString(),
      tables: { party_addresses: { inserted_count: 1, inserted_keys: ["A"] } },
    });
  }, /Receipt status is 'IN_TRANSACTION_PRE_COMMIT', expected 'COMMITTED'/);

  // Negative Case 3: TRANSACTION_ABORTED_ROLLED_BACK
  assert.throws(() => {
    validateExecutionReceiptForRollback({
      status: "TRANSACTION_ABORTED_ROLLED_BACK",
      batch_id: BATCH_ID,
      tenant_id: TENANT_ID,
      executed_at: new Date().toISOString(),
      tables: { party_addresses: { inserted_count: 1, inserted_keys: ["A"] } },
    });
  }, /Receipt status is 'TRANSACTION_ABORTED_ROLLED_BACK', expected 'COMMITTED'/);

  // Negative Case 4: COMMIT_INDETERMINATE
  assert.throws(() => {
    validateExecutionReceiptForRollback({
      status: "COMMIT_INDETERMINATE",
      batch_id: BATCH_ID,
      tenant_id: TENANT_ID,
      executed_at: new Date().toISOString(),
      tables: { party_addresses: { inserted_count: 1, inserted_keys: ["A"] } },
    });
  }, /Receipt status is 'COMMIT_INDETERMINATE', expected 'COMMITTED'/);

  // Negative Case 5: batch_id mismatch
  assert.throws(() => {
    validateExecutionReceiptForRollback({
      status: "COMMITTED",
      batch_id: "DATA150-FAKE-BATCH",
      tenant_id: TENANT_ID,
      executed_at: new Date().toISOString(),
      tables: { party_addresses: { inserted_count: 1, inserted_keys: ["A"] } },
    });
  }, /Receipt batch_id mismatch/);

  // Negative Case 6: tenant_id mismatch
  assert.throws(() => {
    validateExecutionReceiptForRollback({
      status: "COMMITTED",
      batch_id: BATCH_ID,
      tenant_id: "00000000-0000-0000-0000-000000000000",
      executed_at: new Date().toISOString(),
      tables: { party_addresses: { inserted_count: 1, inserted_keys: ["A"] } },
    });
  }, /Receipt tenant_id mismatch/);

  // Negative Case 6b: missing or invalid dataset_hash
  assert.throws(() => {
    validateExecutionReceiptForRollback({
      status: "COMMITTED",
      batch_id: BATCH_ID,
      tenant_id: TENANT_ID,
      dataset_hash: "invalid_short_hash",
      executed_at: new Date().toISOString(),
      tables: { party_addresses: { inserted_count: 1, inserted_keys: ["A"] } },
    });
  }, /Receipt dataset_hash is missing or not a valid 64-character SHA-256 hex string/);

  // Negative Case 7: missing/invalid timestamp
  assert.throws(() => {
    validateExecutionReceiptForRollback({
      status: "COMMITTED",
      batch_id: BATCH_ID,
      tenant_id: TENANT_ID,
      dataset_hash: "8bf3235474d39578cb9dd278a4b14176c3402200066f3b9a5f2fa1efc2c1e913",
      executed_at: "not-a-date",
      tables: { party_addresses: { inserted_count: 1, inserted_keys: ["A"] } },
    });
  }, /Receipt executed_at timestamp is missing or invalid/);

  // Negative Case 8: empty tables map
  assert.throws(() => {
    validateExecutionReceiptForRollback({
      status: "COMMITTED",
      batch_id: BATCH_ID,
      tenant_id: TENANT_ID,
      dataset_hash: "8bf3235474d39578cb9dd278a4b14176c3402200066f3b9a5f2fa1efc2c1e913",
      executed_at: new Date().toISOString(),
      tables: {},
    });
  }, /Receipt tables map contains 0 tables/);

  // Negative Case 9: mismatched count vs keys
  assert.throws(() => {
    validateExecutionReceiptForRollback({
      status: "COMMITTED",
      batch_id: BATCH_ID,
      tenant_id: TENANT_ID,
      dataset_hash: "8bf3235474d39578cb9dd278a4b14176c3402200066f3b9a5f2fa1efc2c1e913",
      executed_at: new Date().toISOString(),
      tables: {
        party_addresses: {
          table: "party_addresses",
          pk_type: "single",
          pk_col: "id",
          inserted_count: 5,
          inserted_keys: ["A", "B"], // length 2 != 5
        },
      },
    });
  }, /count mismatch/);

  // Negative Case 10: Discrepant 64-character dataset hash
  assert.throws(() => {
    validateExecutionReceiptForRollback({
      status: "COMMITTED",
      batch_id: BATCH_ID,
      tenant_id: TENANT_ID,
      dataset_hash: "0000000000000000000000000000000000000000000000000000000000000000",
      executed_at: new Date().toISOString(),
      tables: {
        party_addresses: {
          table: "party_addresses",
          pk_type: "single",
          pk_col: "id",
          inserted_count: 1,
          inserted_keys: ["ADDR-1"],
        },
      },
    });
  }, /Receipt dataset_hash mismatch/);

  // Negative Case 11: SQL injection in primary key
  assert.throws(() => {
    validateExecutionReceiptForRollback({
      status: "COMMITTED",
      batch_id: BATCH_ID,
      tenant_id: TENANT_ID,
      dataset_hash: "8bf3235474d39578cb9dd278a4b14176c3402200066f3b9a5f2fa1efc2c1e913",
      executed_at: new Date().toISOString(),
      tables: {
        party_addresses: {
          table: "party_addresses",
          pk_type: "single",
          pk_col: "id",
          inserted_count: 1,
          inserted_keys: ["' OR 1=1 --"],
        },
      },
    });
  }, /Security validation failed/);

  // Negative Case 12: SQL injection in composite tuple
  assert.throws(() => {
    validateExecutionReceiptForRollback({
      status: "COMMITTED",
      batch_id: BATCH_ID,
      tenant_id: TENANT_ID,
      dataset_hash: "8bf3235474d39578cb9dd278a4b14176c3402200066f3b9a5f2fa1efc2c1e913",
      executed_at: new Date().toISOString(),
      tables: {
        cmr_expeditions: {
          table: "cmr_expeditions",
          pk_type: "composite",
          pks: ["cmr_id", "expedition_id"],
          inserted_count: 1,
          inserted_keys: [["CMR-1", "'; DROP TABLE students; --"]],
        },
      },
    });
  }, /Security validation failed/);

  // Positive Case: Valid COMMITTED receipt with authorized table, valid keys, and SHA-256 dataset hash
  const validPayload = {
    status: "COMMITTED" as const,
    batch_id: BATCH_ID,
    tenant_id: TENANT_ID,
    dataset_hash: "8bf3235474d39578cb9dd278a4b14176c3402200066f3b9a5f2fa1efc2c1e913",
    executed_at: new Date().toISOString(),
    tables: {
      party_addresses: {
        table: "party_addresses",
        pk_type: "single" as const,
        pk_col: "id",
        inserted_count: 2,
        inserted_keys: ["ADDR-1", "ADDR-2"],
      },
    },
  };
  const validated = validateExecutionReceiptForRollback(validPayload);
  assert.equal(validated.status, "COMMITTED");
  assert.equal(validated.tables.party_addresses.inserted_count, 2);
  assert.equal(validated.dataset_hash, "8bf3235474d39578cb9dd278a4b14176c3402200066f3b9a5f2fa1efc2c1e913");
});

test("DATA150 loader transaction lifecycle distinguishes pre-commit abort vs indeterminate commit vs post-commit write failure", async () => {
  // Test Case A: Pre-commit error triggers ROLLBACK and marks TRANSACTION_ABORTED_ROLLED_BACK
  const mockQueriesA: string[] = [];
  const resultA = await executeData150Loader(
    async (sql) => {
      mockQueriesA.push(sql.trim());
      if (sql.includes("INSERT INTO public.party_addresses")) {
        throw new Error("Simulated pre-commit database constraint failure");
      }
      return [];
    },
    {
      loaderSql: `BEGIN;\nINSERT INTO public.party_addresses ("id") VALUES ('A') RETURNING id;\nCOMMIT;`,
      persistToFile: false,
    }
  );
  assert.equal(resultA.success, false);
  assert.equal(resultA.db_committed, false);
  assert.equal(resultA.status, "TRANSACTION_ABORTED_ROLLED_BACK");
  assert.ok(mockQueriesA.includes("ROLLBACK;"), "Must issue ROLLBACK; on pre-commit error");

  // Test Case B: COMMIT failure reports COMMIT_INDETERMINATE and preserves keys without claiming false abort
  const mockQueriesB: string[] = [];
  const resultB = await executeData150Loader(
    async (sql) => {
      mockQueriesB.push(sql.trim());
      if (sql.trim() === "COMMIT;") {
        throw new Error("Simulated network timeout during COMMIT");
      }
      if (sql.includes("INSERT INTO public.party_addresses")) {
        return [{ id: "00000000-0000-4000-8000-000000000100" }];
      }
      return [];
    },
    {
      loaderSql: `BEGIN;\nINSERT INTO public.party_addresses ("id") VALUES ('A') RETURNING id;\nCOMMIT;`,
      persistToFile: false,
    }
  );
  assert.equal(resultB.success, false);
  assert.equal(resultB.db_committed, "INDETERMINATE");
  assert.equal(resultB.status, "COMMIT_INDETERMINATE");
  assert.ok(resultB.error?.includes("Database COMMIT failed (indeterminate state)"));
  assert.ok(
    mockQueriesB.includes("ROLLBACK;"),
    "Must attempt recovery ROLLBACK; when COMMIT fails"
  );
  assert.equal(resultB.receipt.party_addresses?.inserted_count, 1);
  assert.deepEqual(resultB.receipt.party_addresses?.inserted_keys, ["00000000-0000-4000-8000-000000000100"]);

  // Test Case C: Post-commit write failure retains db_committed: true and does NOT issue spurious ROLLBACK
  const mockQueriesC: string[] = [];
  const resultC = await executeData150Loader(
    async (sql) => {
      mockQueriesC.push(sql.trim());
      if (sql.includes("INSERT INTO public.party_addresses")) {
        return [{ id: "00000000-0000-4000-8000-000000000200" }];
      }
      return [];
    },
    {
      loaderSql: `BEGIN;\nINSERT INTO public.party_addresses ("id") VALUES ('A') RETURNING id;\nCOMMIT;`,
      simulatePostCommitFailure: true,
      persistToFile: false,
    }
  );
  assert.equal(resultC.success, false);
  assert.equal(resultC.db_committed, true, "Transaction was successfully committed in DB");
  assert.equal(resultC.status, "COMMIT_CONFIRMED_POST_COMMIT_WRITE_FAILED");
  assert.ok(!mockQueriesC.includes("ROLLBACK;"), "Must NOT issue ROLLBACK after DB has already committed!");
  assert.equal(resultC.receipt.party_addresses?.inserted_count, 1);
});

test("DATA150 rollback generator respects append-only tables, cascade protection, and parent tenant verification", () => {
  const receipt: Data150ExecutionReceipt = {
    transport_events: {
      table: "transport_events",
      pk_type: "single",
      pk_col: "id",
      inserted_count: 3,
      inserted_keys: ["EVT-1", "EVT-2", "EVT-3"],
    },
    operational_events: {
      table: "operational_events",
      pk_type: "identity",
      pk_col: "id",
      inserted_count: 2,
      inserted_keys: [101, 102],
    },
    cmr_documents: {
      table: "cmr_documents",
      pk_type: "single",
      pk_col: "id",
      inserted_count: 1,
      inserted_keys: ["CMR-DOC-1"],
    },
    transport_stops: {
      table: "transport_stops",
      pk_type: "single",
      pk_col: "id",
      inserted_count: 1,
      inserted_keys: ["STOP-1"],
    },
    cmr_parties: {
      table: "cmr_parties",
      pk_type: "single",
      pk_col: "id",
      inserted_count: 1,
      inserted_keys: ["CP-1"],
    },
    party_addresses: {
      table: "party_addresses",
      pk_type: "single",
      pk_col: "id",
      inserted_count: 1,
      inserted_keys: ["PA-1"],
    },
  };

  const rollbackSql = generateRollbackSqlFromExecutionReceipt(receipt, TENANT_ID);

  // Must NOT contain DELETE statements for append-only tables
  assert.ok(!rollbackSql.includes("DELETE FROM public.transport_events"), "Must not delete transport_events");
  assert.ok(!rollbackSql.includes("DELETE FROM public.operational_events"), "Must not delete operational_events");
  assert.ok(rollbackSql.includes("[IMMUTABLE AUDIT TABLE] Table public.transport_events"));
  assert.ok(rollbackSql.includes("[IMMUTABLE AUDIT TABLE] Table public.operational_events"));

  // Must NOT contain DELETE statements for cascade-protected tables
  assert.ok(!rollbackSql.includes("DELETE FROM public.cmr_documents"), "Must not delete cmr_documents");
  assert.ok(!rollbackSql.includes("DELETE FROM public.transport_stops"), "Must not delete transport_stops");
  assert.ok(rollbackSql.includes("[CASCADE PROTECTED TABLE] Table public.cmr_documents"));
  assert.ok(rollbackSql.includes("[CASCADE PROTECTED TABLE] Table public.transport_stops"));

  // Child table without tenant must verify ownership through parent cmr_documents
  assert.ok(
    rollbackSql.includes("DELETE FROM public.cmr_parties WHERE \"id\" IN ('CP-1') AND cmr_id IN (SELECT id FROM public.cmr_documents WHERE tenant_id = '00000000-0000-4000-8000-000000000001')"),
    "Must verify child row ownership via parent cmr_documents tenant"
  );

  // Standard table must be scoped by tenant_id
  assert.ok(
    rollbackSql.includes("DELETE FROM public.party_addresses WHERE \"id\" IN ('PA-1') AND tenant_id = '00000000-0000-4000-8000-000000000001'"),
    "Must scope party_addresses by tenant_id"
  );
});

test("DATA150 transactional in-memory unit simulation succeeds with 100% logic integrity", async () => {
  const { runNonProductiveTrial } = await import("../scripts/data150/run_non_productive_trial.ts");
  const passed = await runNonProductiveTrial();
  assert.equal(passed, true, "Transactional unit simulation must succeed with 0 failures");
});

test("DATA150 validateAndLoadDurableReceipt strictly fails closed on corrupt, staging, uncommitted, mismatched or invalid receipts", () => {
  const dummyFile = "/tmp/data150-validate-failclosed-test.json";
  const dummySql = "BEGIN;\nSELECT 1;\nCOMMIT;";
  const dummyHash = computeSqlSha256(dummySql);

  // Negative 1: Corrupt JSON
  writeFileSync(dummyFile, "NOT_JSON{{{");
  assert.throws(
    () => validateAndLoadDurableReceipt(dummyFile, dummyHash),
    /Corrupt or invalid JSON in execution receipt on disk/
  );

  // Negative 2: In-transaction staging receipt (blind retry rejected)
  writeFileSync(
    dummyFile,
    JSON.stringify({
      status: "IN_TRANSACTION_PRE_COMMIT",
      batch_id: DATA150_BATCH_ID,
      tenant_id: TENANT_ID,
      dataset_hash: dummyHash,
      attempt_id: "test-in-flight-attempt-1",
      tables: {},
      staged_tables: {
        tariff_zones: {
          table: "tariff_zones",
          pk_type: "single",
          pk_col: "id",
          inserted_count: 1,
          inserted_keys: ["7c596a00-ee8a-5ed0-a529-c05c3a541ea2"],
        },
      },
    })
  );
  assert.throws(
    () => validateAndLoadDurableReceipt(dummyFile, dummyHash),
    /unconfirmed staging state 'IN_TRANSACTION_PRE_COMMIT'/
  );

  // Negative 3: Aborted status
  writeFileSync(
    dummyFile,
    JSON.stringify({
      status: "TRANSACTION_ABORTED_ROLLED_BACK",
      batch_id: DATA150_BATCH_ID,
      tenant_id: TENANT_ID,
      dataset_hash: dummyHash,
      tables: {},
    })
  );
  assert.throws(
    () => validateAndLoadDurableReceipt(dummyFile, dummyHash),
    /Cannot recover execution receipt from disk with status 'TRANSACTION_ABORTED_ROLLED_BACK'/
  );

  // Negative 4: Mismatched dataset_hash
  writeFileSync(
    dummyFile,
    JSON.stringify({
      status: "COMMITTED",
      batch_id: DATA150_BATCH_ID,
      tenant_id: TENANT_ID,
      dataset_hash: "0000000000000000000000000000000000000000000000000000000000000000",
      tables: {},
    })
  );
  assert.throws(
    () => validateAndLoadDurableReceipt(dummyFile, dummyHash),
    /mismatched dataset_hash/
  );

  // Negative 5: Mismatched tenant_id
  writeFileSync(
    dummyFile,
    JSON.stringify({
      status: "COMMITTED",
      batch_id: DATA150_BATCH_ID,
      tenant_id: "99999999-9999-4999-8999-999999999999",
      dataset_hash: dummyHash,
      tables: {},
    })
  );
  assert.throws(
    () => validateAndLoadDurableReceipt(dummyFile, dummyHash),
    /mismatched tenant_id/
  );

  // Negative 6: Mismatched batch_id
  writeFileSync(
    dummyFile,
    JSON.stringify({
      status: "COMMITTED",
      batch_id: "DATA999-INVALID",
      tenant_id: TENANT_ID,
      dataset_hash: dummyHash,
      tables: {},
    })
  );
  assert.throws(
    () => validateAndLoadDurableReceipt(dummyFile, dummyHash),
    /mismatched batch_id/
  );

  // Negative 7: Duplicate keys inside inserted_keys
  writeFileSync(
    dummyFile,
    JSON.stringify({
      status: "COMMITTED",
      batch_id: DATA150_BATCH_ID,
      tenant_id: TENANT_ID,
      dataset_hash: dummyHash,
      tables: {
        tariff_zones: {
          table: "tariff_zones",
          pk_type: "single",
          pk_col: "id",
          inserted_count: 2,
          inserted_keys: [
            "7c596a00-ee8a-5ed0-a529-c05c3a541ea2",
            "7c596a00-ee8a-5ed0-a529-c05c3a541ea2",
          ],
        },
      },
    })
  );
  assert.throws(
    () => validateAndLoadDurableReceipt(dummyFile, dummyHash),
    /duplicate key/
  );

  // Negative 8: Non-UUID key for UUID column
  writeFileSync(
    dummyFile,
    JSON.stringify({
      status: "COMMITTED",
      batch_id: DATA150_BATCH_ID,
      tenant_id: TENANT_ID,
      dataset_hash: dummyHash,
      tables: {
        tariff_zones: {
          table: "tariff_zones",
          pk_type: "single",
          pk_col: "id",
          inserted_count: 1,
          inserted_keys: ["not-a-valid-uuid-1234"],
        },
      },
    })
  );
  assert.throws(
    () => validateAndLoadDurableReceipt(dummyFile, dummyHash),
    /violates UUID\/integer format/
  );

  // Cleanup
  if (existsSync(dummyFile)) unlinkSync(dummyFile);
});

test("DATA150 validateReturnedRow strictly rejects malformed or missing primary keys from RETURNING", () => {
  const meta = loadReceipt();

  // Missing id on single PK table
  assert.throws(
    () => validateReturnedRow("tariff_zones", { name: "Zona Norte" }, meta.tariff_zones),
    /missing required PK column 'id'/
  );

  // Invalid non-UUID format on single PK table
  assert.throws(
    () => validateReturnedRow("tariff_zones", { id: "MALFORMED-UUID" }, meta.tariff_zones),
    /invalid key 'MALFORMED-UUID'/
  );

  // Missing composite key column
  assert.throws(
    () => validateReturnedRow("cmr_expeditions", { cmr_id: "7c596a00-ee8a-5ed0-a529-c05c3a541ea2" }, meta.cmr_expeditions),
    /missing composite PK column 'expedition_id'/
  );
});

test("DATA150 reconcileInFlightReceipt explicitly verifies staged keys vs DB: commits if present, aborts if absent", async () => {
  const reconcileTestFile = "/tmp/data150-reconcile-test.json";
  const dummySql = "BEGIN;\nSELECT 1;\nCOMMIT;";
  const dummyHash = computeSqlSha256(dummySql);

  // Case A: Transaction committed in DB before process died
  writeFileSync(
    reconcileTestFile,
    JSON.stringify({
      status: "IN_TRANSACTION_PRE_COMMIT",
      batch_id: DATA150_BATCH_ID,
      tenant_id: TENANT_ID,
      dataset_hash: dummyHash,
      attempt_id: "attempt-committed",
      tables: {},
      staged_tables: {
        tariff_zones: {
          table: "tariff_zones",
          pk_type: "single",
          pk_col: "id",
          inserted_count: 1,
          inserted_keys: ["7c596a00-ee8a-5ed0-a529-c05c3a541ea2"],
        },
      },
    })
  );

  // Mock executor returning count 1 (rows exist in DB)
  const mockExecutorCommitted = async () => [{ cnt: "1" }];
  const resA = await reconcileInFlightReceipt(mockExecutorCommitted, reconcileTestFile, dummyHash);
  assert.equal(resA.reconciled, true);
  assert.equal(resA.status, "COMMITTED");
  assert.equal(resA.confirmedKeysCount, 1);

  // Check disk status promoted to COMMITTED with keys moved to tables
  const diskA = JSON.parse(readFileSync(reconcileTestFile, "utf8"));
  assert.equal(diskA.status, "COMMITTED");
  assert.equal(diskA.tables.tariff_zones.inserted_count, 1);
  assert.deepEqual(diskA.staged_tables, {});

  // Case B: Transaction aborted in DB (connection drop)
  writeFileSync(
    reconcileTestFile,
    JSON.stringify({
      status: "IN_TRANSACTION_PRE_COMMIT",
      batch_id: DATA150_BATCH_ID,
      tenant_id: TENANT_ID,
      dataset_hash: dummyHash,
      attempt_id: "attempt-aborted",
      tables: {},
      staged_tables: {
        tariff_zones: {
          table: "tariff_zones",
          pk_type: "single",
          pk_col: "id",
          inserted_count: 1,
          inserted_keys: ["7c596a00-ee8a-5ed0-a529-c05c3a541ea2"],
        },
      },
    })
  );

  // Mock executor returning count 0 (rows do not exist in DB)
  const mockExecutorAborted = async () => [{ cnt: "0" }];
  const resB = await reconcileInFlightReceipt(mockExecutorAborted, reconcileTestFile, dummyHash);
  assert.equal(resB.reconciled, true);
  assert.equal(resB.status, "TRANSACTION_ABORTED_ROLLED_BACK");
  assert.equal(resB.confirmedKeysCount, 0);

  const diskB = JSON.parse(readFileSync(reconcileTestFile, "utf8"));
  assert.equal(diskB.status, "TRANSACTION_ABORTED_ROLLED_BACK");

  if (existsSync(reconcileTestFile)) unlinkSync(reconcileTestFile);
});

test("DATA150 multi-process concurrency: distinct OS processes with barrier and disjoint returns guarded by withFileLock preserve 100% of keys without loss", async () => {
  const concurrentReceiptPath = "/tmp/data150-multiprocess-barrier-test.json";
  const barrierPath = "/tmp/data150-barrier-release";
  const readyA = "/tmp/data150-worker-a-ready";
  const readyB = "/tmp/data150-worker-b-ready";

  if (existsSync(concurrentReceiptPath)) unlinkSync(concurrentReceiptPath);
  if (existsSync(barrierPath)) unlinkSync(barrierPath);
  if (existsSync(readyA)) unlinkSync(readyA);
  if (existsSync(readyB)) unlinkSync(readyB);

  const dummySql = "BEGIN;\nINSERT INTO public.tariff_zones (id) VALUES ('1') RETURNING id;\nCOMMIT;";
  const dummySqlHash = computeSqlSha256(dummySql);

  // Seed initial COMMITTED receipt on disk
  writeJsonAtomicallyWithFsync(concurrentReceiptPath, {
    status: "COMMITTED",
    batch_id: DATA150_BATCH_ID,
    tenant_id: TENANT_ID,
    dataset_hash: dummySqlHash,
    executed_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    tables: {
      tariff_zones: {
        table: "tariff_zones",
        pk_type: "single",
        pk_col: "id",
        inserted_count: 1,
        inserted_keys: ["7c596a00-ee8a-5ed0-a529-c05c3a541ea2"],
      },
    },
  });

  const workerScript = "tests/helpers/data150-concurrent-worker.ts";
  const contentionSignalPath = "/tmp/data150-contention-signal.txt";
  if (existsSync(contentionSignalPath)) unlinkSync(contentionSignalPath);

  // Spawn Worker H (Holder) and Worker C (Contender) in distinct concurrent OS processes
  const procA = spawn("node", [
    "--experimental-strip-types",
    workerScript,
    "H",
    barrierPath,
    concurrentReceiptPath,
    readyA,
    contentionSignalPath,
  ]);

  const procB = spawn("node", [
    "--experimental-strip-types",
    workerScript,
    "C",
    barrierPath,
    concurrentReceiptPath,
    readyB,
    contentionSignalPath,
  ]);

  let contenderOutput = "";
  procB.stdout.on("data", (d) => {
    contenderOutput += d.toString();
  });

  // Wait for both processes to be alive and ready
  const startWait = Date.now();
  while (!existsSync(readyA) || !existsSync(readyB)) {
    if (Date.now() - startWait > 10000) {
      throw new Error("Timed out waiting for child processes to become ready");
    }
    await new Promise((r) => setTimeout(r, 50));
  }

  // Confirm distinct PIDs
  const pidA = procA.pid;
  const pidB = procB.pid;
  assert.ok(pidA && pidB);
  assert.notEqual(pidA, pidB, "Child processes must have distinct OS PIDs");

  // Release barrier to unleash concurrent contention on withFileLock
  writeFileSync(barrierPath, "GO");

  // Wait for both processes to complete
  const [exitA, exitB] = await Promise.all([
    new Promise<number>((resolve) => procA.on("exit", (code) => resolve(code ?? 0))),
    new Promise<number>((resolve) => procB.on("exit", (code) => resolve(code ?? 0))),
  ]);

  assert.equal(exitA, 0, "Worker H (Holder) must exit with code 0");
  assert.equal(exitB, 0, "Worker C (Contender) must exit with code 0");

  // Parse Contender output and assert observable contention
  const lastLine = contenderOutput.trim().split("\n").pop() || "{}";
  const parsedContender = JSON.parse(lastLine);
  assert.equal(parsedContender.role, "C");
  assert.ok(
    parsedContender.contentionWaitMs >= 80,
    `Observable lock contention verified: Contender waited ${parsedContender.contentionWaitMs}ms for Holder lockfile release`
  );

  // Verify resulting receipt on disk
  const finalDisk = JSON.parse(readFileSync(concurrentReceiptPath, "utf8"));
  assert.equal(finalDisk.status, "COMMITTED");

  // tariff_zones must contain the initial key + Worker H key + Worker C key (all 3 preserved!)
  assert.equal(finalDisk.tables.tariff_zones.inserted_count, 3);
  assert.ok(finalDisk.tables.tariff_zones.inserted_keys.includes("7c596a00-ee8a-5ed0-a529-c05c3a541ea2"));
  assert.ok(finalDisk.tables.tariff_zones.inserted_keys.includes("7c596a00-ee8a-5ed0-a529-c05c3a541ea3"));
  assert.ok(finalDisk.tables.tariff_zones.inserted_keys.includes("7c596a00-ee8a-5ed0-a529-c05c3a541ea4"));

  // parties must contain Worker H key
  assert.equal(finalDisk.tables.parties.inserted_count, 1);
  assert.ok(finalDisk.tables.parties.inserted_keys.includes("00000000-0000-4000-8000-000000000010"));

  // party_addresses must contain Worker C key
  assert.equal(finalDisk.tables.party_addresses.inserted_count, 1);
  assert.ok(finalDisk.tables.party_addresses.inserted_keys.includes("00000000-0000-4000-8000-000000000020"));

  // Cleanup
  if (existsSync(concurrentReceiptPath)) unlinkSync(concurrentReceiptPath);
  if (existsSync(barrierPath)) unlinkSync(barrierPath);
  if (existsSync(readyA)) unlinkSync(readyA);
  if (existsSync(readyB)) unlinkSync(readyB);
  if (existsSync(contentionSignalPath)) unlinkSync(contentionSignalPath);
});

test("Point 2a: Ordinary callback returning deferred Promise holds lock until settlement and verifies token on release", async () => {
  const testFile = path.join(os.tmpdir(), "data150-test-2a.json");
  const lockFile = `${testFile}.lock`;
  if (existsSync(lockFile)) unlinkSync(lockFile);
  if (existsSync(testFile)) unlinkSync(testFile);

  let promiseSettled = false;
  let lockHeldDuringPromise = false;

  // Caller A: ordinary function (not declared async) returning a Promise
  const promiseA = withFileLock(testFile, () => {
    return new Promise<string>((resolve) => {
      setTimeout(() => {
        promiseSettled = true;
        resolve("resultA");
      }, 100);
    });
  });

  // Verify that lockfile is created and held while Promise is pending
  await new Promise((r) => setTimeout(r, 20));
  assert.ok(existsSync(lockFile), "Lockfile must exist on disk while deferred Promise is unsettled");
  assert.equal(promiseSettled, false, "Promise must not yet be settled");

  // Caller B in same process attempts to acquire lock: must be queued and wait until A settles
  let callerBAcquiredAfterSettle = false;
  const promiseB = withFileLock(testFile, async () => {
    lockHeldDuringPromise = promiseSettled; // Must be true!
    callerBAcquiredAfterSettle = true;
    return "resultB";
  });

  const resA = await promiseA;
  const resB = await promiseB;

  assert.equal(resA, "resultA");
  assert.equal(resB, "resultB");
  assert.equal(lockHeldDuringPromise, true, "Caller B must only acquire after deferred Promise settled");
  assert.equal(callerBAcquiredAfterSettle, true);
  assert.ok(!existsSync(lockFile), "Lockfile must be unlinked once all holders release");
});

test("Point 2b: Causal context is invalidated on release, preventing delayed descendant from bypassing lock while B holds it", async () => {
  const testFile = path.join(os.tmpdir(), "data150-test-2b.json");
  const lockFile = `${testFile}.lock`;
  if (existsSync(lockFile)) unlinkSync(lockFile);
  if (existsSync(testFile)) unlinkSync(testFile);

  let enteredConcurrentlyWithB = false;
  let callerBActive = false;
  let callerBFinished = false;
  let lateDescendantAcquired = false;

  // Caller A acquires lock, spawns a delayed task, and finishes immediately
  let delayedTaskPromise: Promise<void>;
  await withFileLock(testFile, async () => {
    delayedTaskPromise = (async () => {
      // Yield slightly so A finishes and B has time to acquire
      await new Promise((r) => setTimeout(r, 20));
      // Now attempt withFileLock: B is currently holding the lock!
      // If a broken implementation allowed bypass via inherited context,
      // this callback would enter immediately while callerBActive === true!
      await withFileLock(testFile, async () => {
        if (callerBActive) {
          enteredConcurrentlyWithB = true; // LOCK BYPASS DETECTED!
        }
        lateDescendantAcquired = true;
      });
    })();
  });

  // Caller B acquires lock immediately and holds it for 100ms
  await withFileLock(testFile, async () => {
    callerBActive = true;
    await new Promise((r) => setTimeout(r, 100));
    callerBActive = false;
    callerBFinished = true;
  });

  await delayedTaskPromise!;
  assert.equal(enteredConcurrentlyWithB, false, "Late descendant must NOT enter concurrently with caller B");
  assert.equal(callerBFinished, true, "Caller B must have finished before descendant entered");
  assert.equal(lateDescendantAcquired, true, "Late descendant must successfully acquire after B releases");
  assert.ok(!existsSync(lockFile));
});

test("Point 1.3: withFileLock safely normalizes PromiseLike/thenables that lack .finally without releasing early", async () => {
  const testFile = path.join(os.tmpdir(), "data150-test-thenable.json");
  const lockFile = `${testFile}.lock`;
  if (existsSync(lockFile)) unlinkSync(lockFile);
  if (existsSync(testFile)) unlinkSync(testFile);

  let thenableSettled = false;

  // An object with .then, but strictly NO .finally property
  const customThenable = {
    then(onFulfilled: (val: any) => void) {
      setTimeout(() => {
        thenableSettled = true;
        onFulfilled("custom-thenable-result");
      }, 80);
    },
  };
  assert.equal((customThenable as any).finally, undefined);

  const lockPromise = withFileLock(testFile, () => customThenable as unknown as Promise<string>);

  // While pending, check that lockfile exists
  await new Promise((r) => setTimeout(r, 20));
  assert.ok(existsSync(lockFile), "Lock must remain held while thenable is pending");
  assert.equal(thenableSettled, false);

  // Another caller in queue
  let secondCallerSawSettlement = false;
  const secondPromise = withFileLock(testFile, async () => {
    secondCallerSawSettlement = thenableSettled;
    return "second-done";
  });

  const res = await lockPromise;
  const res2 = await secondPromise;

  assert.equal(res, "custom-thenable-result");
  assert.equal(res2, "second-done");
  assert.equal(secondCallerSawSettlement, true, "Second caller must only run after thenable settled");
  assert.ok(!existsSync(lockFile), "Lockfile must be unlinked after all settled");
});

test("Point 1.3b: Nested thenables with inner deferred Promise retain lock until full recursive settlement (MUST #2)", async () => {
  const testFile = path.join(os.tmpdir(), "data150-test-nested-thenable.json");
  const lockFile = `${testFile}.lock`;
  if (existsSync(lockFile)) unlinkSync(lockFile);
  if (existsSync(testFile)) unlinkSync(testFile);

  let innerSettled = false;
  let callerBBlockedWhileInnerPending = false;
  let callerBEntered = false;

  // Inner deferred promise that takes 120ms to settle
  const innerDeferredPromise = new Promise<string>((resolve) => {
    setTimeout(() => {
      innerSettled = true;
      resolve("deeply-nested-resolution");
    }, 120);
  });

  // Custom outer thenable that fulfills by passing the innerDeferredPromise to resolve callback
  const outerThenable = {
    then(onFulfilled: (val: any) => void) {
      setTimeout(() => {
        // Fulfills with another unresolved Promise!
        onFulfilled(innerDeferredPromise);
      }, 30);
    },
  };

  const lockPromiseA = withFileLock(testFile, () => outerThenable as unknown as Promise<string>);

  // Wait 50ms so outer thenable fulfills and passes innerDeferredPromise
  await new Promise((r) => setTimeout(r, 50));
  assert.equal(innerSettled, false, "Inner promise must still be pending");
  assert.ok(existsSync(lockFile), "Lockfile MUST remain held while innerDeferredPromise is pending");

  // Caller B tries to acquire with a 40ms timeout: MUST reject because lock is still held by inner promise!
  await assert.rejects(
    async () => {
      await withFileLock(testFile, async () => "callerB-short", 40);
    },
    (err: Error) => {
      callerBBlockedWhileInnerPending = true;
      return err.message.includes("Timeout");
    },
    "Caller B must timeout while innerDeferredPromise is pending"
  );

  // Queued Caller C waits for full settlement
  const lockPromiseC = withFileLock(testFile, async () => {
    callerBEntered = true;
    assert.equal(innerSettled, true, "Caller C must only enter after inner promise settled");
    return "callerC-done";
  });

  const resA = await lockPromiseA;
  const resC = await lockPromiseC;

  assert.equal(resA, "deeply-nested-resolution");
  assert.equal(resC, "callerC-done");
  assert.equal(callerBBlockedWhileInnerPending, true);
  assert.equal(callerBEntered, true);
  assert.ok(!existsSync(lockFile), "Lockfile must be unlinked once all holders release");
});

test("Point 2c: In-process async queue timeout cleans up waiter without leaving orphaned state", async () => {
  const testFile = path.join(os.tmpdir(), "data150-test-2c.json");
  const lockFile = `${testFile}.lock`;
  if (existsSync(lockFile)) unlinkSync(lockFile);
  if (existsSync(testFile)) unlinkSync(testFile);

  // Holder holds lock for 200ms
  const holderPromise = withFileLock(testFile, async () => {
    await new Promise((r) => setTimeout(r, 200));
    return "done";
  });

  await new Promise((r) => setTimeout(r, 20));

  // Contender attempts to acquire with 50ms timeout
  await assert.rejects(
    async () => {
      await withFileLock(testFile, async () => "contender", 50);
    },
    (err: Error) => {
      return err.message.includes("Timeout");
    },
    "Contender with short timeout must reject"
  );

  await holderPromise;
  assert.ok(!existsSync(lockFile));

  // Subsequent acquire must succeed cleanly (no orphaned waiters)
  const subsequent = await withFileLock(testFile, async () => "clean");
  assert.equal(subsequent, "clean");
});

test("Point 2d: Crash-safe orphan reclaim detects dead reclaimer in .reclaim.lock and recovers", async () => {
  const testFile = path.join(os.tmpdir(), "data150-test-2d.json");
  const lockFile = `${testFile}.lock`;
  const reclaimLockFile = `${lockFile}.reclaim.lock`;
  if (existsSync(lockFile)) unlinkSync(lockFile);
  if (existsSync(reclaimLockFile)) unlinkSync(reclaimLockFile);

  // Simulate an abandoned primary lock held by a dead PID (e.g. 999999)
  writeFileSync(lockFile, "999999\n1000\nfake-context-1\n");
  // Simulate an abandoned .reclaim.lock held by a dead reclaimer PID (e.g. 999998)
  writeFileSync(reclaimLockFile, "999998\n1000\n");

  // Now call withFileLock: it must safely detect dead reclaimer, unlink .reclaim.lock,
  // then under newly acquired reclaim mutex detect dead primary holder, and acquire lock cleanly!
  let acquiredCleanly = false;
  const result = await withFileLock(testFile, async () => {
    acquiredCleanly = true;
    return "recovered";
  });

  assert.equal(result, "recovered");
  assert.equal(acquiredCleanly, true);
  assert.ok(!existsSync(reclaimLockFile), "Reclaim lock must be cleaned up");
  assert.ok(!existsSync(lockFile), "Primary lock must be cleaned up");
});

test("Point 1.2: Crash-safe recovery of empty/corrupted 0-byte .reclaim.lock without killing live holders", async () => {
  const testFile = path.join(os.tmpdir(), "data150-test-p2-empty.json");
  const lockFile = `${testFile}.lock`;
  const reclaimLockFile = `${lockFile}.reclaim.lock`;
  if (existsSync(lockFile)) unlinkSync(lockFile);
  if (existsSync(reclaimLockFile)) unlinkSync(reclaimLockFile);

  // Simulate an abandoned primary lock with dead PID
  writeFileSync(lockFile, "999991\n1000\nfake-ctx-1\n");
  // Simulate an abandoned empty .reclaim.lock (0 bytes, from crash between open and write)
  writeFileSync(reclaimLockFile, "");

  let acquiredCleanly = false;
  const result = await withFileLock(testFile, async () => {
    acquiredCleanly = true;
    return "empty-reclaim-recovered";
  });

  assert.equal(result, "empty-reclaim-recovered");
  assert.equal(acquiredCleanly, true);
  assert.ok(!existsSync(reclaimLockFile));
  assert.ok(!existsSync(lockFile));
});

test("Point 1.1: Concurrent multi-process orphan reclaim maintains mutual exclusion and never deletes live lock", async () => {
  const testFile = path.join(os.tmpdir(), "data150-test-p1-race.json");
  const lockFile = `${testFile}.lock`;
  const reclaimLockFile = `${lockFile}.reclaim.lock`;
  const startBarrier = path.join(os.tmpdir(), "data150-test-p1-barrier.flag");
  const activeDir = path.join(os.tmpdir(), "data150-test-p1-active-" + Date.now());
  const violationsFile = path.join(os.tmpdir(), "data150-test-p1-violations.txt");

  if (existsSync(lockFile)) unlinkSync(lockFile);
  if (existsSync(reclaimLockFile)) unlinkSync(reclaimLockFile);
  if (existsSync(startBarrier)) unlinkSync(startBarrier);
  if (existsSync(violationsFile)) unlinkSync(violationsFile);
  if (existsSync(activeDir)) rmSync(activeDir, { recursive: true, force: true });
  mkdirSync(activeDir, { recursive: true });

  // Abandoned primary lock with dead PID
  writeFileSync(lockFile, "999992\n1000\nfake-ctx-1\n");
  // Abandoned .reclaim.lock with dead reclaimer PID
  writeFileSync(reclaimLockFile, "999993\n1000\n");

  const childWorkerScript = `
import { withFileLock } from "./lib/data150-loader.ts";
import * as fs from "node:fs";
import * as path from "node:path";

async function run() {
  const file = process.env.DATA150_TEST_FILE!;
  const id = process.env.DATA150_WORKER_ID!;
  const barrier = process.env.DATA150_START_BARRIER!;
  const activeDir = process.env.DATA150_ACTIVE_DIR!;
  const violationsFile = process.env.DATA150_VIOLATIONS_FILE!;
  const myFlag = path.join(activeDir, "active-" + id + ".flag");

  // Wait for start barrier so both processes contend at the exact same moment
  while (!fs.existsSync(barrier)) {
    await new Promise((r) => setTimeout(r, 5));
  }

  await withFileLock(file, async () => {
    // 1. Publish presence in activeDir
    fs.writeFileSync(myFlag, id + "\\n" + Date.now() + "\\n", "utf8");

    // 2. Atomic presence check: list active flags in directory
    const flagsOnEntry = fs.readdirSync(activeDir).filter((f) => f.startsWith("active-") && f.endsWith(".flag"));
    if (flagsOnEntry.length > 1) {
      fs.appendFileSync(violationsFile, "OVERLAP_ENTRY:" + id + " saw [" + flagsOnEntry.join(",") + "]\\n");
    }

    // 3. Hold critical section while actively polling for concurrent invaders
    const startTime = Date.now();
    while (Date.now() - startTime < 80) {
      const currentFlags = fs.readdirSync(activeDir).filter((f) => f.startsWith("active-") && f.endsWith(".flag"));
      if (currentFlags.length > 1) {
        fs.appendFileSync(violationsFile, "OVERLAP_HOLDING:" + id + " saw [" + currentFlags.join(",") + "]\\n");
      }
      await new Promise((r) => setTimeout(r, 8));
    }

    // 4. Remove presence flag before releasing lock
    try { fs.unlinkSync(myFlag); } catch {}

    console.log("HOLDER:" + id);
  });
}
run().catch((e) => {
  console.error("ERROR:" + e.message);
  process.exit(1);
});
`;

  const p1 = spawn("node", ["--experimental-strip-types", "-e", childWorkerScript], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      DATA150_TEST_FILE: testFile,
      DATA150_WORKER_ID: "P1",
      DATA150_START_BARRIER: startBarrier,
      DATA150_ACTIVE_DIR: activeDir,
      DATA150_VIOLATIONS_FILE: violationsFile,
    },
    stdio: ["pipe", "pipe", "pipe"],
  });
  const p2 = spawn("node", ["--experimental-strip-types", "-e", childWorkerScript], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      DATA150_TEST_FILE: testFile,
      DATA150_WORKER_ID: "P2",
      DATA150_START_BARRIER: startBarrier,
      DATA150_ACTIVE_DIR: activeDir,
      DATA150_VIOLATIONS_FILE: violationsFile,
    },
    stdio: ["pipe", "pipe", "pipe"],
  });

  let out1 = "";
  let out2 = "";
  let err1 = "";
  let err2 = "";
  p1.stdout?.on("data", (d) => { out1 += d.toString(); });
  p2.stdout?.on("data", (d) => { out2 += d.toString(); });
  p1.stderr?.on("data", (d) => { err1 += d.toString(); });
  p2.stderr?.on("data", (d) => { err2 += d.toString(); });

  // Release the start barrier to release both workers simultaneously
  await new Promise((r) => setTimeout(r, 40));
  writeFileSync(startBarrier, "GO\n");

  const [code1, code2] = await Promise.all([
    new Promise<number>((r) => p1.on("close", r)),
    new Promise<number>((r) => p2.on("close", r)),
  ]);

  assert.equal(code1, 0, `Process 1 must exit 0: ${out1} ${err1}`);
  assert.equal(code2, 0, `Process 2 must exit 0: ${out2} ${err2}`);
  assert.ok(out1.includes("HOLDER:P1"));
  assert.ok(out2.includes("HOLDER:P2"));

  // Check overlap violations file: MUST NOT exist or must be empty!
  if (existsSync(violationsFile)) {
    const violations = readFileSync(violationsFile, "utf8").trim();
    assert.equal(violations, "", `Zero concurrency overlap violations allowed: ${violations}`);
    unlinkSync(violationsFile);
  }
  if (existsSync(activeDir)) rmSync(activeDir, { recursive: true, force: true });
  if (existsSync(startBarrier)) unlinkSync(startBarrier);
  assert.ok(!existsSync(lockFile), "Final lockfile must be cleanly removed");
  assert.ok(!existsSync(reclaimLockFile), "Final reclaim lockfile must be cleanly removed");
});

test("Point 1.1 negative: Without withFileLock, concurrent workers reliably trigger overlap violations", async () => {
  const startBarrier = path.join(os.tmpdir(), "data150-test-p1-neg-barrier.flag");
  const activeDir = path.join(os.tmpdir(), "data150-test-p1-neg-active-" + Date.now());
  const violationsFile = path.join(os.tmpdir(), "data150-test-p1-neg-violations.txt");

  if (existsSync(startBarrier)) unlinkSync(startBarrier);
  if (existsSync(violationsFile)) unlinkSync(violationsFile);
  if (existsSync(activeDir)) rmSync(activeDir, { recursive: true, force: true });
  mkdirSync(activeDir, { recursive: true });

  const unshieldedWorkerScript = `
import * as fs from "node:fs";
import * as path from "node:path";

async function run() {
  const id = process.env.DATA150_WORKER_ID!;
  const barrier = process.env.DATA150_START_BARRIER!;
  const activeDir = process.env.DATA150_ACTIVE_DIR!;
  const violationsFile = process.env.DATA150_VIOLATIONS_FILE!;
  const myFlag = path.join(activeDir, "active-" + id + ".flag");

  while (!fs.existsSync(barrier)) {
    await new Promise((r) => setTimeout(r, 5));
  }

  // UNGUARDED EXECUTION (NO withFileLock!)
  fs.writeFileSync(myFlag, id + "\\n" + Date.now() + "\\n", "utf8");
  const flagsOnEntry = fs.readdirSync(activeDir).filter((f) => f.startsWith("active-") && f.endsWith(".flag"));
  if (flagsOnEntry.length > 1) {
    fs.appendFileSync(violationsFile, "OVERLAP_ENTRY:" + id + " saw [" + flagsOnEntry.join(",") + "]\\n");
  }

  const startTime = Date.now();
  while (Date.now() - startTime < 80) {
    const currentFlags = fs.readdirSync(activeDir).filter((f) => f.startsWith("active-") && f.endsWith(".flag"));
    if (currentFlags.length > 1) {
      fs.appendFileSync(violationsFile, "OVERLAP_HOLDING:" + id + " saw [" + currentFlags.join(",") + "]\\n");
    }
    await new Promise((r) => setTimeout(r, 8));
  }

  try { fs.unlinkSync(myFlag); } catch {}
  console.log("HOLDER:" + id);
}
run().catch((e) => {
  console.error("ERROR:" + e.message);
  process.exit(1);
});
`;

  const p1 = spawn("node", ["--experimental-strip-types", "-e", unshieldedWorkerScript], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      DATA150_WORKER_ID: "NEG_P1",
      DATA150_START_BARRIER: startBarrier,
      DATA150_ACTIVE_DIR: activeDir,
      DATA150_VIOLATIONS_FILE: violationsFile,
    },
    stdio: ["pipe", "pipe", "pipe"],
  });
  const p2 = spawn("node", ["--experimental-strip-types", "-e", unshieldedWorkerScript], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      DATA150_WORKER_ID: "NEG_P2",
      DATA150_START_BARRIER: startBarrier,
      DATA150_ACTIVE_DIR: activeDir,
      DATA150_VIOLATIONS_FILE: violationsFile,
    },
    stdio: ["pipe", "pipe", "pipe"],
  });

  await new Promise((r) => setTimeout(r, 40));
  writeFileSync(startBarrier, "GO\n");

  await Promise.all([
    new Promise<number>((r) => p1.on("close", r)),
    new Promise<number>((r) => p2.on("close", r)),
  ]);

  // Assert that violations WERE captured because there was no lock!
  assert.ok(existsSync(violationsFile), "Violations file must exist for unshielded concurrent execution");
  const violations = readFileSync(violationsFile, "utf8").trim();
  assert.ok(violations.includes("OVERLAP"), `Unshielded execution must trigger overlap: ${violations}`);

  // Cleanup
  if (existsSync(violationsFile)) unlinkSync(violationsFile);
  if (existsSync(activeDir)) rmSync(activeDir, { recursive: true, force: true });
  if (existsSync(startBarrier)) unlinkSync(startBarrier);
});

test("Point 1.1b: Forced interleaving: Dead mutex claim does NOT evict or replace newly acquired live reclaimer", async () => {
  const testFile = path.join(os.tmpdir(), "data150-test-p1-interleaving.json");
  const lockFile = `${testFile}.lock`;
  const reclaimLockFile = `${lockFile}.reclaim.lock`;
  if (existsSync(lockFile)) unlinkSync(lockFile);
  if (existsSync(reclaimLockFile)) unlinkSync(reclaimLockFile);

  // Setup: Primary lock has dead holder PID 999991
  writeFileSync(lockFile, "999991\n1000\nfake-primary\n");

  // Reclaim lock has OUR current PID (LIVE holder!) with a unique context ID
  const liveContextId = "live-reclaim-context-12345";
  writeFileSync(reclaimLockFile, `${process.pid}\n${Date.now()}\n${liveContextId}\n`);

  // Now, call safeReclaimOrphanLock from a simulated concurrent contender
  // Contender observes that reclaimLockFile exists and holder is process.pid (ALIVE!).
  safeReclaimOrphanLock(lockFile, 999991);

  // Assert that Process B's live reclaim lock was NOT deleted, moved, or altered!
  assert.ok(existsSync(reclaimLockFile), "Live reclaimer's lock must remain on disk");
  const contentAfter = readFileSync(reclaimLockFile, "utf8");
  assert.ok(contentAfter.includes(liveContextId), "Live reclaimer's context MUST NOT be overwritten or evicted");

  // Cleanup
  if (existsSync(reclaimLockFile)) unlinkSync(reclaimLockFile);
  if (existsSync(lockFile)) unlinkSync(lockFile);
});

test("Point 1.1c: Orphaned claim token recovery: Reclaimer recovers dead claim token and replaces dead mutex (MUST #1)", () => {
  const testFile = path.join(os.tmpdir(), "data150-test-p1-claim-orphan.json");
  const lockFile = `${testFile}.lock`;
  const reclaimLockFile = `${lockFile}.reclaim.lock`;
  const deadHolderToken = "dead-holder-token-999992";
  const claimTokenFile = `${reclaimLockFile}.claim.${deadHolderToken}`;

  if (existsSync(lockFile)) unlinkSync(lockFile);
  if (existsSync(reclaimLockFile)) unlinkSync(reclaimLockFile);
  if (existsSync(claimTokenFile)) unlinkSync(claimTokenFile);

  // Primary lock with dead PID
  writeFileSync(lockFile, "999991\n1000\nfake-primary\n");
  // Reclaim lock with dead PID and deadHolderToken
  writeFileSync(reclaimLockFile, `999992\n1000\n${deadHolderToken}\n`);
  // Orphaned claim token left by another reclaimer that crashed after linkSync(claim)
  writeFileSync(claimTokenFile, "999993\n1000\norphaned-claim-ctx\n");

  // Live contender runs safeReclaimOrphanLock:
  safeReclaimOrphanLock(lockFile, 999991);

  // Assert: dead claim token was detected as dead, unlinked, re-acquired, and primary orphan lock removed!
  assert.ok(!existsSync(lockFile), "Primary orphan lock must be safely removed after claim recovery");
  assert.ok(!existsSync(claimTokenFile), "Claim token must be cleanly unlinked in finally block");
  if (existsSync(reclaimLockFile)) unlinkSync(reclaimLockFile);
});

test("Point 1.1d: Live claim token protection: Contender never evicts or replaces a LIVE claim token (MUST #1)", () => {
  const testFile = path.join(os.tmpdir(), "data150-test-p1-claim-live.json");
  const lockFile = `${testFile}.lock`;
  const reclaimLockFile = `${lockFile}.reclaim.lock`;
  const deadHolderToken = "dead-holder-token-999992";
  const claimTokenFile = `${reclaimLockFile}.claim.${deadHolderToken}`;

  if (existsSync(lockFile)) unlinkSync(lockFile);
  if (existsSync(reclaimLockFile)) unlinkSync(reclaimLockFile);
  if (existsSync(claimTokenFile)) unlinkSync(claimTokenFile);

  // Primary lock with dead PID
  writeFileSync(lockFile, "999991\n1000\nfake-primary\n");
  // Reclaim lock with dead PID and deadHolderToken
  writeFileSync(reclaimLockFile, `999992\n1000\n${deadHolderToken}\n`);
  // Claim token held by our LIVE PID!
  const liveClaimContext = "live-claim-active-holder-555";
  writeFileSync(claimTokenFile, `${process.pid}\n${Date.now()}\n${liveClaimContext}\n`);

  // Contender runs safeReclaimOrphanLock:
  safeReclaimOrphanLock(lockFile, 999991);

  // Assert: live claim token was NOT unlinked or overwritten!
  assert.ok(existsSync(claimTokenFile), "Live claim token must remain on disk");
  const content = readFileSync(claimTokenFile, "utf8");
  assert.ok(content.includes(liveClaimContext), "Live claim token context must be preserved");

  // Cleanup
  if (existsSync(claimTokenFile)) unlinkSync(claimTokenFile);
  if (existsSync(reclaimLockFile)) unlinkSync(reclaimLockFile);
  if (existsSync(lockFile)) unlinkSync(lockFile);
});

test("Point 1.1e: Controlled crash boundary using testHookAfterClaimWon (MUST #1)", () => {
  const testFile = path.join(os.tmpdir(), "data150-test-p1-crash-boundary.json");
  const lockFile = `${testFile}.lock`;
  const reclaimLockFile = `${lockFile}.reclaim.lock`;
  const deadHolderToken = "dead-holder-token-boundary";
  const claimTokenFile = `${reclaimLockFile}.claim.${deadHolderToken}`;

  if (existsSync(lockFile)) unlinkSync(lockFile);
  if (existsSync(reclaimLockFile)) unlinkSync(reclaimLockFile);
  if (existsSync(claimTokenFile)) unlinkSync(claimTokenFile);

  // Primary lock with dead PID
  writeFileSync(lockFile, "999991\n1000\nfake-primary\n");
  // Reclaim lock with dead PID
  writeFileSync(reclaimLockFile, `999992\n1000\n${deadHolderToken}\n`);

  // Process A acquires the claim token, then suffers a simulated fatal crash right at the boundary
  let crashTriggered = false;
  try {
    safeReclaimOrphanLock(lockFile, 999991, () => {
      // Crash boundary: hook executes AFTER winning the claim token and BEFORE replacing the mutex!
      // In a real process crash, the process exits without running finally:
      crashTriggered = true;
      throw new Error("FATAL_SIMULATED_PROCESS_CRASH_AFTER_CLAIM_WON");
    });
  } catch (e: any) {
    if (e.message !== "FATAL_SIMULATED_PROCESS_CRASH_AFTER_CLAIM_WON") throw e;
  }
  assert.ok(crashTriggered, "Crash hook must have fired at exact boundary");

  // Simulate that the crashed process is now dead by updating the PID in the claim token to 999994
  writeFileSync(claimTokenFile, "999994\n1000\ncrashed-reclaimer-token\n");
  assert.ok(existsSync(claimTokenFile), "Claim token must exist on disk after crash");

  // Process B runs safeReclaimOrphanLock and successfully recovers from the crashed claimer!
  safeReclaimOrphanLock(lockFile, 999991);

  // Assert: Process B cleanly recovered and completed the orphan lock eviction!
  assert.ok(!existsSync(lockFile), "Primary lock must be cleanly removed after crash recovery");
  assert.ok(!existsSync(claimTokenFile), "Claim token must be cleanly unlinked after recovery");
  if (existsSync(reclaimLockFile)) unlinkSync(reclaimLockFile);
});

test("Point 1.2b: Fail-closed inspection: lsof error or timeout never evicts unverified 0-byte file", () => {
  const testFile = path.join(os.tmpdir(), "data150-test-p2-failclosed.json");
  const lockFile = `${testFile}.lock`;
  const reclaimLockFile = `${lockFile}.reclaim.lock`;
  if (existsSync(lockFile)) unlinkSync(lockFile);
  if (existsSync(reclaimLockFile)) unlinkSync(reclaimLockFile);

  // 1. Live process holds an open file descriptor on the 0-byte file!
  writeFileSync(reclaimLockFile, "");
  const fd = openSync(reclaimLockFile, "r+");
  try {
    // With an open fd held by our live PID, checkLiveProcessHoldingFd MUST report live holder!
    const inspection = checkLiveProcessHoldingFd(reclaimLockFile);
    assert.equal(inspection.hasLiveHolder, true, "Must detect live holder holding open fd");

    // safeReclaimOrphanLock MUST fail closed and NOT evict or replace the file!
    safeReclaimOrphanLock(lockFile, 999991);
    assert.ok(existsSync(reclaimLockFile), "0-byte lock held by live process MUST NOT be evicted");
  } finally {
    closeSync(fd);
    if (existsSync(reclaimLockFile)) unlinkSync(reclaimLockFile);
    if (existsSync(lockFile)) unlinkSync(lockFile);
  }
});

test("Point 1.2c: checkLiveProcessHoldingFd strictly fails closed on stderr errors, timeouts, signals, and spawn errors (MUST #2)", () => {
  const dummyFile = path.join(os.tmpdir(), "data150-test-p2c-dummy.txt");
  writeFileSync(dummyFile, "test\n");

  try {
    // 1. Stderr diagnostic warning/error with status 1: MUST fail closed!
    const mockStderr = () => ({
      status: 1,
      stdout: "",
      stderr: "lsof: WARNING: can't stat() filesystem /net\n",
      pid: 1234,
      output: [],
      signal: null,
    } as any);
    const resStderr = checkLiveProcessHoldingFd(dummyFile, mockStderr);
    assert.equal(resStderr.determined, false, "Stderr warning must result in indeterminate inspection");
    assert.equal(resStderr.hasLiveHolder, true, "Must fail closed (hasLiveHolder: true) on stderr warning");

    // 2. Timeout error: MUST fail closed!
    const mockTimeout = () => ({
      status: null,
      stdout: "",
      stderr: "",
      error: Object.assign(new Error("ETIMEDOUT"), { code: "ETIMEDOUT" }),
      pid: 1234,
      output: [],
      signal: "SIGTERM",
    } as any);
    const resTimeout = checkLiveProcessHoldingFd(dummyFile, mockTimeout);
    assert.equal(resTimeout.determined, false);
    assert.equal(resTimeout.hasLiveHolder, true);

    // 3. Spawn failure (tool missing / ENOENT): MUST fail closed!
    const mockMissing = () => ({
      status: null,
      stdout: "",
      stderr: "",
      error: Object.assign(new Error("ENOENT"), { code: "ENOENT" }),
      pid: 1234,
      output: [],
      signal: null,
    } as any);
    const resMissing = checkLiveProcessHoldingFd(dummyFile, mockMissing);
    assert.equal(resMissing.determined, false);
    assert.equal(resMissing.hasLiveHolder, true);

    // 4. Killed by signal: MUST fail closed!
    const mockSignal = () => ({
      status: null,
      stdout: "",
      stderr: "",
      signal: "SIGKILL",
      pid: 1234,
      output: [],
    } as any);
    const resSignal = checkLiveProcessHoldingFd(dummyFile, mockSignal);
    assert.equal(resSignal.determined, false);
    assert.equal(resSignal.hasLiveHolder, true);

    // 5. Exit status 2 (error): MUST fail closed!
    const mockStatus2 = () => ({
      status: 2,
      stdout: "",
      stderr: "",
      signal: null,
      pid: 1234,
      output: [],
    } as any);
    const resStatus2 = checkLiveProcessHoldingFd(dummyFile, mockStatus2);
    assert.equal(resStatus2.determined, false);
    assert.equal(resStatus2.hasLiveHolder, true);

    // 6. Clean exit 1 with empty stdout and clean stderr: Confirmed absence!
    const mockCleanAbsence = () => ({
      status: 1,
      stdout: "",
      stderr: "",
      signal: null,
      pid: 1234,
      output: [],
    } as any);
    const resClean = checkLiveProcessHoldingFd(dummyFile, mockCleanAbsence);
    assert.equal(resClean.determined, true, "Clean exit 1 must be determined");
    assert.equal(resClean.hasLiveHolder, false, "Clean exit 1 must report no live holders");

    // 7. Clean exit 0 with our live PID: Confirmed presence!
    const mockCleanPresence = () => ({
      status: 0,
      stdout: `${process.pid}\n`,
      stderr: "",
      signal: null,
      pid: 1234,
      output: [],
    } as any);
    const resPresence = checkLiveProcessHoldingFd(dummyFile, mockCleanPresence);
    assert.equal(resPresence.determined, true);
    assert.equal(resPresence.hasLiveHolder, true);
  } finally {
    if (existsSync(dummyFile)) unlinkSync(dummyFile);
  }
});

test("Point 3: Reconciliation with empty staging preserves committed ledger and marks attempt indeterminate", async () => {
  const receiptPath = path.join(os.tmpdir(), "data150-test-p3-receipt.json");
  if (existsSync(receiptPath)) unlinkSync(receiptPath);

  const sqlContent = readFileSync(LOADER_SQL_PATH, "utf8");
  const expectedHash = computeSqlSha256(sqlContent);

  // Initial receipt with committed ledger from an earlier successful attempt
  const initialReceipt: Record<string, any> = {
    batch_id: "DATA150-PRODUCTION-20261009",
    tenant_id: "00000000-0000-4000-8000-000000000001",
    status: "IN_TRANSACTION_PRE_COMMIT",
    attempt_id: "attempt-zero-staged",
    dataset_hash: expectedHash,
    executed_at: undefined,
    reconciled_at: undefined,
    execution_reconciled: false,
    tables: {
      parties: {
        table: "parties",
        inserted_count: 1,
        inserted_keys: ["00000000-0000-4000-8000-000000000001"],
        pk_type: "single",
        pk_col: "id",
        immutable: false,
      },
    },
    staged_tables: {}, // Empty staging: 0 candidate keys in this attempt
  };

  writeJsonAtomicallyWithFsync(receiptPath, initialReceipt);

  const mockExecutor = async () => [{ count: 0 }];

  const outcome = await reconcileInFlightReceipt(mockExecutor, receiptPath, expectedHash);

  assert.equal(outcome.reconciled, false, "Must not affirm commit from empty staging");
  assert.equal(outcome.status, "COMMIT_INDETERMINATE");
  assert.equal(outcome.confirmedKeysCount, 0);

  const disk = JSON.parse(readFileSync(receiptPath, "utf8"));
  assert.equal(disk.status, "COMMIT_INDETERMINATE");
  assert.equal(disk.execution_reconciled, false);
  assert.ok(disk.reconciled_at, "reconciled_at observation time must be recorded");
  assert.equal(disk.executed_at, undefined, "executed_at must NOT be fabricated from reconciliation time");
  // Prior confirmed ledger preserved
  assert.equal(disk.tables.parties.inserted_count, 1);

  if (existsSync(receiptPath)) unlinkSync(receiptPath);
});
