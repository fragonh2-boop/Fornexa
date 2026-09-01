import { notFound } from "next/navigation";
import { getAuthenticatedContext } from "@/lib/auth-context";
import { getAuthenticatedUser } from "@/lib/supabase/server";
import { callTelemetryRpc } from "@/lib/platform-telemetry";

export const dynamic = "force-dynamic";

type RequestEvent = {
  id: string;
  occurred_at: string;
  session_id: string | null;
  ip: string | null;
  ip_hash: string | null;
  method: string;
  path: string;
  country: string | null;
  region: string | null;
  city: string | null;
  user_agent: string | null;
};

type AuthEvent = {
  id: string;
  occurred_at: string;
  session_id: string | null;
  user_id: string | null;
  event_type: string;
  email_hash: string | null;
  ip: string | null;
  failure_code: string | null;
};

type PageEvent = {
  id: string;
  occurred_at: string;
  session_id: string;
  user_id: string | null;
  path: string;
  referrer_path: string | null;
  dwell_ms: number | null;
};

type TelemetryPayload = {
  requests?: RequestEvent[];
  auth_events?: AuthEvent[];
  page_events?: PageEvent[];
};

function allowedEmail(email?: string | null) {
  if (!email) return false;
  const allowlist = (process.env.FORNEXA_TELEMETRY_OWNER_EMAILS ?? "")
    .split(",")
    .map(value => value.trim().toLowerCase())
    .filter(Boolean);
  return allowlist.includes(email.toLowerCase());
}

function formatDate(value: string) {
  try {
    return new Intl.DateTimeFormat("es-ES", { dateStyle: "short", timeStyle: "medium" }).format(new Date(value));
  } catch {
    return value;
  }
}

export default async function TelemetryPage() {
  const [context, user] = await Promise.all([getAuthenticatedContext(), getAuthenticatedUser()]);
  if (!context || context.role !== "OWNER" || !allowedEmail(user?.email)) notFound();

  const data = (await callTelemetryRpc("read", { p_limit: 250 }).catch(() => null)) as TelemetryPayload | null;
  const requests = data?.requests ?? [];
  const authEvents = data?.auth_events ?? [];
  const pageEvents = data?.page_events ?? [];

  const sessions = new Map<string, PageEvent[]>();
  pageEvents.forEach(event => {
    const bucket = sessions.get(event.session_id) ?? [];
    bucket.push(event);
    sessions.set(event.session_id, bucket);
  });
  const sessionRows = [...sessions.entries()]
    .map(([sessionId, events]) => [sessionId, events.sort((a, b) => a.occurred_at.localeCompare(b.occurred_at))] as const)
    .sort((a, b) => (b[1].at(-1)?.occurred_at ?? "").localeCompare(a[1].at(-1)?.occurred_at ?? ""));

  return (
    <main style={{ padding: "32px", maxWidth: 1500, margin: "0 auto", fontFamily: "var(--font-fornexa), sans-serif" }}>
      <header style={{ marginBottom: 28 }}>
        <span style={{ fontSize: 12, letterSpacing: ".12em", fontWeight: 800 }}>INTERNAL / PLATFORM TELEMETRY</span>
        <h1 style={{ margin: "8px 0" }}>Telemetría FORNEXA</h1>
        <p style={{ margin: 0 }}>Acceso restringido. Sin replay DOM; rutas y eventos sanitizados.</p>
      </header>

      <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(190px,1fr))", gap: 12, marginBottom: 28 }}>
        <article style={{ border: "1px solid #d9e1ea", borderRadius: 14, padding: 18 }}><strong>{requests.length}</strong><div>requests recientes</div></article>
        <article style={{ border: "1px solid #d9e1ea", borderRadius: 14, padding: 18 }}><strong>{authEvents.length}</strong><div>eventos de acceso</div></article>
        <article style={{ border: "1px solid #d9e1ea", borderRadius: 14, padding: 18 }}><strong>{sessions.size}</strong><div>sesiones con navegación</div></article>
      </section>

      <section style={{ marginBottom: 32 }}>
        <h2>Sesiones y recorrido</h2>
        <div style={{ display: "grid", gap: 10 }}>
          {sessionRows.slice(0, 80).map(([sessionId, events]) => (
            <details key={sessionId} style={{ border: "1px solid #d9e1ea", borderRadius: 12, padding: 14 }}>
              <summary style={{ cursor: "pointer", fontWeight: 700 }}>{sessionId} · {events.length} eventos · {formatDate(events.at(-1)?.occurred_at ?? "")}</summary>
              <ol style={{ marginBottom: 0 }}>
                {events.map(event => <li key={event.id}><code>{event.path}</code>{event.dwell_ms != null ? ` · ${Math.round(event.dwell_ms / 1000)} s` : ""} · {formatDate(event.occurred_at)}</li>)}
              </ol>
            </details>
          ))}
        </div>
      </section>

      <section style={{ marginBottom: 32 }}>
        <h2>Intentos y eventos de acceso</h2>
        <div style={{ overflowX: "auto" }}><table style={{ width: "100%", borderCollapse: "collapse" }}><thead><tr><th align="left">Fecha</th><th align="left">Evento</th><th align="left">IP</th><th align="left">Usuario</th><th align="left">Fallo</th></tr></thead><tbody>
          {authEvents.map(event => <tr key={event.id}><td>{formatDate(event.occurred_at)}</td><td>{event.event_type}</td><td>{event.ip ?? "—"}</td><td>{event.user_id ?? event.email_hash?.slice(0, 12) ?? "—"}</td><td>{event.failure_code ?? "—"}</td></tr>)}
        </tbody></table></div>
      </section>

      <section>
        <h2>Requests recientes</h2>
        <div style={{ overflowX: "auto" }}><table style={{ width: "100%", borderCollapse: "collapse" }}><thead><tr><th align="left">Fecha</th><th align="left">Método</th><th align="left">Ruta</th><th align="left">IP</th><th align="left">Geo</th></tr></thead><tbody>
          {requests.map(event => <tr key={event.id}><td>{formatDate(event.occurred_at)}</td><td>{event.method}</td><td><code>{event.path}</code></td><td>{event.ip ?? event.ip_hash?.slice(0, 12) ?? "—"}</td><td>{[event.city,event.region,event.country].filter(Boolean).join(", ") || "—"}</td></tr>)}
        </tbody></table></div>
      </section>
    </main>
  );
}
