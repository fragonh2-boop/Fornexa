import assert from "node:assert/strict";
import test from "node:test";
import { probeRejections } from "../scripts/wms/rejection-probe.ts";

function createRejectionMockClient(scenario: "all_pass" | "one_fails" | "missing_data") {
  const executedQueries: string[] = [];
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

      // Simulación de fornexa_wms_action
      if (sql.includes("fornexa_wms_action")) {
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

test("probeRejections envuelve todo en SAVEPOINT wms_probe_rejections_scope y valida los 7 casos con igualdad estricta (MUST-2/4/5)", async () => {
  const { client, executedQueries } = createRejectionMockClient("all_pass");
  const evidence = await probeRejections(client, {
    tenantId: "00000000-0000-4000-8000-000000000001",
    actorId: "actor-uuid",
  });

  assert.equal(evidence.total, 7);
  assert.equal(evidence.verified, 7);
  assert.equal(evidence.verdict, "ALL_VERIFIED");
  assert.equal(evidence.cases.length, 7);

  // Comprobar que todos los casos tienen postestado registrado y código obtenido
  for (const c of evidence.cases) {
    assert.equal(c.verified, true);
    assert.equal(c.obtained, c.code);
    assert.ok(c.post_state.length > 5, `El caso ${c.rej} debe registrar descripción de postestado`);
  }

  // Comprobar que el savepoint maestro wms_probe_rejections_scope se creó al inicio y se revirtió al final
  assert.equal(executedQueries[0], "SAVEPOINT wms_probe_rejections_scope");
  assert.equal(executedQueries[executedQueries.length - 2], "ROLLBACK TO SAVEPOINT wms_probe_rejections_scope");
  assert.equal(executedQueries[executedQueries.length - 1], "RELEASE SAVEPOINT wms_probe_rejections_scope");
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
