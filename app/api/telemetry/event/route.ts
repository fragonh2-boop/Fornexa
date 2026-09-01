import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/supabase/server";
import {
  callTelemetryRpc,
  normalizeTelemetryPath,
  telemetryClientIp,
  telemetryIpHash,
} from "@/lib/platform-telemetry";

const authEvents = new Set([
  "LOGIN_ATTEMPT",
  "LOGIN_SUCCESS",
  "LOGIN_FAILURE",
  "RECOVERY_REQUEST",
  "FIRST_ACCESS_REQUEST",
]);

function uuid(value: unknown) {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
    ? value
    : null;
}

export async function POST(request: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Payload inválido." }, { status: 400 });
  }

  const sessionId = uuid(body.session_id);
  if (!sessionId) return NextResponse.json({ error: "Sesión inválida." }, { status: 400 });

  const ip = telemetryClientIp(request.headers);
  const user = await getAuthenticatedUser().catch(() => null);
  const now = new Date().toISOString();

  try {
    if (body.kind === "page") {
      await callTelemetryRpc("page", {
        occurred_at: now,
        session_id: sessionId,
        user_id: user?.id ?? null,
        path: normalizeTelemetryPath(String(body.path ?? "/")),
        referrer_path: typeof body.referrer_path === "string" ? normalizeTelemetryPath(body.referrer_path) : null,
        visibility_state: typeof body.visibility_state === "string" ? body.visibility_state.slice(0, 32) : null,
        dwell_ms: typeof body.dwell_ms === "number" && Number.isFinite(body.dwell_ms)
          ? Math.max(0, Math.min(Math.round(body.dwell_ms), 86_400_000))
          : null,
      });
    } else if (body.kind === "auth") {
      const eventType = String(body.event_type ?? "");
      if (!authEvents.has(eventType)) return NextResponse.json({ error: "Evento inválido." }, { status: 400 });
      const email = typeof body.email === "string" ? body.email.trim().toLowerCase().slice(0, 320) : "";
      await callTelemetryRpc("auth", {
        occurred_at: now,
        event_type: eventType,
        session_id: sessionId,
        user_id: user?.id ?? null,
        email_hash: email ? createHash("sha256").update(email).digest("hex") : null,
        ip,
        ip_hash: telemetryIpHash(ip),
        path: "/login",
        failure_code: typeof body.failure_code === "string" ? body.failure_code.slice(0, 128) : null,
      });
    } else {
      return NextResponse.json({ error: "Tipo de evento inválido." }, { status: 400 });
    }
  } catch {
    // Telemetry is intentionally best-effort: never surface storage failures to visitors.
  }

  return new NextResponse(null, {
    status: 204,
    headers: { "Cache-Control": "no-store" },
  });
}
