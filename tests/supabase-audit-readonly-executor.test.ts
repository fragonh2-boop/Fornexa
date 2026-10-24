// tests/supabase-audit-readonly-executor.test.ts
// Tests for the Read-Only Supabase Audit Executor (scripts/audit/run-supabase-audit-readonly.mjs)
// Certifies:
// 1. Kernel-level fail-closed read-only protection (PostgreSQL 25006).
// 2. Connection string and host allowlist validation.
// 3. Static audit SQL boundaries (BEGIN READ ONLY / ROLLBACK / 0 COMMIT).
// 4. In-memory execution, zero payload leakage, and 20260912 baseline preservation.

import assert from "node:assert/strict";
import { readFileSync, existsSync, unlinkSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";
import {
  validateConnectionString,
  verify0912BaselineIntact,
  executeReadOnlyCapture,
} from "../scripts/audit/run-supabase-audit-readonly.ts";

test("ReadOnly Executor — Validación estricta de Connection String (Allowlist)", () => {
  // Caso válido
  const valid = "postgresql://postgres.gqkjqhpmyejmehbuombk:secretpassword@aws-0-eu-central-1.pooler.supabase.com:5432/postgres";
  const res = validateConnectionString(valid);
  assert.equal(res.verified, true);
  assert.equal(res.projectRef, "gqkjqhpmyejmehbuombk");

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

test("ReadOnly Executor — Límites del script SQL (BEGIN READ ONLY, ROLLBACK, 0 COMMIT)", () => {
  const sqlPath = resolve(import.meta.dirname, "../scripts/audit/capture-supabase-migration-audit.sql");
  assert.ok(existsSync(sqlPath), "Script SQL debe existir en el repositorio");

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

test("ReadOnly Executor — Ejecución relacional completa sobre PGlite con mock de esquema", async () => {
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

  // Seed schema_migrations matching active git migrations (using single-statement migration for synthetic test)
  const f = "20260814_cmr_canonical_model.sql";
  const migrationDir = resolve(import.meta.dirname, "../supabase/migrations");
  const version = f.split("_")[0];
  const name = f.replace(/^[0-9]+_/, "").replace(/\.sql$/, "");
  const sql = readFileSync(resolve(migrationDir, f), "utf8");
  await db.query(
    "insert into supabase_migrations.schema_migrations (version, name, statements) values ($1, $2, $3);",
    [version, name, [sql]],
  );

  const tempOut = resolve(import.meta.dirname, "../docs/verification/test-temp-audit-20261024.json");
  const tempPre = resolve(import.meta.dirname, "../docs/verification/test-temp-preflight-20261024.json");

  // Adapt db to client interface
  const clientAdapter = {
    query: async (sql: string, params?: any[]) => {
      return await db.query(sql, params);
    },
  };

  // Run execution
  try {
    const result = await executeReadOnlyCapture(clientAdapter, {
      capturedAt: "2026-10-24T12:00:00Z",
      outputPath: tempOut,
      preflightPath: tempPre,
    });

    assert.equal(result.success, true);
    assert.equal(result.baseline0912Intact, true);

    // Verify output file exists and has 0 raw payload_base64 values
    assert.ok(existsSync(tempOut), "El archivo de salida debe existir");
    const outContent = readFileSync(tempOut, "utf8");
    assert.equal(outContent.includes('"payload_base64":'), false, "Cero raw payload_base64 en el archivo final");

    assert.ok(existsSync(tempPre), "El archivo preflight debe existir");
  } finally {
    if (existsSync(tempOut)) unlinkSync(tempOut);
    if (existsSync(tempPre)) unlinkSync(tempPre);
  }
});
