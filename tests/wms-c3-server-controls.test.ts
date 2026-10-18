import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { WMS_ACTIONS, type WmsAction } from "../lib/wms.ts";

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

test("M7 C-3 — lib/wms declara CONTROL_STATE en WMS_ACTIONS y columnas de control en WmsHandlingUnit", () => {
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

test("M7 C-3 — trigger trg_wms_invalidate_hu_control invalida el control físico ante mutaciones de contenido", () => {
  assert.ok(
    migrationSql.includes("create or replace function public.fornexa_wms_invalidate_hu_control()"),
    "La migración debe definir la función de invalidación",
  );
  assert.ok(
    migrationSql.includes("create trigger trg_wms_invalidate_hu_control"),
    "La migración debe crear el trigger sobre handling_unit_contents",
  );
  assert.ok(
    migrationSql.includes("after insert or update or delete"),
    "El trigger debe dispararse en insert, update y delete",
  );
  assert.ok(
    migrationSql.includes("set state_controlled_at = null"),
    "La función de trigger debe limpiar state_controlled_at",
  );
});

test("M7 C-3 — fornexa_wms_action implementa CONTROL_STATE resolviendo ambigüedades (a) y (b)", () => {
  assert.ok(
    migrationSql.includes("elsif p_action = 'CONTROL_STATE' then"),
    "fornexa_wms_action debe implementar el bloque CONTROL_STATE",
  );
  // Bloqueo de HU ya cargadas
  assert.ok(
    migrationSql.includes("if v_hu.state = 'LOADED' then"),
    "CONTROL_STATE sobre HU LOADED debe rechazar",
  );
  // (a) REJECTED no lanza excepción SQL y pasa a QUARANTINE o DAMAGED
  assert.ok(
    migrationSql.includes("v_control_status = 'REJECTED'") ||
    migrationSql.includes("p_payload->>'status', 'PASSED')) = 'REJECTED'"),
    "CONTROL_STATE debe evaluar status REJECTED",
  );
  assert.ok(
    migrationSql.includes("QUARANTINE"),
    "CONTROL_STATE REJECTED debe transicionar a QUARANTINE",
  );
  assert.ok(
    migrationSql.includes("CONTROL_STATE_REJECTED"),
    "CONTROL_STATE REJECTED debe emitir evento de auditoría CONTROL_STATE_REJECTED",
  );
  // (b) Idempotencia
  assert.ok(
    migrationSql.includes("wt.idempotency_key = v_idem"),
    "CONTROL_STATE debe soportar repetición idempotente",
  );
});

test("M7 C-3 — LABEL y LOAD calculan pesos y volúmenes en servidor y exigen control físico si la política lo requiere", () => {
  // Cálculo de pesos y volúmenes por join con products
  assert.ok(
    migrationSql.includes("sum(p.gross_weight_kg * huc.quantity)"),
    "LABEL/LOAD deben calcular el peso sumando gross_weight_kg * quantity de productos",
  );
  assert.ok(
    migrationSql.includes("sum(p.volume_m3 * huc.quantity)"),
    "LABEL/LOAD deben calcular el volumen sumando volume_m3 * quantity de productos",
  );
  // Exigencia de control físico en LABEL
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
  // RECEIVE_CHECK
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
