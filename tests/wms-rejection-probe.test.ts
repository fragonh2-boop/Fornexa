import assert from "node:assert/strict";
import test from "node:test";
import { probeRejections } from "../scripts/wms/rejection-probe.ts";

function createRejectionMockClient(scenario: "all_pass" | "one_fails" | "missing_data" | "post_state_mutation") {
  const executedQueries: string[] = [];
  let actionExecuted = false;

  const client = {
    query: async (sql: string, params: unknown[] = []) => {
      executedQueries.push(sql);

      // Simulación de SAVEPOINT / ROLLBACK / RELEASE
      if (sql.startsWith("SAVEPOINT") || sql.startsWith("ROLLBACK") || sql.startsWith("RELEASE")) {
        return { rows: [] };
      }

      // Query huUnchecked
      if (sql.includes("code like 'WMS-TEST-S01-%'")) {
        return scenario === "missing_data" ? { rows: [] } : { rows: [{ id: "hu-s01-uuid", warehouse_id: "wh-uuid-1" }] };
      }
      // Query huChecked
      if (sql.includes("code like 'WMS-TEST-S02-%'")) {
        return scenario === "missing_data" ? { rows: [] } : { rows: [{ id: "hu-s02-uuid", warehouse_id: "wh-uuid-1" }] };
      }
      // Query quantDe
      if (sql.includes("from public.inventory_quants where hu_id = $1")) {
        return { rows: [{ id: `quant-de-${params[0]}` }] };
      }
      // Query legacy
      if (sql.includes("from public.inventory_quants where tenant_id = $1 and flow_state is null")) {
        return { rows: [{ id: "legacy-quant-uuid" }] };
      }
      // Query bin in same warehouse
      if (sql.includes("from public.warehouse_bins where tenant_id = $1 and warehouse_id = $2 and bin_type = 'PALLET_RACK'")) {
        return { rows: [{ id: "bin-wh1-uuid" }] };
      }
      // Query policy warehouse
      if (sql.includes("from public.warehouse_behavior_policies")) {
        return { rows: [{ warehouse_id: "wh-uuid-1" }] };
      }
      // Insert product probe
      if (sql.includes("insert into public.products")) {
        return { rows: [{ id: "prod-probe-uuid" }] };
      }
      // Query dock
      if (sql.includes("from public.warehouse_docks")) {
        return { rows: [{ id: "dock-wh1-uuid" }] };
      }
      // Insert handling unit probe
      if (sql.includes("insert into public.handling_units")) {
        return { rows: [{ id: "hu-probe-uuid" }] };
      }
      // Insert content probe
      if (sql.includes("insert into public.handling_unit_contents")) {
        return { rows: [{ id: "content-probe-uuid" }] };
      }
      // Insert bin blocked
      if (sql.includes("insert into public.warehouse_bins")) {
        return { rows: [{ id: "bin-blocked-uuid" }] };
      }

      // Queries de medición de estado (pre/postestado):
      // 1. stock_reservations count (por quant_id o hu_id)
      if (sql.includes("from public.stock_reservations")) {
        if (scenario === "post_state_mutation" && actionExecuted) {
          // Simular que tras el rechazo de la acción se detecta una reserva mutada inesperadamente
          return { rows: [{ count: 1 }] };
        }
        return { rows: [{ count: 0 }] };
      }

      // 2. handling_units (state, current_bin_id, current_dock_id)
      if (sql.includes("from public.handling_units where tenant_id = $1 and id = $2")) {
        const huId = params[1];
        if (huId === "hu-s01-uuid") {
          return { rows: [{ state: "STAGING_UNCHECKED", current_bin_id: null, current_dock_id: "dock-wh1-uuid" }] };
        }
        if (huId === "hu-s02-uuid") {
          return { rows: [{ state: "STAGING_CHECKED", current_bin_id: null, current_dock_id: "dock-wh1-uuid" }] };
        }
        if (huId === "hu-probe-uuid") {
          return { rows: [{ state: "STAGING_UNCHECKED", current_bin_id: null, current_dock_id: "dock-wh1-uuid" }] };
        }
      }

      // 3. handling_units count en bin bloqueado (binOccupancy)
      if (sql.includes("from public.handling_units where tenant_id = $1 and current_bin_id = $2")) {
        return { rows: [{ count: 0 }] };
      }

      // 4. inventory_quants flow_state
      if (sql.includes("select flow_state from public.inventory_quants where tenant_id = $1 and id = $2")) {
        const quantId = params[1];
        if (quantId === "quant-de-hu-s01-uuid") {
          return { rows: [{ flow_state: "STAGING_UNCHECKED" }] };
        }
        if (quantId === "quant-de-hu-s02-uuid") {
          return { rows: [{ flow_state: "STAGING_CHECKED" }] };
        }
        if (quantId === "legacy-quant-uuid") {
          return { rows: [{ flow_state: null }] };
        }
      }

      // 5. inventory_quants count por hu_id
      if (sql.includes("from public.inventory_quants where tenant_id = $1 and hu_id = $2")) {
        return { rows: [{ count: 0 }] };
      }

      // Simulación de fornexa_wms_action
      if (sql.includes("fornexa_wms_action")) {
        actionExecuted = true;
        const action = params[2];
        const payload = JSON.parse(params[3] as string);

        if (scenario === "one_fails" && action === "PUTAWAY" && payload?.hu_id === "hu-s01-uuid") {
          // Fallo imprevisto (éxito en vez de rechazo)
          return { rows: [{ ok: true }] };
        }

        // Simular rechazos canónicos según acción y payload
        if (action === "RESERVE" && payload?.quant_id === "quant-de-hu-s01-uuid") {
          throw new Error("WMS_STOCK_NOT_LOCATED");
        }
        if (action === "RESERVE" && payload?.quant_id === "quant-de-hu-s02-uuid") {
          throw new Error("WMS_STOCK_NOT_LOCATED");
        }
        if (action === "RESERVE" && payload?.quant_id === "legacy-quant-uuid") {
          throw new Error("WMS_STOCK_NOT_LOCATED");
        }
        if (action === "PUTAWAY" && payload?.hu_id === "hu-s01-uuid") {
          throw new Error("WMS_HU_NOT_CHECKED");
        }
        if (action === "RECEIVE_CHECK" && payload?.expiry_date && !payload?.batch_number) {
          throw new Error("WMS_LOT_REQUIRED");
        }
        if (action === "RECEIVE_CHECK" && payload?.batch_number && !payload?.expiry_date) {
          throw new Error("WMS_EXPIRY_REQUIRED");
        }
        if (action === "PUTAWAY" && payload?.destination_bin_id === "bin-blocked-uuid") {
          throw new Error("WMS_BIN_BLOCKED");
        }

        throw new Error("WMS_FORBIDDEN");
      }

      return { rows: [] };
    },
  };
  return { client: client as never, executedQueries };
}

test("probeRejections envuelve todo en SAVEPOINT wms_probe_rejections_scope y valida los 7 casos con igualdad estricta y postestado medido (MUST-2/4/5 + SHOULD-1)", async () => {
  const { client, executedQueries } = createRejectionMockClient("all_pass");
  const evidence = await probeRejections(client, {
    tenantId: "00000000-0000-4000-8000-000000000001",
    actorId: "actor-uuid",
  });

  assert.equal(evidence.total, 7);
  assert.equal(evidence.verified, 7);
  assert.equal(evidence.verdict, "ALL_VERIFIED");
  assert.equal(evidence.cases.length, 7);

  // Comprobar que todos los casos tienen postestado medido dinámicamente y código obtenido exacto
  for (const c of evidence.cases) {
    assert.equal(c.verified, true);
    assert.equal(c.obtained, c.code);
    assert.ok(c.post_state.includes("pre="), `El caso ${c.rej} debe incluir contraste pre= en post_state medido`);
    assert.match(c.detail, /postestado verificado/);
  }

  // Comprobar detalles específicos de postestado medido
  const r1 = evidence.cases.find((c) => c.rej === "REJ-01");
  assert.ok(r1?.post_state.includes("reservations_count=0 (delta=0)"));
  assert.ok(r1?.post_state.includes("hu_state='STAGING_UNCHECKED'"));

  const r7 = evidence.cases.find((c) => c.rej === "REJ-07");
  assert.ok(r7?.post_state.includes("blocked_bin_occupancy=0 (delta=0)"));

  // Comprobar que el savepoint maestro wms_probe_rejections_scope se creó al inicio y se revirtió al final
  assert.equal(executedQueries[0], "SAVEPOINT wms_probe_rejections_scope");
  assert.equal(executedQueries[executedQueries.length - 2], "ROLLBACK TO SAVEPOINT wms_probe_rejections_scope");
  assert.equal(executedQueries[executedQueries.length - 1], "RELEASE SAVEPOINT wms_probe_rejections_scope");
});

test("probeRejections detecta mutación inesperada en postestado y marca veredicto INCOMPLETE (SHOULD-1)", async () => {
  const { client } = createRejectionMockClient("post_state_mutation");
  const evidence = await probeRejections(client, {
    tenantId: "00000000-0000-4000-8000-000000000001",
    actorId: "actor-uuid",
  });

  assert.equal(evidence.total, 7);
  assert.equal(evidence.verdict, "INCOMPLETE");
  assert.ok(evidence.verified < 7);

  // El caso REJ-01 debe haber detectado la mutación de reservas y fallar cerrado
  const mutatedCase = evidence.cases.find((c) => c.rej === "REJ-01");
  assert.ok(mutatedCase);
  assert.equal(mutatedCase.verified, false);
  assert.match(mutatedCase.detail, /postestado falló/);
  assert.match(mutatedCase.detail, /delta_reservas=1/);
});

test("probeRejections devuelve verdict INCOMPLETE si un caso falla y registra el detalle", async () => {
  const { client } = createRejectionMockClient("one_fails");
  const evidence = await probeRejections(client, {
    tenantId: "00000000-0000-4000-8000-000000000001",
    actorId: "actor-uuid",
  });

  assert.equal(evidence.total, 7);
  assert.equal(evidence.verified, 6);
  assert.equal(evidence.verdict, "INCOMPLETE");

  const failedCase = evidence.cases.find((c) => c.rej === "REJ-04");
  assert.ok(failedCase);
  assert.equal(failedCase.verified, false);
  assert.match(failedCase.detail, /falló/);
});

test("probeRejections devuelve verdict INCOMPLETE si faltan fixtures", async () => {
  const { client } = createRejectionMockClient("missing_data");
  const evidence = await probeRejections(client, {
    tenantId: "00000000-0000-4000-8000-000000000001",
    actorId: "actor-uuid",
  });

  assert.equal(evidence.verdict, "INCOMPLETE");
  assert.ok(evidence.verified < 7);
});
