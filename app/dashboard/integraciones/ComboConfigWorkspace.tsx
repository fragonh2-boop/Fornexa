"use client";

import { useEffect, useState } from "react";
import {
  getAllComboConfigs,
  getComboConfig,
  saveComboConfig,
  resetComboConfig,
  COMBO_UPDATED_EVENT,
  type ComboConfig,
  type SelectionMode,
} from "@/lib/combo-config";
import styles from "./integraciones.module.css";

export default function ComboConfigWorkspace() {
  const [selectedComboId, setSelectedComboId] = useState("order_service");
  const [combo, setCombo] = useState<ComboConfig>(() => getComboConfig("order_service"));
  const [newValue, setNewValue] = useState("");
  const [newLabel, setNewLabel] = useState("");
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    setCombo(getComboConfig(selectedComboId));
  }, [selectedComboId]);

  useEffect(() => {
    function onUpdated() {
      setCombo(getComboConfig(selectedComboId));
    }
    window.addEventListener(COMBO_UPDATED_EVENT, onUpdated);
    return () => window.removeEventListener(COMBO_UPDATED_EVENT, onUpdated);
  }, [selectedComboId]);

  const allCombos = getAllComboConfigs();

  function handleAddOption(e: React.FormEvent) {
    e.preventDefault();
    if (!newValue.trim()) return;
    const val = newValue.trim();
    const lbl = newLabel.trim() || val;

    if (combo.options.some(o => o.value.toLowerCase() === val.toLowerCase())) {
      setNotice(`El valor "${val}" ya existe en este desplegable.`);
      return;
    }

    const nextOptions = [...combo.options, { id: `opt_${Date.now()}`, value: val, label: lbl }];
    const updated = saveComboConfig(combo.id, { options: nextOptions });
    setCombo(updated);
    setNewValue("");
    setNewLabel("");
    setNotice(`Valor "${val}" añadido con éxito al combo.`);
  }

  function handleRemoveOption(valueToRemove: string) {
    const nextOptions = combo.options.filter(o => o.value !== valueToRemove);
    let nextDefault = combo.defaultValue;
    if (nextDefault === valueToRemove) {
      nextDefault = nextOptions[0]?.value ?? "";
    }
    const updated = saveComboConfig(combo.id, { options: nextOptions, defaultValue: nextDefault });
    setCombo(updated);
    setNotice(`Valor "${valueToRemove}" eliminado del combo.`);
  }

  function handleDefaultChange(val: string) {
    const updated = saveComboConfig(combo.id, { defaultValue: val });
    setCombo(updated);
    setNotice(`Valor por defecto establecido en "${val}".`);
  }

  function handleModeChange(mode: SelectionMode) {
    const updated = saveComboConfig(combo.id, { selectionMode: mode });
    setCombo(updated);
    setNotice(`Modo de selección cambiado a "${mode === "single" ? "Selección única" : "Selección múltiple"}".`);
  }

  function handleReset() {
    const reset = resetComboConfig(combo.id);
    setCombo(reset);
    setNotice(`Valores del combo restablecidos a la configuración de fábrica.`);
  }

  return (
    <article className={styles.panel} style={{ marginBottom: "18px" }}>
      <div className={styles.panelHeader}>
        <div>
          <p className={styles.eyebrow}>CAMPOS Y LISTAS DESPLEGABLES</p>
          <h2>Configuración de Combos</h2>
        </div>
        <div className={styles.filters}>
          <label style={{ fontSize: "12px", fontWeight: 800, color: "var(--ui-muted)", display: "flex", alignItems: "center", gap: "8px" }}>
            Campo:
            <select
              value={selectedComboId}
              onChange={e => setSelectedComboId(e.target.value)}
              aria-label="Seleccionar campo combo a configurar"
            >
              {allCombos.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </label>
        </div>
      </div>

      <p style={{ margin: "0 0 16px", color: "var(--ui-muted)", fontSize: "13px" }}>
        {combo.description}. Configura los valores seleccionables, el valor por defecto y si permite selección única o múltiple en los formularios operativos.
      </p>

      {notice && (
        <div style={{ margin: "0 0 16px", padding: "10px 14px", borderRadius: "10px", background: "#eef8f3", color: "#16643c", fontSize: "13px", fontWeight: 700, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span>{notice}</span>
          <button type="button" onClick={() => setNotice(null)} style={{ border: 0, background: "transparent", color: "#16643c", fontWeight: 900, cursor: "pointer" }}>×</button>
        </div>
      )}

      {/* Grid with parameters */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "16px", background: "#f8fafc", border: "1px solid #d9e3ed", borderRadius: "12px", padding: "16px", marginBottom: "18px" }}>
        <div>
          <label style={{ display: "block", fontSize: "12px", fontWeight: 800, color: "#475569", marginBottom: "6px" }}>
            Modo de selección:
          </label>
          <div style={{ display: "flex", gap: "10px" }}>
            <button
              type="button"
              onClick={() => handleModeChange("single")}
              style={{
                padding: "8px 14px",
                borderRadius: "8px",
                border: "1px solid",
                borderColor: combo.selectionMode === "single" ? "#07699a" : "#cbd5e1",
                background: combo.selectionMode === "single" ? "#07699a" : "#ffffff",
                color: combo.selectionMode === "single" ? "#ffffff" : "#334155",
                fontWeight: 800,
                fontSize: "12px",
                cursor: "pointer",
              }}
            >
              Selección única
            </button>
            <button
              type="button"
              onClick={() => handleModeChange("multi")}
              style={{
                padding: "8px 14px",
                borderRadius: "8px",
                border: "1px solid",
                borderColor: combo.selectionMode === "multi" ? "#07699a" : "#cbd5e1",
                background: combo.selectionMode === "multi" ? "#07699a" : "#ffffff",
                color: combo.selectionMode === "multi" ? "#ffffff" : "#334155",
                fontWeight: 800,
                fontSize: "12px",
                cursor: "pointer",
              }}
            >
              Selección múltiple
            </button>
          </div>
        </div>

        <div>
          <label style={{ display: "block", fontSize: "12px", fontWeight: 800, color: "#475569", marginBottom: "6px" }}>
            Valor precargado por defecto:
          </label>
          <select
            value={typeof combo.defaultValue === "string" ? combo.defaultValue : combo.defaultValue[0] ?? ""}
            onChange={e => handleDefaultChange(e.target.value)}
            style={{ width: "100%", padding: "8px 12px", borderRadius: "8px", border: "1px solid #cbd5e1", background: "#ffffff", fontSize: "13px" }}
          >
            {combo.options.map(opt => (
              <option key={opt.id} value={opt.value}>
                {opt.label} ({opt.value})
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Options list */}
      <div style={{ marginBottom: "18px" }}>
        <h4 style={{ margin: "0 0 10px", fontSize: "14px", color: "#1e293b" }}>
          Valores seleccionables activos ({combo.options.length}):
        </h4>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
          {combo.options.map(opt => {
            const isDefault = combo.defaultValue === opt.value;
            return (
              <div
                key={opt.id}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "8px",
                  padding: "6px 12px",
                  borderRadius: "8px",
                  background: isDefault ? "#e0f2fe" : "#f1f5f9",
                  border: isDefault ? "1px solid #7dd3fc" : "1px solid #e2e8f0",
                  fontSize: "13px",
                  fontWeight: 700,
                  color: isDefault ? "#0369a1" : "#1e293b",
                }}
              >
                <span>{opt.label}</span>
                {isDefault && <small style={{ fontSize: "10px", background: "#0284c7", color: "#fff", padding: "1px 5px", borderRadius: "4px" }}>Por defecto</small>}
                <button
                  type="button"
                  onClick={() => handleRemoveOption(opt.value)}
                  style={{
                    border: 0,
                    background: "transparent",
                    color: "#94a3b8",
                    fontWeight: 900,
                    cursor: "pointer",
                    fontSize: "15px",
                    lineHeight: 1,
                    padding: "0 2px",
                  }}
                  title="Eliminar este valor del desplegable"
                >
                  ×
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {/* Add new option form */}
      <form onSubmit={handleAddOption} style={{ display: "flex", gap: "10px", alignItems: "flex-end", flexWrap: "wrap", padding: "14px", background: "#f8fafc", borderRadius: "10px", border: "1px solid #e2e8f0" }}>
        <div style={{ flex: "1 1 200px" }}>
          <label style={{ display: "block", fontSize: "11px", fontWeight: 800, color: "#64748b", marginBottom: "4px" }}>
            Nuevo valor / código:
          </label>
          <input
            value={newValue}
            onChange={e => setNewValue(e.target.value)}
            placeholder="Ej: cross, picking, etc."
            style={{ width: "100%", padding: "8px 12px", borderRadius: "8px", border: "1px solid #cbd5e1", boxSizing: "border-box" }}
          />
        </div>
        <div style={{ flex: "1 1 200px" }}>
          <label style={{ display: "block", fontSize: "11px", fontWeight: 800, color: "#64748b", marginBottom: "4px" }}>
            Etiqueta visible (opcional):
          </label>
          <input
            value={newLabel}
            onChange={e => setNewLabel(e.target.value)}
            placeholder="Ej: Cross docking, Picking almacén..."
            style={{ width: "100%", padding: "8px 12px", borderRadius: "8px", border: "1px solid #cbd5e1", boxSizing: "border-box" }}
          />
        </div>
        <button
          type="submit"
          className={styles.primary}
          style={{ padding: "8px 16px", borderRadius: "8px", fontWeight: 800, fontSize: "13px" }}
        >
          + Añadir valor
        </button>
        <button
          type="button"
          onClick={handleReset}
          className={styles.secondary}
          style={{ padding: "8px 14px", borderRadius: "8px", fontWeight: 700, fontSize: "12px", border: "1px solid #cbd5e1" }}
        >
          Restablecer combo
        </button>
      </form>
    </article>
  );
}
