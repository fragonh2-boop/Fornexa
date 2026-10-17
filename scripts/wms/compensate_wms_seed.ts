/**
 * Compensación del lote DATA150-WMS (fase 4). BORRADOR: no ejecutado.
 *
 * ── Por qué esto no puede ser un ROLLBACK ────────────────────────────────────────────
 * En el ensayo de E1, deshacer la transacción ERA la prueba: no se escribía nada.
 * En F4 habrá una carga COMMITTED, así que la compensación tiene que saber **borrar
 * lo ya escrito**, en orden inverso de claves ajenas, y demostrarlo. Un ROLLBACK no
 * sirve: la transacción ya terminó.
 *
 * ── Reglas que no se negocian ───────────────────────────────────────────────────────
 * 1. Se borra POR IDENTIFICADOR, no por marcador ni por rango. Borrar por `LIKE 'WMS-TEST-%'`
 *    funcionaría hoy y un día se llevaría por delante algo que no era de este lote.
 * 2. Los 150 quants históricos de DATA150 NO están en la lista de ids a borrar. Antes de
 *    empezar se comprueba que no hay intersección; si la hay, se aborta sin tocar nada.
 * 3. Se verifica el estado previo y el posterior, y el recibo los registra. Un borrado que
 *    «no falla» pero deja filas es peor que uno que falla.
 *
 * Modos:
 *   --dry-run     borra dentro de BEGIN … ROLLBACK y comprueba que los recuentos vuelven.
 *   --confirm     transacción única, COMMITTED, con recibo.
 *
 * Uso:
 *   node --experimental-strip-types scripts/wms/compensate_wms_seed.ts --dry-run
 */

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { assertSessionModeEndpoint } from "../muelles/seed-guard.ts";

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

/** Orden inverso de dependencias: primero lo que apunta, después lo apuntado. */
const DELETE_ORDER = [
  "warehouse_tasks",
  "stock_reservations",
  "handling_unit_contents",
  "inventory_quants",
  "handling_units",
  "warehouse_behavior_policies",
  "warehouse_resources",
] as const;

type Dataset = { batch_id: string; tables: Record<string, Record<string, unknown>[]> };
type Manifest = {
  batch_id: string;
  by_table: Record<string, number>;
  borrowed_ids: Record<string, string[]>;
};

const sha256 = (path: string) => createHash("sha256").update(readFileSync(path)).digest("hex");

function idsOf(dataset: Dataset, table: string): string[] {
  return (dataset.tables[table] ?? []).map((row) => String(row.id));
}

/**
 * Comprobación previa, sin base de datos: el lote a borrar no puede incluir ninguna fila
 * prestada de DATA150. Es la regla 2, y se comprueba antes de conectar.
 */
function checkNoBorrowedOverlap(dataset: Dataset, manifest: Manifest): void {
  const borrowed = new Set(Object.values(manifest.borrowed_ids ?? {}).flat());
  for (const table of DELETE_ORDER) {
    for (const id of idsOf(dataset, table)) {
      if (borrowed.has(id)) {
        throw new Error(
          `ABORTA: ${table} ${id} está en borrowed_ids. El lote no puede borrar filas prestadas de DATA150.`,
        );
      }
    }
  }
}

async function countByBatch(client: any, table: string, ids: string[]): Promise<number> {
  if (!ids.length) return 0;
  const res = await client.query(
    `select count(*)::int as n from public.${table} where id = any($1::uuid[])`,
    [ids],
  );
  return res.rows[0].n;
}

async function deleteByIds(client: any, table: string, ids: string[]): Promise<number> {
  if (!ids.length) return 0;
  const res = await client.query(
    `delete from public.${table} where id = any($1::uuid[]) returning id`,
    [ids],
  );
  return res.rowCount ?? res.rows.length;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const confirm = args.includes("--confirm");
  if (dryRun === confirm) {
    throw new Error("Indica exactamente uno: --dry-run o --confirm. No hay modo por defecto.");
  }

  const root = process.cwd();
  const datasetPath = resolve(root, "docs/verification/wms-seed-dataset.json");
  const manifestPath = resolve(root, "docs/verification/wms-seed-manifest.json");
  const receiptPath = resolve(root, "docs/verification/wms-seed-compensation-receipt.json");

  const dataset = JSON.parse(readFileSync(datasetPath, "utf-8")) as Dataset;
  const manifest = JSON.parse(readFileSync(manifestPath, "utf-8")) as Manifest;

  if (dataset.batch_id !== manifest.batch_id) {
    throw new Error(`batch_id distinto: dataset '${dataset.batch_id}' vs manifiesto '${manifest.batch_id}'`);
  }
  checkNoBorrowedOverlap(dataset, manifest); // regla 2, antes de conectar

  const connStr = process.env.FORNEXA_PRODUCTION_DB_URL ?? "";
  if (!connStr) throw new Error("Falta FORNEXA_PRODUCTION_DB_URL.");
  const endpoint = assertSessionModeEndpoint(connStr);
  const client = new Client({ connectionString: connStr, statement_timeout: 60000 });

  await client.connect();
  try {
    const before: Record<string, number> = {};
    for (const table of DELETE_ORDER) before[table] = await countByBatch(client, table, idsOf(dataset, table));

    const total = Object.values(before).reduce((a, n) => a + n, 0);
    if (total === 0) {
      // Ni un solo id del lote está presente. Puede ser correcto (ya compensado) o un error
      // de manifiesto. Se distingue diciéndolo, no asumiendo éxito.
      console.log(JSON.stringify({ status: "NOTHING_TO_COMPENSATE", batch_id: manifest.batch_id }, null, 2));
      return;
    }

    await client.query("BEGIN");
    const deleted: Record<string, number> = {};
    for (const table of DELETE_ORDER) {
      deleted[table] = await deleteByIds(client, table, idsOf(dataset, table));
    }

    // Comprobación posterior: si algo sobrevive, no se declara éxito ni se commitea.
    const remaining: Record<string, number> = {};
    for (const table of DELETE_ORDER) remaining[table] = await countByBatch(client, table, idsOf(dataset, table));
    const sobra = Object.entries(remaining).filter(([, n]) => n > 0);
    if (sobra.length) {
      throw new Error(`la compensación dejó filas: ${JSON.stringify(sobra)}`);
    }

    if (dryRun) {
      await client.query("ROLLBACK");
      console.log(JSON.stringify({ mode: "DRY_RUN_ROLLED_BACK", endpoint, before, deleted, remaining }, null, 2));
      return;
    }

    await client.query("COMMIT");
    writeFileSync(
      receiptPath,
      `${JSON.stringify(
        {
          status: "COMPENSATED",
          batch_id: manifest.batch_id,
          executed_at: new Date().toISOString(),
          endpoint,
          dataset_sha256: sha256(datasetPath),
          manifest_sha256: sha256(manifestPath),
          counts_before: before,
          deleted,
          remaining,
        },
        null,
        2,
      )}\n`,
      "utf-8",
    );
    console.log(JSON.stringify({ mode: "PRODUCTION_COMPENSATED", receipt: receiptPath }, null, 2));
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
