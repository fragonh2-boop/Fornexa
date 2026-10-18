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

type StateVerification<TPre, TPost> = {
  measurePre: () => Promise<TPre>;
  measurePost: () => Promise<TPost>;
  verify: (pre: TPre, post: TPost) => { valid: boolean; postState: string; failureReason?: string };
};

async function caso<TPre, TPost>(
  client: Client,
  opts: Options,
  rej: string,
  code: string,
  accion: string,
  payload: unknown,
  stateCheck: StateVerification<TPre, TPost>,
): Promise<RejectionCase> {
  const spName = `sp_${rej.replace("-", "_")}`;
  let obtenido: string | null = null;
  let verified = false;
  let detail = "";
  let postStateDescription = "no medido";

  let pre: TPre | undefined;
  try {
    pre = await stateCheck.measurePre();

    obtenido = await expectRpcError(client, spName, code, async () => {
      await client.query(`select public.fornexa_wms_action($1, $2, $3, $4::jsonb)`, [
        opts.tenantId,
        opts.actorId,
        accion,
        JSON.stringify(payload),
      ]);
    });

    const post = await stateCheck.measurePost();
    const check = stateCheck.verify(pre, post);
    postStateDescription = check.postState;

    if (!check.valid) {
      verified = false;
      detail = `rechazado con '${code}' pero el postestado falló: ${check.failureReason ?? "mutación inesperada"}`;
    } else {
      verified = true;
      detail = `rechazado con el código exacto esperado '${code}' y postestado verificado`;
    }
  } catch (err: any) {
    verified = false;
    obtenido = err?.message ?? String(err);
    detail = `se esperaba '${code}' y falló: ${obtenido}`;
    if (pre !== undefined) {
      try {
        const post = await stateCheck.measurePost();
        const check = stateCheck.verify(pre, post);
        postStateDescription = check.postState;
      } catch {
        // Ignorar fallo de medición secundaria
      }
    }
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
            {
              measurePre: async () => {
                const res = await client.query(
                  `select count(*)::int as count from public.stock_reservations where tenant_id = $1 and quant_id = $2`,
                  [opts.tenantId, q1],
                );
                const hu = await client.query(
                  `select state from public.handling_units where tenant_id = $1 and id = $2`,
                  [opts.tenantId, hu1],
                );
                const q = await client.query(
                  `select flow_state from public.inventory_quants where tenant_id = $1 and id = $2`,
                  [opts.tenantId, q1],
                );
                return {
                  reservations: res.rows[0]?.count ?? 0,
                  huState: hu.rows[0]?.state ?? null,
                  quantFlowState: q.rows[0]?.flow_state ?? null,
                };
              },
              measurePost: async () => {
                const res = await client.query(
                  `select count(*)::int as count from public.stock_reservations where tenant_id = $1 and quant_id = $2`,
                  [opts.tenantId, q1],
                );
                const hu = await client.query(
                  `select state from public.handling_units where tenant_id = $1 and id = $2`,
                  [opts.tenantId, hu1],
                );
                const q = await client.query(
                  `select flow_state from public.inventory_quants where tenant_id = $1 and id = $2`,
                  [opts.tenantId, q1],
                );
                return {
                  reservations: res.rows[0]?.count ?? 0,
                  huState: hu.rows[0]?.state ?? null,
                  quantFlowState: q.rows[0]?.flow_state ?? null,
                };
              },
              verify: (pre, post) => {
                const delta = post.reservations - pre.reservations;
                const valid =
                  delta === 0 &&
                  post.huState === pre.huState &&
                  post.huState === "STAGING_UNCHECKED" &&
                  post.quantFlowState === pre.quantFlowState &&
                  post.quantFlowState === "STAGING_UNCHECKED";
                const postState = `reservations_count=${post.reservations} (delta=${delta}), hu_state='${post.huState}' (pre='${pre.huState}'), quant_flow_state='${post.quantFlowState}' (pre='${pre.quantFlowState}')`;
                const failureReason = !valid
                  ? `mutación inesperada: delta_reservas=${delta}, hu_state=${post.huState} (pre=${pre.huState}), quant_flow_state=${post.quantFlowState} (pre=${pre.quantFlowState})`
                  : undefined;
                return { valid, postState, failureReason };
              },
            },
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
            {
              measurePre: async () => {
                const res = await client.query(
                  `select count(*)::int as count from public.stock_reservations where tenant_id = $1 and quant_id = $2`,
                  [opts.tenantId, q2],
                );
                const hu = await client.query(
                  `select state from public.handling_units where tenant_id = $1 and id = $2`,
                  [opts.tenantId, hu2],
                );
                const q = await client.query(
                  `select flow_state from public.inventory_quants where tenant_id = $1 and id = $2`,
                  [opts.tenantId, q2],
                );
                return {
                  reservations: res.rows[0]?.count ?? 0,
                  huState: hu.rows[0]?.state ?? null,
                  quantFlowState: q.rows[0]?.flow_state ?? null,
                };
              },
              measurePost: async () => {
                const res = await client.query(
                  `select count(*)::int as count from public.stock_reservations where tenant_id = $1 and quant_id = $2`,
                  [opts.tenantId, q2],
                );
                const hu = await client.query(
                  `select state from public.handling_units where tenant_id = $1 and id = $2`,
                  [opts.tenantId, hu2],
                );
                const q = await client.query(
                  `select flow_state from public.inventory_quants where tenant_id = $1 and id = $2`,
                  [opts.tenantId, q2],
                );
                return {
                  reservations: res.rows[0]?.count ?? 0,
                  huState: hu.rows[0]?.state ?? null,
                  quantFlowState: q.rows[0]?.flow_state ?? null,
                };
              },
              verify: (pre, post) => {
                const delta = post.reservations - pre.reservations;
                const valid =
                  delta === 0 &&
                  post.huState === pre.huState &&
                  post.huState === "STAGING_CHECKED" &&
                  post.quantFlowState === pre.quantFlowState &&
                  post.quantFlowState === "STAGING_CHECKED";
                const postState = `reservations_count=${post.reservations} (delta=${delta}), hu_state='${post.huState}' (pre='${pre.huState}'), quant_flow_state='${post.quantFlowState}' (pre='${pre.quantFlowState}')`;
                const failureReason = !valid
                  ? `mutación inesperada: delta_reservas=${delta}, hu_state=${post.huState} (pre=${pre.huState}), quant_flow_state=${post.quantFlowState} (pre=${pre.quantFlowState})`
                  : undefined;
                return { valid, postState, failureReason };
              },
            },
          ),
        );
      }
    }

    // REJ-03: uno de los 150 quants históricos de DATA150, intacto por definición.
    const legacy = await client.query(
      `select id from public.inventory_quants where tenant_id = $1 and flow_state is null limit 1`,
      [opts.tenantId],
    );
    const legacyId = legacy.rows[0]?.id;
    if (legacyId) {
      cases.push(
        await caso(
          client,
          opts,
          "REJ-03",
          "WMS_STOCK_NOT_LOCATED",
          "RESERVE",
          {
            quant_id: legacyId,
            quantity: 1,
          },
          {
            measurePre: async () => {
              const res = await client.query(
                `select count(*)::int as count from public.stock_reservations where tenant_id = $1 and quant_id = $2`,
                [opts.tenantId, legacyId],
              );
              const q = await client.query(
                `select flow_state from public.inventory_quants where tenant_id = $1 and id = $2`,
                [opts.tenantId, legacyId],
              );
              return {
                reservations: res.rows[0]?.count ?? 0,
                quantFlowState: q.rows[0]?.flow_state ?? null,
              };
            },
            measurePost: async () => {
              const res = await client.query(
                `select count(*)::int as count from public.stock_reservations where tenant_id = $1 and quant_id = $2`,
                [opts.tenantId, legacyId],
              );
              const q = await client.query(
                `select flow_state from public.inventory_quants where tenant_id = $1 and id = $2`,
                [opts.tenantId, legacyId],
              );
              return {
                reservations: res.rows[0]?.count ?? 0,
                quantFlowState: q.rows[0]?.flow_state ?? null,
              };
            },
            verify: (pre, post) => {
              const delta = post.reservations - pre.reservations;
              const valid = delta === 0 && post.quantFlowState === null && pre.quantFlowState === null;
              const postState = `reservations_count=${post.reservations} (delta=${delta}), quant_flow_state=${post.quantFlowState ?? "null"} (pre=${pre.quantFlowState ?? "null"})`;
              const failureReason = !valid
                ? `mutación inesperada: delta_reservas=${delta}, quant_flow_state=${post.quantFlowState} (pre=${pre.quantFlowState})`
                : undefined;
              return { valid, postState, failureReason };
            },
          },
        ),
      );
    }

    // REJ-04: ubicar una HU que no ha pasado el chequeo en un hueco de su MISMO almacén.
    if (hu1 && hu1Warehouse) {
      const bin = await client.query(
        `select id from public.warehouse_bins where tenant_id = $1 and warehouse_id = $2 and bin_type = 'PALLET_RACK' and not is_blocked limit 1`,
        [opts.tenantId, hu1Warehouse],
      );
      const binId = bin.rows[0]?.id;
      if (binId) {
        cases.push(
          await caso(
            client,
            opts,
            "REJ-04",
            "WMS_HU_NOT_CHECKED",
            "PUTAWAY",
            {
              hu_id: hu1,
              destination_bin_id: binId,
            },
            {
              measurePre: async () => {
                const hu = await client.query(
                  `select state, current_bin_id, current_dock_id from public.handling_units where tenant_id = $1 and id = $2`,
                  [opts.tenantId, hu1],
                );
                const res = await client.query(
                  `select count(*)::int as count from public.stock_reservations where tenant_id = $1 and hu_id = $2`,
                  [opts.tenantId, hu1],
                );
                return {
                  hu: hu.rows[0] ?? {},
                  reservations: res.rows[0]?.count ?? 0,
                };
              },
              measurePost: async () => {
                const hu = await client.query(
                  `select state, current_bin_id, current_dock_id from public.handling_units where tenant_id = $1 and id = $2`,
                  [opts.tenantId, hu1],
                );
                const res = await client.query(
                  `select count(*)::int as count from public.stock_reservations where tenant_id = $1 and hu_id = $2`,
                  [opts.tenantId, hu1],
                );
                return {
                  hu: hu.rows[0] ?? {},
                  reservations: res.rows[0]?.count ?? 0,
                };
              },
              verify: (pre, post) => {
                const delta = post.reservations - pre.reservations;
                const valid =
                  delta === 0 &&
                  post.hu.state === pre.hu.state &&
                  post.hu.state === "STAGING_UNCHECKED" &&
                  post.hu.current_bin_id === pre.hu.current_bin_id &&
                  post.hu.current_bin_id !== binId;
                const postState = `hu_state='${post.hu.state}' (pre='${pre.hu.state}'), current_bin_id=${post.hu.current_bin_id ?? "null"} (destination_assigned=false), reservations_count=${post.reservations} (delta=${delta})`;
                const failureReason = !valid
                  ? `mutación inesperada: delta_reservas=${delta}, hu_state=${post.hu.state} (pre=${pre.hu.state}), current_bin_id=${post.hu.current_bin_id} (pre=${pre.hu.current_bin_id})`
                  : undefined;
                return { valid, postState, failureReason };
              },
            },
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
          {
            measurePre: async () => {
              const hu = await client.query(
                `select state from public.handling_units where tenant_id = $1 and id = $2`,
                [opts.tenantId, huProbeId],
              );
              const q = await client.query(
                `select count(*)::int as count from public.inventory_quants where tenant_id = $1 and hu_id = $2`,
                [opts.tenantId, huProbeId],
              );
              return {
                huState: hu.rows[0]?.state ?? null,
                quantsCount: q.rows[0]?.count ?? 0,
              };
            },
            measurePost: async () => {
              const hu = await client.query(
                `select state from public.handling_units where tenant_id = $1 and id = $2`,
                [opts.tenantId, huProbeId],
              );
              const q = await client.query(
                `select count(*)::int as count from public.inventory_quants where tenant_id = $1 and hu_id = $2`,
                [opts.tenantId, huProbeId],
              );
              return {
                huState: hu.rows[0]?.state ?? null,
                quantsCount: q.rows[0]?.count ?? 0,
              };
            },
            verify: (pre, post) => {
              const quantsDelta = post.quantsCount - pre.quantsCount;
              const valid =
                quantsDelta === 0 &&
                post.huState === pre.huState &&
                post.huState === "STAGING_UNCHECKED";
              const postState = `hu_state='${post.huState}' (pre='${pre.huState}'), quants_created=${quantsDelta} (total=${post.quantsCount}), lot_assigned=false`;
              const failureReason = !valid
                ? `mutación inesperada: quants_delta=${quantsDelta}, hu_state=${post.huState} (pre=${pre.huState})`
                : undefined;
              return { valid, postState, failureReason };
            },
          },
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
          {
            measurePre: async () => {
              const hu = await client.query(
                `select state from public.handling_units where tenant_id = $1 and id = $2`,
                [opts.tenantId, huProbeId],
              );
              const q = await client.query(
                `select count(*)::int as count from public.inventory_quants where tenant_id = $1 and hu_id = $2`,
                [opts.tenantId, huProbeId],
              );
              return {
                huState: hu.rows[0]?.state ?? null,
                quantsCount: q.rows[0]?.count ?? 0,
              };
            },
            measurePost: async () => {
              const hu = await client.query(
                `select state from public.handling_units where tenant_id = $1 and id = $2`,
                [opts.tenantId, huProbeId],
              );
              const q = await client.query(
                `select count(*)::int as count from public.inventory_quants where tenant_id = $1 and hu_id = $2`,
                [opts.tenantId, huProbeId],
              );
              return {
                huState: hu.rows[0]?.state ?? null,
                quantsCount: q.rows[0]?.count ?? 0,
              };
            },
            verify: (pre, post) => {
              const quantsDelta = post.quantsCount - pre.quantsCount;
              const valid =
                quantsDelta === 0 &&
                post.huState === pre.huState &&
                post.huState === "STAGING_UNCHECKED";
              const postState = `hu_state='${post.huState}' (pre='${pre.huState}'), quants_created=${quantsDelta} (total=${post.quantsCount}), expiry_assigned=false`;
              const failureReason = !valid
                ? `mutación inesperada: quants_delta=${quantsDelta}, hu_state=${post.huState} (pre=${pre.huState})`
                : undefined;
              return { valid, postState, failureReason };
            },
          },
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
      const binBloqueadoId = binBloqueado.rows[0]?.id;
      if (binBloqueadoId) {
        cases.push(
          await caso(
            client,
            opts,
            "REJ-07",
            "WMS_BIN_BLOCKED",
            "PUTAWAY",
            {
              hu_id: hu2,
              destination_bin_id: binBloqueadoId,
            },
            {
              measurePre: async () => {
                const hu = await client.query(
                  `select state, current_bin_id from public.handling_units where tenant_id = $1 and id = $2`,
                  [opts.tenantId, hu2],
                );
                const occ = await client.query(
                  `select count(*)::int as count from public.handling_units where tenant_id = $1 and current_bin_id = $2`,
                  [opts.tenantId, binBloqueadoId],
                );
                return {
                  hu: hu.rows[0] ?? {},
                  binOccupancy: occ.rows[0]?.count ?? 0,
                };
              },
              measurePost: async () => {
                const hu = await client.query(
                  `select state, current_bin_id from public.handling_units where tenant_id = $1 and id = $2`,
                  [opts.tenantId, hu2],
                );
                const occ = await client.query(
                  `select count(*)::int as count from public.handling_units where tenant_id = $1 and current_bin_id = $2`,
                  [opts.tenantId, binBloqueadoId],
                );
                return {
                  hu: hu.rows[0] ?? {},
                  binOccupancy: occ.rows[0]?.count ?? 0,
                };
              },
              verify: (pre, post) => {
                const valid =
                  post.hu.state === pre.hu.state &&
                  post.hu.state === "STAGING_CHECKED" &&
                  post.hu.current_bin_id === pre.hu.current_bin_id &&
                  post.hu.current_bin_id !== binBloqueadoId &&
                  post.binOccupancy === pre.binOccupancy &&
                  post.binOccupancy === 0;
                const postState = `hu_state='${post.hu.state}' (pre='${pre.hu.state}'), current_bin_id=${post.hu.current_bin_id ?? "null"}, blocked_bin_occupancy=${post.binOccupancy} (delta=${post.binOccupancy - pre.binOccupancy})`;
                const failureReason = !valid
                  ? `mutación inesperada: hu_state=${post.hu.state} (pre=${pre.hu.state}), current_bin_id=${post.hu.current_bin_id} (pre=${pre.hu.current_bin_id}), blocked_bin_occupancy=${post.binOccupancy}`
                  : undefined;
                return { valid, postState, failureReason };
              },
            },
          ),
        );
      }
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
