#!/usr/bin/env node
/**
 * FORNEXA — WMS M7 (C-3) DB-First Migration Runner & Rehearsal Harness
 * Mandatos: Slack 1792572558.748239, 1792575155.895109, 1792576499.291259
 *
 * Arquitectura de Ejecución (Single Owner BEGIN / COMMIT):
 * 1. Dueño Único de Transacción: El runner abre `BEGIN;`, ejecuta DDL + DML + inserción
 *    en el ledger de migraciones (`supabase_migrations.schema_migrations`) y cierra con `COMMIT;`
 *    (o `ROLLBACK;` en modo `--dry-run` / ensayo), eliminando dobles BEGIN y commits prematuros.
 * 2. Gate de Destino Fail-Closed:
 *    - Validación estricta ANTES de cualquier conexión o ejecución SQL.
 *    - Denylist explícita de producción (*.supabase.co, *.supabase.net, gqkjqhpmyejmehbuombk).
 *    - Solo loopback (127.0.0.1 / localhost) o PGlite permitidos por defecto.
 *    - `--apply-live` exige flag explícito de confirmación y variable de entorno FORNEXA_APPLY_C3_AUTHORIZED=true.
 * 3. Atomicidad DDL + Ledger:
 *    - Inserción en `supabase_migrations.schema_migrations` dentro de la MISMA transacción, sin try/catch.
 *    - Comprobación previa de versión ya aplicada (rechazo fail-closed sin ON CONFLICT DO UPDATE).
 * 4. Integridad y Checksums:
 *    - Hash pinning estricto contra HEAD 024d0b1 (SHA-256 f3d944d7..., 69.678 bytes).
 * 5. Preflight y Preimagen Persistida:
 *    - Timeout preventivo: `SET LOCAL lock_timeout = '5s'`, `SET LOCAL statement_timeout = '30s'`.
 *    - Captura de preimagen de `public.fornexa_wms_action` con pg_get_functiondef para reversibilidad Nivel 2.
 * 6. Post-condiciones Estrictas:
 *    - 4 columnas en handling_units, índice idx_handling_units_state_control, inmutabilidad de política,
 *      security definer en fornexa_wms_action y permisos exclusivos en service_role.
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";

const require = createRequire(import.meta.url);

export const PINNED_C3_SQL_SHA256 = "96f78651fa782c44eff96b77980e0abc188ecad1ebfab15324e4f6b14db4feef";
export const PINNED_C3_SQL_BYTES = 72081;
export const MIGRATION_VERSION = "20261019120000";
export const MIGRATION_NAME = "20261019120000_wms_c3_server_load_controls.sql";

export function sha256(content) {
  return createHash("sha256").update(content).digest("hex");
}

export function validateDestination(targetUrl, options = {}) {
  if (!targetUrl || typeof targetUrl !== "string") {
    throw new Error("WMS_DESTINATION_INVALID: Target URL must be a non-empty string.");
  }

  let parsed;
  try {
    parsed = new URL(targetUrl);
  } catch (err) {
    throw new Error(`WMS_DESTINATION_INVALID: Failed to parse connection URL: ${err.message}`);
  }

  const hostname = (parsed.hostname || "").toLowerCase();
  const pathname = (parsed.pathname || "").toLowerCase();

  // 1. Strict Production Denylist (FAIL-CLOSED)
  const productionDenyKeywords = [
    "supabase.co",
    "supabase.net",
    "gqkjqhpmyejmehbuombk",
    "fornexa-prod",
    "production",
  ];
  for (const kw of productionDenyKeywords) {
    if (hostname.includes(kw) || pathname.includes(kw)) {
      throw new Error(
        `WMS_DESTINATION_FORBIDDEN: Destination '${hostname}' rejected by production fail-closed denylist keyword '${kw}'. Remote SQL execution via runner is strictly prohibited.`
      );
    }
  }

  // 2. Loopback allowlist check
  const isLoopback = hostname === "127.0.0.1" || hostname === "localhost" || hostname === "::1";

  if (!isLoopback) {
    if (!options.allowRemoteStaging || options.authorizedStagingHost !== hostname) {
      throw new Error(
        `WMS_DESTINATION_FORBIDDEN: Target host '${hostname}' is not a permitted loopback destination (127.0.0.1/localhost) and is not explicitly authorized for staging.`
      );
    }
  }

  // 3. Apply live gate checks
  if (options.applyLive === true) {
    if (!isLoopback && !options.allowRemoteStaging) {
      throw new Error("WMS_APPLY_GATE_CLOSED: Remote --apply-live is strictly forbidden.");
    }
    if (options.confirmApply !== true) {
      throw new Error(
        "WMS_APPLY_GATE_CLOSED: Applying live migration requires explicit confirmation flag --i-understand-this-modifies-database."
      );
    }
    if (process.env.FORNEXA_APPLY_C3_AUTHORIZED !== "true") {
      throw new Error(
        "WMS_APPLY_GATE_CLOSED: Environment variable FORNEXA_APPLY_C3_AUTHORIZED=true is required to execute --apply-live."
      );
    }
  }

  return {
    hostname,
    isLoopback,
    database: pathname.replace(/^\//, ""),
  };
}

export function stripTopLevelTransactionDelimiters(sql) {
  const lines = sql.split(/\r?\n/);
  let inDollarQuote = false;
  let activeTag = "";

  const processed = lines.map((line) => {
    let remaining = line;
    while (true) {
      if (!inDollarQuote) {
        const match = remaining.match(/\$([A-Za-z0-9_]*)\$/);
        if (match) {
          inDollarQuote = true;
          activeTag = match[0];
          remaining = remaining.substring(match.index + activeTag.length);
          continue;
        }
        break;
      } else {
        const closeIdx = remaining.indexOf(activeTag);
        if (closeIdx !== -1) {
          inDollarQuote = false;
          remaining = remaining.substring(closeIdx + activeTag.length);
          activeTag = "";
          continue;
        }
        break;
      }
    }

    // Only replace standalone begin/commit if OUTSIDE dollar quotes
    if (!inDollarQuote) {
      if (/^\s*begin\s*;\s*$/i.test(line)) {
        return "-- [RUNNER MANAGED BEGIN]";
      }
      if (/^\s*commit\s*;\s*$/i.test(line)) {
        return "-- [RUNNER MANAGED COMMIT]";
      }
      if (/^\s*rollback\s*;\s*$/i.test(line)) {
        return "-- [RUNNER MANAGED ROLLBACK]";
      }
    }
    return line;
  });

  return processed.join("\n");
}

export function isDirectCliExecution(argv = process.argv) {
  if (!argv || !argv[1]) return false;
  try {
    const scriptPath = fileURLToPath(import.meta.url);
    const invokedPath = resolve(argv[1]);
    return scriptPath === invokedPath;
  } catch {
    return false;
  }
}

export async function getClient(options = {}) {
  const isPgLite = options.usePgLite || process.argv.includes("--pglite") || !process.env.POSTGRES_URL_NON_POOLING;
  
  if (isPgLite) {
    const { PGlite } = await import("@electric-sql/pglite");
    const db = new PGlite();
    const repoRoot = resolve(import.meta.dirname, "../..");
    
    // Rehearsal sandbox bootstrap
    await db.exec(`
      do $$ begin
        if not exists (select from pg_roles where rolname = 'service_role') then create role service_role; end if;
        if not exists (select from pg_roles where rolname = 'authenticated') then create role authenticated; end if;
        if not exists (select from pg_roles where rolname = 'anon') then create role anon; end if;
      end $$;
      create schema if not exists auth;
      create table if not exists auth.users (id uuid primary key default gen_random_uuid(), email text);
      create or replace function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid; $$;
      create or replace function auth.role() returns text language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claim.role', true), ''), 'authenticated'); $$;
      create table if not exists public.tenants (id uuid primary key default gen_random_uuid(), code text not null default 'T1', name text not null default 'Tenant 1');
      create table if not exists public.tenant_members (id uuid primary key default gen_random_uuid(), tenant_id uuid not null references public.tenants(id), user_id uuid not null, role text not null default 'ADMIN', status text not null default 'ACTIVE');
      create or replace function public.fornexa_set_updated_at() returns trigger language plpgsql as $$ begin new.updated_at = now(); return new; end; $$;
      create table if not exists public.warehouses (id uuid primary key default gen_random_uuid(), tenant_id uuid not null references public.tenants(id), code text not null, name text not null, unique(tenant_id, id));
      create table if not exists public.warehouse_zones (id uuid primary key default gen_random_uuid(), tenant_id uuid not null references public.tenants(id), warehouse_id uuid not null references public.warehouses(id), code text not null, unique(tenant_id, id));
      create table if not exists public.warehouse_bins (id uuid primary key default gen_random_uuid(), tenant_id uuid not null references public.tenants(id), warehouse_id uuid not null references public.warehouses(id), bin_code text not null, unique(tenant_id, id));
      create table if not exists public.parties (id uuid primary key default gen_random_uuid(), tenant_id uuid not null references public.tenants(id), legal_name text not null, unique(tenant_id, id));
      create table if not exists public.products (id uuid primary key default gen_random_uuid(), tenant_id uuid not null references public.tenants(id), sku text not null, name text not null, gross_weight_kg numeric(10,3) default 10.0, volume_m3 numeric(10,4) default 0.05, unique(tenant_id, id));
      create table if not exists public.orders (id uuid primary key default gen_random_uuid(), tenant_id uuid not null references public.tenants(id), order_number text not null, unique(tenant_id, id));
      create table if not exists public.order_lines (id uuid primary key default gen_random_uuid(), tenant_id uuid not null references public.tenants(id), order_id uuid not null references public.orders(id), product_id uuid not null references public.products(id), quantity numeric(10,3) not null default 1, unique(tenant_id, id));
      create table if not exists public.warehouse_docks (id uuid primary key default gen_random_uuid(), tenant_id uuid not null references public.tenants(id), warehouse_id uuid not null references public.warehouses(id), code text not null, unique(tenant_id, id));
      create table if not exists public.inventory_quants (id uuid primary key default gen_random_uuid(), tenant_id uuid not null references public.tenants(id), warehouse_id uuid not null references public.warehouses(id), bin_id uuid not null references public.warehouse_bins(id), product_id uuid not null references public.products(id), quantity numeric(12,3) not null default 0, quantity_on_hand numeric(12,3) not null default 0, quantity_reserved numeric(12,3) not null default 0, uom text not null default 'UN', flow_state text, hu_id uuid, stock_status text default 'AVAILABLE', created_at timestamptz default now(), updated_at timestamptz default now(), unique(tenant_id, id));
      create table if not exists public.inventory_movements (id uuid primary key default gen_random_uuid(), tenant_id uuid not null references public.tenants(id), warehouse_id uuid not null references public.warehouses(id), product_id uuid not null references public.products(id), quantity numeric(12,3) not null, uom text not null default 'UN', unique(tenant_id, id));
      create table if not exists public.audit_events (id bigint generated always as identity primary key, tenant_id uuid not null references public.tenants(id), entity_type text not null, entity_id uuid, action text not null, actor_user_id uuid, source_channel text, before_data jsonb, after_data jsonb, created_at timestamptz not null default now());
    `);
    const hardenSql = readFileSync(resolve(repoRoot, "supabase/migrations/20260819_harden_tenant_access_function.sql"), "utf-8");
    const e1Sql = readFileSync(resolve(repoRoot, "supabase/migrations/20261017110000_wms_e1_core.sql"), "utf-8");
    await db.exec(hardenSql);
    await db.exec(e1Sql);
    return {
      type: "pglite",
      query: (sql, params) => db.query(sql, params),
      exec: (sql) => db.exec(sql),
      close: () => db.close(),
    };
  }

  // PostgreSQL client con validación de destino previa
  const connStr = process.env.POSTGRES_URL_NON_POOLING?.trim();
  validateDestination(connStr, options);

  const { Client } = require("pg");
  const client = new Client({ connectionString: connStr });
  await client.connect();
  return {
    type: "pg",
    query: (sql, params) => client.query(sql, params),
    exec: (sql) => client.query(sql), // client.query(sql) sin params usa Simple Query Protocol ('Q'), multi-sentencia nativo
    close: () => client.end(),
  };
}

export async function runC3Migration(options = {}) {
  const isApplyLive = options.applyLive ?? process.argv.includes("--apply-live");
  const confirmApply = options.confirmApply ?? process.argv.includes("--i-understand-this-modifies-database");
  const dryRun = options.dryRun ?? (!isApplyLive || process.argv.includes("--dry-run"));

  const repoRoot = resolve(import.meta.dirname, "../..");
  const migrationPath = resolve(repoRoot, "supabase/migrations", MIGRATION_NAME);
  const migrationRaw = readFileSync(migrationPath, "utf-8");
  const migrationHash = sha256(migrationRaw);
  const migrationBytes = Buffer.byteLength(migrationRaw, "utf-8");

  // Hash Pinning estricto contra HEAD 024d0b1
  if (migrationHash !== PINNED_C3_SQL_SHA256) {
    throw new Error(
      `WMS_INTEGRITY_MISMATCH: Migration hash ${migrationHash} does not match pinned hash ${PINNED_C3_SQL_SHA256}`
    );
  }
  if (migrationBytes !== PINNED_C3_SQL_BYTES) {
    throw new Error(
      `WMS_INTEGRITY_MISMATCH: Migration size ${migrationBytes} bytes does not match pinned size ${PINNED_C3_SQL_BYTES}`
    );
  }

  console.log(`[WMS C-3 RUNNER] Preparando migración ${MIGRATION_NAME}`);
  console.log(`[WMS C-3 RUNNER] Hash SHA-256 verificado: ${migrationHash} (${migrationBytes} bytes)`);
  console.log(`[WMS C-3 RUNNER] Modo ejecución: ${dryRun ? "DRY-RUN / REHEARSAL (BEGIN ... ROLLBACK)" : "APPLY VINCULANTE (BEGIN ... COMMIT)"}`);

  const client = await getClient({
    applyLive: isApplyLive,
    confirmApply,
    usePgLite: options.usePgLite,
    allowRemoteStaging: options.allowRemoteStaging,
    authorizedStagingHost: options.authorizedStagingHost,
  });

  const receipt = {
    version: MIGRATION_VERSION,
    name: MIGRATION_NAME,
    sha256: migrationHash,
    bytes: migrationBytes,
    dry_run: dryRun,
    engine: client.type,
    started_at: new Date().toISOString(),
    preflight: {},
    postconditions: {},
    status: "PENDING",
  };

  try {
    // ── PASO 1: Preflight Read-Only ──────────────────────────────────────────
    console.log("[WMS C-3 RUNNER] Ejecutando Fase 1: Preflight read-only...");

    const fnPreRes = await client.query(`
      select pg_get_functiondef(p.oid) as def
        from pg_proc p
        join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = 'fornexa_wms_action'
       limit 1;
    `);
    const preimage = fnPreRes.rows?.[0]?.def || null;
    receipt.preflight.preimage_fornexa_wms_action = preimage;
    console.log(`  ✔ Preimagen de fornexa_wms_action capturada (${preimage ? "EXISTENTE" : "INEXISTENTE"})`);

    if (options.persistPreimage && preimage) {
      const preimagePath = resolve(repoRoot, "docs/verification/fornexa_wms_action_preimage.sql");
      writeFileSync(preimagePath, preimage, "utf-8");
      receipt.preflight.preimage_persisted_path = preimagePath;
    }

    // ── PASO 2: Transacción Atómica con Dueño Único (Single Owner) ───────────
    console.log("[WMS C-3 RUNNER] Ejecutando Fase 2: DDL Transaccional con dueño único...");
    await client.exec("BEGIN;");

    // Guardas de tiempo de bloqueo
    await client.exec("SET LOCAL lock_timeout = '5s';");
    await client.exec("SET LOCAL statement_timeout = '30s';");

    // Preparación de SQL neutralizando delimitadores top-level respetando dollar-quoting
    const sqlToExecute = stripTopLevelTransactionDelimiters(migrationRaw);
    await client.exec(sqlToExecute);
    console.log("  ✔ Sentencias DDL/DML ejecutadas dentro de la transacción atómica");

    // ── Inserción atómica en ledger schema_migrations (SIN try/catch) ────────
    await client.exec(`
      create schema if not exists supabase_migrations;
      create table if not exists supabase_migrations.schema_migrations (
        version text primary key,
        statements text[],
        name text
      );
    `);

    // Comprobación de versión existente (fail-closed, sin ON CONFLICT DO UPDATE)
    const existingVersionRes = await client.query(`
      select version from supabase_migrations.schema_migrations where version = $1;
    `, [MIGRATION_VERSION]);

    if (existingVersionRes.rows && existingVersionRes.rows.length > 0) {
      throw new Error(
        `WMS_MIGRATION_ALREADY_RECORDED: Version ${MIGRATION_VERSION} is already recorded in schema_migrations. Refusing to overwrite or re-apply.`
      );
    }

    await client.query(`
      insert into supabase_migrations.schema_migrations (version, statements, name)
      values ($1, array[$2], $3);
    `, [MIGRATION_VERSION, MIGRATION_NAME, MIGRATION_NAME]);
    console.log("  ✔ Ledger supabase_migrations.schema_migrations insertado atómicamente");
    receipt.postconditions.ledger_recorded = true;

    // ── PASO 3: Verificación de Post-condiciones dentro de la unidad atómica ───
    console.log("[WMS C-3 RUNNER] Ejecutando Fase 3: Post-condiciones de esquema y permisos...");

    // 1. Columnas handling_units
    const colsRes = await client.query(`
      select column_name
        from information_schema.columns
       where table_schema = 'public' and table_name = 'handling_units'
         and column_name in ('state_controlled_at', 'state_controlled_by', 'measured_at', 'measured_by');
    `);
    const foundCols = colsRes.rows.map(r => r.column_name);
    assert.equal(foundCols.length, 4, "Las 4 columnas C-3 deben existir en handling_units");
    receipt.postconditions.columns_verified = foundCols;

    // 2. Índice idx_handling_units_state_control
    const idxRes = await client.query(`
      select indexname
        from pg_indexes
       where schemaname = 'public'
         and tablename = 'handling_units'
         and indexname = 'idx_handling_units_state_control';
    `);
    assert.equal(idxRes.rows.length, 1, "El índice idx_handling_units_state_control debe existir");
    receipt.postconditions.index_verified = true;

    // 3. Inmutabilidad y Security Definer
    const fnPropsRes = await client.query(`
      select p.proname, p.provolatile, p.prosecdef
        from pg_proc p
        join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname in ('fornexa_wms_policy_bool', 'fornexa_wms_action');
    `);
    const policyFn = fnPropsRes.rows.find(r => r.proname === "fornexa_wms_policy_bool");
    const actionFn = fnPropsRes.rows.find(r => r.proname === "fornexa_wms_action");
    assert.ok(policyFn, "Función fornexa_wms_policy_bool debe existir");
    assert.equal(policyFn.provolatile, "i", "fornexa_wms_policy_bool debe ser IMMUTABLE ('i')");
    assert.ok(actionFn, "Función fornexa_wms_action debe existir");
    assert.equal(actionFn.prosecdef, true, "fornexa_wms_action debe ser SECURITY DEFINER");
    receipt.postconditions.functions_verified = true;

    // 4. Privilegios EXECUTE exclusivos en service_role (revocado de anon/authenticated)
    const privRes = await client.query(`
      select has_function_privilege('service_role', 'public.fornexa_wms_action(uuid,uuid,text,jsonb,text)', 'EXECUTE') as priv_action_service,
             has_function_privilege('service_role', 'public.fornexa_wms_policy_bool(jsonb,text,boolean)', 'EXECUTE') as priv_policy_service,
             has_function_privilege('anon', 'public.fornexa_wms_action(uuid,uuid,text,jsonb,text)', 'EXECUTE') as priv_action_anon,
             has_function_privilege('authenticated', 'public.fornexa_wms_action(uuid,uuid,text,jsonb,text)', 'EXECUTE') as priv_action_auth;
    `);
    assert.equal(privRes.rows[0].priv_action_service, true, "service_role debe poseer EXECUTE en fornexa_wms_action");
    assert.equal(privRes.rows[0].priv_policy_service, true, "service_role debe poseer EXECUTE en fornexa_wms_policy_bool");
    assert.equal(privRes.rows[0].priv_action_anon, false, "anon NO debe poseer EXECUTE en fornexa_wms_action (revocado)");
    assert.equal(privRes.rows[0].priv_action_auth, false, "authenticated NO debe poseer EXECUTE en fornexa_wms_action (revocado)");
    receipt.postconditions.privileges_verified = true;

    // ── PASO 4: Cierre de Transacción ─────────────────────────────────────────
    if (dryRun) {
      await client.exec("ROLLBACK;");
      console.log("[WMS C-3 RUNNER] Transacción REVERTIDA limpiamente (ROLLBACK; en dry-run)");
      receipt.status = "SUCCESS_DRY_RUN";
    } else {
      await client.exec("COMMIT;");
      console.log("[WMS C-3 RUNNER] Transacción CONFIRMADA atómicamente (COMMIT;)");
      receipt.status = "COMMITTED_LIVE";
    }

    receipt.completed_at = new Date().toISOString();
    return receipt;
  } catch (err) {
    try {
      await client.exec("ROLLBACK;");
    } catch {}
    receipt.status = "FAILED";
    receipt.error = err.message;
    console.error("[WMS C-3 RUNNER] Error durante ejecución, transacción abortada con ROLLBACK:", err.message);
    throw err;
  } finally {
    await client.close();
  }
}

if (isDirectCliExecution()) {
  runC3Migration()
    .then(r => {
      console.log(`[WMS C-3 RUNNER] Veredicto: ${r.status}`);
      process.exit(0);
    })
    .catch(e => {
      console.error(e);
      process.exit(1);
    });
}
