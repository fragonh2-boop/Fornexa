import { NextResponse } from "next/server";
import { getAuthenticatedContext } from "@/lib/auth-context";
import { createSupabaseAdmin } from "@/lib/supabase-admin";
import {
  object,
  onlyKeys,
  CalendarValidationError,
} from "@/lib/operational-calendar";
import { uuid, instant, choice } from "@/lib/docks";
import {
  generateDockPortalToken,
  dockPortalTokenHash,
} from "@/lib/dock-portal-validation";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const response = (body: unknown, status = 200) =>
  NextResponse.json(body, {
    status,
    headers: {
      "Cache-Control": "private, no-store",
      "Referrer-Policy": "no-referrer",
    },
  });
export async function GET(request: Request) {
  let auth;
  try {
    auth = await getAuthenticatedContext();
  } catch {
    return response({ error: "Acceso no disponible." }, 503);
  }
  if (!auth) return response({ error: "No autorizado." }, 401);
  if (!["OWNER", "ADMIN"].includes(auth.role))
    return response({ error: "Sin permisos." }, 403);
  try {
    const db = createSupabaseAdmin(),
      wid = uuid(new URL(request.url).searchParams.get("warehouseId"));
    const [access, profiles] = await Promise.all([
      db
        .from("dock_portal_access")
        .select("id,carrier_party_id,expires_at,revoked_at")
        .eq("tenant_id", auth.tenantId)
        .eq("warehouse_id", wid)
        .order("created_at", { ascending: false })
        .limit(200),
      db
        .from("carrier_profiles")
        .select("party_id")
        .eq("tenant_id", auth.tenantId)
        .eq("qualification_status", "APPROVED")
        .limit(200),
    ]);
    if (access.error || profiles.error) throw new Error();
    return response({
      items: access.data,
      carrierIds: profiles.data.map((p) => p.party_id),
    });
  } catch {
    return response({ error: "No se pudieron cargar los accesos." }, 503);
  }
}
export async function POST(request: Request) {
  let auth;
  try {
    auth = await getAuthenticatedContext();
  } catch {
    return response({ error: "Acceso no disponible." }, 503);
  }
  if (!auth) return response({ error: "No autorizado." }, 401);
  if (!["OWNER", "ADMIN"].includes(auth.role))
    return response({ error: "Sin permisos." }, 403);
  try {
    const b = object(await request.json());
    onlyKeys(b, ["action", "id", "carrierId", "warehouseId", "expires"]);
    const action = choice(b.action, ["CREATE", "REVOKE"]),
      db = createSupabaseAdmin();
    if (action === "REVOKE") {
      const result = await db.rpc("fornexa_manage_dock_portal_access", {
        p_tenant: auth.tenantId,
        p_actor: auth.userId,
        p_carrier: null,
        p_warehouse: null,
        p_hash: null,
        p_expires: null,
        p_revoke: uuid(b.id),
      });
      if (result.error) throw new Error();
      return response({ ok: true });
    }
    const token = generateDockPortalToken(),
      expires = instant(b.expires);
    const result = await db.rpc("fornexa_manage_dock_portal_access", {
      p_tenant: auth.tenantId,
      p_actor: auth.userId,
      p_carrier: uuid(b.carrierId),
      p_warehouse: uuid(b.warehouseId),
      p_hash: dockPortalTokenHash(token),
      p_expires: expires,
      p_revoke: null,
    });
    if (result.error) throw new Error();
    return response({ path: `/muelles/p/${token}`, expires }, 201);
  } catch (e) {
    return response(
      {
        error:
          e instanceof CalendarValidationError
            ? e.message
            : "No se pudo crear o revocar el acceso.",
      },
      e instanceof CalendarValidationError || e instanceof SyntaxError
        ? 400
        : 409,
    );
  }
}
