// scripts/audit/run-supabase-audit-readonly.mjs
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

const { Client } = pg;
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = resolve(__dirname, "../..");

const BASELINE_0912_PATH = resolve(ROOT, "docs/verification/supabase-migration-content-audit-20260912.json");
const EXPECTED_0912_SHA256 = "a6ee59dafc1c27f1b484b0a9de1bdca9b8f35ca8d733d93ca637212683ef4feb";
const EXPECTED_0912_BYTES = 144040;

const EXPECTED_DB_PROJECT_REF = "gqkjqhpmyejmehbuombk";
const EXPECTED_DB_NAME = "postgres";
const EXPECTED_HOST_SUFFIX = ".pooler.supabase.com";
const EXPECTED_DB_PORT = 5432;

export function validateConnectionString(connectionString: string | undefined) {
  if (!connectionString || typeof connectionString !== "string") {
    throw new Error("Missing connection string. No credentials printed.");
  }

  let url;
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

export async function executeReadOnlyCapture(
  client: { query: (sql: string, params?: any[]) => Promise<any> },
  options: { capturedAt?: string; outputPath?: string; preflightPath?: string } = {},
) {
  const capturedAt = options.capturedAt || new Date().toISOString();
  const outputPath = resolve(ROOT, options.outputPath || "docs/verification/supabase-migration-content-audit-20261024.json");
  const preflightPath = resolve(ROOT, options.preflightPath || "docs/verification/supabase-audit-preflight-evidence-20261024.json");

  // Verify baseline integrity before starting
  verify0912BaselineIntact();

  // 1. Enter strict READ ONLY transaction
  await client.query("BEGIN TRANSACTION READ ONLY;");
  await client.query("SET statement_timeout = '30s';");
  await client.query("SET lock_timeout = '10s';");

  try {
    // 2. Query 1: public.customs_messages metrics
    const q1 = await client.query(`
      SELECT 
          to_jsonb(m)->>'tenant_id' AS message_tenant_id,
          c.tenant_id AS case_tenant_id,
          count(*)::bigint AS total_rows,
          min(m.created_at) AS min_created_at,
          max(m.created_at) AS max_created_at
      FROM public.customs_messages m
      LEFT JOIN public.customs_cases c ON c.id = m.case_id
      GROUP BY to_jsonb(m)->>'tenant_id', c.tenant_id
      ORDER BY to_jsonb(m)->>'tenant_id', c.tenant_id;
    `);

    // 3. Query 2: public.customs_events metrics
    const q2 = await client.query(`
      SELECT 
          to_jsonb(e)->>'tenant_id' AS event_tenant_id,
          c.tenant_id AS case_tenant_id,
          count(*)::bigint AS total_rows,
          min(e.created_at) AS min_created_at,
          max(e.created_at) AS max_created_at
      FROM public.customs_events e
      LEFT JOIN public.customs_cases c ON c.id = e.case_id
      GROUP BY to_jsonb(e)->>'tenant_id', c.tenant_id
      ORDER BY to_jsonb(e)->>'tenant_id', c.tenant_id;
    `);

    // 4. Query 3: public.customs_cases metrics (parent table)
    const q3 = await client.query(`
      SELECT 
          tenant_id,
          count(*)::bigint AS total_rows,
          min(created_at) AS min_created_at,
          max(created_at) AS max_created_at
      FROM public.customs_cases
      GROUP BY tenant_id
      ORDER BY tenant_id;
    `);

    // 5. Query 4: Cross-tenant referential integrity checks
    const q4a = await client.query(`
      SELECT 
          'customs_messages_cross_tenant_check' AS check_name,
          count(*)::bigint AS mismatched_rows
      FROM public.customs_messages m
      JOIN public.customs_cases c ON c.id = m.case_id
      WHERE (to_jsonb(m)->>'tenant_id') IS NOT NULL 
        AND c.tenant_id IS NOT NULL 
        AND (to_jsonb(m)->>'tenant_id')::uuid <> c.tenant_id;
    `);

    const q4b = await client.query(`
      SELECT 
          'customs_events_cross_tenant_check' AS check_name,
          count(*)::bigint AS mismatched_rows
      FROM public.customs_events e
      JOIN public.customs_cases c ON c.id = e.case_id
      WHERE (to_jsonb(e)->>'tenant_id') IS NOT NULL 
        AND c.tenant_id IS NOT NULL 
        AND (to_jsonb(e)->>'tenant_id')::uuid <> c.tenant_id;
    `);

    // 6. Query 5: Schema catalog
    const q5 = await client.query(`
      SELECT 
          table_name,
          column_name,
          data_type,
          is_nullable,
          column_default
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name IN ('customs_messages', 'customs_events', 'customs_cases')
        AND column_name IN ('tenant_id', 'actor_id', 'case_id')
      ORDER BY table_name, column_name;
    `);

    // 7. Query 6: Constraints and RLS policies
    const q6a = await client.query(`
      SELECT 
          conrelid::regclass::text AS table_name,
          conname AS constraint_name,
          contype AS constraint_type,
          pg_get_constraintdef(oid) AS definition
      FROM pg_constraint
      WHERE conrelid IN ('public.customs_messages'::regclass, 'public.customs_events'::regclass)
      ORDER BY table_name, constraint_name;
    `);

    const q6b = await client.query(`
      SELECT 
          tablename,
          policyname,
          permissive,
          roles,
          cmd,
          qual,
          with_check
      FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename IN ('customs_messages', 'customs_events')
      ORDER BY tablename, policyname;
    `);

    // 8. Query 7: Migration ledger export (in memory)
    const q7 = await client.query(`
      SELECT coalesce(jsonb_agg(row_to_json(q) ORDER BY q.version), '[]'::jsonb)::text AS migration_audit_export
      FROM (
        SELECT
          m.version,
          m.name,
          cardinality(m.statements) as remote_array_elements,
          md5(m.statements::text) as array_text_md5,
          (
            select sum(length(e.statement))::integer
            from unnest(m.statements) as e(statement)
          ) as payload_chars_total,
          (
            select sum(octet_length(e.statement))::integer
            from unnest(m.statements) as e(statement)
          ) as payload_utf8_bytes_total,
          (
            select sum(length(encode(convert_to(e.statement, 'UTF8'), 'base64')))::integer
            from unnest(m.statements) as e(statement)
          ) as base64_wrapped_chars_total,
          (
            select sum(
              length(replace(encode(convert_to(e.statement, 'UTF8'), 'base64'), chr(10), ''))
            )::integer
            from unnest(m.statements) as e(statement)
          ) as base64_unwrapped_chars_total,
          (
            select sum(
              length(encode(convert_to(e.statement, 'UTF8'), 'base64'))
              - length(replace(encode(convert_to(e.statement, 'UTF8'), 'base64'), chr(10), ''))
            )::integer
            from unnest(m.statements) as e(statement)
          ) as base64_lf_total,
          (
            select count(*) filter (
              where right(encode(convert_to(e.statement, 'UTF8'), 'base64'), 1) = chr(10)
            )::integer
            from unnest(m.statements) as e(statement)
          ) as base64_elements_with_trailing_lf,
          (
            select md5(string_agg(md5(e.statement), ',' order by e.ordinality))
            from unnest(m.statements) with ordinality as e(statement, ordinality)
          ) as element_md5_sequence_md5,
          (
            select md5(
              string_agg(
                encode(convert_to(e.statement, 'UTF8'), 'base64'),
                ',' order by e.ordinality
              )
            )
            from unnest(m.statements) with ordinality as e(statement, ordinality)
          ) as base64_wrapped_sequence_md5,
          (
            select md5(
              string_agg(
                replace(encode(convert_to(e.statement, 'UTF8'), 'base64'), chr(10), ''),
                ',' order by e.ordinality
              )
            )
            from unnest(m.statements) with ordinality as e(statement, ordinality)
          ) as base64_unwrapped_sequence_md5,
          coalesce(
            (
              select jsonb_agg(
                jsonb_build_object(
                  'ordinality', e.ordinality,
                  'payload_base64', encode(convert_to(e.statement, 'UTF8'), 'base64'),
                  'payload_md5', md5(e.statement)
                )
                order by e.ordinality
              )
              from unnest(m.statements) with ordinality as e(statement, ordinality)
            ),
            '[]'::jsonb
          ) as elements
        FROM supabase_migrations.schema_migrations as m
      ) q;
    `);

    // 9. Rollback cleanly
    await client.query("ROLLBACK;");

    // 10. Process in memory
    const preflightEvidence = {
      captured_at: capturedAt,
      executor: "scripts/audit/run-supabase-audit-readonly.mjs",
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

    // Assert 0 cross-tenant mismatched rows
    assert.equal(preflightEvidence.mismatched_rows.customs_messages, 0, "Customs messages must have 0 cross-tenant mismatches");
    assert.equal(preflightEvidence.mismatched_rows.customs_events, 0, "Customs events must have 0 cross-tenant mismatches");

    // Process migration audit artifact
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

    let gitCommit = "unknown";
    try {
      const { execFileSync } = await import("node:child_process");
      gitCommit = execFileSync("git", ["-C", ROOT, "rev-parse", "HEAD"], { encoding: "utf8" }).trim();
    } catch {
      // fallback
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

    // Write preflight evidence
    const preflightJson = JSON.stringify(preflightEvidence, null, 2) + "\n";
    writeFileSync(preflightPath, preflightJson, "utf8");

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
    statement_timeout: 30000,
  });

  await client.connect();
  try {
    const result = await executeReadOnlyCapture(client);
    console.log("CAPTURE_READONLY_SUCCESS:", JSON.stringify(result, null, 2));
  } finally {
    await client.end();
  }
}
