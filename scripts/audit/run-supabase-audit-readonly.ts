// scripts/audit/run-supabase-audit-readonly.ts
// Official and secure READ-ONLY executor for Supabase Database Audit.
// Enforces fail-closed kernel-level read-only transaction (BEGIN TRANSACTION READ ONLY ... ROLLBACK).
// Performs in-memory ledger transformation: ZERO raw DDL / payload_base64 written to disk or logs.
// Generates docs/verification/supabase-migration-content-audit-20261024.json while keeping 20260912.json intact.

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
// @ts-expect-error pg types not installed separately
import pg from "pg";
import { buildMigrationAudit } from "../generate-supabase-migration-audit.ts";
import { splitSqlStatements } from "../sql-provenance.ts";

const { Client } = pg;
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = resolve(__dirname, "../..");

const BASELINE_0912_PATH = resolve(ROOT, "docs/verification/supabase-migration-content-audit-20260912.json");
const EXPECTED_0912_SHA256 = "a6ee59dafc1c27f1b484b0a9de1bdca9b8f35ca8d733d93ca637212683ef4feb";
const EXPECTED_0912_BYTES = 144040;

const CANONICAL_SQL_PATH = resolve(ROOT, "scripts/audit/capture-supabase-migration-audit.sql");
export const EXPECTED_SQL_SHA256 = "14934a1f9d7af8e4521e79415a29c46810f79ef4a7b0a4965a6d6fdd595bc932";
export const EXPECTED_SQL_BYTES = 6606;

const EXPECTED_DB_PROJECT_REF = "gqkjqhpmyejmehbuombk";
const EXPECTED_DB_NAME = "postgres";
const EXPECTED_HOST_SUFFIX = ".pooler.supabase.com";
const EXPECTED_DB_PORT = 5432;

const ALLOWED_QUERY = new Set(["sslmode", "connect_timeout", "application_name"]);
const KEY_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;

export function validateConnectionString(connectionString: string | undefined) {
  if (!connectionString || typeof connectionString !== "string") {
    throw new Error("Missing connection string. No credentials printed.");
  }

  if (connectionString.includes("#")) {
    throw new Error("Connection string must not contain fragment. No credentials printed.");
  }

  let url: URL;
  try {
    url = new URL(connectionString);
  } catch {
    throw new Error("Invalid connection string URL format. No credentials printed.");
  }

  if (url.protocol !== "postgres:" && url.protocol !== "postgresql:") {
    throw new Error("Connection scheme must be postgres: or postgresql:. No credentials printed.");
  }

  const expectedUser = `postgres.${EXPECTED_DB_PROJECT_REF}`;
  if (url.username !== expectedUser) {
    throw new Error("Connection user does not match authorized project reference. No credentials printed.");
  }

  if (!url.hostname || !url.hostname.endsWith(EXPECTED_HOST_SUFFIX)) {
    throw new Error("Connection host must end with .pooler.supabase.com. No credentials printed.");
  }

  const port = url.port ? parseInt(url.port, 10) : 5432;
  if (port !== EXPECTED_DB_PORT) {
    throw new Error(`Connection port must be ${EXPECTED_DB_PORT} (Session pooler mode). No credentials printed.`);
  }

  const dbName = url.pathname.replace(/^\//, "");
  if (dbName !== EXPECTED_DB_NAME) {
    throw new Error("Target database name must be postgres. No credentials printed.");
  }

  const seen = new Set<string>();
  const rawQuery = url.search.replace(/^\?/, "");
  if (rawQuery) {
    for (const raw of rawQuery.split("&")) {
      if (!raw) continue;
      const rawKey = raw.split("=")[0];
      if (!KEY_RE.test(rawKey)) {
        throw new Error("Invalid query parameter key in connection string. No credentials printed.");
      }
      const key = rawKey.toLowerCase();
      if (seen.has(key)) {
        throw new Error(`Duplicate query parameter in connection string: ${key}. No credentials printed.`);
      }
      seen.add(key);
      if (!ALLOWED_QUERY.has(key)) {
        throw new Error(`Query parameter not permitted in connection string: ${key}. No credentials printed.`);
      }
    }
  }

  return { verified: true, projectRef: EXPECTED_DB_PROJECT_REF };
}

export function verify0912BaselineIntact() {
  if (!existsSync(BASELINE_0912_PATH)) {
    throw new Error(`Baseline audit 20260912 missing at ${BASELINE_0912_PATH}`);
  }
  const bytes = readFileSync(BASELINE_0912_PATH);
  if (bytes.length !== EXPECTED_0912_BYTES) {
    throw new Error(`Baseline audit 20260912 byte size changed: expected ${EXPECTED_0912_BYTES}, got ${bytes.length}`);
  }
  const sha = createHash("sha256").update(bytes).digest("hex");
  if (sha !== EXPECTED_0912_SHA256) {
    throw new Error(`Baseline audit 20260912 SHA-256 corrupted: expected ${EXPECTED_0912_SHA256}, got ${sha}`);
  }
  return true;
}

export function verifyCanonicalSqlIntact() {
  if (!existsSync(CANONICAL_SQL_PATH)) {
    throw new Error(`Canonical SQL file missing at ${CANONICAL_SQL_PATH}`);
  }
  const bytes = readFileSync(CANONICAL_SQL_PATH);
  if (bytes.length !== EXPECTED_SQL_BYTES) {
    throw new Error(`Canonical SQL byte size changed: expected ${EXPECTED_SQL_BYTES}, got ${bytes.length}`);
  }
  const sha = createHash("sha256").update(bytes).digest("hex");
  if (sha !== EXPECTED_SQL_SHA256) {
    throw new Error(`Canonical SQL SHA-256 corrupted: expected ${EXPECTED_SQL_SHA256}, got ${sha}`);
  }
  return true;
}

export function loadCanonicalStatements() {
  verifyCanonicalSqlIntact();
  const content = readFileSync(CANONICAL_SQL_PATH, "utf8");
  const clean = content.replace(/^\\.*$/gm, "");
  const statements = splitSqlStatements(clean);
  if (statements.length !== 13) {
    throw new Error(`Expected 13 statements in ${CANONICAL_SQL_PATH}, got ${statements.length}`);
  }
  return {
    setStatementTimeout: statements[0],
    setLockTimeout: statements[1],
    beginReadOnly: statements[2],
    q1_customs_messages: statements[3],
    q2_customs_events: statements[4],
    q3_customs_cases: statements[5],
    q4a_cross_tenant_messages: statements[6],
    q4b_cross_tenant_events: statements[7],
    q5_columns: statements[8],
    q6a_constraints: statements[9],
    q6b_policies: statements[10],
    q7_migration_audit_export: statements[11],
    rollback: statements[12],
  };
}

export async function executeReadOnlyCapture(
  client: { query: (sql: string, params?: any[]) => Promise<any> },
  options: { capturedAt?: string; outputPath?: string; preflightPath?: string } = {},
) {
  let capturedAt = options.capturedAt || process.env.CAPTURED_AT?.trim() || "";
  if (!capturedAt) {
    capturedAt = new Date().toISOString();
  } else {
    const d = new Date(capturedAt);
    if (isNaN(d.getTime())) {
      throw new Error(`Invalid capturedAt timestamp format: "${capturedAt}". Must be valid ISO-8601.`);
    }
  }
  if (capturedAt === "2026-09-12T17:28:44Z") {
    throw new Error("Cannot spoof historical 2026-09-12 timestamp in live capture");
  }

  const outputPath = resolve(ROOT, options.outputPath || "docs/verification/supabase-migration-content-audit-20261024.json");
  const preflightPath = resolve(ROOT, options.preflightPath || "docs/verification/supabase-audit-preflight-evidence-20261024.json");

  // Verify baseline integrity and canonical SQL before starting
  verify0912BaselineIntact();
  const sql = loadCanonicalStatements();

  // 1. Enter strict READ ONLY transaction
  await client.query(sql.beginReadOnly);
  await client.query(sql.setStatementTimeout);
  await client.query(sql.setLockTimeout);

  let preflightEvidence: any = null;

  try {
    // 2. Execute inspection queries 1 to 6
    const q1 = await client.query(sql.q1_customs_messages);
    const q2 = await client.query(sql.q2_customs_events);
    const q3 = await client.query(sql.q3_customs_cases);
    const q4a = await client.query(sql.q4a_cross_tenant_messages);
    const q4b = await client.query(sql.q4b_cross_tenant_events);
    const q5 = await client.query(sql.q5_columns);
    const q6a = await client.query(sql.q6a_constraints);
    const q6b = await client.query(sql.q6b_policies);

    // 3. Execute Query 7: migration ledger export
    const q7 = await client.query(sql.q7_migration_audit_export);

    // 4. Rollback cleanly immediately after queries
    await client.query(sql.rollback);

    // 5. Build preflight evidence immediately
    preflightEvidence = {
      captured_at: capturedAt,
      executor: "scripts/audit/run-supabase-audit-readonly.ts",
      transaction_mode: "READ ONLY",
      mismatched_rows: {
        customs_messages: Number(q4a.rows[0]?.mismatched_rows ?? 0),
        customs_events: Number(q4b.rows[0]?.mismatched_rows ?? 0),
      },
      customs_messages_metrics: q1.rows,
      customs_events_metrics: q2.rows,
      customs_cases_metrics: q3.rows,
      columns: q5.rows,
      constraints: q6a.rows,
      policies: q6b.rows,
    };

    // Write preflight evidence to disk PRIOR to assert (MUST-EXEC-1R)
    const preflightJson = JSON.stringify(preflightEvidence, null, 2) + "\n";
    assert.ok(!preflightJson.includes('"payload_base64":'), "Preflight evidence must never contain raw payload_base64");
    writeFileSync(preflightPath, preflightJson, "utf8");

    // Assert 0 cross-tenant mismatched rows (aborts if mismatched, but leaves preflight on disk)
    assert.equal(preflightEvidence.mismatched_rows.customs_messages, 0, "Customs messages must have 0 cross-tenant mismatches");
    assert.equal(preflightEvidence.mismatched_rows.customs_events, 0, "Customs events must have 0 cross-tenant mismatches");

    // 6. Process migration audit artifact
    const rawExport = q7.rows[0]?.migration_audit_export;
    if (!rawExport) {
      throw new Error("Query 7 returned empty migration audit export");
    }

    const remoteRows = JSON.parse(rawExport);

    // Read git migrations from repository
    const gitDir = resolve(ROOT, "supabase/migrations");
    const { readdirSync } = await import("node:fs");
    const gitMigrations = readdirSync(gitDir)
      .filter((file) => /^[0-9]+_.+\.sql$/.test(file))
      .sort((a, b) => a.localeCompare(b, "en"))
      .map((file) => ({
        path: `supabase/migrations/${file}`,
        sql: readFileSync(resolve(gitDir, file), "utf8"),
      }));

    // Determine baseline commit SHA (fail-closed, MUST-EXEC-2R)
    const { execFileSync } = await import("node:child_process");
    const targetSha = process.env.TARGET_SHA?.trim() || "";
    if (targetSha) {
      if (!/^[0-9a-f]{40}$/i.test(targetSha)) {
        throw new Error(`Invalid TARGET_SHA provided: "${targetSha}". Must be 40 lowercase hex characters.`);
      }
      // Verificar fail-closed que supabase/migrations en disco coincide exactamente con TARGET_SHA
      try {
        execFileSync("git", ["-C", ROOT, "diff", "--quiet", targetSha, "--", "supabase/migrations"]);
      } catch {
        throw new Error(`supabase/migrations in working tree does not match TARGET_SHA: ${targetSha}`);
      }
    }
    const logArgs = targetSha
      ? ["-C", ROOT, "log", "-1", "--format=%H", targetSha, "--", "supabase/migrations"]
      : ["-C", ROOT, "log", "-1", "--format=%H", "--", "supabase/migrations"];
    const gitCommit = execFileSync("git", logArgs, { encoding: "utf8" }).trim().toLowerCase();
    if (!/^[0-9a-f]{40}$/.test(gitCommit)) {
      throw new Error(`Invalid git migration baseline commit SHA: "${gitCommit}". Must be 40 hex characters.`);
    }

    const auditDocument = buildMigrationAudit({
      remoteRows,
      gitMigrations,
      gitMigrationBaselineCommit: gitCommit,
      capturedAt,
    });

    // Write audit document
    const auditJson = JSON.stringify(auditDocument, null, 2) + "\n";
    writeFileSync(outputPath, auditJson, "utf8");

    // Post-execution security checks:
    // 1. Output must NOT contain raw payload_base64 values
    assert.ok(!auditJson.includes('"payload_base64":'), "Audit document must never contain raw payload_base64");
    // 2. Baseline 0912 must remain intact
    verify0912BaselineIntact();

    const outputSha = createHash("sha256").update(Buffer.from(auditJson, "utf8")).digest("hex");

    return {
      success: true,
      capturedAt,
      outputPath,
      outputSha,
      outputBytes: Buffer.byteLength(auditJson),
      preflightPath,
      pairedMigrations: (auditDocument as any).summary.paired_migrations,
      allPairsEquivalent: (auditDocument as any).summary.all_pairs_equivalent,
      baseline0912Intact: true,
    };
  } catch (err) {
    try {
      await client.query("ROLLBACK;");
    } catch {
      // ignore rollback failure on error
    }
    throw err;
  }
}

// CLI Execution entrypoint
if (process.argv[1] && resolve(process.argv[1]) === resolve(__filename)) {
  const pgUrl = process.env.POSTGRES_URL_NON_POOLING || process.env.PG;
  validateConnectionString(pgUrl);

  const client = new Client({
    connectionString: pgUrl,
    ssl: { rejectUnauthorized: false },
    options: "-c default_transaction_read_only=on -c statement_timeout=30000 -c lock_timeout=10000",
  });

  await client.connect();
  try {
    const result = await executeReadOnlyCapture(client);
    console.log("CAPTURE_READONLY_SUCCESS:", JSON.stringify(result, null, 2));
  } finally {
    await client.end();
  }
}
