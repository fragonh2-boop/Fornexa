import { createHmac } from "node:crypto";
import type { NextRequest } from "next/server";

const TELEMETRY_RPC = {
  request: "fornexa_capture_request_telemetry",
  auth: "fornexa_capture_auth_telemetry",
  page: "fornexa_capture_page_telemetry",
  read: "fornexa_read_telemetry",
} as const;

type TelemetryKind = keyof typeof TELEMETRY_RPC;

function env() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  return { url, key };
}

export function normalizeTelemetryPath(value: string) {
  const raw = value.split("?")[0]?.split("#")[0] ?? "/";
  const cleaned = raw.replace(/\/+/g, "/").slice(0, 512);
  const normalized = cleaned.startsWith("/") ? cleaned : `/${cleaned}`;

  // Capability URLs are bearer credentials. Persist only the route shape, never
  // the raw token, in TLM-1 request telemetry.
  return normalized.replace(
    /^\/regulatory\/d\/[^/]+(?=\/|$)/,
    "/regulatory/d/[token]",
  );
}

export function telemetryClientIp(headers: Headers) {
  const candidates = [
    headers.get("x-vercel-forwarded-for"),
    headers.get("x-forwarded-for"),
    headers.get("x-real-ip"),
    headers.get("cf-connecting-ip"),
  ];
  for (const value of candidates) {
    const first = value?.split(",")[0]?.trim();
    if (first && first.length <= 64) return first;
  }
  return null;
}

export function telemetryIpHash(ip: string | null) {
  if (!ip) return null;
  const secret = process.env.FORNEXA_TELEMETRY_HASH_SECRET;
  if (!secret) return null;
  return createHmac("sha256", secret).update(ip).digest("hex");
}

export function telemetrySessionId(request: NextRequest) {
  const value = request.cookies.get("fornexa_tlm_session")?.value;
  return value && /^[0-9a-f-]{36}$/i.test(value) ? value : null;
}

export async function callTelemetryRpc(kind: TelemetryKind, payload: Record<string, unknown>) {
  const { url, key } = env();
  if (!url || !key) return null;

  const response = await fetch(`${url}/rest/v1/rpc/${TELEMETRY_RPC[kind]}`, {
    method: "POST",
    headers: {
      apikey: key,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(kind === "read" ? payload : { p_payload: payload }),
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`Telemetry RPC ${kind} failed with ${response.status}`);
  if (response.status === 204) return null;
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

export function requestTelemetryPayload(request: NextRequest) {
  const ip = telemetryClientIp(request.headers);
  return {
    occurred_at: new Date().toISOString(),
    request_id: request.headers.get("x-vercel-id")?.slice(0, 200) ?? crypto.randomUUID(),
    session_id: telemetrySessionId(request),
    ip,
    ip_hash: telemetryIpHash(ip),
    host: request.headers.get("host")?.slice(0, 255) ?? null,
    method: request.method.slice(0, 12),
    path: normalizeTelemetryPath(request.nextUrl.pathname),
    user_agent: request.headers.get("user-agent")?.slice(0, 1024) ?? null,
    referrer: request.headers.get("referer")?.split("?")[0]?.slice(0, 1024) ?? null,
    accept_language: request.headers.get("accept-language")?.slice(0, 255) ?? null,
    country: request.headers.get("x-vercel-ip-country")?.slice(0, 8) ?? null,
    region: request.headers.get("x-vercel-ip-country-region")?.slice(0, 64) ?? null,
    city: request.headers.get("x-vercel-ip-city")?.slice(0, 128) ?? null,
  };
}
