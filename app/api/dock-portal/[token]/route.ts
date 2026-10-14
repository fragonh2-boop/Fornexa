import { NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase-admin";
import { resolveDockPortal, loadDockPortal } from "@/lib/dock-portal";
import {
  dockPortalIpHash,
  dockPortalTokenHash,
  dockPortalTokenIsValid,
  readPortalJson,
  validatePortalBooking,
  portalRequestHash,
} from "@/lib/dock-portal-validation";
import { CalendarValidationError } from "@/lib/operational-calendar";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
function reply(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: {
      "Cache-Control": "private, no-store, max-age=0",
      "Referrer-Policy": "no-referrer",
      "X-Robots-Tag": "noindex, nofollow",
    },
  });
}
async function gate(request: Request, token: string) {
  const ipHash = dockPortalIpHash(request.headers);
  if (!ipHash) return null;
  const db = createSupabaseAdmin(),
    tokenHash = dockPortalTokenHash(token);
  const limit = await db.rpc("fornexa_dock_portal_rate", {
    p_token_hash: tokenHash,
    p_ip_hash: ipHash,
    p_phase: "REQUEST",
  });
  if (limit.error) throw new Error("Portal no disponible.");
  return { db, ipHash, tokenHash, allowed: limit.data === true };
}
async function fail(g: NonNullable<Awaited<ReturnType<typeof gate>>>) {
  const result = await g.db.rpc("fornexa_dock_portal_rate", {
    p_token_hash: g.tokenHash,
    p_ip_hash: g.ipHash,
    p_phase: "FAILURE",
  });
  if (result.error) throw new Error("Portal no disponible.");
}
export async function GET(
  request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  try {
    const { token } = await params,
      g = await gate(request, token);
    if (!g) return reply({ error: "Portal no disponible." }, 503);
    if (!g.allowed)
      return reply(
        { error: "Acceso temporalmente bloqueado. Inténtalo más tarde." },
        429,
      );
    const context = dockPortalTokenIsValid(token)
      ? await resolveDockPortal(token)
      : null;
    if (!context) {
      await fail(g);
      return reply({ error: "Acceso no disponible." }, 404);
    }
    const query = new URL(request.url).searchParams;
    if (
      [...query.keys()].some(
        (k) => !["date", "rule", "direction"].includes(k),
      ) ||
      [...query.keys()].length !== new Set(query.keys()).size
    ) {
      await fail(g);
      return reply({ error: "Solicitud no válida." }, 400);
    }
    const direction = query.get("direction") ?? "INBOUND";
    if (!["INBOUND", "OUTBOUND"].includes(direction)) {
      await fail(g);
      return reply({ error: "Solicitud no válida." }, 400);
    }
    return reply(
      await loadDockPortal(
        context,
        query.get("date") ?? undefined,
        query.get("rule") ?? undefined,
        direction,
      ),
    );
  } catch {
    return reply({ error: "Portal no disponible." }, 503);
  }
}
export async function POST(
  request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  try {
    const { token } = await params,
      g = await gate(request, token);
    if (!g) return reply({ error: "Portal no disponible." }, 503);
    if (!g.allowed)
      return reply(
        { error: "Acceso temporalmente bloqueado. Inténtalo más tarde." },
        429,
      );
    const context = dockPortalTokenIsValid(token)
      ? await resolveDockPortal(token)
      : null;
    if (!context) {
      await fail(g);
      return reply({ error: "Acceso no disponible." }, 404);
    }
    if (
      request.headers.get("content-type")?.split(";")[0].trim() !==
      "application/json"
    ) {
      await fail(g);
      return reply({ error: "Solicitud no válida." }, 400);
    }
    let values;
    try {
      values = validatePortalBooking(await readPortalJson(request));
    } catch (e) {
      await fail(g);
      return reply(
        {
          error:
            e instanceof CalendarValidationError
              ? e.message
              : "Solicitud no válida.",
        },
        400,
      );
    }
    const result = await context.db.rpc("fornexa_reserve_dock_portal", {
      p_access: context.access.id,
      p_token_hash: context.tokenHash,
      p_values: values,
      p_request_hash: portalRequestHash(values),
    });
    if (result.error) {
      if (
        /PORTAL_REFERENCE|PORTAL_INPUT|PORTAL_RULE|PORTAL_IDEMPOTENCY/.test(
          result.error.message,
        )
      )
        await fail(g);
      const suspended = result.error.message.includes("PORTAL_SUSPENDED");
      return reply(
        {
          error: suspended
            ? "Autoservicio suspendido. Contacta con el planificador."
            : "No se pudo reservar. Comprueba la referencia del viaje, matrícula, compatibilidad y disponibilidad.",
        },
        suspended ? 403 : 409,
      );
    }
    return reply({ booking: result.data }, 201);
  } catch {
    return reply({ error: "Portal no disponible." }, 503);
  }
}
