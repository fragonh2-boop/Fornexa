// tests/supabase-audit-readonly-executor.test.ts
// Tests for the Read-Only Supabase Audit Executor (scripts/audit/run-supabase-audit-readonly.ts)
// Certifies:
// 1. Kernel-level fail-closed read-only protection (PostgreSQL 25006).
// 2. Connection string and host allowlist validation, query param filtering, and fragment rejection.
// 3. Static audit SQL boundaries (BEGIN READ ONLY / ROLLBACK / 0 COMMIT) and canonical pin.
// 4. In-memory execution, zero payload leakage, and 20260912 baseline preservation.
// 5. Full relational execution on PGlite with realistic ledger scenarios (operational core, e1_core, c3_load_controls).

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, existsSync, unlinkSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";
import {
  validateConnectionString,
  verify0912BaselineIntact,
  verifyCanonicalSqlIntact,
  executeReadOnlyCapture,
  loadCanonicalStatements,
  EXPECTED_SQL_BYTES,
  EXPECTED_SQL_SHA256,
} from "../scripts/audit/run-supabase-audit-readonly.ts";
import { splitSqlStatements } from "../scripts/sql-provenance.ts";
import { buildMigrationAudit } from "../scripts/generate-supabase-migration-audit.ts";

test("ReadOnly Executor — Validación estricta de Connection String (Allowlist, Query Params y Fragmentos)", () => {
  // Caso válido base
  const valid = "postgresql://postgres.gqkjqhpmyejmehbuombk:secretpassword@aws-0-eu-central-1.pooler.supabase.com:5432/postgres";
  const res = validateConnectionString(valid);
  assert.equal(res.verified, true);
  assert.equal(res.projectRef, "gqkjqhpmyejmehbuombk");

  // Query params permitidos
  const withValidQuery = validateConnectionString(valid + "?sslmode=require&connect_timeout=10&application_name=fornexa_audit");
  assert.equal(withValidQuery.verified, true);

  // Caso inválido: fragmento presente (#...)
  assert.throws(
    () => validateConnectionString(valid + "#unauthorized_fragment"),
    /Connection string must not contain fragment/,
  );

  // Caso inválido: query param no permitido
  assert.throws(
    () => validateConnectionString(valid + "?target_session_attrs=read-write"),
    /Query parameter not permitted in connection string: target_session_attrs/,
  );

  // Caso inválido: clave duplicada
  assert.throws(
    () => validateConnectionString(valid + "?sslmode=require&sslmode=disable"),
    /Duplicate query parameter in connection string: sslmode/,
  );

  // Caso inválido: puerto incorrecto (6543 transaccional)
  assert.throws(
    () => validateConnectionString("postgresql://postgres.gqkjqhpmyejmehbuombk:secretpassword@aws-0-eu-central-1.pooler.supabase.com:6543/postgres"),
    /Connection port must be 5432/,
  );

  // Caso inválido: proyecto cruzado
  assert.throws(
    () => validateConnectionString("postgresql://postgres.otroproject:secretpassword@aws-0-eu-central-1.pooler.supabase.com:5432/postgres"),
    /Connection user does not match authorized project reference/,
  );

  // Caso inválido: host directo no pooler
  assert.throws(
    () => validateConnectionString("postgresql://postgres.gqkjqhpmyejmehbuombk:secretpassword@db.gqkjqhpmyejmehbuombk.supabase.co:5432/postgres"),
    /Connection host must end with \.pooler\.supabase\.com/,
  );

  // Caso inválido: base distinta
  assert.throws(
    () => validateConnectionString("postgresql://postgres.gqkjqhpmyejmehbuombk:secretpassword@aws-0-eu-central-1.pooler.supabase.com:5432/other_db"),
    /Target database name must be postgres/,
  );
});

test("ReadOnly Executor — Límites del script SQL (BEGIN READ ONLY, ROLLBACK, 0 COMMIT) y Pin por Contenido", () => {
  const sqlPath = resolve(import.meta.dirname, "../scripts/audit/capture-supabase-migration-audit.sql");
  assert.ok(existsSync(sqlPath), "Script SQL debe existir en el repositorio");

  assert.equal(verifyCanonicalSqlIntact(), true, "El script SQL canónico debe cumplir su pin por contenido (bytes y SHA)");
  assert.equal(EXPECTED_SQL_BYTES, 6606);
  assert.equal(EXPECTED_SQL_SHA256, "14934a1f9d7af8e4521e79415a29c46810f79ef4a7b0a4965a6d6fdd595bc932");

  const sql = readFileSync(sqlPath, "utf8");

  // Delimitadores obligatorios
  assert.match(sql, /BEGIN TRANSACTION READ ONLY;/, "Debe abrir explícitamente BEGIN TRANSACTION READ ONLY;");
  assert.match(sql, /ROLLBACK;/, "Debe terminar explícitamente con ROLLBACK;");

  // Cero confirmaciones
  assert.equal(/\bcommit\b/i.test(sql), false, "No debe contener ningún comando COMMIT");

  // Contiene las 7 consultas
  assert.match(sql, /public\.customs_messages/, "Debe contener consulta 1 (customs_messages)");
  assert.match(sql, /public\.customs_events/, "Debe contener consulta 2 (customs_events)");
  assert.match(sql, /public\.customs_cases/, "Debe contener consulta 3 (customs_cases)");
  assert.match(sql, /customs_messages_cross_tenant_check/, "Debe contener consulta 4a (mismatched check)");
  assert.match(sql, /customs_events_cross_tenant_check/, "Debe contener consulta 4b (mismatched check)");
  assert.match(sql, /information_schema\.columns/, "Debe contener consulta 5 (catálogo de columnas)");
  assert.match(sql, /pg_policies/, "Debe contener consulta 6 (catálogo de políticas)");
  assert.match(sql, /supabase_migrations\.schema_migrations/, "Debe contener consulta 7 (exportación de ledger)");

  // Carga de sentencias canónicas
  const stmts = loadCanonicalStatements();
  assert.ok(stmts.beginReadOnly.includes("BEGIN TRANSACTION READ ONLY"));
  assert.ok(stmts.rollback.includes("ROLLBACK"));
  assert.ok(stmts.q7_migration_audit_export.includes("migration_audit_export"));
});

test("ReadOnly Executor — Preservación de línea base 20260912 inmutable", () => {
  assert.equal(verify0912BaselineIntact(), true, "El archivo 20260912.json debe estar intacto (144.040 bytes)");
});

test("ReadOnly Executor — Protección fail-closed de PostgreSQL ante intentos de escritura (Código 25006)", async () => {
  const db = new PGlite();
  await db.exec(`
    create table public.test_readonly_guard (id int, val text);
    insert into public.test_readonly_guard values (1, 'initial');
  `);

  // Entrar en transacción READ ONLY
  await db.exec("BEGIN TRANSACTION READ ONLY;");

  // Intentar escritura debe fallar con error 25006
  await assert.rejects(
    async () => {
      await db.exec("insert into public.test_readonly_guard values (2, 'mutation_attempt');");
    },
    (err: any) => {
      return (
        err.code === "25006" ||
        /read-only transaction/i.test(err.message)
      );
    },
    "Cualquier mutación DML/DDL dentro de READ ONLY debe abortar a nivel de kernel PostgreSQL",
  );

  await db.exec("ROLLBACK;");

  // Verificar que la tabla no fue mutada
  const rows = (await db.query("select * from public.test_readonly_guard;")).rows;
  assert.equal(rows.length, 1);
  assert.equal((rows[0] as any).val, "initial");
});

test("ReadOnly Executor — Ejecución relacional completa sobre PGlite con mock realista de ledger (SHOULD-TEST-1)", async () => {
  const db = new PGlite();

  // Setup minimal relational schema matching the queries
  await db.exec(`
    create schema if not exists supabase_migrations;
    create table supabase_migrations.schema_migrations (
      version text primary key,
      name text,
      statements text[]
    );

    create table public.customs_cases (
      id uuid primary key default gen_random_uuid(),
      tenant_id uuid not null default '00000000-0000-4000-a000-000000000001'::uuid,
      created_at timestamptz default now()
    );

    create table public.customs_messages (
      id uuid primary key default gen_random_uuid(),
      case_id uuid references public.customs_cases(id),
      tenant_id uuid default '00000000-0000-4000-a000-000000000001'::uuid,
      actor_id uuid,
      created_at timestamptz default now()
    );

    create table public.customs_events (
      id uuid primary key default gen_random_uuid(),
      case_id uuid references public.customs_cases(id),
      tenant_id uuid default '00000000-0000-4000-a000-000000000001'::uuid,
      actor_id uuid,
      created_at timestamptz default now()
    );

    -- Seed data
    insert into public.customs_cases (id) values ('10000000-0000-4000-a000-000000000001');
    insert into public.customs_messages (case_id) values ('10000000-0000-4000-a000-000000000001');
    insert into public.customs_events (case_id) values ('10000000-0000-4000-a000-000000000001');
  `);

  const migrationDir = resolve(import.meta.dirname, "../supabase/migrations");

  // 1. Migración estándar idéntica: 20260814_cmr_canonical_model
  const f1 = "20260814_cmr_canonical_model.sql";
  const sql1 = readFileSync(resolve(migrationDir, f1), "utf8");
  await db.query(
    "insert into supabase_migrations.schema_migrations (version, name, statements) values ($1, $2, $3);",
    ["20260814120000", "cmr_canonical_model", [sql1]],
  );

  // 2. Migración estándar idéntica: 20260901_platform_telemetry
  const fSec = "20260901_platform_telemetry.sql";
  const sqlSec = readFileSync(resolve(migrationDir, fSec), "utf8");
  await db.query(
    "insert into supabase_migrations.schema_migrations (version, name, statements) values ($1, $2, $3);",
    ["20260901120000", "platform_telemetry", [sqlSec]],
  );

  // 2b. Migración con ancla multi-elemento: 20260812_fornexa_operational_core (83 sentencias en ledger recortadas)
  const fCore = "20260812_fornexa_operational_core.sql";
  const sqlCore = readFileSync(resolve(migrationDir, fCore), "utf8");
  const allCoreStmts = splitSqlStatements(sqlCore);
  assert.strictEqual(
    allCoreStmts.length,
    85,
    "fornexa_operational_core en Git debe contener exactamente 85 sentencias (83 base + 2 ALTER de Candidate 5)",
  );
  const coreStmtsTrimmed = [...allCoreStmts.slice(0, 44), ...allCoreStmts.slice(46)].map((s) => s.trim());
  assert.strictEqual(
    coreStmtsTrimmed.length,
    83,
    "coreStmtsTrimmed debe contener exactamente 83 sentencias remotas",
  );
  await db.query(
    "insert into supabase_migrations.schema_migrations (version, name, statements) values ($1, $2, $3);",
    ["20260812120000", "fornexa_operational_core", coreStmtsTrimmed],
  );

  // 3. Migración insertada como nombre de archivo: 20261017110000_wms_e1_core
  await db.query(
    "insert into supabase_migrations.schema_migrations (version, name, statements) values ($1, $2, $3);",
    ["20261017110000", "wms_e1_core", ["20261017110000_wms_e1_core.sql"]],
  );

  // 4. Migración insertada sin delimitadores begin/commit: 20261019120000_wms_c3_server_load_controls
  const fC3 = "20261019120000_wms_c3_server_load_controls.sql";
  const sqlC3 = readFileSync(resolve(migrationDir, fC3), "utf8");
  const c3Stripped = sqlC3.replace(/^\s*begin;\s*$/gim, "").replace(/^\s*commit;\s*$/gim, "");
  await db.query(
    "insert into supabase_migrations.schema_migrations (version, name, statements) values ($1, $2, $3);",
    ["20261019120000", "wms_c3_server_load_controls", [c3Stripped]],
  );

  const tempOut = resolve(import.meta.dirname, "../docs/verification/test-temp-audit-20261024.json");
  const tempPre = resolve(import.meta.dirname, "../docs/verification/test-temp-preflight-20261024.json");

  // Adapt db to client interface
  const clientAdapter = {
    query: async (sql: string, params?: any[]) => {
      return await db.query(sql, params);
    },
  };

  // Run execution with strict real clock verification
  const beforeMs = Date.now();
  try {
    const result = await executeReadOnlyCapture(clientAdapter, {
      outputPath: tempOut,
      preflightPath: tempPre,
    });
    const afterMs = Date.now();

    assert.equal(result.success, true);
    assert.equal(result.baseline0912Intact, true);

    // Verify output file exists and has 0 raw payload_base64 values
    assert.ok(existsSync(tempOut), "El archivo de salida debe existir");
    const outContent = readFileSync(tempOut, "utf8");
    assert.equal(outContent.includes('"payload_base64":'), false, "Cero raw payload_base64 en el archivo final");

    // Verify preflight evidence exists and has 0 cross-tenant mismatches
    assert.ok(existsSync(tempPre), "El archivo preflight debe existir");
    const preContent = JSON.parse(readFileSync(tempPre, "utf8"));
    assert.equal(preContent.mismatched_rows.customs_messages, 0);
    assert.equal(preContent.mismatched_rows.customs_events, 0);

    // Verify real clock timestamp within test execution window
    const preMs = new Date(preContent.captured_at).getTime();
    assert.ok(
      preMs >= beforeMs && preMs <= afterMs,
      `Preflight captured_at (${preContent.captured_at}) debe originarse en la ventana de reloj real`,
    );

    // Verify audit structure and entries documentation
    const parsedAudit = JSON.parse(outContent);
    assert.equal(parsedAudit.schema_version, 1);
    const parsedMs = new Date(parsedAudit.captured_at).getTime();
    assert.ok(
      parsedMs >= beforeMs && parsedMs <= afterMs,
      `Audit captured_at (${parsedAudit.captured_at}) debe originarse en la ventana de reloj real`,
    );
    assert.ok(parsedAudit.migrations.length >= 5, "Debe registrar al menos las 5 migraciones simuladas");

    // fornexa_operational_core must be registered conforming to its multi-element anchors
    const coreEntry = parsedAudit.migrations.find((e: any) => e.remote_name === "fornexa_operational_core");
    assert.ok(coreEntry, "fornexa_operational_core debe estar presente en las entradas auditadas");

    // e1_core must record its factual comparison without crashing
    const e1Entry = parsedAudit.migrations.find((e: any) => e.remote_name === "wms_e1_core");
    assert.ok(e1Entry, "wms_e1_core debe estar presente en las entradas auditadas");
    assert.equal(e1Entry.equivalent, false, "wms_e1_core debe registrar equivalent: false conforme a su ledger real");

    // c3_server_load_controls must record its factual comparison without crashing
    const c3Entry = parsedAudit.migrations.find((e: any) => e.remote_name === "wms_c3_server_load_controls");
    assert.ok(c3Entry, "wms_c3_server_load_controls debe estar presente en las entradas auditadas");
  } finally {
    if (existsSync(tempOut)) unlinkSync(tempOut);
    if (existsSync(tempPre)) unlinkSync(tempPre);
  }
});

test("ReadOnly Executor — Falla cerrada ante mutaciones arbitrarias incluso en fecha actual (SHOULD-SEC-1)", async () => {
  const db = new PGlite();
  await db.exec(`
    create schema if not exists supabase_migrations;
    create table supabase_migrations.schema_migrations (
      version text primary key,
      name text,
      statements text[]
    );
    create table public.customs_cases (
      id uuid primary key default gen_random_uuid(),
      tenant_id uuid not null default '00000000-0000-4000-a000-000000000001'::uuid,
      created_at timestamptz default now()
    );
    create table public.customs_messages (
      id uuid primary key default gen_random_uuid(),
      case_id uuid references public.customs_cases(id),
      tenant_id uuid default '00000000-0000-4000-a000-000000000001'::uuid,
      actor_id uuid,
      created_at timestamptz default now()
    );
    create table public.customs_events (
      id uuid primary key default gen_random_uuid(),
      case_id uuid references public.customs_cases(id),
      tenant_id uuid default '00000000-0000-4000-a000-000000000001'::uuid,
      actor_id uuid,
      created_at timestamptz default now()
    );
  `);

  // Insertar una mutación arbitraria no autorizada en cmr_canonical_model
  await db.query(
    "insert into supabase_migrations.schema_migrations (version, name, statements) values ($1, $2, $3);",
    ["20260814120000", "cmr_canonical_model", ["create table mutated_unauthorized_table (id int);"]],
  );

  const clientAdapter = {
    query: async (sql: string, params?: any[]) => {
      return await db.query(sql, params);
    },
  };

  const tempOut = resolve(import.meta.dirname, "../docs/verification/test-mutated-audit-20261024.json");
  const tempPre = resolve(import.meta.dirname, "../docs/verification/test-mutated-preflight-20261024.json");

  try {
    await assert.rejects(
      async () => {
        await executeReadOnlyCapture(clientAdapter, {
          outputPath: tempOut,
          preflightPath: tempPre,
        });
      },
      /literal-safe comparison failed/,
      "Cualquier mutación arbitraria debe fallar cerrado incluso con timestamp de captura vivo",
    );
  } finally {
    if (existsSync(tempOut)) unlinkSync(tempOut);
    if (existsSync(tempPre)) unlinkSync(tempPre);
  }
});

test("ReadOnly Executor — Conservación de evidencia preflight ante discrepancias cruzadas (mismatched_rows > 0)", async () => {
  const db = new PGlite();
  await db.exec(`
    create schema if not exists supabase_migrations;
    create table supabase_migrations.schema_migrations (
      version text primary key,
      name text,
      statements text[]
    );
    create table public.customs_cases (
      id uuid primary key default gen_random_uuid(),
      tenant_id uuid not null,
      created_at timestamptz default now()
    );
    create table public.customs_messages (
      id uuid primary key default gen_random_uuid(),
      case_id uuid references public.customs_cases(id),
      tenant_id uuid,
      actor_id uuid,
      created_at timestamptz default now()
    );
    create table public.customs_events (
      id uuid primary key default gen_random_uuid(),
      case_id uuid references public.customs_cases(id),
      tenant_id uuid,
      actor_id uuid,
      created_at timestamptz default now()
    );

    -- Insertar discrepancia referencial cruzada deliberada:
    insert into public.customs_cases (id, tenant_id) values ('10000000-0000-4000-a000-000000000001', '00000000-0000-4000-a000-000000000001');
    insert into public.customs_messages (case_id, tenant_id) values ('10000000-0000-4000-a000-000000000001', '00000000-0000-4000-a000-000000000002');
  `);

  const tempPre = resolve(import.meta.dirname, "../docs/verification/test-mismatch-preflight-20261024.json");

  const clientAdapter = {
    query: async (sql: string, params?: any[]) => {
      return await db.query(sql, params);
    },
  };

  try {
    await assert.rejects(
      async () => {
        await executeReadOnlyCapture(clientAdapter, {
          preflightPath: tempPre,
        });
      },
      /Customs messages must have 0 cross-tenant mismatches/,
      "Debe abortar ante discrepancias referenciales",
    );

    // Sin embargo, el archivo preflight debe haberse escrito a disco con el detalle forense:
    assert.ok(existsSync(tempPre), "El preflight debe estar escrito en disco para auditoría forense");
    const preContent = JSON.parse(readFileSync(tempPre, "utf8"));
    assert.equal(preContent.mismatched_rows.customs_messages, 1);
  } finally {
    if (existsSync(tempPre)) unlinkSync(tempPre);
  }
});

test("ReadOnly Executor — Prohibición fail-closed de cualquier override de capturedAt (MUST-PROV-1)", async () => {
  const dummyClient = {
    query: async () => ({ rows: [] }),
  };

  // 1. Rechazo de opción capturedAt histórica 20260912
  await assert.rejects(
    async () => {
      await executeReadOnlyCapture(dummyClient, {
        capturedAt: "2026-09-12T17:28:44Z",
      } as any);
    },
    /Custom or spoofed capturedAt is not permitted in live capture/,
  );

  // 2. Rechazo de opción capturedAt arbitraria viva
  await assert.rejects(
    async () => {
      await executeReadOnlyCapture(dummyClient, {
        capturedAt: "2026-10-24T12:00:00Z",
      } as any);
    },
    /Custom or spoofed capturedAt is not permitted in live capture/,
  );

  // 3. Rechazo de variable de entorno CAPTURED_AT
  process.env.CAPTURED_AT = "2026-10-24T12:00:00Z";
  try {
    await assert.rejects(
      async () => {
        await executeReadOnlyCapture(dummyClient);
      },
      /Custom or spoofed capturedAt is not permitted in live capture/,
    );
  } finally {
    delete process.env.CAPTURED_AT;
  }
});

test("ReadOnly Executor — Compatibilidad con Candidate 5 / PR #145 (85 Git vs 83 remoto + rechazo en índice 44) (MUST-TEST-1)", () => {
  const migrationDir = resolve(import.meta.dirname, "../supabase/migrations");

  // 1. Cargar fornexa_operational_core (83 sentencias de base) y armar el Git autorizado de 85 sentencias
  const fCore = "20260812_fornexa_operational_core.sql";
  const sqlCore = readFileSync(resolve(migrationDir, fCore), "utf8");
  const allCoreStmts = splitSqlStatements(sqlCore);
  assert.strictEqual(
    allCoreStmts.length,
    85,
    "fornexa_operational_core en Git debe contener exactamente 85 sentencias (83 base + 2 ALTER de Candidate 5)",
  );
  const coreStmts83 = [...allCoreStmts.slice(0, 44), ...allCoreStmts.slice(46)];
  assert.strictEqual(coreStmts83.length, 83);

  const valid85Statements = allCoreStmts;
  assert.strictEqual(valid85Statements.length, 85);
  const validGitSql85 = valid85Statements.join(";\n\n");

  // Cargar e1_core y c3_server_load_controls
  const fE1 = "20261017110000_wms_e1_core.sql";
  const sqlE1 = readFileSync(resolve(migrationDir, fE1), "utf8");

  const fC3 = "20261019120000_wms_c3_server_load_controls.sql";
  const sqlC3 = readFileSync(resolve(migrationDir, fC3), "utf8");
  const c3Stripped = sqlC3.replace(/^\s*begin;\s*$/gim, "").replace(/^\s*commit;\s*$/gim, "");

  // Crear elementos remotos para fornexa_operational_core (83 sentencias recortadas)
  const remoteStatements = coreStmts83.map((s) => s.trim());
  function md5(val: Buffer | string): string {
    return createHash("md5").update(val).digest("hex");
  }
  function encodePostgresBase64(buf: Buffer): string {
    if (buf.length === 0) return "";
    const chunks: string[] = [];
    for (let i = 0; i < buf.length; i += 57) {
      const chunk = buf.subarray(i, i + 57);
      const b64 = chunk.toString("base64");
      if (chunk.length === 57) {
        chunks.push(b64 + "\n");
      } else {
        chunks.push(b64);
      }
    }
    return chunks.join("");
  }

  const elementsCore = remoteStatements.map((stmt, idx) => {
    const buf = Buffer.from(stmt, "utf8");
    return {
      ordinality: idx + 1,
      payload_base64: encodePostgresBase64(buf),
      payload_md5: md5(buf),
    };
  });
  const remotePayloadsCore = elementsCore.map((el) => {
    const buf = Buffer.from(el.payload_base64.split("\n").join(""), "base64");
    const s = buf.toString("utf8");
    return {
      chars: Array.from(s).length,
      utf8Bytes: buf.length,
      base64Wrapped: el.payload_base64,
      base64Unwrapped: el.payload_base64.split("\n").join(""),
      base64LfCount: el.payload_base64.split("\n").length - 1,
      base64HasTrailingLf: el.payload_base64.endsWith("\n"),
      ordinality: el.ordinality,
    };
  });
  const normalizedPayloadsCore = remotePayloadsCore.map((p) => p.base64Unwrapped);

  const syntheticRowCore = {
    version: "20260812120000",
    name: "fornexa_operational_core",
    remote_array_elements: elementsCore.length,
    array_text_md5: "00000000000000000000000000000000",
    payload_chars_total: remotePayloadsCore.reduce((sum, p) => sum + p.chars, 0),
    payload_utf8_bytes_total: remotePayloadsCore.reduce((sum, p) => sum + p.utf8Bytes, 0),
    base64_wrapped_chars_total: remotePayloadsCore.reduce((sum, p) => sum + p.base64Wrapped.length, 0),
    base64_unwrapped_chars_total: normalizedPayloadsCore.reduce((sum, p) => sum + p.length, 0),
    base64_lf_total: remotePayloadsCore.reduce((sum, p) => sum + p.base64LfCount, 0),
    base64_elements_with_trailing_lf: remotePayloadsCore.filter((p) => p.base64HasTrailingLf).length,
    element_md5_sequence_md5: md5(elementsCore.map((e) => e.payload_md5).join(",")),
    base64_wrapped_sequence_md5: md5(remotePayloadsCore.map((p) => p.base64Wrapped).join(",")),
    base64_unwrapped_sequence_md5: md5(normalizedPayloadsCore.join(",")),
    elements: elementsCore,
  };

  // Crear elementos para wms_e1_core (workflow filename)
  const e1Buf = Buffer.from("20261017110000_wms_e1_core.sql", "utf8");
  const syntheticRowE1 = {
    version: "20261017110000",
    name: "wms_e1_core",
    remote_array_elements: 1,
    array_text_md5: "00000000000000000000000000000000",
    payload_chars_total: "20261017110000_wms_e1_core.sql".length,
    payload_utf8_bytes_total: e1Buf.length,
    base64_wrapped_chars_total: e1Buf.toString("base64").length,
    base64_unwrapped_chars_total: e1Buf.toString("base64").length,
    base64_lf_total: 0,
    base64_elements_with_trailing_lf: 0,
    element_md5_sequence_md5: md5(md5(e1Buf)),
    base64_wrapped_sequence_md5: md5(e1Buf.toString("base64")),
    base64_unwrapped_sequence_md5: md5(e1Buf.toString("base64")),
    elements: [
      {
        ordinality: 1,
        payload_base64: e1Buf.toString("base64"),
        payload_md5: md5(e1Buf),
      },
    ],
  };

  // Crear elementos para wms_c3_server_load_controls (stripped)
  const c3Stmts = splitSqlStatements(c3Stripped);
  const elementsC3 = c3Stmts.map((stmt, idx) => {
    const buf = Buffer.from(stmt, "utf8");
    return {
      ordinality: idx + 1,
      payload_base64: encodePostgresBase64(buf),
      payload_md5: md5(buf),
    };
  });
  const remotePayloadsC3 = elementsC3.map((el) => {
    const buf = Buffer.from(el.payload_base64.split("\n").join(""), "base64");
    const s = buf.toString("utf8");
    return {
      chars: Array.from(s).length,
      utf8Bytes: buf.length,
      base64Wrapped: el.payload_base64,
      base64Unwrapped: el.payload_base64.split("\n").join(""),
      base64LfCount: el.payload_base64.split("\n").length - 1,
      base64HasTrailingLf: el.payload_base64.endsWith("\n"),
      ordinality: el.ordinality,
    };
  });
  const normalizedPayloadsC3 = remotePayloadsC3.map((p) => p.base64Unwrapped);
  const syntheticRowC3 = {
    version: "20261019120000",
    name: "wms_c3_server_load_controls",
    remote_array_elements: elementsC3.length,
    array_text_md5: "00000000000000000000000000000000",
    payload_chars_total: remotePayloadsC3.reduce((sum, p) => sum + p.chars, 0),
    payload_utf8_bytes_total: remotePayloadsC3.reduce((sum, p) => sum + p.utf8Bytes, 0),
    base64_wrapped_chars_total: remotePayloadsC3.reduce((sum, p) => sum + p.base64Wrapped.length, 0),
    base64_unwrapped_chars_total: normalizedPayloadsC3.reduce((sum, p) => sum + p.length, 0),
    base64_lf_total: remotePayloadsC3.reduce((sum, p) => sum + p.base64LfCount, 0),
    base64_elements_with_trailing_lf: remotePayloadsC3.filter((p) => p.base64HasTrailingLf).length,
    element_md5_sequence_md5: md5(elementsC3.map((e) => e.payload_md5).join(",")),
    base64_wrapped_sequence_md5: md5(remotePayloadsC3.map((p) => p.base64Wrapped).join(",")),
    base64_unwrapped_sequence_md5: md5(normalizedPayloadsC3.join(",")),
    elements: elementsC3,
  };

  // 1. Aserción positiva: buildMigrationAudit acepta simultáneamente Candidate 5 (85 vs 83), e1_core y c3_load_controls
  const auditPositive = buildMigrationAudit({
    capturedAt: new Date().toISOString(),
    gitMigrationBaselineCommit: "d149789c4c73bb68eb259da3230a53c8c6366b27",
    gitMigrations: [
      { path: resolve(migrationDir, fCore), sql: validGitSql85 },
      { path: resolve(migrationDir, fE1), sql: sqlE1 },
      { path: resolve(migrationDir, fC3), sql: sqlC3 },
    ],
    remoteRows: [syntheticRowCore, syntheticRowE1, syntheticRowC3],
  }) as { summary: { all_pairs_equivalent: boolean }; migrations: Array<{ remote_name: string; equivalent: boolean; matched_statements: number }> };

  assert.equal(auditPositive.summary.all_pairs_equivalent, false, "El resumen general refleja delta");
  const entryCore = auditPositive.migrations.find((m) => m.remote_name === "fornexa_operational_core");
  assert.ok(entryCore);
  assert.equal(entryCore.equivalent, false, "fornexa_operational_core refleja equivalent: false");
  assert.equal(entryCore.matched_statements, 44, "Prefijo de sentencias coincidentes es 44");

  const entryE1 = auditPositive.migrations.find((m) => m.remote_name === "wms_e1_core");
  assert.ok(entryE1);
  assert.equal(entryE1.equivalent, false, "wms_e1_core refleja equivalent: false");

  const entryC3 = auditPositive.migrations.find((m) => m.remote_name === "wms_c3_server_load_controls");
  assert.ok(entryC3);
  assert.equal(entryC3.equivalent, false, "wms_c3_server_load_controls refleja equivalent: false");

  // 2. Aserción negativa: adulteración en el índice 44 de fornexa_operational_core lanza literal-safe comparison failed
  const tamperedStatements = [...valid85Statements];
  tamperedStatements[44] = "alter table public.customs_messages add column unauthorized_column text";
  const tamperedGitSql = tamperedStatements.join(";\n\n");

  assert.throws(
    () => {
      buildMigrationAudit({
        capturedAt: new Date().toISOString(),
        gitMigrationBaselineCommit: "d149789c4c73bb68eb259da3230a53c8c6366b27",
        gitMigrations: [
          { path: resolve(migrationDir, fCore), sql: tamperedGitSql },
        ],
        remoteRows: [syntheticRowCore],
      });
    },
    { message: /literal-safe comparison failed/ },
    "Adulteración en el índice 44 debe fallar cerrado con literal-safe comparison failed",
  );

  // 3. Aserción negativa: omisión de sentencias o conteo discordante en Git sin el delta autorizado falla cerrado (SHOULD-1)
  const invalid84Statements = valid85Statements.slice(0, 84);
  assert.throws(
    () => {
      buildMigrationAudit({
        capturedAt: new Date().toISOString(),
        gitMigrationBaselineCommit: "d149789c4c73bb68eb259da3230a53c8c6366b27",
        gitMigrations: [
          { path: resolve(migrationDir, fCore), sql: invalid84Statements.join(";\n\n") },
        ],
        remoteRows: [syntheticRowCore],
      });
    },
    { message: /literal-safe comparison failed|expected 83 remote and 85 git statements/ },
    "Conteo discordante u omisión de ALTERs en fornexa_operational_core debe fallar cerrado",
  );
});
