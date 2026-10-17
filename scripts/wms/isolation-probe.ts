/**
 * Sonda de aislamiento entre tenants, reutilizable por el ensayo de E1 y por la carga de F4.
 *
 * ── Por qué existe este módulo ──────────────────────────────────────────────────────
 * El recibo del ensayo de E1 acreditaba `committed_writes: 0` y 30 rechazos, pero **no
 * registraba la prueba de aislamiento**: ni el control positivo, ni el negativo, ni la
 * auditoría de privilegios de función, ni el canario 42501. El hueco de alcance por el
 * que se coló `fornexa_wms_effective_policy` quedaba fuera de la evidencia, aunque el
 * código ya lo mirara. Esto lo saca a un solo sitio para que ningún recibo lo olvide.
 *
 * ── Qué demuestra, y en qué orden ───────────────────────────────────────────────────
 * 1. Canario de permisos: con `EXECUTE` revocado, `authenticated` NO puede invocar la
 *    función. Si alguien vuelve a concederlo, esto falla. Se aísla en SAVEPOINT porque un
 *    error de permiso ABORTA la transacción y el `reset role` posterior fallaría.
 * 2. Control POSITIVO, y va antes que el negativo: se construye un tenant B con política
 *    de valores distintivos y se comprueba que, como servicio, ESA política se ve. Sin
 *    esto, «devuelve los valores por defecto» no significaría nada.
 * 3. Control NEGATIVO: sin claims (`auth.uid()` nulo) y con `EXECUTE` concedido, el
 *    aislamiento debe devolver los defaults y NO los valores del tenant B.
 *
 * Con `SECURITY INVOKER` este negativo discrimina: con `DEFINER` devolvería los valores
 * de B y fallaría. Es la prueba de la decisión, no una casilla.
 */

import assert from "node:assert/strict";

export type IsolationEvidence = {
  function_privileges: Record<string, { authenticated: boolean; anon: boolean; service_role: boolean }>;
  execute_canary_42501: boolean;
  tenant_b_created: boolean;
  positive_control: { putaway_strategy: string; max_pallets_per_bin: number; consolidation: string } | null;
  negative_control: { putaway_strategy: string; max_pallets_per_bin: number; consolidation: string } | null;
  verdict: "ISOLATED" | "LEAK" | "INCONCLUSIVE";
};

const TENANT_B_ID = "00000000-0000-4000-8000-0000000000bb";
const WAREHOUSE_B_ID = "00000000-0000-4000-8000-0000000000cc";
const FIELDS = ["putaway_strategy", "max_pallets_per_bin", "consolidation"] as const;

type Client = { query: (sql: string, params?: unknown[]) => Promise<{ rows: any[] }> };

function pick(policy: any): IsolationEvidence["positive_control"] {
  if (!policy) return null;
  return {
    putaway_strategy: policy.putaway_strategy,
    max_pallets_per_bin: policy.max_pallets_per_bin,
    consolidation: policy.consolidation,
  };
}

/**
 * Ejecuta la sonda DENTRO de una transacción en curso. No abre ni cierra nada.
 * Todo lo que crea (tenant B, almacén B, política B y la concesión temporal) se deshace
 * en el ROLLBACK del llamante o en los savepoints de aquí.
 */
export async function probeTenantIsolation(client: Client): Promise<IsolationEvidence> {
  const evidence: IsolationEvidence = {
    function_privileges: {},
    execute_canary_42501: false,
    tenant_b_created: false,
    positive_control: null,
    negative_control: null,
    verdict: "INCONCLUSIVE",
  };

  // 1 · Privilegios de FUNCIÓN. El recibo de E1 solo auditaba tablas.
  for (const [fn, firma] of [
    ["fornexa_wms_effective_policy", "(uuid, uuid, uuid, uuid)"],
    ["fornexa_wms_action", "(uuid, uuid, text, jsonb, text)"],
  ] as [string, string][]) {
    const res = await client.query(
      `select has_function_privilege('authenticated', 'public.${fn}${firma}', 'EXECUTE') as auth,
              has_function_privilege('anon', 'public.${fn}${firma}', 'EXECUTE') as anon,
              has_function_privilege('service_role', 'public.${fn}${firma}', 'EXECUTE') as svc`,
    );
    evidence.function_privileges[fn] = {
      authenticated: res.rows[0].auth,
      anon: res.rows[0].anon,
      service_role: res.rows[0].svc,
    };
    assert.equal(res.rows[0].auth, false, `${fn}: authenticated NO debe poder ejecutarla`);
    assert.equal(res.rows[0].anon, false, `${fn}: anon NO debe poder ejecutarla`);
    assert.equal(res.rows[0].svc, true, `${fn}: service_role SÍ debe poder`);
  }

  // 2 · Canario 42501, aislado en SAVEPOINT.
  await client.query("SAVEPOINT wms_probe_canary");
  try {
    await client.query("set local role authenticated");
    await client.query(`select public.fornexa_wms_effective_policy($1, $2, null, null)`, [
      "00000000-0000-4000-8000-000000000001",
      "00000000-0000-4000-8000-000000000001",
    ]);
  } catch (error: any) {
    const code = String(error?.code ?? "");
    evidence.execute_canary_42501 = code === "42501" || /permission denied/i.test(String(error?.message ?? ""));
  } finally {
    await client.query("ROLLBACK TO SAVEPOINT wms_probe_canary");
    await client.query("RELEASE SAVEPOINT wms_probe_canary");
  }
  assert.ok(evidence.execute_canary_42501, "el canario 42501 no se disparó: la función es invocable por authenticated");

  // 3 · Tenant B real con política distintiva, dentro de la transacción del llamante.
  await client.query(
    `insert into public.tenants (id, code, name, status) values ($1, 'PROBE-TENANT-B', '[PROBE] Tenant B', 'PILOT')`,
    [TENANT_B_ID],
  );
  await client.query(
    `insert into public.warehouses (id, tenant_id, code, name, status) values ($1, $2, 'PROBE-WH-B', '[PROBE] Almacén B', 'ACTIVE')`,
    [WAREHOUSE_B_ID, TENANT_B_ID],
  );
  await client.query(
    `insert into public.warehouse_behavior_policies (tenant_id, warehouse_id, scope, params)
     values ($1, $2, 'WAREHOUSE', $3::jsonb)`,
    [TENANT_B_ID, WAREHOUSE_B_ID, JSON.stringify({ putaway_strategy: "LIFO", max_pallets_per_bin: 99, consolidation: "NO" })],
  );
  evidence.tenant_b_created = true;

  // 4 · Control POSITIVO: como servicio, la política de B se ve.
  const positivo = await client.query(
    `select public.fornexa_wms_effective_policy($1, $2, null, null) as pol`,
    [TENANT_B_ID, WAREHOUSE_B_ID],
  );
  evidence.positive_control = pick(positivo.rows[0]?.pol);
  assert.equal(evidence.positive_control?.putaway_strategy, "LIFO", "control positivo: no se ve la política del tenant B");
  assert.equal(evidence.positive_control?.max_pallets_per_bin, 99, "control positivo: no se ve el valor distintivo");

  // 5 · Control NEGATIVO: sin claims, defaults y no los valores de B.
  await client.query("SAVEPOINT wms_probe_negative");
  try {
    await client.query(
      "grant execute on function public.fornexa_wms_effective_policy(uuid, uuid, uuid, uuid) to authenticated",
    );
    await client.query("set local role authenticated");
    const negativo = await client.query(
      `select public.fornexa_wms_effective_policy($1, $2, null, null) as pol`,
      [TENANT_B_ID, WAREHOUSE_B_ID],
    );
    evidence.negative_control = pick(negativo.rows[0]?.pol);
  } catch (error: any) {
    throw new Error(`la prueba de aislamiento no pudo ejecutarse: ${String(error?.message ?? error)}`);
  } finally {
    await client.query("ROLLBACK TO SAVEPOINT wms_probe_negative");
    await client.query("RELEASE SAVEPOINT wms_probe_negative");
  }

  const negativo = evidence.negative_control;
  assert.ok(negativo, "la prueba de aislamiento no devolvió ninguna política");
  // Contra los defaults CONCRETOS, no contra «algo distinto»: un `notEqual(valor, 4)`
  // pasaría siempre y no probaría nada.
  assert.equal(negativo.consolidation, "YES", "FUGA: devolvió la consolidación del tenant B ('NO')");
  assert.equal(negativo.max_pallets_per_bin, 2, "FUGA: devolvió el valor del tenant B (99)");
  assert.notEqual(negativo.putaway_strategy, "LIFO", "FUGA: devolvió la estrategia del tenant B");

  evidence.verdict = "ISOLATED";
  return evidence;
}

/** Comprobación de coherencia del propio objeto de evidencia, para usarla en un test. */
export function assertEvidenceComplete(evidence: IsolationEvidence): void {
  assert.ok(Object.keys(evidence.function_privileges).length >= 2, "faltan privilegios de función");
  assert.equal(evidence.execute_canary_42501, true, "falta el canario 42501");
  assert.equal(evidence.tenant_b_created, true, "falta el tenant B");
  assert.ok(evidence.positive_control, "falta el control positivo");
  assert.ok(evidence.negative_control, "falta el control negativo");
  assert.equal(evidence.verdict, "ISOLATED", "el veredicto no es ISOLATED");
}
