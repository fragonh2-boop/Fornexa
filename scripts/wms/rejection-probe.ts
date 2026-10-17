/**
 * Sonda de los siete rechazos REJ-01…07 del plan F4. MUST-5 del dictamen de Claude:
 * el ensayo de F4 cargaba el lote pero **no ejercitaba ningún rechazo**, así que no probaba
 * que las reglas de oro siguieran vivas con esos datos dentro.
 *
 * Corre DENTRO de la transacción de quien llama, después de insertar el lote y antes de
 * compensarlo. Todo lo que crea (productos, hueco bloqueado) desaparece con el ROLLBACK o
 * con la compensación.
 *
 * ── Qué se prueba y por qué así ──────────────────────────────────────────────────────
 * REJ-01/02/04/07 usan las filas del PROPIO lote: son las que van a producción, y probar con
 * fixtures paralelos demostraría que el fixture rechaza, no que el lote lo hace.
 * REJ-03 usa uno de los 150 quants históricos de DATA150, que es el invariante fail-closed.
 * REJ-05/06 necesitan un artículo gestionado por lote y perecedero, que el lote no garantiza
 * tener, así que se crean aquí dentro.
 *
 * Cada caso registra si se verificó y, si no, por qué. Una sonda que solo sabe decir
 * «verificado» no es una sonda.
 */

export type RejectionCase = { rej: string; code: string; verified: boolean; detail: string };

export type RejectionEvidence = {
  cases: RejectionCase[];
  verified: number;
  total: number;
  verdict: "ALL_VERIFIED" | "INCOMPLETE";
};

type Client = { query: (sql: string, params?: unknown[]) => Promise<{ rows: any[] }> };

type Options = { tenantId: string; actorId: string };

/** Ejecuta una acción y devuelve el código WMS_* con el que rechazó, o null si no rechazó. */
async function intentar(client: Client, opts: Options, accion: string, payload: unknown): Promise<string | null> {
  try {
    await client.query(`select public.fornexa_wms_action($1, $2, $3, $4::jsonb)`, [
      opts.tenantId,
      opts.actorId,
      accion,
      JSON.stringify(payload),
    ]);
    return null; // no rechazó: para estas pruebas, eso es un fallo
  } catch (error: any) {
    const msg = String(error?.message ?? error);
    const match = msg.match(/WMS_[A-Z_]+/);
    return match ? match[0] : `SIN_CODIGO:${msg.slice(0, 40)}`;
  }
}

async function caso(
  client: Client,
  opts: Options,
  rej: string,
  code: string,
  accion: string,
  payload: unknown,
): Promise<RejectionCase> {
  // SAVEPOINT por caso: un rechazo esperado puede abortar la transacción, y sin aislarlo
  // el siguiente caso no llegaría a ejecutarse.
  await client.query(`SAVEPOINT rej_${rej.replace("-", "_")}`);
  let obtenido: string | null;
  try {
    obtenido = await intentar(client, opts, accion, payload);
  } finally {
    await client.query(`ROLLBACK TO SAVEPOINT rej_${rej.replace("-", "_")}`);
    await client.query(`RELEASE SAVEPOINT rej_${rej.replace("-", "_")}`);
  }
  const verified = obtenido === code;
  return {
    rej,
    code,
    verified,
    detail: verified ? "rechazado con el código esperado" : `se esperaba ${code} y se obtuvo ${obtenido ?? "ningún rechazo"}`,
  };
}

export async function probeRejections(client: Client, opts: Options): Promise<RejectionEvidence> {
  const cases: RejectionCase[] = [];

  // Filas del propio lote: S01 queda en STAGING_UNCHECKED y S02 en STAGING_CHECKED.
  const huUnchecked = await client.query(
    `select id from public.handling_units where tenant_id = $1 and code like 'WMS-TEST-S01-%' limit 1`,
    [opts.tenantId],
  );
  const huChecked = await client.query(
    `select id from public.handling_units where tenant_id = $1 and code like 'WMS-TEST-S02-%' limit 1`,
    [opts.tenantId],
  );
  const quantDe = async (huId: string) =>
    (await client.query(`select id from public.inventory_quants where hu_id = $1 limit 1`, [huId])).rows[0]?.id;

  const hu1 = huUnchecked.rows[0]?.id;
  const hu2 = huChecked.rows[0]?.id;

  if (hu1) {
    const q1 = await quantDe(hu1);
    if (q1) cases.push(await caso(client, opts, "REJ-01", "WMS_STOCK_NOT_LOCATED", "RESERVE", { quant_id: q1, quantity: 1 }));
  }
  if (hu2) {
    const q2 = await quantDe(hu2);
    if (q2) cases.push(await caso(client, opts, "REJ-02", "WMS_STOCK_NOT_LOCATED", "RESERVE", { quant_id: q2, quantity: 1 }));
  }

  // REJ-03: uno de los 150 quants históricos de DATA150, intacto por definición.
  const legacy = await client.query(
    `select id from public.inventory_quants where tenant_id = $1 and flow_state is null limit 1`,
    [opts.tenantId],
  );
  if (legacy.rows[0]?.id) {
    cases.push(
      await caso(client, opts, "REJ-03", "WMS_STOCK_NOT_LOCATED", "RESERVE", {
        quant_id: legacy.rows[0].id,
        quantity: 1,
      }),
    );
  }

  // REJ-04: ubicar una HU que no ha pasado el chequeo.
  if (hu1) {
    const bin = await client.query(
      `select id from public.warehouse_bins where tenant_id = $1 and bin_type = 'PALLET_RACK' and not is_blocked limit 1`,
      [opts.tenantId],
    );
    if (bin.rows[0]?.id) {
      cases.push(
        await caso(client, opts, "REJ-04", "WMS_HU_NOT_CHECKED", "PUTAWAY", {
          hu_id: hu1,
          destination_bin_id: bin.rows[0].id,
        }),
      );
    }
  }

  // REJ-05 / REJ-06: artículo gestionado por lote y perecedero, creado aquí porque el lote
  // no garantiza tener ninguno con esos atributos.
  const producto = await client.query(
    `insert into public.products (tenant_id, sku, name, status, is_batch_managed, shelf_life_days)
     values ($1, 'PROBE-REJ-LOT', '[PROBE] lote y caducidad', 'ACTIVE', true, 30)
     returning id`,
    [opts.tenantId],
  );
  const productoId = producto.rows[0].id;
  const almacen = await client.query(`select id from public.warehouses where tenant_id = $1 limit 1`, [opts.tenantId]);
  const muelle = await client.query(`select id from public.warehouse_docks where tenant_id = $1 limit 1`, [opts.tenantId]);
  if (almacen.rows[0]?.id) {
    const huProbe = await client.query(
      `insert into public.handling_units (tenant_id, warehouse_id, code, code_type, hu_type, state, current_dock_id)
       values ($1, $2, 'PROBE-REJ-HU', 'LPN', 'PALLET', 'STAGING_UNCHECKED', $3)
       returning id`,
      [opts.tenantId, almacen.rows[0].id, muelle.rows[0]?.id ?? null],
    );
    const huProbeId = huProbe.rows[0].id;
    await client.query(
      `insert into public.handling_unit_contents (tenant_id, hu_id, product_id, quantity)
       values ($1, $2, $3, 10)`,
      [opts.tenantId, huProbeId, productoId],
    );
    cases.push(
      await caso(client, opts, "REJ-05", "WMS_LOT_REQUIRED", "RECEIVE_CHECK", {
        hu_id: huProbeId,
        expiry_date: "2027-06-01",
      }),
    );
    cases.push(
      await caso(client, opts, "REJ-06", "WMS_EXPIRY_REQUIRED", "RECEIVE_CHECK", {
        hu_id: huProbeId,
        batch_number: "LOT-PROBE-001",
      }),
    );
  }

  // REJ-07: ubicar en un hueco bloqueado.
  if (hu2) {
    const almacenId = (await client.query(`select id from public.warehouses where tenant_id = $1 limit 1`, [opts.tenantId]))
      .rows[0]?.id;
    if (almacenId) {
      const binBloqueado = await client.query(
        `insert into public.warehouse_bins (tenant_id, warehouse_id, bin_code, bin_type, max_pallets, is_blocked)
         values ($1, $2, 'PROBE-REJ-BIN-BLOCKED', 'PALLET_RACK', 1, true)
         returning id`,
        [opts.tenantId, almacenId],
      );
      cases.push(
        await caso(client, opts, "REJ-07", "WMS_BIN_BLOCKED", "PUTAWAY", {
          hu_id: hu2,
          destination_bin_id: binBloqueado.rows[0].id,
        }),
      );
    }
  }

  const verified = cases.filter((c) => c.verified).length;
  return {
    cases,
    verified,
    total: 7,
    // Se exige que estén las siete y todas verificadas. Si el lote no traía la HU de un
    // escenario, faltará un caso y el veredicto lo dirá: no se rellena con un «no aplica».
    verdict: verified === 7 && cases.length === 7 ? "ALL_VERIFIED" : "INCOMPLETE",
  };
}
