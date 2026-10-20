import assert from "node:assert/strict";
import test from "node:test";
import { resolve } from "node:path";
import { POST } from "../app/api/wms/route.ts";
// @ts-expect-error - import from local .mjs harness script
import { checkIsDirectExecution, validateIsolation, validateDisposableDatabase, isDirectExecution } from "../scripts/wms/verify-c3-postgres.mjs";

const OPERATOR_AUTH = {
  userId: "20000000-0000-4000-8000-000000000001",
  tenantId: "10000000-0000-4000-8000-000000000001",
  role: "OPERATOR",
};

const PLANNER_AUTH = {
  userId: "20000000-0000-4000-8000-000000000002",
  tenantId: "10000000-0000-4000-8000-000000000001",
  role: "PLANNER",
};

const VIEWER_AUTH = {
  userId: "20000000-0000-4000-8000-000000000003",
  tenantId: "10000000-0000-4000-8000-000000000001",
  role: "VIEWER",
};

function createPostRequest(body: unknown, headers: Record<string, string> = {}) {
  return new Request("https://localhost/api/wms", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...headers,
    },
    body: JSON.stringify(body),
  });
}

test("M7 C-3 POST /api/wms — rechaza solicitudes no autenticadas con HTTP 401 WMS_FORBIDDEN", async () => {
  const req = createPostRequest({ action: "LOAD", payload: { hu_id: "70000000-0000-4000-8000-000000000001" } });
  // Invoking POST with no second argument uses real getAuthenticatedContext() which returns null outside request scope
  const res = await POST(req);
  assert.equal(res.status, 401);
  const data = (await res.json()) as { code: string; error: string };
  assert.equal(data.code, "WMS_FORBIDDEN");
});

test("M7 C-3 POST /api/wms — rechaza roles no operativos (ej. VIEWER) con HTTP 403 WMS_FORBIDDEN", async () => {
  const req = createPostRequest({ action: "LOAD", payload: { hu_id: "70000000-0000-4000-8000-000000000001" } });
  const res = await POST(req, { auth: VIEWER_AUTH });
  assert.equal(res.status, 403);
  const data = (await res.json()) as { code: string; error: string };
  assert.equal(data.code, "WMS_FORBIDDEN");
  assert.ok(data.error.includes("permisos operativos"));
});

test("M7 C-3 POST /api/wms — rechaza UPSERT_POLICY y UPSERT_RESOURCE a rol OPERATOR con HTTP 403 WMS_FORBIDDEN", async () => {
  const req1 = createPostRequest({ action: "UPSERT_POLICY", payload: { params: {} } });
  const res1 = await POST(req1, { auth: OPERATOR_AUTH });
  assert.equal(res1.status, 403);
  const data1 = (await res1.json()) as { code: string };
  assert.equal(data1.code, "WMS_FORBIDDEN");

  const req2 = createPostRequest({ action: "UPSERT_RESOURCE", payload: {} });
  const res2 = await POST(req2, { auth: OPERATOR_AUTH });
  assert.equal(res2.status, 403);
  const data2 = (await res2.json()) as { code: string };
  assert.equal(data2.code, "WMS_FORBIDDEN");

  // PLANNER sí tiene permiso para configurar políticas
  const mockRpc = {
    rpc: async () => ({
      data: { ok: true, action: "UPSERT_POLICY" },
      error: null,
    }),
  };
  const reqPlanner = createPostRequest({ action: "UPSERT_POLICY", payload: { params: {} } });
  const resPlanner = await POST(reqPlanner, { auth: PLANNER_AUTH, rpcClient: mockRpc });
  assert.equal(resPlanner.status, 200);
});

test("M7 C-3 POST /api/wms — rechaza usurpación de state_controlled con HTTP 400 sin invocar RPC", async () => {
  let rpcInvoked = false;
  const mockRpc = {
    rpc: async () => {
      rpcInvoked = true;
      return { data: null, error: null };
    },
  };

  const req = createPostRequest({
    action: "LOAD",
    payload: {
      hu_id: "70000000-0000-4000-8000-000000000001",
      scanned_code: "HU-001",
      state_controlled: true,
    },
  });

  const res = await POST(req, { auth: OPERATOR_AUTH, rpcClient: mockRpc });
  assert.equal(res.status, 400);
  assert.equal(rpcInvoked, false, "El RPC fornexa_wms_action NUNCA debe ser invocado ante intentos de usurpación");
  const data = (await res.json()) as { code: string; error: string };
  assert.equal(data.code, "WMS_FORBIDDEN");
  assert.ok(data.error.includes("cálculo exclusivo en servidor"));
});

test("M7 C-3 POST /api/wms — rechaza expected_weight_kg y expected_volume_m3 con HTTP 400 sin invocar RPC", async () => {
  let rpcInvoked = false;
  const mockRpc = {
    rpc: async () => {
      rpcInvoked = true;
      return { data: null, error: null };
    },
  };

  // expected_weight_kg
  const reqWeight = createPostRequest({
    action: "LABEL",
    payload: { hu_id: "70000000-0000-4000-8000-000000000001", expected_weight_kg: 50.0 },
  });
  const resWeight = await POST(reqWeight, { auth: OPERATOR_AUTH, rpcClient: mockRpc });
  assert.equal(resWeight.status, 400);
  assert.equal(rpcInvoked, false);

  // expected_volume_m3
  const reqVol = createPostRequest({
    action: "LABEL",
    payload: { hu_id: "70000000-0000-4000-8000-000000000001", expected_volume_m3: 0.5 },
  });
  const resVol = await POST(reqVol, { auth: OPERATOR_AUTH, rpcClient: mockRpc });
  assert.equal(resVol.status, 400);
  assert.equal(rpcInvoked, false);
});

test("M7 C-3 POST /api/wms — REPLENISH rechaza consolidation y conflicting_batch con HTTP 400 sin invocar RPC", async () => {
  let rpcInvoked = false;
  const mockRpc = {
    rpc: async () => {
      rpcInvoked = true;
      return { data: null, error: null };
    },
  };

  const reqConsolidation = createPostRequest({
    action: "REPLENISH",
    payload: { consolidation: "BY_BATCH" },
  });
  const res1 = await POST(reqConsolidation, { auth: OPERATOR_AUTH, rpcClient: mockRpc });
  assert.equal(res1.status, 400);
  assert.equal(rpcInvoked, false);

  const reqBatch = createPostRequest({
    action: "REPLENISH",
    payload: { conflicting_batch: "ALLOW" },
  });
  const res2 = await POST(reqBatch, { auth: OPERATOR_AUTH, rpcClient: mockRpc });
  assert.equal(res2.status, 400);
  assert.equal(rpcInvoked, false);
});

test("M7 C-3 POST /api/wms — rechaza acciones no reconocidas con HTTP 400 WMS_FORBIDDEN", async () => {
  let rpcInvoked = false;
  const mockRpc = {
    rpc: async () => {
      rpcInvoked = true;
      return { data: null, error: null };
    },
  };

  const req = createPostRequest({
    action: "INVALID_HACK_ACTION",
    payload: {},
  });
  const res = await POST(req, { auth: OPERATOR_AUTH, rpcClient: mockRpc });
  assert.equal(res.status, 400);
  assert.equal(rpcInvoked, false);
  const data = (await res.json()) as { code: string };
  assert.equal(data.code, "WMS_FORBIDDEN");
});

test("M7 C-3 POST /api/wms — solicitud legítima delega a RPC garantizando aislamiento de tenant y actor autenticado", async () => {
  let capturedRpcArgs: Record<string, unknown> | null = null;
  const mockRpc = {
    rpc: async (name: string, args: Record<string, unknown>) => {
      capturedRpcArgs = { name, ...args };
      return {
        data: { ok: true, action: args.p_action, task_id: "90000000-0000-4000-8000-000000000001" },
        error: null,
      };
    },
  };

  const req = createPostRequest({
    action: "CONTROL_STATE",
    payload: {
      hu_id: "70000000-0000-4000-8000-000000000001",
      status: "PASSED",
    },
    idempotency_key: "test-idem-key-123",
  });

  const res = await POST(req, { auth: OPERATOR_AUTH, rpcClient: mockRpc });
  assert.equal(res.status, 200);
  assert.ok(capturedRpcArgs);
  const rpcArgs = capturedRpcArgs as Record<string, unknown>;
  assert.equal(rpcArgs.name, "fornexa_wms_action");
  assert.equal(rpcArgs.p_tenant, OPERATOR_AUTH.tenantId, "Tenant DEBE ser estrictamente el del contexto autenticado");
  assert.equal(rpcArgs.p_actor, OPERATOR_AUTH.userId, "Actor DEBE ser estrictamente el del contexto autenticado");
  assert.equal(rpcArgs.p_action, "CONTROL_STATE");
  assert.equal(rpcArgs.p_idempotency_key, "test-idem-key-123");

  const data = (await res.json()) as { result: { ok: boolean; task_id: string } };
  assert.equal(data.result.ok, true);
  assert.equal(data.result.task_id, "90000000-0000-4000-8000-000000000001");
});

test("M7 C-3 POST /api/wms — mapea fallos RPC de base de datos a códigos deterministas (§3.1)", async () => {
  const cases: Array<{ rpcMsg: string; expectedStatus: number; expectedCode: string }> = [
    { rpcMsg: "WMS_CONTROL_PENDING", expectedStatus: 422, expectedCode: "WMS_CONTROL_PENDING" },
    { rpcMsg: "WMS_WEIGHT_TOLERANCE", expectedStatus: 422, expectedCode: "WMS_WEIGHT_TOLERANCE" },
    { rpcMsg: "WMS_VOLUME_TOLERANCE", expectedStatus: 422, expectedCode: "WMS_VOLUME_TOLERANCE" },
    { rpcMsg: "WMS_NOT_READY_TO_LOAD", expectedStatus: 422, expectedCode: "WMS_NOT_READY_TO_LOAD" },
    { rpcMsg: "WMS_FORBIDDEN", expectedStatus: 403, expectedCode: "WMS_FORBIDDEN" },
    { rpcMsg: "WMS_LABEL_MISMATCH", expectedStatus: 422, expectedCode: "WMS_LABEL_MISMATCH" },
  ];

  for (const c of cases) {
    const mockRpc = {
      rpc: async () => ({
        data: null,
        error: { message: c.rpcMsg },
      }),
    };

    const req = createPostRequest({
      action: "LOAD",
      payload: { hu_id: "70000000-0000-4000-8000-000000000001", scanned_code: "HU-001" },
    });

    const res = await POST(req, { auth: OPERATOR_AUTH, rpcClient: mockRpc });
    assert.equal(res.status, c.expectedStatus, `Status for ${c.rpcMsg}`);
    const data = (await res.json()) as { code: string };
    assert.equal(data.code, c.expectedCode, `Code for ${c.rpcMsg}`);
  }
});

// ── CERTIFICACIÓN DE DEUDA PR #135 (Grok & Claude MUST) ──

test("M7 C-3 DEUDA PR #135 — checkIsDirectExecution previene autoejecución al importar y descarta falsos positivos", () => {
  // 1. En entorno de test, isDirectExecution DEBE ser false
  assert.equal(
    isDirectExecution,
    false,
    "Al importar verify-c3-postgres.mjs desde tests, isDirectExecution DEBE ser estrictamente false",
  );

  const scriptPath = resolve(process.cwd(), "scripts/wms/verify-c3-postgres.mjs");
  const scriptUrl = `file://${scriptPath}`;

  // 2. Ruta exacta absoluta -> true
  assert.equal(checkIsDirectExecution(scriptPath, scriptUrl), true);

  // 3. Ruta relativa directa -> true
  assert.equal(checkIsDirectExecution("scripts/wms/verify-c3-postgres.mjs", scriptUrl), true);
  assert.equal(checkIsDirectExecution("./scripts/wms/verify-c3-postgres.mjs", scriptUrl), true);

  // 4. Subcadena / colisión de nombre sin frontera (el bug de endsWith) -> DEBE ser false
  assert.equal(checkIsDirectExecution("c3-postgres.mjs", scriptUrl), false);
  assert.equal(checkIsDirectExecution("postgres.mjs", scriptUrl), false);
  assert.equal(checkIsDirectExecution("gres.mjs", scriptUrl), false);
  assert.equal(checkIsDirectExecution(".mjs", scriptUrl), false);
  assert.equal(checkIsDirectExecution("s", scriptUrl), false);

  // 5. Runner u otro script como argv[1] -> DEBE ser false
  assert.equal(checkIsDirectExecution("/usr/local/bin/node", scriptUrl), false);
  assert.equal(checkIsDirectExecution("tests/wms-c3-route-post.test.ts", scriptUrl), false);

  // 6. Entradas inválidas / nulas -> DEBE ser false
  assert.equal(checkIsDirectExecution("", scriptUrl), false);
  assert.equal(checkIsDirectExecution(null as any, scriptUrl), false);
  assert.equal(checkIsDirectExecution(undefined as any, scriptUrl), false);
});

test("M7 C-3 DEUDA PR #135 — validateIsolation rechaza estrictamente host o base ausentes, vacíos o no loopback", () => {
  // Host no loopback
  assert.throws(
    () => validateIsolation({ host: "192.168.1.1", database: "fornexa_test" }),
    /\[SECURITY_FATAL MUST-5\] Target host '192.168.1.1' is NOT a local loopback address/,
  );
  assert.throws(
    () => validateIsolation({ host: "db.supabase.co", database: "fornexa_test" }),
    /\[SECURITY_FATAL MUST-5\] Target host 'db.supabase.co' is NOT a local loopback address/,
  );

  // Host vacío o ausente (hueco detectado por Grok)
  assert.throws(
    () => validateIsolation({ host: "", database: "fornexa_test" }),
    /\[SECURITY_FATAL MUST-5\] Target host '' is NOT a local loopback address/,
  );
  assert.throws(
    () => validateIsolation({ host: undefined as any, database: "fornexa_test" }),
    /\[SECURITY_FATAL MUST-5\] Target host 'undefined' is NOT a local loopback address/,
  );

  // Base de datos prohibida
  assert.throws(
    () => validateIsolation({ host: "127.0.0.1", database: "production" }),
    /\[SECURITY_FATAL MUST-5\] Target database 'production' is a forbidden production or system database/,
  );
  assert.throws(
    () => validateIsolation({ host: "127.0.0.1", database: "postgres" }),
    /\[SECURITY_FATAL MUST-5\] Target database 'postgres' is a forbidden production or system database/,
  );
  assert.throws(
    () => validateIsolation({ host: "127.0.0.1", database: "supabase" }),
    /\[SECURITY_FATAL MUST-5\] Target database 'supabase' is a forbidden production or system database/,
  );

  // Loopback autorizados y base desechable válida
  assert.doesNotThrow(() => validateIsolation({ host: "127.0.0.1", database: "fornexa_test" }));
  assert.doesNotThrow(() => validateIsolation({ host: "localhost", database: "fornexa_test" }));
  assert.doesNotThrow(() => validateIsolation({ host: "::1", database: "fornexa_test" }));
});

test("M7 C-3 DEUDA PR #135 — validateDisposableDatabase verifica dinámicamente antes de cualquier DDL", async () => {
  const executionLog: string[] = [];

  // Mock DB que registra el orden exacto de ejecución de consultas
  const spyDb = {
    query: async (sql: string) => {
      executionLog.push(sql.trim());
      if (sql.includes("information_schema.tables")) {
        // Simular que existen tablas preexistentes sin marcador sintético
        return { rows: [{ table_name: "customers" }, { table_name: "orders" }] };
      }
      return { rows: [] };
    },
  };

  // 1. Debe lanzar excepción de seguridad ANTES de que se intente ningún DROP o CREATE
  await assert.rejects(
    async () => {
      await validateDisposableDatabase(spyDb as any, "pg-socket");
      // Si validateDisposableDatabase pasara erróneamente, se ejecutaría el DDL:
      executionLog.push("DROP SCHEMA public CASCADE");
    },
    /\[SECURITY_FATAL MUST-5\] Target database contains non-disposable existing tables/,
  );

  // 2. Certificar que DROP SCHEMA nunca fue ejecutado
  assert.equal(
    executionLog.some((q) => q.includes("DROP SCHEMA")),
    false,
    "DROP SCHEMA public cascade NUNCA debe ejecutarse si la base no es desechable",
  );

  // 3. Certificar que las comprobaciones de seguridad fueron las primeras en ejecutarse
  assert.ok(executionLog[0].includes("information_schema.tables"));
});
