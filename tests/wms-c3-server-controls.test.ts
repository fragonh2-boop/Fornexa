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

test("M7 C-3 — Contrato DDL de fornexa_wms_policy_bool: firma, manejo seguro y ausencia de 22P02", () => {
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
  assert.ok(
    migrationSql.includes("revoke all on function public.fornexa_wms_policy_bool(jsonb, text, boolean) from public, anon, authenticated"),
    "Se deben revocar privilegios públicos de fornexa_wms_policy_bool",
  );
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

/**
 * Función canónica de validación estricta de recibo relacional duradero.
 * Falla de forma cerrada si:
 * - El motor o base de datos no corresponden a la certificación homologada de contenedor (pg-socket / fornexa_test).
 * - Faltan o son inválidos los hashes criptográficos (execution_sha, github_run_id, migration_sha256, rollback_sha256, harness_sha256).
 * - Cualquiera de los 16 casos no tiene status "PASS" explícito individual.
 * - Cualquiera de los MUSTs obligatorios no tiene status "PASS" explícito individual.
 */
export function validateRelationalReceipt(receipt: any): void {
  assert.ok(receipt && typeof receipt === "object", "El recibo debe ser un objeto válido");
  assert.equal(receipt.engine, "pg-socket", "El recibo duradero debe estar certificado con engine pg-socket");
  assert.equal(receipt.database, "fornexa_test", "La base de datos del recibo debe ser fornexa_test");
  assert.equal(receipt.certification_scope, "DURABLE_PG16_CONTAINER_CERTIFICATION");
  assert.equal(receipt.concurrency_certified, true, "El recibo debe certificar concurrencia transaccional");

  // Vinculación estricta de SHA y Run
  assert.match(
    receipt.execution_sha,
    /^[0-9a-f]{40}$/i,
    "execution_sha debe ser un commit SHA-1 hexadecimal de 40 caracteres",
  );
  assert.match(
    String(receipt.github_run_id),
    /^\d+$/,
    "github_run_id debe ser un identificador numérico de ejecución CI",
  );
  assert.match(
    receipt.migration_sha256,
    /^[0-9a-f]{64}$/i,
    "migration_sha256 debe ser un hash SHA-256 válido de 64 caracteres",
  );
  assert.match(
    receipt.rollback_sha256,
    /^[0-9a-f]{64}$/i,
    "rollback_sha256 debe ser un hash SHA-256 válido de 64 caracteres",
  );
  assert.match(
    receipt.harness_sha256,
    /^[0-9a-f]{64}$/i,
    "harness_sha256 debe ser un hash SHA-256 válido de 64 caracteres",
  );

  // Validación estricta de matriz de 16 casos
  assert.equal(receipt.summary.total, 16, "El total de casos en summary debe ser exactamente 16");
  assert.equal(receipt.summary.passed, 16, "El conteo passed en summary debe ser exactamente 16");
  assert.equal(receipt.summary.failed, 0, "El conteo failed en summary debe ser 0");
  assert.ok(Array.isArray(receipt.cases), "receipt.cases debe ser un array");
  assert.equal(receipt.cases.length, 16, "receipt.cases debe contener exactamente 16 elementos");

  for (let i = 0; i < 16; i++) {
    const c = receipt.cases[i];
    assert.equal(c.case, i + 1, `El caso en índice ${i} debe tener identificador case: ${i + 1}`);
    assert.equal(
      c.status,
      "PASS",
      `El caso ${i + 1} (${c.title}) debe certificar status PASS individual estricto (no se admite FAIL ni omisión)`,
    );
    assert.ok(typeof c.title === "string" && c.title.trim().length > 0, `El caso ${i + 1} debe incluir título descriptivo`);
  }

  // Validación estricta de MUSTs de seguridad y arquitectura
  const requiredMusts = ["MUST-1", "MUST-2", "MUST-3", "MUST-4", "MUST-5", "MUST-RLS", "MUST-EXECUTE", "MUST-POLICY-BOOL"];
  assert.ok(Array.isArray(receipt.musts), "receipt.musts debe ser un array");
  const mustMap = new Map<string, any>(receipt.musts.map((m: any) => [m.must, m]));

  for (const mustKey of requiredMusts) {
    assert.ok(mustMap.has(mustKey), `Debe existir ${mustKey} en receipt.musts`);
    const m: any = mustMap.get(mustKey);
    assert.equal(m.status, "PASS", `El requisito ${mustKey} debe certificar status: PASS explícito`);
    assert.ok(typeof m.title === "string" && m.title.trim().length > 0, `El requisito ${mustKey} debe tener título`);
    assert.ok(m.evidence && typeof m.evidence === "object", `El requisito ${mustKey} debe contener evidencia`);
  }
}

test("M7 C-3 — Valida la forma del recibo histórico de CI #537 (no ejecuta PostgreSQL)", () => {
  const receiptPath = resolve(import.meta.dirname, "../docs/verification/receipt-m7-c3-postgres.json");
  const rawReceipt = readFileSync(receiptPath, "utf-8");
  const receipt = JSON.parse(rawReceipt);

  // Validación estricta integral del recibo duradero
  validateRelationalReceipt(receipt);

  const mustMap = new Map(receipt.musts.map((m: any) => [m.must, m]));

  // MUST-RLS detalle exacto emitido por el arnés
  const rlsMust = mustMap.get("MUST-RLS") as any;
  assert.equal(
    rlsMust.title,
    "Certificación de Row Level Security (RLS) activo y aislamiento comprobado entre tenants A/B",
  );
  assert.ok(Array.isArray(rlsMust.evidence.tables_relrowsecurity));
  assert.equal(rlsMust.evidence.tables_relrowsecurity.length, 4);
  assert.ok(
    rlsMust.evidence.tables_relrowsecurity.every((t: any) => t.relrowsecurity === true),
    "Todas las tablas WMS deben tener relrowsecurity = true",
  );
  assert.equal(rlsMust.evidence.probes.direct_mutations_denied_for_authenticated.sqlstate, "42501");
  assert.equal(rlsMust.evidence.probes.anon_denied.sqlstate, "42501");

  // MUST-EXECUTE detalle exacto con sonda positiva has_function_privilege
  const execMust = mustMap.get("MUST-EXECUTE") as any;
  assert.equal(
    execMust.title,
    "Control estricto de privilegios EXECUTE en fornexa_wms_action (no-superuser denegado)",
  );
  assert.equal(execMust.evidence.service_role_has_function_privilege, true);
  assert.equal(execMust.evidence.authenticated_sqlstate, "42501");
  assert.equal(execMust.evidence.anon_sqlstate, "42501");
  assert.equal(execMust.evidence.authenticated_denied, true);
  assert.equal(execMust.evidence.anon_denied, true);
});

test("M7 C-3 — Validador de recibo detecta y rechaza recibos inválidos, corruptos o con falsos positivos (pruebas negativas)", () => {
  const receiptPath = resolve(import.meta.dirname, "../docs/verification/receipt-m7-c3-postgres.json");
  const rawReceipt = readFileSync(receiptPath, "utf-8");
  const validReceipt = JSON.parse(rawReceipt);

  // 1. Rechazo si un caso individual está en FAIL aunque summary.passed reporte 16
  const badCaseReceipt = JSON.parse(JSON.stringify(validReceipt));
  badCaseReceipt.cases[0].status = "FAIL";
  assert.throws(
    () => validateRelationalReceipt(badCaseReceipt),
    /status PASS individual estricto/,
    "Debe rechazar recibo si algún caso tiene status FAIL",
  );

  // 2. Rechazo si la lista de casos está incompleta (15 casos)
  const incompleteCasesReceipt = JSON.parse(JSON.stringify(validReceipt));
  incompleteCasesReceipt.cases.pop();
  assert.throws(
    () => validateRelationalReceipt(incompleteCasesReceipt),
    /exactamente 16 elementos/,
    "Debe rechazar recibo si la lista de casos no contiene 16 elementos",
  );

  // 3. Rechazo si un MUST no tiene status PASS
  const badMustReceipt = JSON.parse(JSON.stringify(validReceipt));
  const rlsMust = badMustReceipt.musts.find((m: any) => m.must === "MUST-RLS");
  if (rlsMust) rlsMust.status = "FAIL";
  assert.throws(
    () => validateRelationalReceipt(badMustReceipt),
    /status: PASS explícito/,
    "Debe rechazar recibo si algún MUST tiene status FAIL",
  );

  // 4. Rechazo si falta un MUST obligatorio (p. ej. MUST-EXECUTE)
  const missingMustReceipt = JSON.parse(JSON.stringify(validReceipt));
  missingMustReceipt.musts = missingMustReceipt.musts.filter((m: any) => m.must !== "MUST-EXECUTE");
  assert.throws(
    () => validateRelationalReceipt(missingMustReceipt),
    /Debe existir MUST-EXECUTE/,
    "Debe rechazar recibo si falta un MUST obligatorio",
  );

  // 5. Rechazo si execution_sha no es un commit SHA de 40 hex (falso truthy)
  const fakeShaReceipt = JSON.parse(JSON.stringify(validReceipt));
  fakeShaReceipt.execution_sha = "not-a-valid-sha";
  assert.throws(
    () => validateRelationalReceipt(fakeShaReceipt),
    /execution_sha/,
    "Debe rechazar execution_sha no hexadecimal de 40 caracteres",
  );

  // 6. Rechazo si github_run_id no es numérico
  const fakeRunReceipt = JSON.parse(JSON.stringify(validReceipt));
  fakeRunReceipt.github_run_id = "run-fake-non-numeric";
  assert.throws(
    () => validateRelationalReceipt(fakeRunReceipt),
    /github_run_id/,
    "Debe rechazar github_run_id no numérico",
  );

  // 7. Rechazo si el engine no es pg-socket homologado
  const fakeEngineReceipt = JSON.parse(JSON.stringify(validReceipt));
  fakeEngineReceipt.engine = "pglite-wasm";
  assert.throws(
    () => validateRelationalReceipt(fakeEngineReceipt),
    /engine pg-socket/,
    "Debe rechazar recibo si no proviene del engine pg-socket homologado",
  );

  // 8. Rechazo si concurrency_certified es false
  const noConcurrencyReceipt = JSON.parse(JSON.stringify(validReceipt));
  noConcurrencyReceipt.concurrency_certified = false;
  assert.throws(
    () => validateRelationalReceipt(noConcurrencyReceipt),
    /concurrencia transaccional/,
    "Debe rechazar si concurrency_certified no es true",
  );
});

test("M7 C-3 — Script de rollback protegido no reabre el bypass E1 ni elimina columnas (MUST-2)", () => {
  const rbPath = resolve(
    import.meta.dirname,
    "../supabase/migrations/rollback/20261019120000_wms_c3_rollback_protected.sql",
  );
  const rbSql = readFileSync(rbPath, "utf-8");
  assert.ok(!/drop\s+column/i.test(rbSql), "Rollback protegido no debe eliminar columnas (prohibido DROP COLUMN case-insensitive)");
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
  const { validateDisposableDatabase, validateIsolation, checkIsDirectExecution, isDirectExecution, runHarness } = await import("../scripts/wms/verify-c3-postgres.mjs");

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

  // 7. Comprobación DINÁMICA de ejecución real del arnés: runHarness aborta antes de ejecutar cualquier DDL destructivo
  let ddlExecutedByHarness = false;
  const mockAlienDbForHarness = {
    query: async (sqlText: string) => {
      const lower = typeof sqlText === "string" ? sqlText.toLowerCase() : "";
      if (lower.includes("select version()") || lower.includes("select version();")) {
        return { rows: [{ ver: "PostgreSQL 16.15 (test mock)" }] };
      }
      if (lower.includes("drop schema") || lower.includes("create schema") || lower.includes("create table")) {
        ddlExecutedByHarness = true;
      }
      if (lower.includes("information_schema.tables")) {
        return { rows: [{ table_name: "orders" }, { table_name: "users" }] };
      }
      return { rows: [] };
    },
    exec: async (sqlText: string) => {
      const lower = typeof sqlText === "string" ? sqlText.toLowerCase() : "";
      if (lower.includes("drop schema") || lower.includes("create schema") || lower.includes("create table")) {
        ddlExecutedByHarness = true;
      }
      return [];
    },
  };

  await assert.rejects(
    async () => {
      // Invoca el arnés real pasando la BD con tablas preexistentes no desechables
      await runHarness({ db: mockAlienDbForHarness, clientType: "pg-socket", skipReceipt: true });
    },
    /\[SECURITY_FATAL MUST-5\] Target database contains non-disposable existing tables/,
  );
  assert.equal(
    ddlExecutedByHarness,
    false,
    "runHarness DEBE abortar antes de ejecutar cualquier DDL destructivo (drop/create schema) si validateDisposableDatabase rechaza la base",
  );

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

test("M7 C-3 — Arnés aborta fail-closed y rechaza falsos positivos si la sonda has_function_privilege falla (MUST-EXECUTE)", async () => {
  // Verificamos que si la base de datos lanza un error en has_function_privilege o devuelve false,
  // runHarness aborta fail-closed y NO marca service_role_authorized = true ni emite PASS.
  // @ts-expect-error - import dynamic from local .mjs harness script
  const { runHarness } = await import("../scripts/wms/verify-c3-postgres.mjs");
  const { PGlite } = await import("@electric-sql/pglite");

  // Caso A: La consulta has_function_privilege lanza un error (simulando firma inexistente o fallo de motor)
  const memDbA = new PGlite();
  const dbErroringPrivilege = {
    query: async (sqlText: string, params: any[]) => {
      if (typeof sqlText === "string" && sqlText.includes("has_function_privilege")) {
        throw new Error('function "public.fornexa_wms_action(uuid,uuid,text,jsonb,jsonb)" does not exist');
      }
      return memDbA.query(sqlText, params);
    },
    exec: (sqlText: string) => memDbA.exec(sqlText),
  };

  await assert.rejects(
    async () => {
      await runHarness({ db: dbErroringPrivilege, clientType: "pglite", skipReceipt: true });
    },
    /Role 'service_role' must possess EXECUTE privilege on public\.fornexa_wms_action/,
    "runHarness DEBE abortar con AssertionError si la consulta has_function_privilege lanza error",
  );
  await memDbA.close();

  // Caso B: La consulta has_function_privilege devuelve has_priv = false
  const memDbB = new PGlite();
  const dbFalsePrivilege = {
    query: async (sqlText: string, params: any[]) => {
      if (typeof sqlText === "string" && sqlText.includes("has_function_privilege")) {
        return { rows: [{ has_priv: false }] };
      }
      return memDbB.query(sqlText, params);
    },
    exec: (sqlText: string) => memDbB.exec(sqlText),
  };

  await assert.rejects(
    async () => {
      await runHarness({ db: dbFalsePrivilege, clientType: "pglite", skipReceipt: true });
    },
    /Role 'service_role' must possess EXECUTE privilege on public\.fornexa_wms_action/,
    "runHarness DEBE abortar con AssertionError si service_role carece del privilegio EXECUTE (has_priv = false)",
  );
  await memDbB.close();
});

test("M7 C-3 — Auditoría estática y anclaje sintáctico de cláusulas DDL (UPSERT_RESOURCE, delimitadores de transacción, políticas y rollback)", () => {
  // MUST-1: UPSERT_RESOURCE en fornexa_wms_action restringido a OWNER/ADMIN/PLANNER y con insert
  const upsertBlockMatch = migrationSql.match(/elsif\s+p_action\s*=\s*'UPSERT_RESOURCE'\s+then([\s\S]*?)else/i);
  assert.ok(upsertBlockMatch, "fornexa_wms_action debe contener el bloque elsif p_action = 'UPSERT_RESOURCE'");
  const upsertBlock = upsertBlockMatch[1];
  assert.ok(
    /v_role\s+not\s+in\s*\(\s*'OWNER'\s*,\s*'ADMIN'\s*,\s*'PLANNER'\s*\)/i.test(upsertBlock),
    "El bloque UPSERT_RESOURCE debe restringirse ancladamente a OWNER, ADMIN y PLANNER",
  );
  assert.ok(
    /insert\s+into\s+public\.warehouse_resources/i.test(upsertBlock),
    "El bloque UPSERT_RESOURCE debe realizar insert into public.warehouse_resources",
  );

  // MUST-2: Envoltura atómica BEGIN ... COMMIT
  assert.ok(
    /^\s*begin;/m.test(migrationSql),
    "La migración debe comenzar con BEGIN atómico",
  );
  assert.ok(
    /commit;\s*$/m.test(migrationSql),
    "La migración debe finalizar con COMMIT atómico",
  );

  // MUST-3: Contrato de backfill sin sobreescribir false y actualizando updated_at
  const backfillMatch = migrationSql.match(/\nupdate\s+public\.warehouse_behavior_policies[\s\S]*?require_state_control_on_load[\s\S]*?where[\s\S]*?;/i);
  assert.ok(backfillMatch, "La migración debe contener la sentencia UPDATE de backfill de políticas");
  const backfillClause = backfillMatch[0];
  assert.ok(
    /params\s*->>\s*'require_state_control_on_load'\s+is\s+null\s+or\s+params\s*->>\s*'require_state_control_on_load'\s*=\s*''/i.test(backfillClause),
    "El backfill debe aplicar estrictamente cuando require_state_control_on_load sea NULL o vacío, preservando false legítimos",
  );
  assert.ok(
    /updated_at\s*=\s*now\(\)/i.test(backfillClause),
    "El backfill debe actualizar updated_at = now()",
  );

  // MUST-4: Preimagen real en auditoría de CONTROL_STATE
  const controlStateBlockMatch = migrationSql.match(/elsif\s+p_action\s*=\s*'CONTROL_STATE'\s+then([\s\S]*?)elsif/i);
  assert.ok(controlStateBlockMatch, "Debe existir el bloque CONTROL_STATE");
  const controlStateBlock = controlStateBlockMatch[1];
  const beforePos = controlStateBlock.indexOf("v_before := to_jsonb(v_hu);");
  const updatePos = controlStateBlock.indexOf("update public.handling_units");
  assert.ok(beforePos !== -1, "CONTROL_STATE debe asignar v_before := to_jsonb(v_hu)");
  assert.ok(updatePos !== -1, "CONTROL_STATE debe mutar handling_units");
  assert.ok(beforePos < updatePos, "v_before debe capturarse antes de la mutación de handling_units");
  assert.ok(
    /insert\s+into\s+public\.audit_events[\s\S]*?v_before/i.test(controlStateBlock),
    "CONTROL_STATE debe registrar v_before en audit_events",
  );

  // MUST-5 & MUST-3: Serialización de bin destino y evaluación de disponible duradero en REPLENISH
  const replenishBlockMatch = migrationSql.match(/elsif\s+p_action\s+in\s*\(\s*'REPLENISH'[\s\S]*?\)\s+then([\s\S]*?)elsif\s+p_action\s*=\s*'CONTROL_STATE'/i);
  assert.ok(replenishBlockMatch, "Debe existir el bloque REPLENISH");
  const replenishBlock = replenishBlockMatch[1];
  assert.ok(
    /from\s+public\.warehouse_bins\s+wb[\s\S]*?for\s+update/i.test(replenishBlock),
    "REPLENISH debe bloquear el bin destino con FOR UPDATE",
  );
  assert.ok(
    !/raise\s+exception\s+'WMS_REPLENISHMENT_PENDING'/i.test(replenishBlock),
    "REPLENISH admite órdenes distintas al mismo destino con saldo suficiente",
  );
  assert.ok(
    /\(iq\.quantity_on_hand\s*-\s*iq\.quantity_reserved\)\s*>=\s*v_qty/i.test(replenishBlock),
    "REPLENISH debe evaluar saldo disponible sin mezclar reservas totales con tareas pendientes (MUST-3)",
  );

  // MUST-6: Cabecera y script de rollback documentan apagado fail-closed (WMS_ROLLBACK_ACTIVE)
  assert.ok(
    migrationSql.includes("Nivel 2 (Rollback de RPC Protegido - Apagado Fail-Closed sin Reabrir Bypass E1)"),
    "La cabecera de la migración debe declarar apagado fail-closed en Nivel 2",
  );
  const rollbackSql = readFileSync(
    resolve(import.meta.dirname, "../supabase/migrations/rollback/20261019120000_wms_c3_rollback_protected.sql"),
    "utf-8",
  );
  assert.ok(
    /raise\s+exception\s+'WMS_ROLLBACK_ACTIVE'/i.test(rollbackSql),
    "El script de rollback debe invocar WMS_ROLLBACK_ACTIVE",
  );
  assert.ok(
    !/drop\s+column/i.test(rollbackSql),
    "El script de rollback no debe eliminar columnas (DROP COLUMN prohibido sin importar mayúsculas/minúsculas)",
  );

  // Revocación de privilegios en funciones auxiliares y concesión a service_role
  assert.ok(
    migrationSql.includes("revoke all on function public.fornexa_wms_invalidate_hu_control() from public, anon, authenticated"),
    "Se deben revocar privilegios públicos de fornexa_wms_invalidate_hu_control",
  );
  assert.ok(
    migrationSql.includes("revoke all on function public.fornexa_wms_policy_bool(jsonb, text, boolean) from public, anon, authenticated"),
    "Se deben revocar privilegios públicos de fornexa_wms_policy_bool",
  );
  assert.ok(
    migrationSql.includes("grant execute on function public.fornexa_wms_policy_bool(jsonb, text, boolean) to service_role;"),
    "Se debe otorgar execute a service_role para fornexa_wms_policy_bool",
  );
});

test("M7 C-3 — Subsanaciones Claude SQL (MUST-1, MUST-2, MUST-3, MUST-4)", () => {
  // MUST-A: Backfill acotado estrictamente a políticas activas (superseded_at is null)
  assert.ok(
    /update\s+public\.warehouse_behavior_policies[\s\S]*?superseded_at\s+is\s+null/i.test(migrationSql),
    "El backfill debe acotarse estrictamente con superseded_at is null",
  );

  // MUST-2: Inversión del fallback: peso y volumen esperado legítimo de partida/SGA (v_hu.gross_weight_kg / volume_m3)
  assert.ok(
    migrationSql.includes("v_expected_weight := coalesce(nullif(v_hu.gross_weight_kg, 0), nullif(v_computed_weight, 0));"),
    "v_expected_weight debe calcularse desde contenidos con fallback a dato legítimo v_hu.gross_weight_kg",
  );
  assert.ok(
    migrationSql.includes("v_expected_volume := coalesce(nullif(v_hu.volume_m3, 0), nullif(v_computed_volume, 0));"),
    "v_expected_volume debe calcularse desde contenidos con fallback a dato legítimo v_hu.volume_m3",
  );
  assert.ok(
    migrationSql.includes("if v_expected_weight > 0 and"),
    "Medición voluntaria de peso no debe abortar si el valor esperado es nulo",
  );

  // MUST-3 & MUST-C: Disponibilidad sin greatest y reserva duradera en REPLENISH
  const replenishBlockMatch = migrationSql.match(/elsif\s+p_action\s+in\s*\(\s*'REPLENISH'[\s\S]*?\)\s+then([\s\S]*?)elsif\s+p_action\s*=\s*'CONTROL_STATE'/i);
  assert.ok(replenishBlockMatch, "Debe existir el bloque REPLENISH");
  const replenishBlock = replenishBlockMatch[1];
  assert.ok(
    /from\s+public\.inventory_quants\s+iq[\s\S]*?for\s+update/i.test(replenishBlock),
    "REPLENISH debe bloquear quants origen con FOR UPDATE",
  );
  assert.ok(
    /\(iq\.quantity_on_hand\s*-\s*iq\.quantity_reserved\)\s*>=\s*v_qty/i.test(replenishBlock),
    "REPLENISH debe evaluar disponible con (quantity_on_hand - quantity_reserved) >= v_qty directamente sin mezclar con subconjunto de tareas",
  );
  assert.ok(
    /update\s+public\.inventory_quants\s+set\s+quantity_reserved\s*=\s*quantity_reserved\s*\+\s*v_qty/i.test(replenishBlock),
    "REPLENISH debe incrementar quantity_reserved de forma duradera en el quant origen",
  );

  // MUST-4: Identidad durable de reservas en warehouse_tasks y liberación exacta
  assert.ok(
    /foreign key\s*\(tenant_id,\s*source_quant_id\)\s+references public\.inventory_quants\(tenant_id,\s*id\)/i.test(migrationSql),
    "warehouse_tasks debe incluir columna source_quant_id",
  );
  assert.ok(
    /v_task\.source_quant_id\s+is\s+not\s+null/i.test(replenishBlock),
    "CONFIRM_TASK debe liberar quantity_reserved usando source_quant_id exacto",
  );

  // MUST-D: Validación explícita de warehouse perteneciente al tenant en UPSERT_POLICY y UPSERT_RESOURCE
  assert.ok(
    /from\s+public\.warehouses\s+where\s+tenant_id\s*=\s*p_tenant\s+and\s+id\s*=\s*v_warehouse_id/i.test(migrationSql),
    "UPSERT_POLICY y UPSERT_RESOURCE deben validar que warehouse_id pertenezca a p_tenant",
  );

  // MUST-1: Reversión de SHOULD-4: reject_detail almacena v_fingerprint para garantizar replay idempotente
  const controlStateBlockMatch = migrationSql.match(/elsif\s+p_action\s*=\s*'CONTROL_STATE'\s+then([\s\S]*?)elsif\s+p_action\s*=\s*'LABEL'/i);
  assert.ok(controlStateBlockMatch, "Debe existir bloque CONTROL_STATE");
  const csBlock = controlStateBlockMatch[1];
  assert.ok(
    /v_control_status\s*=\s*'PASSED'[\s\S]*?insert\s+into\s+public\.warehouse_tasks[\s\S]*?v_fingerprint,\s*v_ts,\s*v_ts/i.test(csBlock),
    "CONTROL_STATE PASSED debe fijar reject_detail a v_fingerprint para replay idempotente de servidor",
  );
  assert.ok(
    /v_control_status\s*=\s*'REJECTED'[\s\S]*?insert\s+into\s+public\.warehouse_tasks[\s\S]*?v_fingerprint,\s*v_ts,\s*v_ts/i.test(csBlock),
    "CONTROL_STATE REJECTED debe fijar reject_detail a v_fingerprint para replay idempotente de servidor",
  );
  assert.ok(
    /p_action\s+in\s*\(\s*'REPLENISH'[\s\S]*?insert\s+into\s+public\.warehouse_tasks[\s\S]*?v_fingerprint,\s*v_quant\.id/i.test(migrationSql),
    "REPLENISH debe fijar reject_detail a v_fingerprint y source_quant_id a v_quant.id",
  );
});

test("M7 C-3 — Runner Transaccional: Validación de Destinos (MUST-1 Gate Fail-Closed)", async () => {
  // @ts-expect-error - import dynamic from local .mjs runner script
  const { validateDestination } = await import("../scripts/wms/run-c3-migration.mjs");

  // 1. Rechazo inmediato de hosts en denylist de producción
  assert.throws(
    () => validateDestination("postgres://postgres:pw@gqkjqhpmyejmehbuombk.supabase.co:5432/postgres"),
    /WMS_DESTINATION_FORBIDDEN.*production fail-closed denylist/i,
  );
  assert.throws(
    () => validateDestination("postgres://postgres:pw@other-prod.supabase.net:5432/postgres"),
    /WMS_DESTINATION_FORBIDDEN/i,
  );

  // 2. Rechazo de hosts remotos no autorizados
  assert.throws(
    () => validateDestination("postgres://postgres:pw@192.168.1.100:5432/fornexa"),
    /WMS_DESTINATION_FORBIDDEN.*not a permitted loopback/i,
  );

  // 3. Aceptación de loopback para rehearsal
  const loopback = validateDestination("postgres://postgres:pw@127.0.0.1:5432/fornexa_test");
  assert.equal(loopback.isLoopback, true);
  assert.equal(loopback.hostname, "127.0.0.1");

  // 4. Bloqueo de --apply-live sin flags ni env autorizados
  assert.throws(
    () => validateDestination("postgres://postgres:pw@127.0.0.1:5432/fornexa_test", { applyLive: true, confirmApply: false }),
    /WMS_APPLY_GATE_CLOSED.*explicit confirmation flag/i,
  );
});

test("M7 C-3 — Runner Transaccional: Delimitadores, Guard de Importación y Hash Pinning", async () => {
  const {
    stripTopLevelTransactionDelimiters,
    isDirectCliExecution,
    PINNED_C3_SQL_SHA256,
    PINNED_C3_SQL_BYTES,
    // @ts-expect-error - import dynamic from local .mjs runner script
  } = await import("../scripts/wms/run-c3-migration.mjs");

  // 1. Hash pinning coincide con el archivo en disco
  const diskSql = readFileSync(C3_MIGRATION_PATH, "utf-8");
  const { createHash } = await import("node:crypto");
  const actualHash = createHash("sha256").update(diskSql).digest("hex");
  const actualBytes = Buffer.byteLength(diskSql, "utf-8");
  assert.equal(actualHash, PINNED_C3_SQL_SHA256, "Hash fijado debe coincidir con HEAD");
  assert.equal(actualBytes, PINNED_C3_SQL_BYTES, "Bytes fijados deben coincidir con HEAD");

  // 2. Neutralización de begin; commit; rollback; fuera de dollar quotes
  const sampleSql = `
BEGIN;
create table test (id int);
do $$
begin
  -- inside dollar quote, should NOT be modified
  perform 1;
end;
$$;
COMMIT;
`;
  const stripped = stripTopLevelTransactionDelimiters(sampleSql);
  assert.ok(stripped.includes("-- [RUNNER MANAGED BEGIN]"), "BEGIN top-level debe neutralizarse");
  assert.ok(stripped.includes("-- [RUNNER MANAGED COMMIT]"), "COMMIT top-level debe neutralizarse");
  assert.ok(stripped.includes("begin\n  -- inside dollar quote"), "BEGIN interno de función debe preservarse intacto");

  // 3. Guard de importación CLI
  assert.equal(isDirectCliExecution(["node", "/path/to/other.js"]), false);
});

test("M7 C-3 — Runner Transaccional: Ejecución Rehearsal PGlite y Post-condiciones Atómicas", async () => {
  // @ts-expect-error - import dynamic from local .mjs runner script
  const { runC3Migration } = await import("../scripts/wms/run-c3-migration.mjs");
  const receipt = await runC3Migration({ usePgLite: true, dryRun: true });

  assert.equal(receipt.status, "SUCCESS_DRY_RUN", "Rehearsal en PGlite debe completar con SUCCESS_DRY_RUN");
  assert.equal(receipt.postconditions.ledger_recorded, true, "Ledger debe insertarse atómicamente");
  assert.equal(receipt.postconditions.columns_verified.length, 4, "Las 4 columnas deben validarse en postcondiciones");
  assert.equal(receipt.postconditions.index_verified, true, "El índice debe validarse en postcondiciones");
  assert.equal(receipt.postconditions.functions_verified, true, "Las funciones deben validarse en postcondiciones");
  assert.equal(receipt.postconditions.privileges_verified, true, "Privilegios service_role exclusivos deben validarse");
});








test("C3 runner refuses apply in PGlite and dryRun=false without explicit apply", async () => {
  // @ts-expect-error - local mjs runner
  const { runC3Migration } = await import("../scripts/wms/run-c3-migration.mjs");
  await assert.rejects(() => runC3Migration({ applyLive: true, usePgLite: true, confirmApply: true }), /WMS_APPLY_GATE_CLOSED/);
  await assert.rejects(() => runC3Migration({ dryRun: false, usePgLite: true }), /WMS_APPLY_GATE_CLOSED/);
  await assert.rejects(() => runC3Migration({ applyLive: true, dryRun: true }), /WMS_APPLY_GATE_CLOSED/);
});
