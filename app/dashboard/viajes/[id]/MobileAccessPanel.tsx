"use client";

import { useEffect, useState } from "react";

type AccessRow = {
  id: string;
  driver_id?: string | null;
  created_at: string;
  expires_at: string;
  revoked_at?: string | null;
  last_used_at?: string | null;
};

function mobileAccessLink(token: string) {
  return `fornexa-mobile://trip/${token}`;
}

export default function MobileAccessPanel({ tripCode, readOnly }: { tripCode: string; readOnly: boolean }) {
  const [accesses, setAccesses] = useState<AccessRow[]>([]);
  const [issuedToken, setIssuedToken] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  async function refresh() {
    const response = await fetch(`/api/trips/${encodeURIComponent(tripCode)}/mobile-access`, { cache: "no-store" });
    const body = await response.json().catch(() => ({}));
    if (response.ok) setAccesses(Array.isArray(body.accesses) ? body.accesses : []);
  }

  useEffect(() => { void refresh(); }, [tripCode]);

  async function issue() {
    setLoading(true); setMessage(""); setIssuedToken("");
    try {
      const response = await fetch(`/api/trips/${encodeURIComponent(tripCode)}/mobile-access`, { method: "POST" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "No se pudo emitir el acceso Mobile.");
      setIssuedToken(String(body.token ?? ""));
      setExpiresAt(String(body.expiresAt ?? ""));
      setMessage("Acceso emitido. El valor se muestra una sola vez; compártelo con el conductor de forma segura.");
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No se pudo emitir el acceso Mobile.");
    } finally { setLoading(false); }
  }

  async function revoke() {
    setLoading(true); setMessage(""); setIssuedToken("");
    try {
      const response = await fetch(`/api/trips/${encodeURIComponent(tripCode)}/mobile-access`, { method: "DELETE" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "No se pudo revocar el acceso Mobile.");
      setMessage("Acceso Mobile revocado.");
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No se pudo revocar el acceso Mobile.");
    } finally { setLoading(false); }
  }

  async function copyAccess() {
    if (!issuedToken) return;
    const value = mobileAccessLink(issuedToken);
    try {
      await navigator.clipboard.writeText(value);
      setMessage("Acceso copiado al portapapeles.");
    } catch {
      setMessage("No se pudo copiar automáticamente. Selecciona el acceso y cópialo manualmente.");
    }
  }

  const active = accesses.find(item => !item.revoked_at && new Date(item.expires_at).getTime() > Date.now());

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start", flexWrap: "wrap" }}>
        <div>
          <h2 style={{ margin: 0 }}>FORNEXA Mobile</h2>
          <p style={{ margin: "6px 0 0", color: "#66768a" }}>
            Acceso operativo del conductor al viaje completo. No expone las CMR Keys individuales.
          </p>
        </div>
        <span style={{ padding: "6px 10px", borderRadius: 999, background: active ? "#e8f4ed" : "#eef2f6", color: active ? "#296044" : "#566577", fontWeight: 800, fontSize: 12 }}>
          {active ? "Acceso activo" : "Sin acceso activo"}
        </span>
      </div>

      {active && (
        <p style={{ margin: 0, fontSize: 13, color: "#526276" }}>
          Vigente hasta {new Date(active.expires_at).toLocaleString("es-ES")}
          {active.last_used_at ? ` · Último uso ${new Date(active.last_used_at).toLocaleString("es-ES")}` : " · Todavía no utilizado"}
        </p>
      )}

      {issuedToken && (
        <div style={{ padding: 14, border: "1px solid #9ebbd0", borderRadius: 10, background: "#f4f9fc", display: "grid", gap: 8 }}>
          <strong>Acceso recién emitido</strong>
          <code style={{ overflowWrap: "anywhere", userSelect: "all" }}>{mobileAccessLink(issuedToken)}</code>
          {expiresAt && <small>Caduca: {new Date(expiresAt).toLocaleString("es-ES")}</small>}
          <button type="button" onClick={copyAccess} style={{ justifySelf: "start", padding: "8px 12px", borderRadius: 8, border: 0, background: "#005d8f", color: "white", fontWeight: 800, cursor: "pointer" }}>Copiar acceso</button>
        </div>
      )}

      {message && <p style={{ margin: 0, padding: "9px 11px", borderRadius: 8, background: "#f4f6f8", color: "#3d4c5e" }}>{message}</p>}

      {!readOnly && (
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button type="button" disabled={loading} onClick={issue} style={{ padding: "9px 14px", borderRadius: 8, border: 0, background: "#005d8f", color: "white", fontWeight: 800, cursor: loading ? "wait" : "pointer" }}>
            {active ? "Rotar acceso Mobile" : "Emitir acceso Mobile"}
          </button>
          {active && <button type="button" disabled={loading} onClick={revoke} style={{ padding: "9px 14px", borderRadius: 8, border: "1px solid #c9d3dd", background: "white", color: "#7a3138", fontWeight: 800, cursor: loading ? "wait" : "pointer" }}>Revocar acceso</button>}
        </div>
      )}
      {readOnly && <p style={{ margin: 0, fontSize: 12, color: "#718095" }}>Modo revisión: la gestión de accesos Mobile está deshabilitada.</p>}
    </div>
  );
}
