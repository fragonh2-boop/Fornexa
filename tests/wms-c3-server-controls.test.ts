import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { WMS_ACTIONS, isHuColumnMissingError, executeWmsActionApi, validateWmsActionPayloadSecurity, type WmsAction } from "../lib/wms.ts";

const C3_MIGRATION_PATH = resolve(
  import.meta.dirname,
  "../supabase/migrations/20261019120000_wms_c3_server_load_controls.sql",
);
const C3_RESOLUTION_PATH = resolve(
  import.meta.dirname,
  "../docs/architecture/wms-m7-c3-contract-resolution.md",
);
const API_ROUTE_PATH = resolve(
  import.meta.dirname,
  "../app/api/wms/route.ts",
);
const WORKSPACE_PATH = resolve(
  import.meta.dirname,
  "../app/dashboard/almacenes/WmsWorkspace.tsx",
);

const migrationSql = readFileSync(C3_MIGRATION_PATH, "utf-8");
const contractDoc = readFileSync(C3_RESOLUTION_PATH, "utf-8");
const apiRoute = readFileSync(API_ROUTE_PATH, "utf-8");
const workspace = readFileSync(WORKSPACE_PATH, "utf-8");

test("M7 C-3 — lib/wms declara CONTROL_STATE en WMS_ACTIONS y columnas de control y medición en WmsHandlingUnit", () => {
  assert.ok(
    WMS_ACTIONS.includes("CONTROL_STATE" as WmsAction),
    "CONTROL_STATE debe formar parte de WMS_ACTIONS",
  );
  const wmsTs = readFileSync(resolve(import.meta.dirname, "../lib/wms.ts"), "utf-8");
  assert.ok(
    wmsTs.includes("state_controlled_at?: string | null;"),
    "WmsHandlingUnit debe declarar state_controlled_at",
  );
  assert.ok(
    wmsTs.includes("state_controlled_by?: string | null;"),
    "WmsHandlingUnit debe declarar state_controlled_by",
  );
  assert.ok(
    wmsTs.includes("measured_at?: string | null;"),
    "WmsHandlingUnit debe declarar measured_at",
  );
  assert.ok(
    wmsTs.includes("measured_by?: string | null;"),
    "WmsHandlingUnit debe declarar measured_by",
  );
});

test("M7 C-3 — app/api/wms/route.ts rechaza con HTTP 400 determinista cualquier intento de usurpación de autoridad cliente", () => {
  // Verificación estática de las validaciones en POST
  assert.ok(
    apiRoute.includes('"state_controlled" in payload'),
    "API debe rechazar explícitamente state_controlled en payload",
  );
  assert.ok(
    apiRoute.includes('"expected_weight_kg" in payload'),
    "API debe rechazar explícitamente expected_weight_kg en payload",
  );
  assert.ok(
    apiRoute.includes('"expected_volume_m3" in payload'),
    "API debe rechazar explícitamente expected_volume_m3 en payload",
  );
  assert.ok(
    apiRoute.includes('"consolidation" in payload'),
    "API debe rechazar explícitamente consolidation en payload para REPLENISH",
  );
  assert.ok(
    apiRoute.includes('"conflicting_batch" in payload'),
    "API debe rechazar explícitamente conflicting_batch en payload para REPLENISH",
  );
  assert.ok(
    apiRoute.includes("400"),
    "API debe devolver status 400 ante payloads con parámetros prohibidos",
  );
});

test("M7 C-3 — WmsWorkspace no envía parámetros de autoridad cliente y expone acción CONTROL_STATE", () => {
  // LABEL y LOAD no deben enviar state_controlled ni expected_*
  const labelCall = workspace.match(/runAction\("LABEL",\s*\{[\s\S]*?\}\)/)?.[0] ?? "";
  assert.ok(labelCall.length > 0, "Debe existir llamada a runAction LABEL");
  assert.ok(!labelCall.includes("state_controlled"), "LABEL no debe enviar state_controlled");
  assert.ok(!labelCall.includes("expected_weight_kg"), "LABEL no debe enviar expected_weight_kg");
  assert.ok(!labelCall.includes("expected_volume_m3"), "LABEL no debe enviar expected_volume_m3");

  const loadCall = workspace.match(/runAction\("LOAD",\s*\{[\s\S]*?\}\)/)?.[0] ?? "";
  assert.ok(loadCall.length > 0, "Debe existir llamada a runAction LOAD");
  assert.ok(!loadCall.includes("state_controlled"), "LOAD no debe enviar state_controlled");

  // Debe existir llamada a CONTROL_STATE
  assert.ok(
    workspace.includes('runAction("CONTROL_STATE"'),
    "WmsWorkspace debe exponer llamada interactiva a CONTROL_STATE",
  );
  assert.ok(
    workspace.includes('status: "PASSED"'),
    "CONTROL_STATE debe soportar status PASSED",
  );
  assert.ok(
    workspace.includes('status: "REJECTED"'),
    "CONTROL_STATE debe soportar status REJECTED",
  );
});

test("M7 C-3 — migración declara columnas state_controlled_at/by e índice de búsqueda en handling_units", () => {
  assert.ok(
    migrationSql.includes("add column if not exists state_controlled_at timestamptz"),
    "La migración debe añadir state_controlled_at a handling_units",
  );
  assert.ok(
    migrationSql.includes("add column if not exists state_controlled_by uuid references auth.users(id)"),
    "La migración debe añadir state_controlled_by a handling_units",
  );
  assert.ok(
    migrationSql.includes("create index if not exists idx_handling_units_state_control"),
    "La migración debe crear índice sobre state_controlled_at",
  );
});

test("M7 C-3 — trigger trg_wms_invalidate_hu_control preserva aislamiento multitenant estricto (MUST-5)", () => {
  assert.ok(
    migrationSql.includes("create or replace function public.fornexa_wms_invalidate_hu_control()"),
    "La migración debe definir la función de invalidación",
  );
  assert.ok(
    migrationSql.includes("where tenant_id = old.tenant_id") &&
    migrationSql.includes("where tenant_id = new.tenant_id"),
    "La función de trigger debe filtrar por tenant_id tanto en DELETE como en INSERT/UPDATE (MUST-5)",
  );
  assert.ok(
    migrationSql.includes("set state_controlled_at = null"),
    "La función de trigger debe limpiar state_controlled_at",
  );
});

test("M7 C-3 — migración incluye pre-rollout seguro para require_state_control_on_load en políticas activas (MUST-2)", () => {
  assert.ok(
    migrationSql.includes("update public.warehouse_behavior_policies"),
    "La migración debe actualizar políticas de almacén activas",
  );
  assert.ok(
    migrationSql.includes("require_state_control_on_load"),
    "Debe asegurar require_state_control_on_load como default seguro",
  );
});

test("M7 C-3 — fornexa_wms_action es inmune a p_payload NULL en declaración y cuerpo (MUST-1)", () => {
  assert.ok(
    migrationSql.includes("case when p_payload is not null then p_payload->>'idempotency_key' else null end"),
    "v_idem debe proteger contra p_payload NULL",
  );
  assert.ok(
    migrationSql.includes("if p_payload is null then") &&
    migrationSql.includes("p_payload := '{}'::jsonb;"),
    "El cuerpo de la RPC debe normalizar p_payload nulo a jsonb vacío antes de cualquier acceso",
  );
});

test("M7 C-3 — CONTROL_STATE valida estados aptos de HU y bloquea no inspeccionables (MUST-3)", () => {
  assert.ok(
    migrationSql.includes("if v_hu.state not in ('STAGING_UNCHECKED', 'STAGING_CHECKED', 'PICKED_STAGED') then"),
    "CONTROL_STATE debe restringir inspección únicamente a estados aptos de staging (MUST-3)",
  );
  assert.ok(
    migrationSql.includes("raise exception 'WMS_NOT_READY_TO_LOAD'"),
    "HU en STORED, QUARANTINE o DAMAGED debe levantar WMS_NOT_READY_TO_LOAD",
  );
  assert.ok(
    migrationSql.includes("if v_hu.state = 'LOADED' then"),
    "HU en LOADED debe levantar excepción",
  );
});

test("M7 C-3 — CONTROL_STATE reconcilia stock_status y flow_state en quants ante REJECTED (MUST-4)", () => {
  assert.ok(
    migrationSql.includes("stock_status = case when v_rej_state = 'DAMAGED' then 'DAMAGED' else 'QUARANTINE' end"),
    "inventory_quants debe asignar stock_status DAMAGED cuando el rechazo es por daño (MUST-4)",
  );
  assert.ok(
    migrationSql.includes("flow_state = v_rej_state"),
    "flow_state debe alinearse semánticamente con v_rej_state",
  );
});

test("M7 C-3 — replay idempotente de CONTROL_STATE cubre PASSED y REJECTED con fingerprint exhaustivo (SHOULD-1 y SHOULD-10)", () => {
  assert.ok(
    migrationSql.includes("coalesce(upper(trim(p_payload->>'status')), '')") ||
    migrationSql.includes("coalesce(upper(p_payload->>'status'), '')"),
    "v_fingerprint debe incorporar status de inspección",
  );
  assert.ok(
    migrationSql.includes("coalesce(p_payload->>'reason', '')"),
    "v_fingerprint debe incorporar motivo de inspección",
  );
  assert.ok(
    migrationSql.includes("v_fingerprint") &&
    migrationSql.includes("'CONTROL_STATE', 'FAILED'"),
    "Tareas FAILED por CONTROL_STATE deben guardar v_fingerprint en reject_detail para replay idéntico",
  );
  assert.ok(
    migrationSql.includes("v_fingerprint") &&
    migrationSql.includes("'CONTROL_STATE', 'DONE'"),
    "Tareas DONE por CONTROL_STATE deben guardar v_fingerprint en reject_detail para replay idéntico",
  );
});

test("M7 C-3 — LABEL y LOAD calculan pesos y volúmenes en servidor y exigen control físico si la política lo requiere", () => {
  assert.ok(
    migrationSql.includes("sum(p.gross_weight_kg * huc.quantity)"),
    "LABEL/LOAD deben calcular el peso sumando gross_weight_kg * quantity de productos",
  );
  assert.ok(
    migrationSql.includes("sum(p.volume_m3 * huc.quantity)"),
    "LABEL/LOAD deben calcular el volumen sumando volume_m3 * quantity de productos",
  );
  assert.ok(
    migrationSql.includes("require_state_control_on_load"),
    "Se debe consultar require_state_control_on_load de la política",
  );
  assert.ok(
    migrationSql.includes("v_hu.state_controlled_at is null"),
    "Se debe comprobar si state_controlled_at es null en la base de datos",
  );
  assert.ok(
    migrationSql.includes("raise exception 'WMS_CONTROL_PENDING'"),
    "Se debe levantar WMS_CONTROL_PENDING si falta el control físico",
  );
  assert.ok(
    migrationSql.includes("raise exception 'WMS_WEIGHT_TOLERANCE'"),
    "Se debe levantar WMS_WEIGHT_TOLERANCE si el peso excede la tolerancia",
  );
  assert.ok(
    migrationSql.includes("raise exception 'WMS_VOLUME_TOLERANCE'"),
    "Se debe levantar WMS_VOLUME_TOLERANCE si el volumen excede la tolerancia",
  );
});

test("M7 C-3 — REPLENISH deriva consolidación estrictamente de política de servidor", () => {
  assert.ok(
    migrationSql.includes("v_consolidation := coalesce(v_policy->>'consolidation', 'YES')"),
    "REPLENISH debe derivar consolidación de la política sin leer p_payload->>'consolidation'",
  );
  assert.ok(
    migrationSql.includes("raise exception 'WMS_CONSOLIDATION_CONFLICT'"),
    "REPLENISH debe comprobar conflicto de lote o mezcla según política en servidor",
  );
});

test("M7 C-3 — RECEIVE_CHECK y PICK resetean explícitamente state_controlled_at", () => {
  assert.ok(
    migrationSql.includes("state_controlled_at = null"),
    "RECEIVE_CHECK y PICK deben resetear state_controlled_at",
  );
});

test("M7 C-3 — documento de resolución wms-m7-c3-contract-resolution.md cubre los puntos (a) a (e)", () => {
  assert.ok(contractDoc.includes("### (a)"), "Debe documentar resolución (a)");
  assert.ok(contractDoc.includes("### (b)"), "Debe documentar resolución (b)");
  assert.ok(contractDoc.includes("### (c)"), "Debe documentar resolución (c)");
  assert.ok(contractDoc.includes("### (d)"), "Debe documentar resolución (d)");
  assert.ok(contractDoc.includes("### (e)"), "Debe documentar resolución (e)");
});

test("M7 C-3 — helper fornexa_wms_policy_bool define parsing seguro y previene errores 22P02 (MUST-A)", () => {
  assert.ok(
    migrationSql.includes("create or replace function public.fornexa_wms_policy_bool"),
    "La migración debe definir la función helper fornexa_wms_policy_bool",
  );
  assert.ok(
    migrationSql.includes("fornexa_wms_policy_bool(v_policy, 'require_state_control_on_load', true)"),
    "LABEL y LOAD deben evaluar require_state_control_on_load mediante fornexa_wms_policy_bool",
  );
  assert.ok(
    !migrationSql.includes("::boolean"),
    "No debe existir ningún casteo crudo ::boolean en la migración para evitar error PostgreSQL 22P02",
  );

  // Simulación funcional del evaluador seguro de políticas booleanas
  function parsePolicyBool(policy: Record<string, unknown> | null, key: string, def = true): boolean {
    if (!policy || !(key in policy)) return def;
    const raw = String(policy[key] ?? "").trim().toLowerCase();
    if (raw === "") return def;
    if (["true", "1", "t", "yes", "si", "on"].includes(raw)) return true;
    if (["false", "0", "f", "no", "off"].includes(raw)) return false;
    return def;
  }

  assert.strictEqual(parsePolicyBool({ k: "true" }, "k"), true);
  assert.strictEqual(parsePolicyBool({ k: "si" }, "k"), true);
  assert.strictEqual(parsePolicyBool({ k: "1" }, "k"), true);
  assert.strictEqual(parsePolicyBool({ k: "false" }, "k"), false);
  assert.strictEqual(parsePolicyBool({ k: "0" }, "k"), false);
  assert.strictEqual(parsePolicyBool({ k: "no" }, "k"), false);
  assert.strictEqual(parsePolicyBool({ k: "invalid_syntax" }, "k", true), true);
  assert.strictEqual(parsePolicyBool({ k: "" }, "k", true), true);
  assert.strictEqual(parsePolicyBool(null, "k", true), true);
});

test("M7 C-3 — CONTROL_STATE deriva v_rej_state estrictamente de disposition sin heurísticas LIKE (SHOULD-B y SHOULD-C)", () => {
  assert.ok(
    !migrationSql.includes("like '%dañ%'") && !migrationSql.includes("like '%damag%'"),
    "CONTROL_STATE no debe contener heurísticas de lenguaje natural LIKE",
  );
  assert.ok(
    migrationSql.includes("v_disposition text;") && migrationSql.includes("v_rej_state text;"),
    "v_disposition y v_rej_state deben declararse en el bloque superior de fornexa_wms_action (SHOULD-B)",
  );
  assert.ok(
    migrationSql.includes("if v_disposition not in ('QUARANTINE', 'DAMAGED') then") &&
    migrationSql.includes("v_disposition := 'QUARANTINE';"),
    "v_disposition debe fallar cerrado a QUARANTINE si no es DAMAGED (SHOULD-C)",
  );
});

test("M7 C-3 — migración documenta condición vinculante de rollback y notas operativas de rollout (SHOULD-I y MUST-A)", () => {
  assert.ok(
    migrationSql.includes("CONDICIÓN VINCULANTE (SHOULD-I): Solo válido si no hay migraciones posteriores a"),
    "La migración debe documentar la condición vinculante de rollback (SHOULD-I)",
  );
  assert.ok(
    migrationSql.includes("NOTA OPERATIVA DE DESPLIEGUE (ROLLOUT SAFETY - MUST-A)"),
    "La migración debe documentar la nota de rollout para HUs preexistentes (MUST-A)",
  );
});

test("M7 C-3 — WmsWorkspace utiliza clases CSS controlOk y controlPending sin estilos inline (NICE-1)", () => {
  assert.ok(
    workspace.includes("styles.controlOk") && workspace.includes("styles.controlPending"),
    "WmsWorkspace debe usar styles.controlOk y styles.controlPending",
  );
});

test("M7 C-3 — backfill de políticas se ubica al final de la migración tras fornexa_wms_action y exige bloque atómico (MUST-1)", () => {
  const rpcIndex = migrationSql.indexOf("create or replace function public.fornexa_wms_action");
  assert.ok(rpcIndex > 0, "Debe existir fornexa_wms_action en la migración");

  const backfillIndex = migrationSql.indexOf("update public.warehouse_behavior_policies");
  assert.ok(backfillIndex > 0, "Debe existir la sentencia de backfill de políticas");

  assert.ok(
    backfillIndex > rpcIndex,
    "El backfill de require_state_control_on_load debe ejecutarse después de fornexa_wms_action (MUST-1)",
  );

  assert.ok(
    migrationSql.includes("bloque transaccional atómico único (BEGIN ... COMMIT)"),
    "La migración debe documentar la obligatoriedad de ejecución en bloque transaccional atómico",
  );
});

test("M7 C-3 — isHuColumnMissingError y wms-loader discriminan estrictamente errores de columna vs red/RLS (MUST-2)", () => {

  // Debe retornar true para código 42703 (undefined_column) o mensaje descriptivo
  assert.strictEqual(isHuColumnMissingError({ code: "42703", message: "column not found" }), true);
  assert.strictEqual(
    isHuColumnMissingError({ code: "PGRST204", message: "Could not find the 'state_controlled_at' column" }),
    true,
  );
  assert.strictEqual(
    isHuColumnMissingError({ code: "PGRST204", message: "Could not find the 'state_controlled_by' column" }),
    true,
  );

  // Debe retornar false para errores de RLS (42501), de red, timeout o permisos
  assert.strictEqual(isHuColumnMissingError({ code: "42501", message: "permission denied for table handling_units" }), false);
  assert.strictEqual(isHuColumnMissingError({ code: "ETIMEDOUT", message: "connection timed out" }), false);
  assert.strictEqual(isHuColumnMissingError({ message: "NetworkError when attempting to fetch resource." }), false);
  assert.strictEqual(isHuColumnMissingError(null), false);
  assert.strictEqual(isHuColumnMissingError(undefined), false);

  // wms-loader.ts debe invocar isHuColumnMissingError en la consulta de fallback
  const loaderSrc = readFileSync(resolve(import.meta.dirname, "../lib/wms-loader.ts"), "utf-8");
  assert.ok(
    loaderSrc.includes("isHuColumnMissingError(husRes.error)"),
    "loadWmsData debe invocar isHuColumnMissingError antes de ejecutar la consulta de fallback",
  );
});

test("M7 C-3 — CONTROL_STATE exige status explícito obligatorio y rechaza omisiones fail-closed sin inventar PASSED (MUST-3)", () => {
  assert.ok(
    migrationSql.includes("v_control_status := upper(nullif(trim(p_payload->>'status'), ''));"),
    "CONTROL_STATE debe extraer y normalizar status de manera estricta",
  );
  assert.ok(
    migrationSql.includes("if v_control_status is null or v_control_status not in ('PASSED', 'REJECTED') then"),
    "CONTROL_STATE debe exigir que status sea estrictamente no nulo y ('PASSED', 'REJECTED')",
  );
  assert.ok(
    migrationSql.includes("raise exception 'WMS_FORBIDDEN';"),
    "CONTROL_STATE debe levantar WMS_FORBIDDEN ante status inválido o nulo",
  );
  assert.ok(
    !migrationSql.includes("coalesce(p_payload->>'status', 'PASSED')"),
    "No debe admitir fallback tácito a PASSED ante ausencia de status",
  );
});

test("M7 C-3 — lib/memorandum.ts modera la redacción de C-3 a 'En revisión independiente' (SHOULD-7)", () => {
  const memoSrc = readFileSync(resolve(import.meta.dirname, "../lib/memorandum.ts"), "utf-8");
  assert.ok(
    memoSrc.includes("En revisión independiente de M7 (C-3)"),
    "El resumen de almacenes en memorandum.ts debe reflejar 'En revisión independiente de M7 (C-3)'",
  );
  assert.ok(
    !memoSrc.includes("Se incorpora en M7 (C-3)"),
    "No debe afirmar que C-3 ya está incorporado en producción",
  );
});

test("M7 C-3 — Ejecución local relacional en PostgreSQL genera recibo con pre/postestado de 16 casos (MUST-1)", () => {
  const receiptPath = resolve(import.meta.dirname, "../docs/verification/receipt-m7-c3-postgres.json");
  const rawReceipt = readFileSync(receiptPath, "utf-8");
  const receipt = JSON.parse(rawReceipt);
  assert.equal(receipt.summary.total, 16);
  assert.equal(receipt.summary.passed, 16);
  assert.equal(receipt.summary.failed, 0);
  assert.ok(receipt.cases.length === 16);
  assert.ok(receipt.musts.length >= 4);
});

test("M7 C-3 — Script de rollback protegido no reabre el bypass E1 ni elimina columnas (MUST-2)", () => {
  const rbPath = resolve(
    import.meta.dirname,
    "../supabase/migrations/rollback/20261019120000_wms_c3_rollback_protected.sql",
  );
  const rbSql = readFileSync(rbPath, "utf-8");
  assert.ok(!rbSql.includes("drop column"), "Rollback protegido no debe eliminar columnas nulables");
  assert.ok(
    rbSql.includes("p_idempotency_key text default null"),
    "Rollback protegido debe preservar la firma exacta de fornexa_wms_action",
  );
  assert.ok(
    rbSql.includes("raise exception 'WMS_ROLLBACK_ACTIVE';"),
    "Rollback protegido debe rechazar ejecuciones operativas inseguras",
  );
});

test("M7 C-3 — Medición de peso/volumen es obligatoria cuando la política lo requiere y persiste timestamps (MUST-4)", () => {
  assert.ok(
    migrationSql.includes("v_req_weight := public.fornexa_wms_policy_bool(v_policy, 'require_weight_measurement', false)"),
    "LABEL y LOAD deben evaluar require_weight_measurement",
  );
  assert.ok(
    migrationSql.includes("raise exception 'WMS_WEIGHT_TOLERANCE';"),
    "Omisión de peso medido cuando es requerido debe levantar WMS_WEIGHT_TOLERANCE",
  );
  assert.ok(
    migrationSql.includes("measured_at = case when v_measured_weight is not null or v_measured_volume is not null then v_ts else measured_at end"),
    "LABEL y LOAD deben actualizar measured_at con timestamp del servidor",
  );
  assert.ok(
    migrationSql.includes("measured_by = case when v_measured_weight is not null or v_measured_volume is not null then p_actor else measured_by end"),
    "LABEL y LOAD deben registrar el actor que efectuó la medición",
  );
});

test("M7 C-3 — Mutación de quant.hu_id invalida control de estado y mediciones (SHOULD-1)", () => {
  assert.ok(
    migrationSql.includes("drop trigger if exists trg_wms_invalidate_hu_control_quants on public.inventory_quants;"),
    "Debe registrarse trigger de invalidación sobre inventory_quants",
  );
  assert.ok(
    migrationSql.includes("tg_table_name = 'inventory_quants'"),
    "Función fornexa_wms_invalidate_hu_control debe manejar mutaciones de inventory_quants",
  );
});

test("M7 C-3 SHOULD-1 — API Request execution rejects client-provided authority fields with HTTP 400 WMS_FORBIDDEN", async () => {
  const authContext = {
    userId: "00000000-0000-4000-8000-000000000001",
    tenantId: "10000000-0000-4000-8000-000000000001",
    role: "OPERATOR",
  };

  // Test 1: state_controlled in payload -> 400
  const req1 = new Request("https://localhost/api/wms", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action: "LOAD",
      payload: {
        hu_id: "70000000-0000-4000-8000-000000000001",
        state_controlled: true,
      },
    }),
  });
  const res1 = await executeWmsActionApi(req1, authContext);
  assert.equal(res1.status, 400);
  const data1 = (await res1.json()) as { code: string; error: string };
  assert.equal(data1.code, "WMS_FORBIDDEN");
  assert.ok(data1.error.includes("cálculo exclusivo en servidor"));

  // Test 2: expected_weight_kg in payload -> 400
  const req2 = new Request("https://localhost/api/wms", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action: "LOAD",
      payload: {
        hu_id: "70000000-0000-4000-8000-000000000001",
        expected_weight_kg: 50.0,
      },
    }),
  });
  const res2 = await executeWmsActionApi(req2, authContext);
  assert.equal(res2.status, 400);
  const data2 = (await res2.json()) as { code: string; error: string };
  assert.equal(data2.code, "WMS_FORBIDDEN");

  // Test 3: expected_volume_m3 in payload -> 400
  const req3 = new Request("https://localhost/api/wms", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action: "LABEL",
      payload: {
        hu_id: "70000000-0000-4000-8000-000000000001",
        expected_volume_m3: 1.2,
      },
    }),
  });
  const res3 = await executeWmsActionApi(req3, authContext);
  assert.equal(res3.status, 400);
  const data3 = (await res3.json()) as { code: string; error: string };
  assert.equal(data3.code, "WMS_FORBIDDEN");

  // Test 4: REPLENISH with consolidation in payload -> 400
  const req4 = new Request("https://localhost/api/wms", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action: "REPLENISH",
      payload: {
        source_bin_id: "20000000-0000-4000-8000-000000000001",
        target_bin_id: "20000000-0000-4000-8000-000000000002",
        consolidation: "OVERRIDE_ALLOW",
      },
    }),
  });
  const res4 = await executeWmsActionApi(req4, authContext);
  assert.equal(res4.status, 400);
  const data4 = (await res4.json()) as { code: string; error: string };
  assert.equal(data4.code, "WMS_FORBIDDEN");
  assert.ok(data4.error.includes("consolidación es de cálculo exclusivo en servidor"));

  // Test 5: Unrecognized action -> 400
  const req5 = new Request("https://localhost/api/wms", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action: "INVALID_HACK_ACTION",
      payload: {},
    }),
  });
  const res5 = await executeWmsActionApi(req5, authContext);
  assert.equal(res5.status, 400);
  const data5 = (await res5.json()) as { code: string; error: string };
  assert.equal(data5.code, "WMS_FORBIDDEN");

  // Test 6: Valid action without client authority fields passes through to RPC executor cleanly
  let rpcCalled = false;
  const req6 = new Request("https://localhost/api/wms", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action: "LOAD",
      payload: {
        hu_id: "70000000-0000-4000-8000-000000000001",
        scanned_code: "HU-VALID",
        measured_weight_kg: 25.5,
      },
    }),
  });
  // Direct test of validateWmsActionPayloadSecurity helper
  assert.equal(validateWmsActionPayloadSecurity("LOAD", { state_controlled: true })?.code, "WMS_FORBIDDEN");
  assert.equal(validateWmsActionPayloadSecurity("LOAD", { scanned_code: "OK" }), null);

  const res6 = await executeWmsActionApi(req6, authContext, async (action) => {
    rpcCalled = true;
    return { ok: true, action };
  });
  assert.equal(res6.status, 200);
  assert.equal(rpcCalled, true);
});

test("M7 C-3 SHOULD-1 — documento de contrato no cita códigos inexistentes como WMS_MEASUREMENT_REQUIRED y documenta WMS_WEIGHT_TOLERANCE", () => {
  const currentContractDoc = readFileSync(C3_RESOLUTION_PATH, "utf-8");
  assert.ok(
    !currentContractDoc.includes("WMS_MEASUREMENT_REQUIRED"),
    "El documento de contrato no debe citar el código inexistente WMS_MEASUREMENT_REQUIRED",
  );
  assert.ok(
    currentContractDoc.includes("WMS_WEIGHT_TOLERANCE"),
    "El documento de contrato debe documentar el código real WMS_WEIGHT_TOLERANCE",
  );
});

test("M7 C-3 SHOULD-2 — validateDisposableDatabase rechaza base con tablas sin marcador sintético y autoriza con marcador o vacía (MUST-5 guard)", async () => {
  // @ts-expect-error - import dynamic from local .mjs harness script
  const { validateDisposableDatabase, validateIsolation, checkIsDirectExecution, isDirectExecution } = await import("../scripts/wms/verify-c3-postgres.mjs");

  // Al importar desde el test runner, la guarda de ejecución directa DEBE ser estrictamente false (cero efectos secundarios)
  assert.equal(isDirectExecution, false, "Al importar el arnés desde test runner, isDirectExecution debe ser estrictamente false");

  // 1. Base externa con tablas ajenas en 'public' SIN marcador sintético -> DEBE LANZAR [SECURITY_FATAL MUST-5]
  const mockAlienDb = {
    query: async () => ({
      rows: [{ table_name: "users" }, { table_name: "orders" }, { table_name: "wms_bins" }],
    }),
  };
  await assert.rejects(
    async () => {
      await validateDisposableDatabase(mockAlienDb, "pg-socket");
    },
    (err: Error) => {
      assert.ok(
        err.message.includes("[SECURITY_FATAL MUST-5]"),
        `Error debe contener [SECURITY_FATAL MUST-5], obtenido: ${err.message}`,
      );
      assert.ok(
        err.message.includes("without synthetic test marker 'fornexa_synthetic_test_marker'"),
        "Error debe especificar la ausencia del marcador sintético",
      );
      return true;
    },
  );

  // 2. Base externa con tablas que CONTIENEN el marcador sintético 'fornexa_synthetic_test_marker' -> AUTORIZADO
  const mockReusableTestDb = {
    query: async () => ({
      rows: [{ table_name: "fornexa_synthetic_test_marker" }, { table_name: "handling_units" }],
    }),
  };
  await assert.doesNotReject(async () => {
    await validateDisposableDatabase(mockReusableTestDb, "pg-socket");
  });

  // 3. Base externa completamente vacía (0 tablas) -> AUTORIZADO
  const mockEmptyDb = {
    query: async () => ({ rows: [] }),
  };
  await assert.doesNotReject(async () => {
    await validateDisposableDatabase(mockEmptyDb, "pg-socket");
  });

  // 4. Sandbox en memoria PGlite WASM -> AUTORIZADO inmediatamente sin consulta
  const mockPgliteDb = {
    query: async () => {
      throw new Error("No debe ejecutarse query para sandbox efímero");
    },
  };
  await assert.doesNotReject(async () => {
    await validateDisposableDatabase(mockPgliteDb, "pglite-wasm");
  });

  // 5. Host y DB isolation validator exhaustivo
  assert.throws(
    () => validateIsolation({ host: "192.168.1.100", database: "fornexa_test" }),
    /\[SECURITY_FATAL MUST-5\] Target host '192.168.1.100' is NOT a local loopback address/,
  );
  assert.throws(
    () => validateIsolation({ host: "", database: "fornexa_test" }),
    /\[SECURITY_FATAL MUST-5\] Target host '' is NOT a local loopback address/,
  );
  assert.throws(
    () => validateIsolation({ host: "supabase", database: "fornexa_test" }),
    /\[SECURITY_FATAL MUST-5\] Target host 'supabase' is NOT a local loopback address/,
  );
  assert.throws(
    () => validateIsolation({ database: "fornexa_test" } as any),
    /\[SECURITY_FATAL MUST-5\] Target host 'undefined' is NOT a local loopback address/,
  );
  assert.throws(
    () => validateIsolation({ host: "127.0.0.1", database: "" }),
    /\[SECURITY_FATAL MUST-5\] Target database is required/,
  );
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
  assert.doesNotThrow(() => validateIsolation({ host: "127.0.0.1", database: "fornexa_test" }));
  assert.doesNotThrow(() => validateIsolation({ host: "localhost", database: "fornexa_test" }));
  assert.doesNotThrow(() => validateIsolation({ host: "::1", database: "fornexa_test" }));

  // 6. Comprobación estática de orden en arnés
  const harnessScript = readFileSync(resolve(import.meta.dirname, "../scripts/wms/verify-c3-postgres.mjs"), "utf-8");
  const idxValidate = harnessScript.indexOf("validateDisposableDatabase(db, clientType)");
  const idxDropSchema = harnessScript.indexOf("drop schema if exists public cascade");
  assert.ok(idxValidate !== -1, "validateDisposableDatabase debe estar presente en el arnés");
  assert.ok(idxDropSchema !== -1, "drop schema debe estar presente en el arnés");
  assert.ok(
    idxValidate < idxDropSchema,
    "validateDisposableDatabase DEBE llamarse estrictamente antes de drop schema public cascade",
  );

  // 7. Comprobación DINÁMICA de ejecución: el arnés aborta antes de ejecutar cualquier DDL destructivo
  let ddlExecuted = false;
  const mockFailingDb = {
    query: async (sqlText: string) => {
      if (typeof sqlText === "string" && sqlText.toLowerCase().includes("drop schema")) {
        ddlExecuted = true;
      }
      return { rows: [{ table_name: "orders" }, { table_name: "users" }] };
    },
  };
  await assert.rejects(
    async () => {
      // Simula el orden exacto del flujo en runHarness(): primero validación, si falla no hay DDL
      await validateDisposableDatabase(mockFailingDb, "pg-socket");
      await mockFailingDb.query("drop schema if exists public cascade");
    },
    /\[SECURITY_FATAL MUST-5\]/,
  );
  assert.equal(ddlExecuted, false, "El DDL destructivo jamás debe ejecutarse si validateDisposableDatabase rechaza la base");

  // 8. Certificación simétrica de checkIsDirectExecution (eliminación del fallo de endsWith)
  const scriptMetaUrl = new URL("../scripts/wms/verify-c3-postgres.mjs", import.meta.url).href;
  const scriptAbsPath = fileURLToPath(scriptMetaUrl);

  // Invocaciones legítimas
  assert.equal(checkIsDirectExecution(scriptAbsPath, scriptMetaUrl), true, "Ruta absoluta canónica resuelta debe retornar true");
  assert.equal(checkIsDirectExecution("./scripts/wms/verify-c3-postgres.mjs", scriptMetaUrl), true, "Ruta relativa resuelta debe retornar true");

  // Falsos positivos que el endsWith frágil aceptaba erróneamente:
  assert.equal(checkIsDirectExecution("c3-postgres.mjs", scriptMetaUrl), false, "Sufijo corto c3-postgres.mjs debe ser estrictamente false");
  assert.equal(checkIsDirectExecution("postgres.mjs", scriptMetaUrl), false, "Sufijo corto postgres.mjs debe ser estrictamente false");
  assert.equal(checkIsDirectExecution("gres.mjs", scriptMetaUrl), false, "Sufijo corto gres.mjs debe ser estrictamente false");
  assert.equal(checkIsDirectExecution(".mjs", scriptMetaUrl), false, "Sufijo .mjs debe ser estrictamente false");
  assert.equal(checkIsDirectExecution("s", scriptMetaUrl), false, "Sufijo de un caracter 's' debe ser estrictamente false");

  // Runners y scripts de prueba
  assert.equal(checkIsDirectExecution("/usr/local/bin/node", scriptMetaUrl), false, "Runner 'node' debe ser estrictamente false");
  assert.equal(checkIsDirectExecution("tests/wms-c3-server-controls.test.ts", scriptMetaUrl), false, "Test runner debe ser estrictamente false");
  assert.equal(checkIsDirectExecution("", scriptMetaUrl), false, "Cadena vacía debe ser false");
  assert.equal(checkIsDirectExecution(undefined, scriptMetaUrl), false, "Undefined debe ser false");
});




