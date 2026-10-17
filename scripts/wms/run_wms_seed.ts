/**
 * Ejecutor del lote DATA150-WMS (fase 4). BORRADOR: no ejecutado.
 *
 * Sigue el patrón que funcionó en Muelles y corrige sus dos MUST:
 *   - guard de endpoint obligatorio (reutiliza scripts/muelles/seed-guard.ts, ya en main)
 *   - `pg` resuelto como dependencia del proyecto, sin rutas en /private/tmp
 *
 * Y añade lo que allí faltó:
 *   - la PRIMERA comprobación no toca la base: valida que el manifiesto y el plan
 *     no se contradigan. Es el fallo que más se ha repetido en este expediente.
 *   - no injerencia comprobada POR ID, no por recuento global.
 *
 * Modos:
 *   --dry-run-rehearsal   carga completa dentro de BEGIN…ROLLBACK, incluida la
 *                         compensación. Si algo falla, no se ha escrito nada.
 *   --confirm-production  transacción única, COMMITTED, recibo durable.
 *
 * Uso:
 *   node --experimental-strip-types scripts/wms/run_wms_seed.ts --dry-run-rehearsal
 */

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { assertSessionModeEndpoint } from "../muelles/seed-guard.ts";
import { probeTenantIsolation, assertEvidenceComplete } from "./isolation-probe.ts";
import { compensateBatch, countBatch } from "./compensation.ts";
import { probeRejections } from "./rejection-probe.ts";

const require = createRequire(import.meta.url);

function loadPg(): { Client: new (config: unknown) => any } {
  try {
    return require("pg");
  } catch {
    const override = process.env.FORNEXA_PG_MODULE;
    if (override) return require(override);
    throw new Error("No se encontró 'pg': instala dependencias o define FORNEXA_PG_MODULE.");
  }
}

const { Client } = loadPg();

const TENANT = "00000000-0000-4000-8000-000000000001";
const TABLES = [
  "handling_units",
  "handling_unit_contents",
  "inventory_quants",
  "stock_reservations",
  "warehouse_tasks",
  "warehouse_behavior_policies",
  "warehouse_resources",
] as const;

type Dataset = { batch_id: string; tables: Record<string, Record<string, unknown>[]> };
type Manifest = {
  batch_id: string;
  total_rows: number;
  by_table: Record<string, number>;
  by_delivery: Record<string, number>;
  borrowed_ids: Record<string, string[]>;
};

const sha256 = (path: string) => createHash("sha256").update(readFileSync(path)).digest("hex");

/**
 * Comprobación 0: manifiesto y dataset no se contradicen, y ningún estado sale del
 * dominio. Se ejecuta ANTES de conectar y no necesita base de datos.
 */
function checkPlanIntegrity(dataset: Dataset, manifest: Manifest): void {
  if (dataset.batch_id !== manifest.batch_id) {
    throw new Error(`batch_id distinto: dataset '${dataset.batch_id}' vs manifiesto '${manifest.batch_id}'`);
  }
  for (const table of TABLES) {
    // Una tabla ausente en AMBOS lados daría 0 === 0 y pasaría: se exige presencia explícita.
    if (!(table in dataset.tables)) throw new Error(`${table}: falta en el dataset`);
    if (!(table in manifest.by_table)) throw new Error(`${table}: falta en el manifiesto`);
    const rows = dataset.tables[table].length;
    const declared = manifest.by_table[table];
    if (rows !== declared) {
      throw new Error(`${table}: el dataset trae ${rows} filas y el manifiesto declara ${declared}`);
    }
  }
  const total = Object.values(manifest.by_table).reduce((acc, n) => acc + n, 0);
  if (total !== manifest.total_rows) {
    throw new Error(`el manifiesto se contradice: suma por tabla ${total} vs total ${manifest.total_rows}`);
  }
  // El lote admite dos formas y la comprobación debe admitirlas AMBAS:
  //   · sólo E1 → 130 escenarios (el escenario 4 es de E2 y necesita replenishment_rules)
  //   · E1 + E2 → 150 escenarios
  // Exigir siempre 150 rechazaba el modo por defecto, que es precisamente el que se usa
  // mientras E2 no exista.
  const e1 = manifest.by_delivery?.E1 ?? 0;
  const e2 = manifest.by_delivery?.E2 ?? 0;
  if (e2 !== 0 && e2 !== 20) {
    throw new Error(`E2 debe ser 0 (lote E1) o 20 (lote completo); es ${e2}`);
  }
  const esperado = e2 === 0 ? 130 : 150;
  if (e1 + e2 !== esperado) {
    throw new Error(
      `el reparto por entrega no suma los ${esperado} escenarios del modo declarado: E1=${e1} E2=${e2}`,
    );
  }
}

/** Hashes de las filas prestadas: se comparan antes y después para probar no injerencia. */
async function hashBorrowed(client: any, borrowed: Record<string, string[]>): Promise<Record<string, string>> {
  const fingerprints: Record<string, string> = {};
  for (const [table, ids] of Object.entries(borrowed)) {
    if (!ids.length) continue;
    const res = await client.query(
      `select coalesce(string_agg(t::text, '|' order by t.id), '') as h
         from public.${table} t where t.id = any($1::uuid[])`,
      [ids],
    );
    fingerprints[`${table}:${ids.length}`] = createHash("sha256").update(res.rows[0].h).digest("hex");
  }
  return fingerprints;
}

/**
 * Ejecuta la sonda de aislamiento y la DESHACE. La sonda crea un tenant B para poder
 * distinguir «devuelve defaults» de «devuelve una política ajena»; en una carga COMMITTED
 * ese tenant no debe sobrevivir, así que todo va dentro de un savepoint que se revierte.
 */
async function runIsolationProbe(client: any): Promise<unknown> {
  await client.query("SAVEPOINT wms_isolation_probe");
  let evidence: unknown;
  try {
    evidence = await probeTenantIsolation(client);
  } finally {
    await client.query("ROLLBACK TO SAVEPOINT wms_isolation_probe");
    await client.query("RELEASE SAVEPOINT wms_isolation_probe");
  }
  return evidence;
}

/** Actor con permisos para ejecutar las acciones del ensayo. */
async function actorIdOf(client: any): Promise<string> {
  const res = await client.query(
    `select user_id from public.tenant_members
      where tenant_id = $1 and status = 'ACTIVE' and role in ('OWNER','ADMIN') limit 1`,
    [TENANT],
  );
  if (!res.rows[0]?.user_id) {
    throw new Error("no hay ningún actor OWNER/ADMIN en el tenant: los rechazos no se pueden ejercitar");
  }
  return res.rows[0].user_id;
}

async function countBy(client: any, table: string): Promise<number> {
  const res = await client.query(`select count(*)::int as n from public.${table} where tenant_id = $1`, [TENANT]);
  return res.rows[0].n;
}

async function insertAll(client: any, dataset: Dataset): Promise<Record<string, number>> {
  const inserted: Record<string, number> = {};
  for (const table of TABLES) {
    const rows = dataset.tables[table] ?? [];
    inserted[table] = 0;
    for (const row of rows) {
      const cols = Object.keys(row);
      const values = cols.map((_, i) => `$${i + 1}`);
      const res = await client.query(
        `insert into public.${table} (${cols.join(", ")}) values (${values.join(", ")}) returning id`,
        cols.map((c) => row[c]),
      );
      if (res.rows[0]?.id) inserted[table] += 1;
    }
  }
  return inserted;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const rehearsal = args.includes("--dry-run-rehearsal");
  const confirm = args.includes("--confirm-production");
  if (!rehearsal && !confirm) {
    throw new Error("Indica --dry-run-rehearsal o --confirm-production. No hay modo por defecto.");
  }

  const root = process.cwd();
  const datasetPath = resolve(root, "docs/verification/wms-seed-dataset.json");
  const manifestPath = resolve(root, "docs/verification/wms-seed-manifest.json");
  const receiptPath = resolve(root, "docs/verification/wms-seed-execution-receipt.json");
  // El ensayo y la carga NO comparten fichero de recibo: uno acredita que se deshizo todo
  // y el otro que se escribió. Mezclarlos haría que un artefacto de ensayo pudiera leerse
  // como prueba de una carga, que es justo lo que no queremos.
  const rehearsalReceiptPath = resolve(root, "docs/verification/wms-seed-rehearsal-receipt.json");

  const dataset = JSON.parse(readFileSync(datasetPath, "utf-8")) as Dataset;
  const manifest = JSON.parse(readFileSync(manifestPath, "utf-8")) as Manifest;

  // Comprobación 0: sin base de datos.
  checkPlanIntegrity(dataset, manifest);

  const connStr = process.env.FORNEXA_PRODUCTION_DB_URL ?? "";
  if (!connStr) throw new Error("Falta FORNEXA_PRODUCTION_DB_URL.");
  const endpoint = assertSessionModeEndpoint(connStr); // lanza si es el pooler transaccional
  const client = new Client({ connectionString: connStr, statement_timeout: 60000 });

  await client.connect();
  try {
    const before: Record<string, number> = {};
    for (const table of TABLES) before[table] = await countBy(client, table);
    const borrowedBefore = await hashBorrowed(client, manifest.borrowed_ids ?? {});

    // Los 150 quants históricos de DATA150 se comprueban POR ID y deben seguir en NULL.
    const legacyIds = manifest.borrowed_ids?.inventory_quants ?? [];
    if (legacyIds.length !== 150) {
      // La comprobación de los 150 quants históricos es el invariante central (REJ-03).
      // Si el manifiesto no los trae, no se salta: se aborta.
      throw new Error(`el manifiesto debe traer los 150 ids históricos de inventory_quants; trae ${legacyIds.length}`);
    }
    const legacyBefore = legacyIds.length
      ? (
          await client.query(
            `select count(*)::int as n from public.inventory_quants
              where id = any($1::uuid[]) and flow_state is null`,
            [legacyIds],
          )
        ).rows[0].n
      : 0;
    if (legacyIds.length && legacyBefore !== legacyIds.length) {
      throw new Error(`preflight: ${legacyBefore}/${legacyIds.length} quants históricos estaban en NULL antes del lote`);
    }

    await client.query("BEGIN");
    const inserted = await insertAll(client, dataset);

    for (const table of TABLES) {
      if (inserted[table] !== manifest.by_table[table]) {
        throw new Error(`${table}: insertadas ${inserted[table]} de ${manifest.by_table[table]}`);
      }
    }

    // La evidencia de aislamiento va en el recibo, no en la cabeza de quien lo lee.
    const isolation = await runIsolationProbe(client);
    // La evidencia no solo se produce: se comprueba que está completa antes de seguir.
    // Si faltara una pieza, el recibo sería un objeto a medias que parece válido.
    assertEvidenceComplete(isolation as any);

    if (rehearsal) {
      // MUST-5: los siete rechazos se ejercitan con el lote ya dentro.
      const rejections = await probeRejections(client, { tenantId: TENANT, actorId: await actorIdOf(client) });

      // MUST-3: se ensaya la MISMA compensación que se ejecutaría de verdad, no un bucle
      // paralelo. Y se comprueban TODAS las tablas por id, no solo handling_units: una
      // tabla con filas supervivientes es una compensación fallida aunque la principal esté vacía.
      const antesDeCompensar = await countBatch(client, dataset);
      const { deleted } = await compensateBatch(client, dataset);
      const despuesDeCompensar = await countBatch(client, dataset);
      const supervivientes = Object.entries(despuesDeCompensar).filter(([, n]) => n > 0);
      if (supervivientes.length) {
        throw new Error(`la compensación dejó filas: ${JSON.stringify(supervivientes)}`);
      }
      for (const [table, n] of Object.entries(antesDeCompensar)) {
        if (n !== (deleted as Record<string, number>)[table]) {
          throw new Error(`${table}: había ${n} filas del lote y se borraron ${(deleted as Record<string, number>)[table]}`);
        }
      }
      await client.query("ROLLBACK");
      const rehearsalReceipt = {
        status: "REHEARSAL_ROLLED_BACK",
        mode: "BEGIN_ROLLBACK_ONLY",
        batch_id: manifest.batch_id,
        executed_at: new Date().toISOString(),
        endpoint,
        dataset_sha256: sha256(datasetPath),
        manifest_sha256: sha256(manifestPath),
        committed_writes: 0,
        counts_before: before,
        inserted,
        borrowed_fingerprints: borrowedBefore,
        isolation,
        rejections,
        compensation: { before: antesDeCompensar, deleted, remaining: despuesDeCompensar },
      };
      // El ensayo escribe su recibo igual que la carga: sin él, el workflow no tiene nada
      // que publicar y un ensayo correcto se queda sin evidencia.
      writeFileSync(rehearsalReceiptPath, `${JSON.stringify(rehearsalReceipt, null, 2)}\n`, "utf-8");
      console.log(JSON.stringify(rehearsalReceipt, null, 2));
      return;
    }

    // MUST-4: la no injerencia se comprueba ANTES de confirmar. Comprobarla después del
    // COMMIT es comprobar un daño ya escrito: el error llega cuando ya no se puede deshacer.
    const borrowedAfter = await hashBorrowed(client, manifest.borrowed_ids ?? {});
    if (JSON.stringify(borrowedBefore) !== JSON.stringify(borrowedAfter)) {
      throw new Error("INJERENCIA: cambió el hash de filas prestadas de DATA150 (no se confirma nada)");
    }
    const legacyAfter = legacyIds.length
      ? (
          await client.query(
            `select count(*)::int as n from public.inventory_quants
              where id = any($1::uuid[]) and flow_state is null`,
            [legacyIds],
          )
        ).rows[0].n
      : 0;
    if (legacyIds.length && legacyAfter !== legacyIds.length) {
      throw new Error(
        `INJERENCIA: ${legacyAfter}/${legacyIds.length} quants históricos conservan NULL (no se confirma nada)`,
      );
    }

    await client.query("COMMIT");

    const after: Record<string, number> = {};
    for (const table of TABLES) after[table] = await countBy(client, table);

    writeFileSync(
      receiptPath,
      `${JSON.stringify(
        {
          status: "COMMITTED",
          batch_id: manifest.batch_id,
          executed_at: new Date().toISOString(),
          endpoint,
          dataset_sha256: sha256(datasetPath),
          manifest_sha256: sha256(manifestPath),
          counts_before: before,
          counts_after: after,
          borrowed_fingerprints: borrowedAfter,
          isolation,
          legacy_quants_null: { before: legacyBefore, after: legacyAfter },
        },
        null,
        2,
      )}\n`,
      "utf-8",
    );
    console.log(JSON.stringify({ mode: "PRODUCTION_COMMITTED", receipt: receiptPath }, null, 2));
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    await client.end().catch(() => {});
  }
}

main().catch((error) => {
  console.error("ERROR:", error instanceof Error ? error.message : String(error));
  process.exit(1);
});
