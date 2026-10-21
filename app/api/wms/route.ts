import { NextResponse } from "next/server.js";
import { getAuthenticatedContext } from "../../../lib/auth-context.ts";
import { createSupabaseAdmin } from "../../../lib/supabase-admin.ts";
import { loadWmsData } from "../../../lib/wms-loader.ts";
import { validateWmsActionPayloadSecurity, wmsRpcFailure, type WmsAction } from "../../../lib/wms.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const EDIT_ROLES = new Set(["OWNER", "ADMIN", "PLANNER", "OPERATOR"]);
const CONFIG_ROLES = new Set(["OWNER", "ADMIN", "PLANNER"]);

function response(data: unknown, status = 200) {
  return NextResponse.json(data, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

export async function GET(request: Request) {
  const auth = await getAuthenticatedContext();
  if (!auth) {
    return response({ error: "No autorizado.", code: "WMS_FORBIDDEN" }, 401);
  }
  try {
    const url = new URL(request.url);
    const warehouseId = url.searchParams.get("warehouse_id") || undefined;
    const data = await loadWmsData(auth.tenantId, warehouseId);
    return response({
      ...data,
      canEdit: EDIT_ROLES.has(auth.role),
      canConfigure: CONFIG_ROLES.has(auth.role),
    });
  } catch {
    return response(
      { error: "No se pudieron cargar los datos de almacenes." },
      503,
    );
  }
}

export async function POST(request: Request) {
  const auth = await getAuthenticatedContext();
  if (!auth) {
    return response({ error: "No autorizado.", code: "WMS_FORBIDDEN" }, 401);
  }
  if (!EDIT_ROLES.has(auth.role)) {
    return response(
      {
        error: "WMS_FORBIDDEN: No tienes permisos operativos en este almacén.",
        code: "WMS_FORBIDDEN",
      },
      403,
    );
  }

  try {
    const body = (await request.json()) as Record<string, unknown>;
    const rawAction = String(body.action ?? "");
    const securityViolation = validateWmsActionPayloadSecurity(rawAction, body.payload);
    if (securityViolation) {
      return response(
        {
          error: securityViolation.error,
          code: securityViolation.code,
        },
        securityViolation.status,
      );
    }
    const action = rawAction as WmsAction;
    if (
      (action === "UPSERT_POLICY" || action === "UPSERT_RESOURCE") &&
      !CONFIG_ROLES.has(auth.role)
    ) {
      return response(
        {
          error: "WMS_FORBIDDEN: Se requiere rol de planificación o administración.",
          code: "WMS_FORBIDDEN",
        },
        403,
      );
    }

    const payload =
      body.payload && typeof body.payload === "object" && !Array.isArray(body.payload)
        ? (body.payload as Record<string, unknown>)
        : {};

    if (
      "state_controlled" in payload ||
      "expected_weight_kg" in payload ||
      "expected_volume_m3" in payload
    ) {
      return response(
        {
          error:
            "WMS_FORBIDDEN: Los campos de control de estado y magnitudes esperadas son de cálculo exclusivo en servidor y no pueden enviarse desde el cliente.",
          code: "WMS_FORBIDDEN",
        },
        400,
      );
    }

    if (
      action === "REPLENISH" &&
      ("consolidation" in payload || "conflicting_batch" in payload)
    ) {
      return response(
        {
          error:
            "WMS_FORBIDDEN: La política de consolidación es de cálculo exclusivo en servidor y no puede ser anulada desde el cliente.",
          code: "WMS_FORBIDDEN",
        },
        400,
      );
    }

    const idempotencyKey =
      typeof body.idempotency_key === "string" && body.idempotency_key.trim().length > 0
        ? body.idempotency_key.trim()
        : null;

    const db = createSupabaseAdmin();
    const result = await db.rpc("fornexa_wms_action", {
      p_tenant: auth.tenantId,
      p_actor: auth.userId,
      p_action: action,
      p_payload: payload,
      p_idempotency_key: idempotencyKey,
    });

    if (result.error) {
      const failure = wmsRpcFailure(result.error);
      return response(
        { error: failure.error, code: failure.code },
        failure.status,
      );
    }

    return response({ result: result.data });
  } catch {
    return response(
      { error: "Solicitud de almacén no válida." },
      400,
    );
  }
}
