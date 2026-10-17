/**
 * Compensación del lote DATA150-WMS, compartida por el ensayo y por el script de compensación.
 *
 * ── Por qué es un módulo y no un bucle dentro del cargador ─────────────────────────
 * MUST-3 del dictamen de Claude: lo que se ensayaba era un bucle propio del cargador que
 * solo comprobaba `handling_units`, mientras `compensate_wms_seed.ts` —el que se ejecutaría
 * de verdad— no se ejercitaba nunca. Ensayar una cosa y ejecutar otra es la forma más
 * elegante de que el ensayo no sirva. Ahora hay una sola implementación y la usan los dos.
 *
 * ── Reglas ─────────────────────────────────────────────────────────────────────────
 * 1. Se borra por IDENTIFICADOR, nunca por marcador ni por rango.
 * 2. El orden es el inverso de las claves ajenas, verificado contra la migración:
 *    `inventory_quants` referencia `handling_units` por `hu_id`, así que va antes;
 *    `warehouse_tasks` referencia `warehouse_resources`, así que va antes.
 * 3. Después de borrar se recuentan TODAS las tablas por id. Si alguna conserva filas, la
 *    compensación ha fallado y quien llama no debe commitear.
 */

export const COMPENSATION_ORDER = [
  "warehouse_tasks",
  "stock_reservations",
  "handling_unit_contents",
  "inventory_quants",
  "handling_units",
  "warehouse_behavior_policies",
  "warehouse_resources",
] as const;

export type CompensationTable = (typeof COMPENSATION_ORDER)[number];

export type Dataset = {
  batch_id: string;
  tables: Record<string, Record<string, unknown>[]>;
};

export type CompensationResult = {
  deleted: Record<string, number>;
  remaining: Record<string, number>;
};

type Client = { query: (sql: string, params?: unknown[]) => Promise<{ rows: any[]; rowCount?: number | null }> };

export function idsOf(dataset: Dataset, table: string): string[] {
  return (dataset.tables[table] ?? []).map((row) => String(row.id));
}

async function countByIds(client: Client, table: string, ids: string[]): Promise<number> {
  if (!ids.length) return 0;
  const res = await client.query(`select count(*)::int as n from public.${table} where id = any($1::uuid[])`, [ids]);
  return res.rows[0].n;
}

async function deleteByIds(client: Client, table: string, ids: string[]): Promise<number> {
  if (!ids.length) return 0;
  const res = await client.query(`delete from public.${table} where id = any($1::uuid[]) returning id`, [ids]);
  return res.rowCount ?? res.rows.length;
}

/** Recuento por id de todas las tablas del lote. Sirve de línea base y de verificación. */
export async function countBatch(client: Client, dataset: Dataset): Promise<Record<string, number>> {
  const counts: Record<string, number> = {};
  for (const table of COMPENSATION_ORDER) {
    counts[table] = await countByIds(client, table, idsOf(dataset, table));
  }
  return counts;
}

/**
 * Borra el lote y comprueba que no queda nada. NO abre transacción: la abre quien llama,
 * porque el ensayo lo hace dentro de su `BEGIN … ROLLBACK` y la compensación real dentro de
 * la suya. Una función que gestiona su propia transacción no se puede ensayar.
 */
export async function compensateBatch(client: Client, dataset: Dataset): Promise<CompensationResult> {
  const deleted: Record<string, number> = {};
  for (const table of COMPENSATION_ORDER) {
    deleted[table] = await deleteByIds(client, table, idsOf(dataset, table));
  }

  // Se recuenta TODO, no solo `handling_units`: una tabla con filas supervivientes es una
  // compensación fallida aunque la principal esté vacía.
  const remaining = await countBatch(client, dataset);
  const sobra = Object.entries(remaining).filter(([, n]) => n > 0);
  if (sobra.length) {
    throw new Error(`la compensación dejó filas: ${JSON.stringify(sobra)}`);
  }
  return { deleted, remaining };
}

/** Igual que `compensateBatch` pero sin borrar: solo comprueba que el lote está entero. */
export async function assertBatchComplete(client: Client, dataset: Dataset): Promise<Record<string, number>> {
  const counts = await countBatch(client, dataset);
  const faltan = Object.entries(counts).filter(([, n], i) => n === 0 && idsOf(dataset, COMPENSATION_ORDER[i]).length > 0);
  if (faltan.length) {
    throw new Error(`el lote no está completo antes de compensar: ${JSON.stringify(faltan)}`);
  }
  return counts;
}
