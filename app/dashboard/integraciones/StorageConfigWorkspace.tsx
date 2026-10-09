"use client";

import { useEffect, useState } from "react";
import {
  getStorageConfig,
  saveStorageConfig,
  resetStorageConfig,
  STORAGE_UPDATED_EVENT,
  DEFAULT_STORAGE_CONFIG,
  type StorageConfig,
  type StorageProvider,
} from "@/lib/storage-config";
import styles from "./integraciones.module.css";

export default function StorageConfigWorkspace() {
  const [config, setConfig] = useState<StorageConfig>(() => getStorageConfig());
  const [provider, setProvider] = useState<StorageProvider>(config.provider);
  const [localDir, setLocalDir] = useState(config.localDirectory);
  const [claudeAccount, setClaudeAccount] = useState(config.claudeSpaceAccount);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    function onUpdated() {
      const current = getStorageConfig();
      setConfig(current);
      setProvider(current.provider);
      setLocalDir(current.localDirectory);
      setClaudeAccount(current.claudeSpaceAccount);
    }
    window.addEventListener(STORAGE_UPDATED_EVENT, onUpdated);
    return () => window.removeEventListener(STORAGE_UPDATED_EVENT, onUpdated);
  }, []);

  function handleSave(e: React.FormEvent) {
    e.preventDefault();
    const updated = saveStorageConfig({
      provider,
      localDirectory: localDir.trim() || DEFAULT_STORAGE_CONFIG.localDirectory,
      claudeSpaceAccount: claudeAccount.trim() || DEFAULT_STORAGE_CONFIG.claudeSpaceAccount,
    });
    setConfig(updated);
    setNotice(
      provider === "local"
        ? `Configuración guardada. Destino de referencia local: "${updated.localDirectory}".`
        : `Configuración guardada (modo prototipo espacio Claude): "${updated.claudeSpaceAccount}".`
    );
  }

  function handleReset() {
    const res = resetStorageConfig();
    setConfig(res);
    setProvider(res.provider);
    setLocalDir(res.localDirectory);
    setClaudeAccount(res.claudeSpaceAccount);
    setNotice(`Configuración de almacenamiento restablecida a los valores predeterminados.`);
  }

  return (
    <article className={styles.panel} style={{ marginBottom: "18px" }}>
      <div className={styles.panelHeader}>
        <div>
          <p className={styles.eyebrow}>ALMACENAMIENTO Y GESTIÓN DOCUMENTAL</p>
          <h2>Almacenamiento y adjuntos</h2>
        </div>
        <span className={`${styles.badge} ${styles.activo}`}>
          {provider === "local" ? "Ruta local activa (Modo Prototipo)" : "Espacio Claude (En preparación)"}
        </span>
      </div>

      <p style={{ margin: "0 0 16px", color: "var(--ui-muted)", fontSize: "13px" }}>
        Configura el destino de referencia para archivos adjuntos en las órdenes operativas. Modo prototipo / estación de trabajo: las referencias se registran localmente en el navegador del operador sin persistencia en servidor remoto.
      </p>

      {notice && (
        <div style={{ margin: "0 0 16px", padding: "10px 14px", borderRadius: "10px", background: "#eef8f3", color: "#16643c", fontSize: "13px", fontWeight: 700, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span>{notice}</span>
          <button type="button" onClick={() => setNotice(null)} style={{ border: 0, background: "transparent", color: "#16643c", fontWeight: 900, cursor: "pointer" }}>×</button>
        </div>
      )}

      <form onSubmit={handleSave} style={{ display: "grid", gap: "16px", background: "#f8fafc", border: "1px solid #d9e3ed", borderRadius: "14px", padding: "18px" }}>
        <div>
          <label style={{ display: "block", fontSize: "12px", fontWeight: 800, color: "#475569", marginBottom: "8px" }}>
            Proveedor de almacenamiento:
          </label>
          <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
            <button
              type="button"
              onClick={() => setProvider("local")}
              style={{
                padding: "10px 16px",
                borderRadius: "10px",
                border: "1px solid",
                borderColor: provider === "local" ? "#07699a" : "#cbd5e1",
                background: provider === "local" ? "#07699a" : "#ffffff",
                color: provider === "local" ? "#ffffff" : "#334155",
                fontWeight: 800,
                fontSize: "13px",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: "8px",
              }}
            >
              💻 Directorio local del equipo (Habilitado)
            </button>
            <button
              type="button"
              onClick={() => setProvider("claude_space")}
              style={{
                padding: "10px 16px",
                borderRadius: "10px",
                border: "1px solid",
                borderColor: provider === "claude_space" ? "#07699a" : "#cbd5e1",
                background: provider === "claude_space" ? "#07699a" : "#ffffff",
                color: provider === "claude_space" ? "#ffffff" : "#334155",
                fontWeight: 800,
                fontSize: "13px",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: "8px",
              }}
            >
              ☁️ Cuenta de espacio Claude (En preparación)
            </button>
          </div>
        </div>

        {provider === "local" ? (
          <div>
            <label style={{ display: "block", fontSize: "12px", fontWeight: 800, color: "#475569", marginBottom: "6px" }}>
              Ruta en el sistema de archivos local de este equipo:
            </label>
            <input
              value={localDir}
              onChange={e => setLocalDir(e.target.value)}
              placeholder="/Users/usuario/fornexa-adjuntos o C:\fornexa-adjuntos"
              style={{ width: "100%", padding: "10px 14px", borderRadius: "10px", border: "1px solid #cbd5e1", background: "#ffffff", fontSize: "13px", boxSizing: "border-box" }}
              required
            />
            <small style={{ display: "block", marginTop: "6px", color: "#64748b", fontSize: "11px" }}>
              Los archivos adjuntados en las órdenes se registran como referencias locales en esta estación de trabajo (sin sincronización con la nube).
            </small>
          </div>
        ) : (
          <div>
            <label style={{ display: "block", fontSize: "12px", fontWeight: 800, color: "#475569", marginBottom: "6px" }}>
              Identificador de cuenta / espacio Claude:
            </label>
            <input
              value={claudeAccount}
              onChange={e => setClaudeAccount(e.target.value)}
              placeholder="claude-workspace-tenant"
              style={{ width: "100%", padding: "10px 14px", borderRadius: "10px", border: "1px solid #cbd5e1", background: "#ffffff", fontSize: "13px", boxSizing: "border-box" }}
              required
            />
          </div>
        )}

        <div style={{ display: "flex", gap: "10px", alignItems: "center", marginTop: "6px" }}>
          <button
            type="submit"
            className={styles.primary}
            style={{ padding: "9px 20px", borderRadius: "8px", fontWeight: 800, fontSize: "13px" }}
          >
            Guardar configuración de almacenamiento
          </button>
          <button
            type="button"
            onClick={handleReset}
            className={styles.secondary}
            style={{ padding: "9px 14px", borderRadius: "8px", fontWeight: 700, fontSize: "12px", border: "1px solid #cbd5e1" }}
          >
            Restablecer valor por defecto
          </button>
        </div>
      </form>

      <div style={{ marginTop: "14px", padding: "12px 14px", borderRadius: "10px", background: "#f1f5f9", border: "1px solid #cbd5e1", fontSize: "12px", color: "#475569" }}>
        <strong>Evolución registrada en Memorándum:</strong> Ampliación de conectores cloud en el roadmap corporativo (Microsoft OneDrive, Google Drive, Claude Workspace y servicio nativo Fornexa Storage con cifrado y trazabilidad eFTI).
      </div>
    </article>
  );
}
