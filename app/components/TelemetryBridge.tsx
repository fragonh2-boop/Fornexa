"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

const COOKIE_NAME = "fornexa_tlm_session";

function sessionId() {
  const existing = document.cookie
    .split(";")
    .map(part => part.trim())
    .find(part => part.startsWith(`${COOKIE_NAME}=`))
    ?.slice(COOKIE_NAME.length + 1);
  if (existing && /^[0-9a-f-]{36}$/i.test(existing)) return existing;

  const value = crypto.randomUUID();
  document.cookie = `${COOKIE_NAME}=${value}; Path=/; Max-Age=86400; SameSite=Lax; Secure`;
  return value;
}

function send(payload: Record<string, unknown>) {
  void fetch("/api/telemetry/event", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    keepalive: true,
    cache: "no-store",
  }).catch(() => undefined);
}

export default function TelemetryBridge() {
  const pathname = usePathname();
  const previous = useRef<{ path: string; startedAt: number } | null>(null);

  useEffect(() => {
    const sid = sessionId();
    const now = performance.now();
    const prior = previous.current;

    if (prior && prior.path !== pathname) {
      send({
        kind: "page",
        session_id: sid,
        path: prior.path,
        referrer_path: null,
        visibility_state: document.visibilityState,
        dwell_ms: Math.max(0, now - prior.startedAt),
      });
    }

    send({
      kind: "page",
      session_id: sid,
      path: pathname || "/",
      referrer_path: prior?.path ?? null,
      visibility_state: document.visibilityState,
      dwell_ms: null,
    });
    previous.current = { path: pathname || "/", startedAt: now };
  }, [pathname]);

  useEffect(() => {
    const sid = sessionId();
    const onPageHide = () => {
      const current = previous.current;
      if (!current) return;
      send({
        kind: "page",
        session_id: sid,
        path: current.path,
        referrer_path: null,
        visibility_state: document.visibilityState,
        dwell_ms: Math.max(0, performance.now() - current.startedAt),
      });
    };
    window.addEventListener("pagehide", onPageHide);
    return () => window.removeEventListener("pagehide", onPageHide);
  }, []);

  return null;
}
