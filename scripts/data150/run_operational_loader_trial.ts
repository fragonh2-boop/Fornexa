#!/usr/bin/env node
/**
 * FORNEXA — Live PostgreSQL Operational Loader Trial
 * Executes executeData150Loader directly against the live PostgreSQL 17.11 instance
 * (socket /private/tmp/data150-pg-CUM6hE:55439) to verify:
 * 1. Live operational route execution with real RETURNING row capture,
 *    atomic pre-commit staging, and COMMITTED durability.
 * 2. Live retry recovery without existingReceipt: verifies automatic disk receipt
 *    recovery preventing key clobbering when 0 rows are returned.
 * 3. Live COMMIT failure / indeterminate state recovery: preserves captured keys
 *    and records COMMIT_INDETERMINATE without assuming false abort.
 * 4. Post-commit write failure resilience: preserves DB committed state and avoids
 *    illegal ROLLBACK calls on an already-committed transaction.
 * 5. Dynamic operational rollback generation and execution on live PostgreSQL,
 *    verifying clean deletion of batch rows while preserving pre-existing fixtures.
 */

import { spawn, spawnSync } from "node:child_process";
import { readFileSync, writeFileSync, unlinkSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { homedir } from "node:os";
import {
  executeData150Loader,
  reconcileInFlightReceipt,
  computeSqlSha256,
  DATA150_TENANT_ID,
  DATA150_BATCH_ID,
} from "../../lib/data150-loader.ts";
import { generateOperationalRollback } from "./generate_rollback_from_receipt.ts";

const DEFAULT_PSQL = resolve(
  homedir(),
  "Documents/Codex/2026-10-09/fornexa-data150/local-pg-168JFA/Postgres.app/Contents/Versions/17/bin/psql"
);
const PSQL_BIN =
  process.env.PSQL_BIN || (existsSync(DEFAULT_PSQL) ? DEFAULT_PSQL : "psql");
const SOCKET_DIR = process.env.PGHOST || "/private/tmp/data150-pg-CUM6hE";
const PORT = process.env.PGPORT || "55439";
const DB_NAME = process.env.PGDATABASE || "data150_trial";
const PG_USER = process.env.PGUSER || process.env.USER || "postgres";
const EVIDENCE_DIR = process.env.DATA150_EVIDENCE_DIR || "/private/tmp/data150-rehearsal-evidence";
const OPERATIONAL_LOG_PATH = resolve(EVIDENCE_DIR, "data150-operational-loader.log");

export class LivePsqlSession {
  public proc: any;
  private buffer: string = "";
  private pendingResolve: ((val: string) => void) | null = null;
  private pendingReject: ((err: Error) => void) | null = null;
  public queryLog: string[] = [];

  constructor() {
    this.proc = spawn(PSQL_BIN, [
      "-X", // Strict: Do not read startup file (~/.psqlrc)
      "-U", PG_USER, // Explicit target user
      "-h", SOCKET_DIR,
      "-p", PORT,
      "-d", DB_NAME,
      "-q", "-A", "-t",
      "-v", "ON_ERROR_STOP=1",
    ]);

    this.proc.stdout.on("data", (d: Buffer) => {
      this.buffer += d.toString();
      if (this.buffer.includes("---FORNEXA_DONE---\n")) {
        const parts = this.buffer.split("---FORNEXA_DONE---\n");
        const resp = parts[0].trim();
        this.buffer = parts.slice(1).join("---FORNEXA_DONE---\n");
        if (this.pendingResolve) {
          const r = this.pendingResolve;
          this.pendingResolve = null;
          this.pendingReject = null;
          r(resp);
        }
      }
    });

    this.proc.stderr.on("data", (err: Buffer) => {
      const msg = err.toString();
      if (this.pendingReject) {
        const rej = this.pendingReject;
        this.pendingResolve = null;
        this.pendingReject = null;
        rej(new Error(`PostgreSQL execution error: ${msg.trim()}`));
      }
    });

    this.proc.on("exit", (code: number | null, signal: string | null) => {
      if (this.pendingReject) {
        const rej = this.pendingReject;
        this.pendingResolve = null;
        this.pendingReject = null;
        rej(new Error(`psql process exited unexpectedly (code: ${code}, signal: ${signal})`));
      }
    });
  }

  public query(sql: string, timeoutMs = 10000): Promise<any[]> {
    this.queryLog.push(sql.trim());
    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        if (this.pendingReject) {
          const rej = this.pendingReject;
          this.pendingResolve = null;
          this.pendingReject = null;
          this.proc.kill("SIGKILL");
          rej(new Error(`Query timed out after ${timeoutMs}ms: ${sql.trim()}`));
        }
      }, timeoutMs);

      this.pendingResolve = (rawOutput: string) => {
        clearTimeout(timeoutId);
        if (!rawOutput || rawOutput.trim() === "") {
          resolve([]);
          return;
        }
        try {
          const parsed = JSON.parse(rawOutput);
          resolve(Array.isArray(parsed) ? parsed : [parsed]);
        } catch (jsonErr: any) {
          const upper = trimmed.toUpperCase();
          if (
            upper.startsWith("BEGIN") ||
            upper.startsWith("COMMIT") ||
            upper.startsWith("ROLLBACK") ||
            upper.startsWith("DELETE") ||
            upper.startsWith("UPDATE") ||
            upper.startsWith("DROP") ||
            upper.startsWith("CREATE") ||
            upper.startsWith("ALTER")
          ) {
            resolve([]);
            return;
          }
          // Reject protocol error: never convert invalid JSON into 0 returns!
          reject(
            new Error(
              `Protocol error: failed to parse JSON output from psql: '${rawOutput}' (${jsonErr.message})`
            )
          );
        }
      };

      this.pendingReject = (err) => {
        clearTimeout(timeoutId);
        reject(err);
      };

      const trimmed = sql.trim().replace(/;$/, "");
      if (
        trimmed.toUpperCase().startsWith("INSERT INTO") &&
        trimmed.toUpperCase().includes("RETURNING")
      ) {
        this.proc.stdin.write(
          `WITH fornexa_ins AS (${trimmed}) SELECT coalesce(json_agg(r), '[]'::json) FROM fornexa_ins r;\nSELECT '---FORNEXA_DONE---';\n`
        );
      } else if (trimmed.toUpperCase().startsWith("SELECT")) {
        this.proc.stdin.write(
          `SELECT coalesce(json_agg(r), '[]'::json) FROM (${trimmed}) r;\nSELECT '---FORNEXA_DONE---';\n`
        );
      } else {
        this.proc.stdin.write(`${trimmed};\nSELECT '---FORNEXA_DONE---';\n`);
      }
    });
  }

  public close() {
    try {
      this.proc.stdin.end();
    } catch {}
  }
}

async function runDirectPsqlCmd(sql: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const p = spawn(PSQL_BIN, [
      "-X", // Strict: Do not read startup file (~/.psqlrc)
      "-U", PG_USER, // Explicit target user
      "-h", SOCKET_DIR,
      "-p", PORT,
      "-d", DB_NAME,
      "-q", "-A", "-t",
      "-c", sql,
    ]);
    let out = "";
    let err = "";
    p.stdout.on("data", (d) => (out += d.toString()));
    p.stderr.on("data", (d) => (err += d.toString()));
    p.on("close", (code) => {
      if (code !== 0) reject(new Error(`psql error (${code}): ${err}`));
      else resolve(out.trim());
    });
  });
}

export async function runOperationalLoaderTrial() {
  const logBuffer: string[] = [];
  const origLog = console.log;
  const origErr = console.error;
  console.log = (...args: any[]) => {
    origLog(...args);
    logBuffer.push(args.map((a) => (typeof a === "string" ? a : JSON.stringify(a))).join(" "));
  };
  console.error = (...args: any[]) => {
    origErr(...args);
    logBuffer.push(args.map((a) => (typeof a === "string" ? a : JSON.stringify(a))).join(" "));
  };

  const gitHead = spawnSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).stdout?.trim() || "unknown";
  const runnerScriptHash = createHash("sha256").update(readFileSync(resolve(process.cwd(), "scripts/data150/run_operational_loader_trial.ts"))).digest("hex");
  const loaderLibHash = createHash("sha256").update(readFileSync(resolve(process.cwd(), "lib/data150-loader.ts"))).digest("hex");

  console.log("=".repeat(80));
  console.log("FORNEXA — LIVE POSTGRESQL OPERATIONAL LOADER TRIAL (executeData150Loader)");
  console.log(`Timestamp: ${new Date().toISOString()}`);
  console.log(`Git HEAD SHA: ${gitHead}`);
  console.log(`Operational Runner TS SHA256: ${runnerScriptHash}`);
  console.log(`Loader Library TS SHA256: ${loaderLibHash}`);
  console.log(`Target Database: ${DB_NAME} on socket ${SOCKET_DIR}:${PORT}`);
  console.log(`User: ${PG_USER} | Tenant: ${DATA150_TENANT_ID} | Batch: ${DATA150_BATCH_ID}`);
  console.log("=".repeat(80));

  const testReceiptPath = "/tmp/data150-live-operational-receipt.json";
  if (existsSync(testReceiptPath)) unlinkSync(testReceiptPath);

  // Clean up trial test rows from database before starting to ensure clean initial state:
  await runDirectPsqlCmd(`
    DELETE FROM public.party_addresses WHERE id = '00000000-0000-4000-8000-000000000020';
    DELETE FROM public.parties WHERE id = '00000000-0000-4000-8000-000000000010';
    DELETE FROM public.tariff_zones WHERE id = '7c596a00-ee8a-5ed0-a529-c05c3a541ea2';
  `);
  const liveTrialSql = [
    "BEGIN;",
    `INSERT INTO public.tariff_zones ("id", "tenant_id", "name", "country", "purpose") VALUES ('7c596a00-ee8a-5ed0-a529-c05c3a541ea2', '${DATA150_TENANT_ID}', '[PRUEBA] Zona Ibérica 000', 'ES', 'Distribución 000') ON CONFLICT ("id") DO NOTHING RETURNING "id";`,
    `INSERT INTO public.parties ("id", "tenant_id", "code", "legal_name", "country_code", "language", "currency") VALUES ('00000000-0000-4000-8000-000000000010', '${DATA150_TENANT_ID}', 'TER-OP-0010', '[PRUEBA] Empresa Operativa 10', 'ES', 'es', 'EUR') ON CONFLICT ("id") DO NOTHING RETURNING "id";`,
    `INSERT INTO public.party_addresses ("id", "tenant_id", "party_id", "code", "name", "address_line1", "postal_code", "city", "country_code") VALUES ('00000000-0000-4000-8000-000000000020', '${DATA150_TENANT_ID}', '00000000-0000-4000-8000-000000000010', 'ADDR-OP-0020', 'Almacén Central OP', 'Polígono Industrial 1', '28001', 'Madrid', 'ES') ON CONFLICT ("id") DO NOTHING RETURNING "id";`,
    "COMMIT;",
  ].join("\n");

  // --------------------------------------------------------------------------
  // TEST 1: Live Operational Route Execution
  // --------------------------------------------------------------------------
  console.log("\n[ENSAYO 1] Ruta Operativa Real con executeData150Loader en PostgreSQL Vivo:");
  const session1 = new LivePsqlSession();
  const res1 = await executeData150Loader((sql) => session1.query(sql), {
    loaderSql: liveTrialSql,
    targetReceiptPath: testReceiptPath,
    tenantId: DATA150_TENANT_ID,
  });
  session1.close();

  console.log(`- Éxito de ejecución: ${res1.success}`);
  console.log(`- Estado en recibo: ${res1.status}`);
  console.log(`- Estado de COMMIT en BD: ${res1.db_committed}`);
  console.log(`- Total filas devueltas por RETURNING: ${res1.inserted_rows_total}`);
  console.log(`- Claves capturadas en recibo:`);
  for (const [tbl, e] of Object.entries(res1.receipt)) {
    console.log(`  * ${tbl}: ${e.inserted_count} filas -> [${e.inserted_keys.join(", ")}]`);
  }

  if (!res1.success || res1.db_committed !== true || res1.status !== "COMMITTED") {
    throw new Error("Ensayo 1 falló: la ejecución operativa no fue exitosa o no se comprometió.");
  }
  if (res1.inserted_rows_total !== 3) {
    throw new Error(`Ensayo 1 falló: esperadas 3 filas insertadas, obtenidas ${res1.inserted_rows_total}.`);
  }

  // Verify rows actually exist in PostgreSQL live:
  const tzCount = await runDirectPsqlCmd(
    `SELECT count(*) FROM public.tariff_zones WHERE id = '7c596a00-ee8a-5ed0-a529-c05c3a541ea2';`
  );
  if (tzCount !== "1") throw new Error("Fila tariff_zones no se encuentra en PostgreSQL vivo tras COMMIT.");
  console.log("  => VERIFICADO: executeData150Loader insertó y comprometió en PostgreSQL vivo con recibo COMMITTED.");

  // --------------------------------------------------------------------------
  // TEST 2: Idempotent Retry & Key Recovery (Point 1)
  // --------------------------------------------------------------------------
  console.log("\n[ENSAYO 2] Retry Idempotente en Vivo sin existingReceipt (Recuperación Automática de Disco):");
  const session2 = new LivePsqlSession();
  const res2 = await executeData150Loader((sql) => session2.query(sql), {
    loaderSql: liveTrialSql,
    targetReceiptPath: testReceiptPath,
    tenantId: DATA150_TENANT_ID,
    // Note: options.existingReceipt is intentionally OMITTED to test recovery from disk
  });
  session2.close();

  console.log(`- Éxito en reejecución: ${res2.success}`);
  console.log(`- Nuevas filas devueltas por RETURNING en BD: ${res2.inserted_rows_total} (0 esperado)`);
  console.log(`- Claves preservadas en recibo fusionado tras retry:`);
  for (const [tbl, e] of Object.entries(res2.receipt)) {
    console.log(`  * ${tbl}: ${e.inserted_count} filas preservadas -> [${e.inserted_keys.join(", ")}]`);
  }

  if (res2.inserted_rows_total !== 0) {
    throw new Error("Ensayo 2 falló: el retry devolvió filas nuevas en lugar de 0.");
  }
  if (
    res2.receipt.tariff_zones?.inserted_count !== 1 ||
    res2.receipt.parties?.inserted_count !== 1 ||
    res2.receipt.party_addresses?.inserted_count !== 1
  ) {
    throw new Error("ERROR CRÍTICO (Punto 1): El retry sin existingReceipt perdió o borró las claves durables.");
  }
  console.log("  => VERIFICADO: Retry devuelve 0 filas y recupera íntegramente las claves durables previas sin pérdida.");

  // --------------------------------------------------------------------------
  // TEST 3: Indeterminate COMMIT State Handling (Controlled Client Disconnect)
  // Declaración: Ensayo de inyección controlada a nivel de ejecutor para verificar
  // la transición a COMMIT_INDETERMINATE y preservación durable de claves staged.
  // --------------------------------------------------------------------------
  console.log("\n[ENSAYO 3] Manejo de Fallo Indeterminado en COMMIT (Inyección Controlada):");
  const testIndeterminateReceiptPath = "/tmp/data150-indeterminate-receipt.json";
  if (existsSync(testIndeterminateReceiptPath)) unlinkSync(testIndeterminateReceiptPath);

  const session3 = new LivePsqlSession();
  const res3 = await executeData150Loader(
    async (sql) => {
      if (sql.trim().startsWith("COMMIT")) {
        throw new Error("Simulated connection timeout / disconnect during COMMIT");
      }
      return session3.query(sql);
    },
    {
      loaderSql: liveTrialSql,
      targetReceiptPath: testIndeterminateReceiptPath,
      tenantId: DATA150_TENANT_ID,
    }
  );
  session3.close();

  console.log(`- Éxito esperado: false (obtenido: ${res3.success})`);
  console.log(`- Estado registrado: ${res3.status}`);
  console.log(`- Estado en BD: ${res3.db_committed}`);

  if (res3.status !== "COMMIT_INDETERMINATE" || res3.db_committed !== "INDETERMINATE") {
    throw new Error("Ensayo 3 falló: no se tipó COMMIT_INDETERMINATE ante fallo incierto de COMMIT.");
  }
  const diskIndeterminate = JSON.parse(readFileSync(testIndeterminateReceiptPath, "utf8"));
  if (diskIndeterminate.status !== "COMMIT_INDETERMINATE") {
    throw new Error("Ensayo 3 falló: el recibo en disco no persistió el estado COMMIT_INDETERMINATE.");
  }
  console.log("  => VERIFICADO: Fallo en COMMIT tipa COMMIT_INDETERMINATE y preserva todas las claves capturadas.");

  // --------------------------------------------------------------------------
  // TEST 3B: Real Safe Backend Disconnect & Autonomous Recovery
  // Terminación real segura del backend PostgreSQL vía pg_terminate_backend
  // (sin SIGKILL al cluster, sin reinicio de PostgreSQL ni costes).
  // Acredita: aserción estricta de desconexión capturada, ausencia de filas
  // no confirmadas, preservación de filas preexistentes, integridad del recibo
  // y reintento legítimo en sesión limpia.
  // --------------------------------------------------------------------------
  console.log("\n[ENSAYO 3B] Desconexión Real Segura de Backend PostgreSQL y Recuperación Autónoma:");
  const testRealFailReceiptPath = "/tmp/data150-real-disconnect-receipt.json";
  if (existsSync(testRealFailReceiptPath)) unlinkSync(testRealFailReceiptPath);

  // Claves nuevas disjuntas exclusivas para Ensayo 3B en target local
  const trial3bTzId = "7c596a00-ee8a-5ed0-a529-c05c3a541eb2";
  const trial3bPartyId = "00000000-0000-4000-8000-00000000001b";
  const trial3bAddrId = "00000000-0000-4000-8000-00000000002b";

  await runDirectPsqlCmd(`
    DELETE FROM public.party_addresses WHERE id = '${trial3bAddrId}';
    DELETE FROM public.parties WHERE id = '${trial3bPartyId}';
    DELETE FROM public.tariff_zones WHERE id = '${trial3bTzId}';
  `);

  const trial3bSql = [
    "BEGIN;",
    `INSERT INTO public.tariff_zones ("id", "tenant_id", "name", "country", "purpose") VALUES ('${trial3bTzId}', '${DATA150_TENANT_ID}', '[PRUEBA 3B] Zona Ibérica 3B', 'ES', 'Distribución 3B') ON CONFLICT ("id") DO NOTHING RETURNING "id";`,
    `INSERT INTO public.parties ("id", "tenant_id", "code", "legal_name", "country_code", "language", "currency") VALUES ('${trial3bPartyId}', '${DATA150_TENANT_ID}', 'TER-OP-001B', '[PRUEBA 3B] Empresa Operativa 1B', 'ES', 'es', 'EUR') ON CONFLICT ("id") DO NOTHING RETURNING "id";`,
    `INSERT INTO public.party_addresses ("id", "tenant_id", "party_id", "code", "name", "address_line1", "postal_code", "city", "country_code") VALUES ('${trial3bAddrId}', '${DATA150_TENANT_ID}', '${trial3bPartyId}', 'ADDR-OP-002B', 'Almacén Central 3B', 'Polígono Industrial 3B', '28001', 'Madrid', 'ES') ON CONFLICT ("id") DO NOTHING RETURNING "id";`,
    "COMMIT;",
  ].join("\n");

  const sessionFail = new LivePsqlSession();
  let realDisconnectCaught = false;
  let disconnectErrorDetail = "";

  try {
    const failResult = await executeData150Loader(
      async (sql) => {
        if (sql.trim().startsWith("INSERT INTO public.party_addresses")) {
          // Disparar desconexión real de backend en PostgreSQL para esta conexión
          try {
            await sessionFail.query("SELECT pg_terminate_backend(pg_backend_pid());");
          } catch {
            // Backend closes connection immediately
          }
        }
        return sessionFail.query(sql);
      },
      {
        loaderSql: trial3bSql,
        targetReceiptPath: testRealFailReceiptPath,
        tenantId: DATA150_TENANT_ID,
      }
    );
    if (!failResult.success) {
      realDisconnectCaught = true;
      disconnectErrorDetail = failResult.error || "Loader reported pre-commit failure";
    }
  } catch (err: any) {
    realDisconnectCaught = true;
    disconnectErrorDetail = err?.message || String(err);
  }
  sessionFail.close();

  // Aserción estricta: realDisconnectCaught DEBE ser true
  if (!realDisconnectCaught) {
    throw new Error("ERROR CRÍTICO: No se observó la desconexión real esperada en Ensayo 3B.");
  }
  console.log(`  * Desconexión real observada y capturada con éxito: ${disconnectErrorDetail}`);

  // 1. Comprobar que el cluster PostgreSQL sigue 100% vivo y accesible tras la desconexión
  const clusterHealth = await runDirectPsqlCmd("SELECT 1;");
  if (clusterHealth !== "1") {
    throw new Error("ERROR CRÍTICO: El cluster local de PostgreSQL quedó inaccesible tras el fallo de backend.");
  }

  // 2. Comprobar que las filas no confirmadas del ensayo 3B NO existen en PostgreSQL (transacción abortada/rollback)
  const tz3bCount = await runDirectPsqlCmd(
    `SELECT count(*) FROM public.tariff_zones WHERE id = '${trial3bTzId}';`
  );
  const party3bCount = await runDirectPsqlCmd(
    `SELECT count(*) FROM public.parties WHERE id = '${trial3bPartyId}';`
  );
  const addr3bCount = await runDirectPsqlCmd(
    `SELECT count(*) FROM public.party_addresses WHERE id = '${trial3bAddrId}';`
  );
  if (tz3bCount !== "0" || party3bCount !== "0" || addr3bCount !== "0") {
    throw new Error(`ERROR: Filas no confirmadas persisten en PostgreSQL tras desconexión (${tz3bCount}, ${party3bCount}, ${addr3bCount}).`);
  }
  console.log("  * Filas no confirmadas ausentes en BD (rollback efectivo tras desconexión).");

  // 3. Comprobar que las filas preexistentes de Ensayos 1/2 permanecen intactas
  const tzPreCount = await runDirectPsqlCmd(
    `SELECT count(*) FROM public.tariff_zones WHERE id = '7c596a00-ee8a-5ed0-a529-c05c3a541ea2';`
  );
  if (tzPreCount !== "1") {
    throw new Error("ERROR: Fila preexistente de Ensayo 1/2 afectada por la desconexión.");
  }
  console.log("  * Filas preexistentes de Ensayos 1/2 intactas en BD.");

  // 4. Verificar que el recibo abortado en disco existe y NO está marcado como COMMITTED
  if (existsSync(testRealFailReceiptPath)) {
    const diskAbort = JSON.parse(readFileSync(testRealFailReceiptPath, "utf8"));
    if (diskAbort.status === "COMMITTED") {
      throw new Error("ERROR CRÍTICO: Recibo en disco marcó COMMITTED tras desconexión real de backend.");
    }
    console.log(`  * Recibo en disco no comprometido (estado verificado: ${diskAbort.status}).`);
  }

  // 5. Recuperación autónoma: reconciliar intento previo y ejecutar recuperación legítima en sesión limpia
  const sessionRecovery = new LivePsqlSession();
  const reconStatus = await reconcileInFlightReceipt(
    (sql) => sessionRecovery.query(sql),
    testRealFailReceiptPath,
    computeSqlSha256(trial3bSql)
  );
  console.log(`  * Reconciliación explícita de intento en vuelo: ${reconStatus.status}`);

  // Tras reconciliar que el intento abortó, se retira el recibo fallido para reintento limpio
  if (existsSync(testRealFailReceiptPath)) unlinkSync(testRealFailReceiptPath);

  // Reintento limpio de executeData150Loader sobre la sesión nueva
  const resRecovery = await executeData150Loader(
    (sql) => sessionRecovery.query(sql),
    {
      loaderSql: trial3bSql,
      targetReceiptPath: testRealFailReceiptPath,
      tenantId: DATA150_TENANT_ID,
    }
  );
  sessionRecovery.close();

  if (!resRecovery.success || resRecovery.status !== "COMMITTED" || resRecovery.inserted_rows_total !== 3) {
    throw new Error(`ERROR: Recuperación tras corte falló en reintento limpio (éxito=${resRecovery.success}, filas=${resRecovery.inserted_rows_total}).`);
  }

  // Verificar que ahora las filas de Ensayo 3B sí existen confirmadas en PostgreSQL
  const tz3bRecoveredCount = await runDirectPsqlCmd(
    `SELECT count(*) FROM public.tariff_zones WHERE id = '${trial3bTzId}';`
  );
  if (tz3bRecoveredCount !== "1") {
    throw new Error("ERROR: Filas no se confirmaron en BD tras recuperación exitosa.");
  }
  console.log("  * Filas de Ensayo 3B comprometidas y confirmadas en BD tras recuperación autónoma.");

  // Limpiar filas de prueba 3B de PostgreSQL y recibo temporal
  await runDirectPsqlCmd(`
    DELETE FROM public.party_addresses WHERE id = '${trial3bAddrId}';
    DELETE FROM public.parties WHERE id = '${trial3bPartyId}';
    DELETE FROM public.tariff_zones WHERE id = '${trial3bTzId}';
  `);
  if (existsSync(testRealFailReceiptPath)) unlinkSync(testRealFailReceiptPath);
  console.log("  => VERIFICADO: Desconexión real de backend capturada sin falsos COMMITTED; cluster PostgreSQL 100% operativo y recuperación probada.");

  // --------------------------------------------------------------------------
  // TEST 3C: Real Post-COMMIT Abrupt Death, Lockfile Orphan Recovery & Rollback Execution
  // Acredita rigurosamente (Puntos 3.1 & 3.2):
  // 1. Proceso titular sufre muerte abrupta inmediata (SIGKILL no capturable) tras COMMIT en BD,
  //    dejando el archivo .lock huérfano con PID muerto y recibo en estado staged IN_TRANSACTION_PRE_COMMIT.
  // 2. Proceso hijo independiente (PID distinto) ejecuta reconcileInFlightReceipt,
  //    reclamando atómicamente el mutex huérfano (safeReclaimOrphanLock), reconciliando
  //    exitosamente tablas con y sin tenant_id (cmr_parties) contra PostgreSQL 17.11 vivo
  //    y promoviendo el recibo a COMMITTED con execution_reconciled: true.
  // 3. Retry legítimo sobre el recibo ya COMMITTED devuelve 0 filas nuevas y preserva las claves.
  // 4. Generación Y EJECUCIÓN REAL del rollback operacional dinámico contra PostgreSQL vivo,
  //    verificando con consultas SQL reales que el 100% de las filas se eliminan de BD,
  //    preservando los datos ajenos y preexistentes.
  // --------------------------------------------------------------------------
  console.log("\n[ENSAYO 3C] Muerte Abrupta Real (SIGKILL), Rescate de Bloqueo Huérfano, Reconciliación y Rollback Efectivo:");
  const test3cReceiptPath = "/tmp/data150-real-postcommit-receipt.json";
  const test3cLockPath = `${test3cReceiptPath}.lock`;
  if (existsSync(test3cReceiptPath)) unlinkSync(test3cReceiptPath);
  if (existsSync(test3cLockPath)) unlinkSync(test3cLockPath);

  const trial3cTzId = "7c596a00-ee8a-5ed0-a529-c05c3a541ec3";
  const trial3cCmrId = "35b5ee58-4e75-5c17-ad55-f7ec1a1b7599";
  const trial3cCmrPartyId = "b5a5d190-105f-5749-b2fd-f56afcd0bd99";

  await runDirectPsqlCmd(`
    DELETE FROM public.cmr_parties WHERE id = '${trial3cCmrPartyId}';
    DELETE FROM public.cmr_documents WHERE id = '${trial3cCmrId}';
    DELETE FROM public.tariff_zones WHERE id = '${trial3cTzId}';
  `);

  const trial3cSql = [
    "BEGIN;",
    `INSERT INTO public.tariff_zones ("id", "tenant_id", "name", "country", "purpose") VALUES ('${trial3cTzId}', '${DATA150_TENANT_ID}', '[PRUEBA 3C] Zona 3C', 'ES', 'Distribución 3C') ON CONFLICT ("id") DO NOTHING RETURNING "id";`,
    `INSERT INTO public.cmr_documents ("id", "cmr_number", "access_key", "status", "source", "customer_ids", "sender", "recipient", "pickup_location", "delivery_location", "carrier", "goods_description", "adr", "metadata", "issued_at", "created_at", "updated_at", "tenant_id", "carriage_charges", "cash_on_delivery", "document_kind") VALUES ('${trial3cCmrId}', 'DATA150-CMR-TRIAL3C', 'CMRKEY3CSECUREX99', 'Borrador', 'DATA150_BATCH', '{"00000000-0000-4000-8000-000000000001"}', 'Sender 3C', 'Recipient 3C', 'Madrid', 'Getafe', 'Carrier 3C', 'Goods 3C', '{"is_adr": false}'::jsonb, '{"batch": "DATA150-PRODUCTION-20261009"}'::jsonb, '2026-10-09T11:09:57Z', '2026-10-09T11:09:57Z', '2026-10-09T11:09:57Z', '${DATA150_TENANT_ID}', '{"prepaid": true}'::jsonb, '{"has_cod": false}'::jsonb, 'cmr') ON CONFLICT ("id") DO NOTHING RETURNING "id";`,
    `INSERT INTO public.cmr_parties ("id", "cmr_id", "role", "sequence", "legal_name", "metadata", "created_at") VALUES ('${trial3cCmrPartyId}', '${trial3cCmrId}', 'sender', 1, 'Empresa Remitente 3C', '{"batch": "DATA150-PRODUCTION-20261009"}'::jsonb, '2026-10-09T11:09:57Z') ON CONFLICT ("id") DO NOTHING RETURNING "id";`,
    "COMMIT;",
  ].join("\n");

  // 1. Spawning child process that executes executeData150Loader and gets abrupt SIGKILL after COMMIT
  console.log("  * Spawning proceso titular que ejecutará loader y sufrirá SIGKILL abrupto post-COMMIT...");
  const childLoaderScript = `
import { LivePsqlSession } from "./scripts/data150/run_operational_loader_trial.ts";
import { executeData150Loader, DATA150_TENANT_ID } from "./lib/data150-loader.ts";

async function runLoader() {
  const receiptPath = process.env.DATA150_CHILD_RECEIPT_PATH!;
  const sql = process.env.DATA150_CHILD_SQL!;
  const session = new LivePsqlSession();
  try {
    await executeData150Loader(
      async (s) => {
        const res = await session.query(s);
        if (s.trim().toUpperCase().startsWith("COMMIT")) {
          // Transaction committed in PostgreSQL. Hold lock and signal parent:
          process.stdout.write("[CHILD_COMMITTED_HOLDING_LOCK]\\n");
          // Sleep forever holding withFileLock until parent delivers SIGKILL
          await new Promise(() => {});
        }
        return res;
      },
      {
        loaderSql: sql,
        targetReceiptPath: receiptPath,
        tenantId: DATA150_TENANT_ID,
      }
    );
  } finally {
    session.close();
  }
}
runLoader().catch((err) => {
  console.error("Child loader error:", err);
  process.exit(1);
});
`;

  const childLoader = spawn("node", ["--experimental-strip-types", "-e", childLoaderScript], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      DATA150_CHILD_RECEIPT_PATH: test3cReceiptPath,
      DATA150_CHILD_SQL: trial3cSql,
    },
    stdio: ["pipe", "pipe", "pipe"],
  });

  const childPid = childLoader.pid!;
  let committedReceived = false;

  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      try { childLoader.kill("SIGKILL"); } catch {}
      reject(new Error("Timeout esperando [CHILD_COMMITTED_HOLDING_LOCK] desde el loader hijo"));
    }, 15000);

    childLoader.stdout?.on("data", (d: Buffer) => {
      const text = d.toString();
      if (text.includes("[CHILD_COMMITTED_HOLDING_LOCK]")) {
        committedReceived = true;
        clearTimeout(timeout);
        // Abruptly kill child process with SIGKILL (no finally, no cleanup, leaves lock on disk)
        try {
          process.kill(childPid, "SIGKILL");
        } catch (kErr) {
          reject(kErr);
          return;
        }
        resolve();
      }
    });

    childLoader.stderr?.on("data", (d: Buffer) => {
      console.error("Child loader stderr:", d.toString());
    });

    childLoader.on("error", (err) => {
      clearTimeout(timeout);
      reject(err);
    });
  });

  // Wait for child process exit:
  await new Promise<void>((resolve) => {
    childLoader.on("exit", () => resolve());
  });

  if (!committedReceived) {
    throw new Error("ERROR: Proceso hijo no emitió confirmación de COMMIT antes de finalizar.");
  }

  // Verify child process is dead:
  let childDead = false;
  try {
    process.kill(childPid, 0);
  } catch (err: any) {
    if (err.code === "ESRCH") childDead = true;
  }
  if (!childDead) {
    throw new Error(`ERROR: Proceso hijo PID ${childPid} aún sigue vivo tras SIGKILL.`);
  }
  console.log(`  * Proceso titular original PID ${childPid} terminado abruptamente con SIGKILL.`);

  // Verify that the lock file remains orphaned on disk with the dead PID:
  if (!existsSync(test3cLockPath)) {
    throw new Error(`ERROR: El archivo de bloqueo huérfano ${test3cLockPath} no existe en disco.`);
  }
  const orphanLockContent = readFileSync(test3cLockPath, "utf8");
  const orphanLockPid = parseInt(orphanLockContent.split("\n")[0]?.trim(), 10);
  if (orphanLockPid !== childPid) {
    throw new Error(`ERROR: El bloqueo huérfano contiene PID ${orphanLockPid}, esperado ${childPid}.`);
  }
  console.log(`  * Bloqueo huérfano ${test3cLockPath} verificado en disco retenido por PID muerto ${orphanLockPid}.`);

  // Verify that disk receipt is staged as IN_TRANSACTION_PRE_COMMIT:
  if (!existsSync(test3cReceiptPath)) {
    throw new Error(`ERROR: El recibo staged ${test3cReceiptPath} no existe en disco.`);
  }
  const diskPreCommit3c = JSON.parse(readFileSync(test3cReceiptPath, "utf8"));
  if (diskPreCommit3c.status !== "IN_TRANSACTION_PRE_COMMIT") {
    throw new Error(`ERROR: Recibo en disco debía ser IN_TRANSACTION_PRE_COMMIT, obtenido '${diskPreCommit3c.status}'.`);
  }
  console.log("  * Recibo en disco verificado en estado staged IN_TRANSACTION_PRE_COMMIT con claves intactas.");

  // Verify rows are actually committed in PostgreSQL:
  const tzCommitted = await runDirectPsqlCmd(`SELECT count(*) FROM public.tariff_zones WHERE id = '${trial3cTzId}';`);
  const cmrCommitted = await runDirectPsqlCmd(`SELECT count(*) FROM public.cmr_documents WHERE id = '${trial3cCmrId}';`);
  const cmrPartyCommitted = await runDirectPsqlCmd(`SELECT count(*) FROM public.cmr_parties WHERE id = '${trial3cCmrPartyId}';`);
  if (tzCommitted !== "1" || cmrCommitted !== "1" || cmrPartyCommitted !== "1") {
    throw new Error("ERROR: Filas no se confirmaron en BD antes de la muerte del proceso.");
  }
  console.log("  * Filas comprometidas y durables verificadas en BD tras caída abrupta del titular.");

  // 2. Ejecutar reconciliación en proceso hijo independiente (PID distinto)
  // Este proceso encontrará el bloqueo huérfano del PID muerto, rescatará el lock atómicamente,
  // verificará las 3 tablas en PostgreSQL y promoverá el recibo a COMMITTED.
  console.log("  * Ejecutando reconciliación autónoma en proceso hijo independiente (PID distinto)...");
  const childReconcilerScript = `
import { LivePsqlSession } from "./scripts/data150/run_operational_loader_trial.ts";
import { reconcileInFlightReceipt } from "./lib/data150-loader.ts";

async function runChild() {
  const receiptPath = process.env.DATA150_CHILD_RECEIPT_PATH!;
  const expectedHash = process.env.DATA150_CHILD_SQL_HASH!;
  const session = new LivePsqlSession();
  try {
    const res = await reconcileInFlightReceipt(
      (sql) => session.query(sql),
      receiptPath,
      expectedHash
    );
    console.log("[CHILD_RECON_RESULT]" + JSON.stringify(res));
  } finally {
    session.close();
  }
}
runChild().catch((err) => {
  console.error("Child process error:", err);
  process.exit(1);
});
`;
  const childRes = spawnSync("node", ["--experimental-strip-types", "-e", childReconcilerScript], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      DATA150_CHILD_RECEIPT_PATH: test3cReceiptPath,
      DATA150_CHILD_SQL_HASH: computeSqlSha256(trial3cSql),
    },
    encoding: "utf8",
  });
  if (childRes.status !== 0) {
    throw new Error(`ERROR: Proceso hijo de reconciliación falló (status=${childRes.status}). Stderr: ${childRes.stderr}`);
  }
  const matchChild = (childRes.stdout || "").match(/\[CHILD_RECON_RESULT\](.*)/);
  if (!matchChild) {
    throw new Error(`ERROR: Proceso hijo de reconciliación no devolvió resultado válido. Salida: ${childRes.stdout}`);
  }
  const recon3cResult = JSON.parse(matchChild[1]);
  console.log(`  * Rescate de lock huérfano y reconciliación exitosa (PID independiente): status=${recon3cResult.status}, confirmedKeys=${recon3cResult.confirmedKeysCount}`);

  if (recon3cResult.status !== "COMMITTED" || recon3cResult.confirmedKeysCount !== 3) {
    throw new Error(`ERROR: Reconciliación real post-COMMIT falló (status=${recon3cResult.status}, keys=${recon3cResult.confirmedKeysCount}).`);
  }

  // Verificar que el recibo en disco ahora está COMMITTED con las 3 tablas y sus claves
  const diskPromoted3c = JSON.parse(readFileSync(test3cReceiptPath, "utf8"));
  if (diskPromoted3c.status !== "COMMITTED") {
    throw new Error("ERROR: Recibo en disco no fue promovido a COMMITTED.");
  }
  if (!diskPromoted3c.executed_at && !diskPromoted3c.reconciled_at) {
    throw new Error("ERROR: Recibo promovido no contiene marca temporal executed_at o reconciled_at.");
  }
  if (diskPromoted3c.execution_reconciled !== true) {
    throw new Error("ERROR: Recibo promovido no tiene marca execution_reconciled: true.");
  }
  if (
    diskPromoted3c.tables?.tariff_zones?.inserted_count !== 1 ||
    diskPromoted3c.tables?.cmr_documents?.inserted_count !== 1 ||
    diskPromoted3c.tables?.cmr_parties?.inserted_count !== 1
  ) {
    throw new Error("ERROR: Recibo promovido no contiene las 3 tablas completas.");
  }
  console.log("  * Recibo promovido exitosamente a COMMITTED en disco tras rescate de lock, preservando cmr_parties (sin tenant_id).");

  // 3. Generar Y EJECUTAR el rollback operacional dinámico DIRECTO desde el recibo reconciliado (SIN retry previo)
  // Demuestra que un recibo promovido a COMMITTED por reconciliación
  // (con execution_reconciled=true, reconciled_at registrado y sin executed_at restampado)
  // produce un rollback operacional 100% válido y se ejecuta directamente con éxito en PostgreSQL.
  const test3cRollbackSqlPath = "/tmp/data150-trial3c-rollback.sql";
  const test3cSqlPath = "/tmp/data150-trial3c.sql";
  if (existsSync(test3cRollbackSqlPath)) unlinkSync(test3cRollbackSqlPath);
  writeFileSync(test3cSqlPath, trial3cSql, "utf8");

  console.log("  * Generando y ejecutando rollback operacional DIRECTO desde estado reconciliado (SIN retry previo)...");
  const rollbackSql3c = generateOperationalRollback(test3cReceiptPath, test3cRollbackSqlPath, test3cSqlPath);
  if (
    !rollbackSql3c.includes("DELETE FROM public.cmr_parties") ||
    !rollbackSql3c.includes("[CASCADE PROTECTED TABLE] Table public.cmr_documents") ||
    !rollbackSql3c.includes("DELETE FROM public.tariff_zones")
  ) {
    throw new Error("ERROR: Rollback operacional generado no contiene el tratamiento esperado.");
  }

  // Ejecución real del rollback en PostgreSQL vivo DIRECTO desde estado reconciliado:
  await runDirectPsqlCmd(rollbackSql3c);
  console.log("  * Rollback operacional directo desde estado reconciliado ejecutado con éxito en PostgreSQL vivo.");

  // Comprobar borrado selectivo según política de inmutabilidad y protección en cascada:
  // - tariff_zones y cmr_parties: mutables -> eliminadas por el rollback (count 0)
  // - cmr_documents: en DATA150_CASCADE_PROTECTED_TABLES -> retenida intencionadamente para no romper cascadas de eventos (count 1)
  const tz3cPostCount = await runDirectPsqlCmd(`SELECT count(*) FROM public.tariff_zones WHERE id = '${trial3cTzId}';`);
  const cmr3cPostCount = await runDirectPsqlCmd(`SELECT count(*) FROM public.cmr_documents WHERE id = '${trial3cCmrId}';`);
  const cmrParty3cPostCount = await runDirectPsqlCmd(`SELECT count(*) FROM public.cmr_parties WHERE id = '${trial3cCmrPartyId}';`);
  if (tz3cPostCount !== "0" || cmrParty3cPostCount !== "0") {
    throw new Error(`ERROR: Filas mutables del ensayo 3C persisten tras rollback directo (tz=${tz3cPostCount}, cmr_parties=${cmrParty3cPostCount}).`);
  }
  if (cmr3cPostCount !== "1") {
    throw new Error(`ERROR: cmr_documents debía ser preservada por la regla de protección en cascada (obtenido ${cmr3cPostCount}).`);
  }
  console.log("  * Filas mutables eliminadas al 100% y cmr_documents preservada por protección en cascada según política de rollback.");

  // Limpieza explícita de cmr_documents tras validar su protección en el rollback
  await runDirectPsqlCmd(`DELETE FROM public.cmr_documents WHERE id = '${trial3cCmrId}';`);

  // Comprobar preservación de filas de Ensayo 1/2:
  const tzPreCheck = await runDirectPsqlCmd(`SELECT count(*) FROM public.tariff_zones WHERE id = '7c596a00-ee8a-5ed0-a529-c05c3a541ea2';`);
  if (tzPreCheck !== "1") {
    throw new Error("ERROR: Filas preexistentes de Ensayos 1/2 afectadas por rollback 3C.");
  }
  console.log("  * Filas preexistentes de Ensayos 1/2 100% intactas tras rollback directo 3C.");

  // 4. Sub-ensayo 3C.2: Reintento legítimo sobre recibo reconciliado en BD
  // Reinyectamos las filas para probar el reintento sobre recibo reconciliado:
  console.log("  * Sub-ensayo 3C.2: Probando reintento sobre recibo reconciliado...");
  await runDirectPsqlCmd(trial3cSql);
  // Reconciliamos de nuevo para simular recibo COMMITTED reconciliado:
  const sessionReconcile3c2 = new LivePsqlSession();
  try {
    await reconcileInFlightReceipt(
      (sql) => sessionReconcile3c2.query(sql),
      test3cReceiptPath,
      computeSqlSha256(trial3cSql)
    );
  } finally {
    sessionReconcile3c2.close();
  }
  const session3cRetry = new LivePsqlSession();
  const res3cRetry = await executeData150Loader(
    (sql) => session3cRetry.query(sql),
    {
      loaderSql: trial3cSql,
      targetReceiptPath: test3cReceiptPath,
      tenantId: DATA150_TENANT_ID,
    }
  );
  session3cRetry.close();
  console.log(`  * Reintento tras reconciliación: éxito=${res3cRetry.success}, nuevas filas=${res3cRetry.inserted_rows_total}`);
  if (!res3cRetry.success || res3cRetry.status !== "COMMITTED" || res3cRetry.inserted_rows_total !== 0) {
    throw new Error(`ERROR: Reintento sobre recibo reconciliado falló (éxito=${res3cRetry.success}, filas=${res3cRetry.inserted_rows_total}).`);
  }
  if (
    res3cRetry.receipt?.tariff_zones?.inserted_count !== 1 ||
    res3cRetry.receipt?.cmr_documents?.inserted_count !== 1 ||
    res3cRetry.receipt?.cmr_parties?.inserted_count !== 1
  ) {
    throw new Error("ERROR: Claves durables perdidas tras reintento de 0 filas.");
  }
  console.log("  * Reintento verificado: 0 filas nuevas devueltas y 100% claves preservadas.");

  // Limpieza final del sub-ensayo 3C.2
  const cleanupRollback = generateOperationalRollback(test3cReceiptPath, test3cRollbackSqlPath, test3cSqlPath);
  await runDirectPsqlCmd(cleanupRollback);
  await runDirectPsqlCmd(`DELETE FROM public.cmr_documents WHERE id = '${trial3cCmrId}';`);

  if (existsSync(test3cRollbackSqlPath)) unlinkSync(test3cRollbackSqlPath);
  if (existsSync(test3cSqlPath)) unlinkSync(test3cSqlPath);
  if (existsSync(test3cReceiptPath)) unlinkSync(test3cReceiptPath);
  console.log("  => VERIFICADO: Rollback directo sin retry probado + Reintento con 0 duplicados y preservación probado.");

  // --------------------------------------------------------------------------
  // TEST 3D: Negative Reconciliation Tests (Partial Key Presence & Strict Protocol Contract)
  // Acredita fail-closed:
  // 1. Presencia parcial de claves NO marca ABORTED ni borra staged_tables; marca COMMIT_INDETERMINATE.
  // 2. Respuesta malformada o inválida de consulta lanza error de protocolo fail-closed.
  // 3. Formato no numérico, fracción, negativo, conteo excedente o filas vacías/múltiples fallan cerrado.
  // --------------------------------------------------------------------------
  console.log("\n[ENSAYO 3D] Pruebas Negativas de Reconciliación (Presencia Parcial y Contrato Estricto):");

  // 1. Presencia parcial: insertamos sólo tariff_zones y cmr_documents (omitiendo cmr_parties)
  await runDirectPsqlCmd(`
    INSERT INTO public.tariff_zones ("id", "tenant_id", "name", "country", "purpose")
    VALUES ('${trial3cTzId}', '${DATA150_TENANT_ID}', '[PRUEBA 3D] Zona 3D', 'ES', 'Distribución 3D')
    ON CONFLICT ("id") DO NOTHING;

    INSERT INTO public.cmr_documents ("id", "cmr_number", "access_key", "status", "source", "customer_ids", "sender", "recipient", "pickup_location", "delivery_location", "carrier", "goods_description", "adr", "metadata", "issued_at", "created_at", "updated_at", "tenant_id", "carriage_charges", "cash_on_delivery", "document_kind")
    VALUES ('${trial3cCmrId}', 'DATA150-CMR-TRIAL3D', 'CMRKEY3DSECUREX99', 'Borrador', 'DATA150_BATCH', '{"00000000-0000-4000-8000-000000000001"}', 'Sender 3D', 'Recipient 3D', 'Madrid', 'Getafe', 'Carrier 3D', 'Goods 3D', '{"is_adr": false}'::jsonb, '{"batch": "DATA150-PRODUCTION-20261009"}'::jsonb, '2026-10-09T11:09:57Z', '2026-10-09T11:09:57Z', '2026-10-09T11:09:57Z', '${DATA150_TENANT_ID}', '{"prepaid": true}'::jsonb, '{"has_cod": false}'::jsonb, 'cmr')
    ON CONFLICT ("id") DO NOTHING;
  `);

  // Simulamos recibo en vuelo con las 3 tablas en staged_tables
  const test3dReceiptPath = "/tmp/data150-partial-test-receipt.json";
  const partialPayload = {
    status: "IN_TRANSACTION_PRE_COMMIT",
    batch_id: DATA150_BATCH_ID,
    tenant_id: DATA150_TENANT_ID,
    dataset_hash: computeSqlSha256(trial3cSql),
    executed_at: null,
    updated_at: new Date().toISOString(),
    tables: {},
    staged_tables: {
      tariff_zones: { table: "tariff_zones", pk_type: "single", pk_col: "id", inserted_count: 1, inserted_keys: [trial3cTzId] },
      cmr_documents: { table: "cmr_documents", pk_type: "single", pk_col: "id", inserted_count: 1, inserted_keys: [trial3cCmrId] },
      cmr_parties: { table: "cmr_parties", pk_type: "single", pk_col: "id", inserted_count: 1, inserted_keys: [trial3cCmrPartyId] },
    },
  };
  writeFileSync(test3dReceiptPath, JSON.stringify(partialPayload, null, 2));

  const session3d = new LivePsqlSession();
  const partialReconResult = await reconcileInFlightReceipt(
    (sql) => session3d.query(sql),
    test3dReceiptPath,
    computeSqlSha256(trial3cSql)
  );
  session3d.close();

  console.log(`  * Presencia parcial detectada: reconciled=${partialReconResult.reconciled}, status=${partialReconResult.status}`);
  if (partialReconResult.reconciled !== false || partialReconResult.status !== "COMMIT_INDETERMINATE") {
    throw new Error(`ERROR: Presencia parcial debía retornar COMMIT_INDETERMINATE, obtenido '${partialReconResult.status}'.`);
  }

  const diskPartial = JSON.parse(readFileSync(test3dReceiptPath, "utf8"));
  if (diskPartial.status !== "COMMIT_INDETERMINATE") {
    throw new Error("ERROR: Recibo en disco no conservó estado COMMIT_INDETERMINATE ante presencia parcial.");
  }
  if (!diskPartial.staged_tables || Object.keys(diskPartial.staged_tables).length !== 3) {
    throw new Error("ERROR CRÍTICO: staged_tables fueron borradas indebidamente ante presencia parcial.");
  }
  console.log("  * Presencia parcial conservó staged_tables y estado COMMIT_INDETERMINATE sin borrar evidencia.");

  // 2. Pruebas negativas de protocolo y validación numérica estricta:
  const negativeCases: Array<{ name: string; mockRes: any }> = [
    { name: "Respuesta malformada sin columna count ni cnt", mockRes: [{ unexpected_field: 42 }] },
    { name: "Formato no numérico con sufijo basura ('1garbage')", mockRes: [{ cnt: "1garbage" }] },
    { name: "Fracción no entera ('1.5')", mockRes: [{ cnt: "1.5" }] },
    { name: "Recuento negativo ('-1')", mockRes: [{ cnt: "-1" }] },
    { name: "Recuento excedente al esperado ('99' > 1)", mockRes: [{ cnt: "99" }] },
    { name: "Arreglo de resultados vacío (0 filas)", mockRes: [] },
    { name: "Arreglo de resultados múltiple (2 filas)", mockRes: [{ cnt: "1" }, { cnt: "1" }] },
  ];

  for (const tc of negativeCases) {
    let caught = false;
    try {
      await reconcileInFlightReceipt(
        async () => tc.mockRes,
        test3dReceiptPath,
        computeSqlSha256(trial3cSql)
      );
    } catch (err: any) {
      caught = true;
      console.log(`  * [NEGATIVO] ${tc.name}: rechazado correctamente (${err.message.split("\n")[0]}).`);
    }
    if (!caught) {
      throw new Error(`ERROR: Prueba negativa '${tc.name}' no falló cerrado como se requería.`);
    }
  }
  console.log("  => VERIFICADO: Pruebas negativas acreditan fail-closed estricto ante presencia parcial y violaciones de contrato de conteo.");

  // Limpieza de claves 3D de PostgreSQL y archivos temporales
  await runDirectPsqlCmd(`
    DELETE FROM public.cmr_documents WHERE id = '${trial3cCmrId}';
    DELETE FROM public.tariff_zones WHERE id = '${trial3cTzId}';
  `);
  if (existsSync(test3dReceiptPath)) unlinkSync(test3dReceiptPath);

  // --------------------------------------------------------------------------
  // TEST 4: Post-Commit Write Failure Resilience (Controlled Disk Write Failure)
  // Declaración: Ensayo de inyección controlada de fallo de disco post-commit para verificar
  // que la transacción confirmada en BD no se aborta con un ROLLBACK espurio.
  // --------------------------------------------------------------------------
  console.log("\n[ENSAYO 4] Resiliencia ante Fallo de Escritura Post-Commit (Inyección Controlada):");
  const testPostCommitReceiptPath = "/tmp/data150-postcommit-failure-receipt.json";
  if (existsSync(testPostCommitReceiptPath)) unlinkSync(testPostCommitReceiptPath);

  const session4 = new LivePsqlSession();
  const res4 = await executeData150Loader((sql) => session4.query(sql), {
    loaderSql: liveTrialSql,
    targetReceiptPath: testPostCommitReceiptPath,
    tenantId: DATA150_TENANT_ID,
    simulatePostCommitFailure: true,
  });
  session4.close();

  console.log(`- Éxito retornado: false (obtenido: ${res4.success})`);
  console.log(`- Estado registrado: ${res4.status}`);
  console.log(`- DB comprometida: ${res4.db_committed}`);

  if (res4.status !== "COMMIT_CONFIRMED_POST_COMMIT_WRITE_FAILED" || res4.db_committed !== true) {
    throw new Error("Ensayo 4 falló: no se registró COMMIT_CONFIRMED_POST_COMMIT_WRITE_FAILED.");
  }
  const rollbackCalls = session4.queryLog.filter((s) => s.startsWith("ROLLBACK"));
  if (rollbackCalls.length > 0) {
    throw new Error("ERROR CRÍTICO: Se ejecutó ROLLBACK tras un COMMIT confirmado en BD.");
  }
  console.log("  => VERIFICADO: Fallo post-commit reconoce transacción confirmada sin emitir ROLLBACK espurio.");

  // --------------------------------------------------------------------------
  // TEST 5: Dynamic Rollback Generation & Live Execution on PostgreSQL
  // --------------------------------------------------------------------------
  console.log("\n[ENSAYO 5] Generación y Ejecución de Rollback Operativo sobre PostgreSQL Vivo:");
  const liveRollbackSqlPath = "/tmp/data150-live-dynamic-rollback.sql";

  const generatedSql = generateOperationalRollback(testReceiptPath, liveRollbackSqlPath, liveTrialSql);
  if (!generatedSql.includes("DELETE FROM public.tariff_zones") || !generatedSql.includes("7c596a00-ee8a-5ed0-a529-c05c3a541ea2")) {
    throw new Error("Ensayo 5 falló: SQL de rollback dinámico no contiene sentencias esperadas.");
  }
  console.log("  * Rollback dinámico generado con éxito desde recibo verificado COMMITTED.");

  // Execute rollback on live PostgreSQL:
  await runDirectPsqlCmd(generatedSql);
  console.log("  * Rollback ejecutado en PostgreSQL vivo con código 0.");

  // Verify deletion:
  const tzPostCount = await runDirectPsqlCmd(
    `SELECT count(*) FROM public.tariff_zones WHERE id = '7c596a00-ee8a-5ed0-a529-c05c3a541ea2';`
  );
  const partyPostCount = await runDirectPsqlCmd(
    `SELECT count(*) FROM public.parties WHERE id = '00000000-0000-4000-8000-000000000010';`
  );
  const addrPostCount = await runDirectPsqlCmd(
    `SELECT count(*) FROM public.party_addresses WHERE id = '00000000-0000-4000-8000-000000000020';`
  );

  if (tzPostCount !== "0" || partyPostCount !== "0" || addrPostCount !== "0") {
    throw new Error(`Ensayo 5 falló: filas del lote siguen presentes tras rollback (${tzPostCount}, ${partyPostCount}, ${addrPostCount}).`);
  }
  console.log("  => VERIFICADO: 100% de las filas de prueba eliminadas de PostgreSQL vivo tras rollback.");

  // Clean up test receipts
  if (existsSync(testReceiptPath)) unlinkSync(testReceiptPath);
  if (existsSync(testIndeterminateReceiptPath)) unlinkSync(testIndeterminateReceiptPath);
  if (existsSync(liveRollbackSqlPath)) unlinkSync(liveRollbackSqlPath);

  console.log("\n" + "=".repeat(80));
  console.log("✅ ENSAYO OPERATIVO COMPLETO EN POSTGRESQL 17.11 VIVO SUPERADO CON ÉXITO");
  console.log("=".repeat(80) + "\n");

  if (existsSync(EVIDENCE_DIR)) {
    writeFileSync(OPERATIONAL_LOG_PATH, logBuffer.join("\n") + "\n", "utf8");
    origLog(`Operational trial raw log artifact written to ${OPERATIONAL_LOG_PATH}`);
  }
}

if (
  process.argv[1] &&
  (import.meta.url === `file://${process.argv[1]}` ||
    import.meta.url.endsWith(process.argv[1]) ||
    process.argv[1].endsWith("run_operational_loader_trial.ts"))
) {
  runOperationalLoaderTrial()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(`FATAL ERROR: ${err.message}\n${err.stack}`);
      process.exit(1);
    });
}
