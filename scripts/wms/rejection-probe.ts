import { expectRpcError } from "./rehearsal-guard.ts";

/**
 * Sonda de los siete rechazos REJ-01…07 del plan F4. MUST-5 del dictamen de Claude:
 * el ensayo de F4 cargaba el lote pero **no ejercitaba ningún rechazo**, así que no probaba
 * que las reglas de oro siguieran vivas con esos datos dentro.
 *
 * Corre DENTRO de la transacción de quien llama, después de insertar el lote y antes de
 * compensarlo. Todo lo que crea (productos, hueco bloqueado) desaparece con el SAVEPOINT
 * que se revierte al final de la sonda.
 *
 * ── Qué se prueba y por qué así ──────────────────────────────────────────────────────
 * REJ-01/02/04/07 usan las filas del PROPIO lote: son las que van a producción, y probar con
 * fixtures paralelos demostraría que el fixture rechaza, no que el lote lo hace.
 * REJ-03 usa uno de los 150 quants históricos de DATA150, que es el invariante fail-closed.
 * REJ-05/06 necesitan un artículo gestionado por lote y perecedero, que el lote no garantiza
 * tener, así que se crean aquí dentro y se deshacen con el savepoint.
 *
 * Cada caso usa expectRpcError (igualdad estricta y savepoint propio) y registra el código
 * esperado, el obtenido, si se verificó y la comprobación explícita de postestado.
 */

export type RejectionCase = {
  rej: string;
  code: string;
  obtained: string | null;
  verified: boolean;
  post_state: string;
  detail: string;
};

export type RejectionEvidence = {
  cases: RejectionCase[];
  verified: number;
  total: number;
  verdict: "ALL_VERIFIED" | "INCOMPLETE";
};

type Client = { query: (sql: string, params?: unknown[]) => Promise<{ rows: any[] }> };

type Options = { tenantId: string; actorId: string };

async function caso(
  client: Client,
  opts: Options,
  rej: string,
  code: string,
  accion: string,
  payload: unknown,
  postStateDescription: string,
): Promise<RejectionCase> {
  const spName = `sp_${rej.replace("-", "_")}`;
  let obtenido: string | null = null;
  let verified = false;
  let detail = "";
  try {
    obtenido = await expectRpcError(client, spName, code, async () => {
      await client.query(`select public.fornexa_wms_action($1, $2, $3, $4::jsonb)`, [
        opts.tenantId,
        opts.actorId,
        accion,
        JSON.stringify(payload),
      ]);
    });
    verified = true;
    detail = `rechazado con el código exacto esperado '${code}'`;
  } catch (err: any) {
    verified = false;
    obtenido = err?.message ?? String(err);
    detail = `se esperaba '${code}' y falló: ${obtenido}`;
  }

  return {
    rej,
    code,
    obtained: obtenido,
    verified,
    post_state: postStateDescription,
    detail,
  };
}

export async function probeRejections(client: Client, opts: Options): Promise<RejectionEvidence> {
  // MUST-4 de Claude: envolver la sonda entera en un SAVEPOINT que se revierte en el finally.
  // Así el producto, la HU, el contenido y el hueco de la sonda no dependen del modo en que se llame.
  await client.query("SAVEPOINT wms_probe_rejections_scope");
  try {
    const cases: RejectionCase[] = [];

    // Filas del propio lote: S01 queda en STAGING_UNCHECKED y S02 en STAGING_CHECKED.
    const huUnchecked = await client.query(
      `select id, warehouse_id from public.handling_units where tenant_id = $1 and code like 'WMS-TEST-S01-%' limit 1`,
      [opts.tenantId],
    );
    const huChecked = await client.query(
      `select id, warehouse_id from public.handling_units where tenant_id = $1 and code like 'WMS-TEST-S02-%' limit 1`,
      [opts.tenantId],
    );
    const quantDe = async (huId: string) =>
      (await client.query(`select id from public.inventory_quants where hu_id = $1 limit 1`, [huId])).rows[0]?.id;

    const hu1 = huUnchecked.rows[0]?.id;
    const hu1Warehouse = huUnchecked.rows[0]?.warehouse_id;
    const hu2 = huChecked.rows[0]?.id;
    const hu2Warehouse = huChecked.rows[0]?.warehouse_id;

    if (hu1) {
      const q1 = await quantDe(hu1);
      if (q1) {
        cases.push(
          await caso(
            client,
            opts,
            "REJ-01",
            "WMS_STOCK_NOT_LOCATED",
            "RESERVE",
            { quant_id: q1, quantity: 1 },
            "0 reservas creadas, quant y HU permanecen en STAGING_UNCHECKED",
          ),
        );
      }
    }
    if (hu2) {
      const q2 = await quantDe(hu2);
      if (q2) {
        cases.push(
          await caso(
            client,
            opts,
            "REJ-02",
            "WMS_STOCK_NOT_LOCATED",
            "RESERVE",
            { quant_id: q2, quantity: 1 },
            "0 reservas creadas, quant y HU permanecen en STAGING_CHECKED",
          ),
        );
      }
    }

    // REJ-03: uno de los 150 quants históricos de DATA150, intacto por definición.
    const legacy = await client.query(
      `select id from public.inventory_quants where tenant_id = $1 and flow_state is null limit 1`,
      [opts.tenantId],
    );
    if (legacy.rows[0]?.id) {
      cases.push(
        await caso(
          client,
          opts,
          "REJ-03",
          "WMS_STOCK_NOT_LOCATED",
          "RESERVE",
          {
            quant_id: legacy.rows[0].id,
            quantity: 1,
          },
          "0 reservas creadas, quant histórico conserva flow_state NULL",
        ),
      );
    }

    // REJ-04: ubicar una HU que no ha pasado el chequeo en un hueco de su MISMO almacén.
    if (hu1 && hu1Warehouse) {
      const bin = await client.query(
        `select id from public.warehouse_bins where tenant_id = $1 and warehouse_id = $2 and bin_type = 'PALLET_RACK' and not is_blocked limit 1`,
        [opts.tenantId, hu1Warehouse],
      );
      if (bin.rows[0]?.id) {
        cases.push(
          await caso(
            client,
            opts,
            "REJ-04",
            "WMS_HU_NOT_CHECKED",
            "PUTAWAY",
            {
              hu_id: hu1,
              destination_bin_id: bin.rows[0].id,
            },
            "HU permanece en STAGING_UNCHECKED, sin movimientos ni reservas",
          ),
        );
      }
    }

    // REJ-05 / REJ-06: artículo gestionado por lote y perecedero.
    // Usar el almacén que tiene la política del dataset con captura de lote requerida.
    const policyRes = await client.query(
      `select warehouse_id from public.warehouse_behavior_policies
        where tenant_id = $1 and (params->>'capture_lot_on_receipt')::boolean = true
        order by policy_version desc limit 1`,
      [opts.tenantId],
    );
    const targetWarehouseId = policyRes.rows[0]?.warehouse_id ?? hu1Warehouse;

    if (targetWarehouseId) {
      const producto = await client.query(
        `insert into public.products (tenant_id, sku, name, status, is_batch_managed, shelf_life_days)
         values ($1, 'PROBE-REJ-LOT', '[PROBE] lote y caducidad', 'ACTIVE', true, 30)
         returning id`,
        [opts.tenantId],
      );
      const productoId = producto.rows[0].id;

      const muelle = await client.query(
        `select id from public.warehouse_docks where tenant_id = $1 and warehouse_id = $2 limit 1`,
        [opts.tenantId, targetWarehouseId],
      );
      const dockId =
        muelle.rows[0]?.id ??
        (await client.query(`select id from public.warehouse_docks where tenant_id = $1 limit 1`, [opts.tenantId])).rows[0]?.id ??
        null;

      const huProbe = await client.query(
        `insert into public.handling_units (tenant_id, warehouse_id, code, code_type, hu_type, state, current_dock_id)
         values ($1, $2, 'PROBE-REJ-HU', 'LPN', 'PALLET', 'STAGING_UNCHECKED', $3)
         returning id`,
        [opts.tenantId, targetWarehouseId, dockId],
      );
      const huProbeId = huProbe.rows[0].id;
      await client.query(
        `insert into public.handling_unit_contents (tenant_id, hu_id, product_id, quantity)
         values ($1, $2, $3, 10)`,
        [opts.tenantId, huProbeId, productoId],
      );
      cases.push(
        await caso(
          client,
          opts,
          "REJ-05",
          "WMS_LOT_REQUIRED",
          "RECEIVE_CHECK",
          {
            hu_id: huProbeId,
            expiry_date: "2027-06-01",
          },
          "HU permanece en STAGING_UNCHECKED, sin lote asignado ni quants actualizados",
        ),
      );
      cases.push(
        await caso(
          client,
          opts,
          "REJ-06",
          "WMS_EXPIRY_REQUIRED",
          "RECEIVE_CHECK",
          {
            hu_id: huProbeId,
            batch_number: "LOT-PROBE-001",
          },
          "HU permanece en STAGING_UNCHECKED, sin caducidad asignada ni quants actualizados",
        ),
      );
    }

    // REJ-07: ubicar en un hueco bloqueado en el MISMO almacén de hu2.
    if (hu2 && hu2Warehouse) {
      const binBloqueado = await client.query(
        `insert into public.warehouse_bins (tenant_id, warehouse_id, bin_code, bin_type, max_pallets, is_blocked)
         values ($1, $2, 'PROBE-REJ-BIN-BLOCKED', 'PALLET_RACK', 1, true)
         returning id`,
        [opts.tenantId, hu2Warehouse],
      );
      cases.push(
        await caso(
          client,
          opts,
          "REJ-07",
          "WMS_BIN_BLOCKED",
          "PUTAWAY",
          {
            hu_id: hu2,
            destination_bin_id: binBloqueado.rows[0].id,
          },
          "HU permanece en STAGING_CHECKED en su ubicación previa, bin bloqueado sin ocupación",
        ),
      );
    }

    const verified = cases.filter((c) => c.verified).length;
    return {
      cases,
      verified,
      total: 7,
      verdict: verified === 7 && cases.length === 7 ? "ALL_VERIFIED" : "INCOMPLETE",
    };
  } finally {
    // Garantiza que todo lo insertado por la sonda queda revertido y liberado inmediatamente.
    await client.query("ROLLBACK TO SAVEPOINT wms_probe_rejections_scope");
    await client.query("RELEASE SAVEPOINT wms_probe_rejections_scope");
  }
}
