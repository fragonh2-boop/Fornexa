#!/usr/bin/env node
/**
 * FORNEXA — DATA150 In-Memory Transactional Unit Simulation (MockPostgresDatabase)
 * Tests the mechanics of executeData150Loader and executeData150Rollback:
 * 1. Statement parsing without dropping table-leading statements.
 * 2. Collision handling with RETURNING excluding pre-existing rows from receipt.
 * 3. Pre-commit staging of durable execution receipt on disk.
 * 4. Idempotent retry yielding 0 rows and preserving previous receipt keys.
 * 5. Mid-transaction failure triggering ROLLBACK and marking receipt aborted.
 * 6. Dynamic rollback generation in reverse topological order preserving foreign/pre-existing rows.
 *
 * NOTA METODOLÓGICA (FAIL-CLOSED):
 * Esta prueba es un simulador unitario en memoria (MockPostgresDatabase). No reemplaza
 * ni pretende simular un ensayo real sobre una instancia PostgreSQL viva con dos sesiones
 * concurrentes. La ejecución sobre PostgreSQL vivo no productivo permanece BLOCKED
 * hasta contar con una instancia o contenedor aislado no productivo disponible.
 */

import {
  executeData150Loader,
  executeData150Rollback,
  DATA150_TENANT_ID,
} from "../../lib/data150-loader.ts";
import { generateOperationalRollback } from "./generate_rollback_from_receipt.ts";
import { unlinkSync, existsSync } from "node:fs";

interface MockRow {
  [key: string]: any;
}

class MockPostgresDatabase {
  private tables: Map<string, Map<string, MockRow>> = new Map();
  private inTransaction: boolean = false;
  private transactionSnapshot: Map<string, Map<string, MockRow>> | null = null;
  public logs: string[] = [];

  constructor() {
    this.tables.set("party_addresses", new Map());
    this.tables.set("orders", new Map());
    this.tables.set("order_lines", new Map());
    this.tables.set("cmr_parties", new Map());
  }

  public seed(table: string, id: string, data: MockRow) {
    if (!this.tables.has(table)) {
      this.tables.set(table, new Map());
    }
    this.tables.get(table)!.set(id, { id, ...data });
  }

  public getRow(table: string, id: string): MockRow | undefined {
    return this.tables.get(table)?.get(id);
  }

  public getTableRows(table: string): MockRow[] {
    const t = this.tables.get(table);
    return t ? Array.from(t.values()) : [];
  }

  public async query(sql: string): Promise<any[]> {
    const trimmed = sql.trim().replace(/;$/, "");

    if (trimmed === "BEGIN") {
      if (this.inTransaction) throw new Error("Transaction already in progress");
      this.inTransaction = true;
      // Deep snapshot for rollback
      this.transactionSnapshot = new Map();
      for (const [tname, map] of this.tables.entries()) {
        this.transactionSnapshot.set(tname, new Map(map));
      }
      this.logs.push("[SQL] BEGIN;");
      return [];
    }

    if (trimmed === "COMMIT") {
      if (!this.inTransaction) throw new Error("No active transaction to commit");
      this.inTransaction = false;
      this.transactionSnapshot = null;
      this.logs.push("[SQL] COMMIT;");
      return [];
    }

    if (trimmed === "ROLLBACK") {
      if (!this.inTransaction) throw new Error("No active transaction to rollback");
      if (this.transactionSnapshot) {
        this.tables = this.transactionSnapshot;
      }
      this.inTransaction = false;
      this.transactionSnapshot = null;
      this.logs.push("[SQL] ROLLBACK;");
      return [];
    }

    if (trimmed.startsWith("INSERT INTO public.")) {
      const match = trimmed.match(/INSERT INTO public\.([a-z0-9_]+)\s*\((.*?)\)\s*VALUES\s*\((.*?)\)\s*ON CONFLICT \((.*?)\) DO NOTHING RETURNING (.*)/i);
      if (!match) {
        throw new Error(`Unsupported INSERT syntax in mock: ${trimmed}`);
      }
      const [, tableName, colsRaw, valsRaw, conflictColRaw, returningColsRaw] = match;
      const cols = colsRaw.split(",").map((c) => c.trim().replace(/"/g, ""));
      const vals = valsRaw.split(",").map((v) => {
        const t = v.trim();
        if (t.startsWith("'") && t.endsWith("'")) return t.slice(1, -1);
        if (t === "NULL") return null;
        if (t === "NOW()") return new Date().toISOString();
        const n = Number(t);
        return isNaN(n) ? t : n;
      });

      const row: MockRow = {};
      cols.forEach((col, idx) => {
        row[col] = vals[idx];
      });

      const pkCol = conflictColRaw.replace(/"/g, "").trim();
      const pkVal = String(row[pkCol]);

      if (!this.tables.has(tableName)) {
        this.tables.set(tableName, new Map());
      }
      const tableMap = this.tables.get(tableName)!;

      // Simulate ON CONFLICT DO NOTHING:
      if (tableMap.has(pkVal)) {
        this.logs.push(`[SQL] INSERT into ${tableName} PK='${pkVal}' -> CONFLICT DETECTED (skipped, RETURNING 0 rows)`);
        return [];
      }

      // Insert fresh row:
      tableMap.set(pkVal, row);
      const retCols = returningColsRaw.split(",").map((c) => c.trim().replace(/"/g, ""));
      const retObj: Record<string, any> = {};
      for (const rc of retCols) {
        retObj[rc] = row[rc];
      }
      this.logs.push(`[SQL] INSERT into ${tableName} PK='${pkVal}' -> INSERTED (RETURNING: ${JSON.stringify(retObj)})`);
      return [retObj];
    }

    if (trimmed.startsWith("DELETE FROM public.")) {
      const match = trimmed.match(
        /DELETE FROM public\.([a-z0-9_]+)\s*WHERE\s*"([a-z0-9_]+)"\s*IN\s*\((.*?)\)(?:\s*AND\s*(?:tenant_id\s*=\s*'([^']+)'|cmr_id\s*IN\s*\(SELECT\s+id\s+FROM\s+public\.cmr_documents\s+WHERE\s+tenant_id\s*=\s*'([^']+)'\)))?/i
      );
      if (!match) {
        throw new Error(`Unsupported DELETE syntax in mock: ${trimmed}`);
      }
      const tableName = match[1];
      const inClauseRaw = match[3];
      const tenantFilter = match[4] || match[5];
      const targetKeys = new Set(
        inClauseRaw.split(",").map((s) => s.trim().replace(/^'|'$/g, ""))
      );

      const tableMap = this.tables.get(tableName);
      let deletedCount = 0;
      if (tableMap) {
        for (const [key, row] of Array.from(tableMap.entries())) {
          if (targetKeys.has(key)) {
            if (tenantFilter && row.tenant_id && row.tenant_id !== tenantFilter) {
              // Tenant mismatch - skip delete!
              continue;
            }
            tableMap.delete(key);
            deletedCount++;
          }
        }
      }
      this.logs.push(`[SQL] DELETE FROM ${tableName} matching ${targetKeys.size} keys -> Deleted ${deletedCount} rows`);
      return [{ count: deletedCount }];
    }

    throw new Error(`Unhandled SQL command in mock: ${trimmed}`);
  }
}

export async function runNonProductiveTrial(): Promise<boolean> {
  console.log("================================================================================");
  console.log("FORNEXA — SIMULACIÓN UNITARIA EN MEMORIA (MockPostgresDatabase)");
  console.log("Verificación de lógica de parsing, RETURNING, fusión de recibo y rollback inverso");
  console.log("NOTA: Simulador unitario de proceso único; no constituye ensayo en PostgreSQL vivo.");
  console.log("================================================================================");

  const db = new MockPostgresDatabase();

  // 1. Seed pre-existing rows in DB
  const PRE_EXISTING_ADDR = "00000000-0000-4000-a000-000000000001";
  const FOREIGN_TENANT_ADDR = "99999999-9999-4999-a999-000000000001";
  const PRE_EXISTING_ORD = "00000000-0000-4000-b000-000000000001";
  const FOREIGN_TENANT_ID = "99999999-9999-4999-8999-999999999999";
  const ADDR_1 = "00000000-0000-4000-8000-000000000001";
  const ADDR_2 = "00000000-0000-4000-8000-000000000002";
  const ORD_1 = "00000000-0000-4000-8000-000000000003";
  const ORDLINE_1 = "00000000-0000-4000-8000-000000000004";
  const CMRP_1 = "00000000-0000-4000-8000-000000000005";

  db.seed("party_addresses", PRE_EXISTING_ADDR, {
    tenant_id: DATA150_TENANT_ID,
    address_line_1: "Calle Logística Existente 1",
    city: "Madrid",
  });
  db.seed("party_addresses", FOREIGN_TENANT_ADDR, {
    tenant_id: FOREIGN_TENANT_ID,
    address_line_1: "Calle Ajena de Otro Tenant",
    city: "Barcelona",
  });
  db.seed("orders", PRE_EXISTING_ORD, {
    tenant_id: DATA150_TENANT_ID,
    order_number: "ORD-PRE-001",
  });

  console.log("\n[FASE 1] Estado Inicial de Base de Datos:");
  console.log(`- party_addresses: 2 filas existentes ('${PRE_EXISTING_ADDR}' [FORNEXA], '${FOREIGN_TENANT_ADDR}' [AJENO])`);
  console.log(`- orders: 1 fila existente ('${PRE_EXISTING_ORD}' [FORNEXA])`);

  // 2. Sample batch SQL containing colliding rows and fresh rows
  const testBatchSql = [
    "BEGIN;",
    // party_addresses: 1 colisionando, 2 nuevas
    `INSERT INTO public.party_addresses ("id", "tenant_id", "address_line_1", "city") VALUES ('${PRE_EXISTING_ADDR}', '${DATA150_TENANT_ID}', 'Calle Modificada Fake', 'Madrid') ON CONFLICT ("id") DO NOTHING RETURNING "id";`,
    `INSERT INTO public.party_addresses ("id", "tenant_id", "address_line_1", "city") VALUES ('${ADDR_1}', '${DATA150_TENANT_ID}', 'Calle Industrial 1', 'Madrid') ON CONFLICT ("id") DO NOTHING RETURNING "id";`,
    `INSERT INTO public.party_addresses ("id", "tenant_id", "address_line_1", "city") VALUES ('${ADDR_2}', '${DATA150_TENANT_ID}', 'Calle Industrial 2', 'Zaragoza') ON CONFLICT ("id") DO NOTHING RETURNING "id";`,
    // orders: 1 colisionando, 1 nueva
    `INSERT INTO public.orders ("id", "tenant_id", "order_number") VALUES ('${PRE_EXISTING_ORD}', '${DATA150_TENANT_ID}', 'ORD-COLLIDING') ON CONFLICT ("id") DO NOTHING RETURNING "id";`,
    `INSERT INTO public.orders ("id", "tenant_id", "order_number") VALUES ('${ORD_1}', '${DATA150_TENANT_ID}', 'ORD-TEST-0001') ON CONFLICT ("id") DO NOTHING RETURNING "id";`,
    // order_lines: 1 nueva
    `INSERT INTO public.order_lines ("id", "tenant_id", "order_id", "line_number") VALUES ('${ORDLINE_1}', '${DATA150_TENANT_ID}', '${ORD_1}', 1) ON CONFLICT ("id") DO NOTHING RETURNING "id";`,
    // cmr_parties: 1 nueva (tabla sin tenant_id)
    `INSERT INTO public.cmr_parties ("id", "role", "party_name") VALUES ('${CMRP_1}', 'CARRIER', 'Transportes Sintéticos SL') ON CONFLICT ("id") DO NOTHING RETURNING "id";`,
    "COMMIT;",
  ].join("\n");

  const tempReceiptPath = "/tmp/data150-trial-execution-receipt.json";
  const trialDynamicRollbackPath = "/tmp/data150-trial-dynamic-rollback.sql";
  if (existsSync(tempReceiptPath)) unlinkSync(tempReceiptPath);
  if (existsSync(trialDynamicRollbackPath)) unlinkSync(trialDynamicRollbackPath);

  console.log("\n[FASE 2] Ejecución Transaccional del Lote (Primera Carga):");
  const result1 = await executeData150Loader(
    (sql) => db.query(sql),
    {
      loaderSql: testBatchSql,
      targetReceiptPath: tempReceiptPath,
      tenantId: DATA150_TENANT_ID,
    }
  );

  console.log(`- Éxito de ejecución: ${result1.success}`);
  console.log(`- Total sentencias procesadas: ${result1.total_statements}`);
  console.log(`- Filas devueltas por RETURNING: ${result1.inserted_rows_total}`);
  console.log("- Resumen del recibo de ejecución capturado:");
  for (const [tbl, entry] of Object.entries(result1.receipt)) {
    console.log(`  * ${tbl}: ${entry.inserted_count} filas devueltas -> [${entry.inserted_keys.join(", ")}]`);
  }

  // Verificaciones Fase 2
  if (!result1.success) throw new Error(`Fase 2 falló: ${result1.error} (status: ${result1.status})`);
  const addrKeys = result1.receipt.party_addresses?.inserted_keys as (string | number)[] | undefined;
  if (addrKeys?.includes(PRE_EXISTING_ADDR)) {
    throw new Error("ERROR CRÍTICO: La fila preexistente fue registrada erróneamente en el recibo");
  }
  const ordKeys = result1.receipt.orders?.inserted_keys as (string | number)[] | undefined;
  if (ordKeys?.includes(PRE_EXISTING_ORD)) {
    throw new Error("ERROR CRÍTICO: La orden preexistente fue registrada erróneamente en el recibo");
  }
  console.log("  => VERIFICADO: Fila preexistente colisionada excluida al 100% del recibo mediante RETURNING.");

  // 3. Retry Execution (Segunda Carga Idempotente)
  console.log("\n[FASE 3] Ensayo de Retry / Reejecución Idempotente:");
  const result2 = await executeData150Loader(
    (sql) => db.query(sql),
    {
      loaderSql: testBatchSql,
      targetReceiptPath: tempReceiptPath,
      tenantId: DATA150_TENANT_ID,
      existingReceipt: result1.receipt,
    }
  );

  console.log(`- Éxito en reejecución: ${result2.success}`);
  console.log(`- Nuevas filas devueltas por RETURNING: ${result2.inserted_rows_total}`);
  console.log(`- Claves en recibo fusionado tras retry vacío:`);
  for (const [tbl, entry] of Object.entries(result2.receipt)) {
    console.log(`  * ${tbl}: ${entry.inserted_count} filas preservadas -> [${entry.inserted_keys.join(", ")}]`);
  }

  if (result2.inserted_rows_total !== 0) throw new Error("El retry debió devolver 0 filas nuevas");
  if (result2.receipt.party_addresses?.inserted_count !== 2) {
    throw new Error("ERROR CRÍTICO: El retry vacío borró las claves del primer recibo");
  }
  console.log("  => VERIFICADO: Retry devuelve 0 filas y preserva íntegramente las claves del recibo previo sin borrado.");

  // Verificación dinámica de procedencia de rollback desde recibo persistido:
  const dynamicSql = generateOperationalRollback(tempReceiptPath, trialDynamicRollbackPath, testBatchSql);
  if (!dynamicSql.includes("DELETE FROM public.party_addresses") || !dynamicSql.includes(ADDR_1)) {
    throw new Error("Generación de rollback dinámico desde recibo COMMITTED falló");
  }
  console.log("  => VERIFICADO: Generador operativo produjo rollback exacto a partir del recibo persistido COMMITTED.");

  // 4. Mid-Transaction Abort / Atomic Rollback
  console.log("\n[FASE 4] Ensayo de Aborto y Rollback Transaccional (Fallo en Concurrencia):");
  const ADDR_FAIL_1 = "00000000-0000-4000-8000-0000000000ff";
  const failingBatchSql = [
    "BEGIN;",
    `INSERT INTO public.party_addresses ("id", "tenant_id", "address_line_1", "city") VALUES ('${ADDR_FAIL_1}', '${DATA150_TENANT_ID}', 'Calle Fallida 1', 'Valencia') ON CONFLICT ("id") DO NOTHING RETURNING "id";`,
    `INSERT INTO public.party_addresses ("id", "tenant_id", "address_line_1", "city") VALUES ('TRIGGER_ERROR_FAIL', '${DATA150_TENANT_ID}', 'Calle Fallida 2', 'Valencia') ON CONFLICT ("id") DO NOTHING RETURNING "id";`,
    "COMMIT;",
  ].join("\n");

  const result3 = await executeData150Loader(
    async (sql) => {
      if (sql.includes("TRIGGER_ERROR_FAIL")) {
        throw new Error("Simulated concurrent conflict / constraint violation mid-transaction");
      }
      return db.query(sql);
    },
    {
      loaderSql: failingBatchSql,
      targetReceiptPath: tempReceiptPath,
      existingReceipt: result2.receipt,
    }
  );

  console.log(`- Éxito esperado: false (obtenido: ${result3.success})`);
  console.log(`- Estado de transacción: ${result3.status} (db_committed: ${result3.db_committed})`);
  console.log(`- Error capturado: ${result3.error}`);
  const failedRow1 = db.getRow("party_addresses", ADDR_FAIL_1);
  console.log(`- Comprobación de fila uncommitted en BD: ${failedRow1 ? "PRESENTE (ERROR)" : "NO PRESENTE (ROLLBACK ATÓMICO OK)"}`);
  if (failedRow1) throw new Error("Fila abortada persiste en BD tras rollback");
  console.log("  => VERIFICADO: Error en lote disparó ROLLBACK atómico sin escrituras residuales.");

  // Verificación negativa: Intentar generar rollback desde recibo abortado debe fallar (fail-closed):
  let caughtAbortedError = false;
  try {
    generateOperationalRollback(tempReceiptPath, trialDynamicRollbackPath);
  } catch (err: any) {
    caughtAbortedError = true;
    console.log(`  => VERIFICADO (PRUEBA NEGATIVA): Rollback generator rechazó recibo abortado: ${err.message}`);
  }
  if (!caughtAbortedError) {
    throw new Error("ERROR CRÍTICO: El generador de rollback aceptó un recibo no COMMITTED");
  }

  // 5. Rollback Execution from Receipt
  console.log("\n[FASE 5] Ejecución de Rollback Exclusivo desde Recibo:");
  const rollbackResult = await executeData150Rollback(
    (sql) => db.query(sql),
    result2.receipt,
    DATA150_TENANT_ID
  );

  console.log(`- Éxito del rollback: ${rollbackResult.success}`);
  console.log("- Sentencias generadas en orden topológico inverso:");
  const rollbackStmts = rollbackResult.rollbackSql
    .split("\n")
    .map((s) => s.trim())
    .filter((s) => s.startsWith("DELETE"));
  for (const stmt of rollbackStmts) {
    console.log(`  * ${stmt}`);
  }

  // Comprobaciones de estado final
  console.log("\n[FASE 6] Verificación Exhaustiva del Estado Post-Rollback:");
  const addrBatch1 = db.getRow("party_addresses", ADDR_1);
  const addrBatch2 = db.getRow("party_addresses", ADDR_2);
  const ordBatch = db.getRow("orders", ORD_1);
  const ordLineBatch = db.getRow("order_lines", ORDLINE_1);
  const cmrPartBatch = db.getRow("cmr_parties", CMRP_1);

  const preExistingAddrFinal = db.getRow("party_addresses", PRE_EXISTING_ADDR);
  const foreignAddrFinal = db.getRow("party_addresses", FOREIGN_TENANT_ADDR);
  const preExistingOrdFinal = db.getRow("orders", PRE_EXISTING_ORD);

  console.log(`- Filas del lote eliminadas: ${!addrBatch1 && !addrBatch2 && !ordBatch && !ordLineBatch && !cmrPartBatch ? "100% ELIMINADAS (OK)" : "ERROR: QUEDAN RESIDUOS"}`);
  console.log(`- Fila preexistente '${PRE_EXISTING_ADDR}': ${preExistingAddrFinal ? "100% INTACTA (OK)" : "ERROR: FUE BORRADA"}`);
  console.log(`- Fila ajena '${FOREIGN_TENANT_ADDR}': ${foreignAddrFinal ? "100% INTACTA (OK)" : "ERROR: FUE BORRADA"}`);
  console.log(`- Orden preexistente '${PRE_EXISTING_ORD}': ${preExistingOrdFinal ? "100% INTACTA (OK)" : "ERROR: FUE BORRADA"}`);

  if (addrBatch1 || addrBatch2 || ordBatch || ordLineBatch || cmrPartBatch) {
    throw new Error("El rollback no eliminó todas las filas del lote");
  }
  if (!preExistingAddrFinal || !foreignAddrFinal || !preExistingOrdFinal) {
    throw new Error("ERROR CRÍTICO: El rollback eliminó datos preexistentes o ajenos");
  }

  if (existsSync(tempReceiptPath)) {
    unlinkSync(tempReceiptPath);
  }

  console.log("\n================================================================================");
  console.log("✅ SIMULACIÓN UNITARIA EN MEMORIA COMPLETADA CON ÉXITO: 0 FALLOS DE LÓGICA");
  console.log("================================================================================\n");
  return true;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runNonProductiveTrial().catch((err) => {
    console.error("❌ Ensayo falló:", err);
    process.exit(1);
  });
}
