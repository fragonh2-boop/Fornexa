"use client";

import { useEffect, useState } from "react";
import {
  DEFAULT_UI_DENSITY,
  getUiDensity,
  normalizeUiDensity,
  resetUiDensity,
  saveUiDensity,
  UI_DENSITY_ATTRIBUTE,
  UI_DENSITY_OPTIONS,
  UI_DENSITY_UPDATED_EVENT,
  type UiDensity,
} from "@/lib/ui-density";
import styles from "./integraciones.module.css";

/**
 * Selector de nivel de visualización (densidad) en Configuración -> Interfaz.
 *
 * Al elegir un nivel se aplica y se guarda al instante: el propio panel, las
 * tablas y los formularios cambian de escala en la misma pantalla, de modo que
 * la previsualización es el producto real y no una maqueta aparte.
 */
export default function InterfaceConfigWorkspace() {
  const [density, setDensity] = useState<UiDensity>(DEFAULT_UI_DENSITY);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    // El atributo del documento manda: lo dejó el arranque anti-FOUC.
    const fromDocument = document.documentElement.getAttribute(UI_DENSITY_ATTRIBUTE);
    setDensity(normalizeUiDensity(fromDocument ?? getUiDensity()));

    function onUpdated(event: Event) {
      const detail = (event as CustomEvent<unknown>).detail;
      setDensity(normalizeUiDensity(detail ?? getUiDensity()));
    }
    window.addEventListener(UI_DENSITY_UPDATED_EVENT, onUpdated);
    return () => window.removeEventListener(UI_DENSITY_UPDATED_EVENT, onUpdated);
  }, []);

  function select(next: UiDensity) {
    const applied = saveUiDensity(next);
    setDensity(applied);
    const option = UI_DENSITY_OPTIONS.find((item) => item.id === applied);
    setNotice(`Nivel aplicado y guardado: ${option?.label ?? applied}. Se recuerda en este navegador.`);
  }

  function reset() {
    const applied = resetUiDensity();
    setDensity(applied);
    setNotice("Nivel restablecido al valor por defecto de FORNEXA (Compacta).");
  }

  return (
    <article className={styles.panel} style={{ marginBottom: "18px" }}>
      <div className={styles.panelHeader}>
        <div>
          <p className={styles.eyebrow}>VISUALIZACIÓN</p>
          <h2>Interfaz</h2>
        </div>
        <button type="button" className={styles.secondary} onClick={reset}>
          Restablecer
        </button>
      </div>

      <p className={styles.note}>
        Elige cuánta información quieres ver de una vez. El cambio se aplica al momento y se guarda
        solo en este navegador: es una preferencia de puesto, no un dato de la empresa.
      </p>

      <fieldset className={styles.densityFieldset}>
        <legend className={styles.densityLegend}>Nivel de visualización</legend>
        <div className={styles.densityGrid} role="radiogroup" aria-label="Nivel de visualización">
          {UI_DENSITY_OPTIONS.map((option) => {
            const checked = option.id === density;
            return (
              <label
                key={option.id}
                className={`${styles.densityCard} ${checked ? styles.densityCardActive : ""}`}
                data-active={checked ? "true" : undefined}
              >
                <input
                  type="radio"
                  name="fornexa-ui-density"
                  value={option.id}
                  checked={checked}
                  onChange={() => select(option.id)}
                  className={styles.densityInput}
                />
                <span className={styles.densityCardHead}>
                  <strong>{option.label}</strong>
                  {option.id === DEFAULT_UI_DENSITY && <span className={styles.densityTag}>Por defecto</span>}
                </span>
                <span className={styles.densitySummary}>{option.summary}</span>
                <span className={styles.densityDetail}>{option.detail}</span>
                <span className={`${styles.densitySample} ${styles[`densitySample_${option.id}`] ?? ""}`} aria-hidden="true">
                  <span />
                  <span />
                  <span />
                </span>
              </label>
            );
          })}
        </div>
      </fieldset>

      {notice && (
        <p role="status" className={styles.note}>
          {notice}
        </p>
      )}

      <div className={styles.densityPreview} aria-hidden="true">
        <div className={styles.densityPreviewHead}>
          <span>Vista previa</span>
          <span>{UI_DENSITY_OPTIONS.find((item) => item.id === density)?.label ?? density}</span>
        </div>
        <div className={styles.densityPreviewTable}>
          <div className={styles.densityPreviewRow}>
            <strong>EXP-260071</strong>
            <span>Valencia → Lyon</span>
            <span>En tránsito</span>
          </div>
          <div className={styles.densityPreviewRow}>
            <strong>EXP-260072</strong>
            <span>Barcelona → Marseille</span>
            <span>Planificada</span>
          </div>
          <div className={styles.densityPreviewRow}>
            <strong>EXP-260073</strong>
            <span>Madrid → Toulouse</span>
            <span>Entregada</span>
          </div>
        </div>
      </div>
    </article>
  );
}
