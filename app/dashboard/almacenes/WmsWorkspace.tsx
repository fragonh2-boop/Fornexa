"use client";
import { useMemo, useState } from "react";
import {
  MetricGrid,
  ScreenHeader,
  screenButton,
  screenPanelClass,
} from "../../components/ScreenChrome";
import {
  computePickAllocationProposals,
  computePutawayProposal,
  resolveEffectiveWmsPolicy,
  type WmsFlowState,
  type WmsHuState,
} from "@/lib/wms";
import { useWmsData, wmsMutation } from "@/lib/wms-client";
import styles from "./wms.module.css";

const TABS = [
  "Mapa y Ubicaciones",
  "Recepción y Playa",
  "Ubicación Dirigida",
  "Picking y Tareas",
  "Carga y Expedición",
  "Recursos y Políticas",
  "Reposición Interna",
] as const;

type TabKey = (typeof TABS)[number];

export const FLOW_STATE_LABEL: Record<string, string> = {
  STAGING_UNCHECKED: "Playa sin chequear",
  STAGING_CHECKED: "Playa chequeado OK",
  STORED: "Ubicado (STORED)",
  RESERVED: "Reservado en hueco",
  PICKED_STAGED: "Preparado en expedición",
  LOADED: "Cargado en vehículo",
  QUARANTINE: "En cuarentena",
  DAMAGED: "Dañado",
};

function flowBadgeClass(state: WmsFlowState | WmsHuState | null): string {
  if (!state) return `${styles.badge} ${styles.badgeDanger}`;
  if (state === "STORED" || state === "LOADED") return `${styles.badge} ${styles.badgeOk}`;
  if (state === "STAGING_CHECKED" || state === "RESERVED" || state === "PICKED_STAGED")
    return `${styles.badge} ${styles.badgeInfo}`;
  if (state === "STAGING_UNCHECKED") return `${styles.badge} ${styles.badgeWarn}`;
  return `${styles.badge} ${styles.badgeDanger}`;
}

export default function WmsWorkspace({
  defaultTab = "Mapa y Ubicaciones",
}: { defaultTab?: TabKey } = {}) {
  const { data, loading, error, setError, load } = useWmsData();
  const [tab, setTab] = useState<TabKey>(defaultTab);
  const [warehouseId, setWarehouseId] = useState<string>("");
  const [zoneFilter, setZoneFilter] = useState<string>("");
  const [tempFilter, setTempFilter] = useState<string>("");
  const [busy, setBusy] = useState<boolean>(false);
  const [feedback, setFeedback] = useState<{ code?: string; message: string; ok: boolean } | null>(
    null,
  );

  // Per-row interactive inputs
  const [receiptInputs, setReceiptInputs] = useState<
    Record<string, { batch: string; expiry: string; qty: string }>
  >({});
  const [putawayInputs, setPutawayInputs] = useState<
    Record<string, { binId: string; resourceId: string }>
  >({});
  const [pickInputs, setPickInputs] = useState<
    Record<string, { scannedBatch: string; resourceId: string }>
  >({});
  const [loadInputs, setLoadInputs] = useState<
    Record<string, { scannedCode: string; weight: string; volume: string; stateOk: boolean }>
  >({});

  const activeWarehouseId = warehouseId || data.warehouses[0]?.id || "";

  const zones = useMemo(
    () => data.zones.filter((z) => z.warehouse_id === activeWarehouseId),
    [data.zones, activeWarehouseId],
  );

  const bins = useMemo(
    () =>
      data.bins.filter((b) => {
        if (b.warehouse_id !== activeWarehouseId) return false;
        if (zoneFilter && b.zone_id !== zoneFilter) return false;
        if (tempFilter) {
          const z = zones.find((zn) => zn.id === b.zone_id);
          if (z?.temperature_regime !== tempFilter) return false;
        }
        return true;
      }),
    [data.bins, activeWarehouseId, zoneFilter, tempFilter, zones],
  );

  const quants = useMemo(
    () => data.quants.filter((q) => q.warehouse_id === activeWarehouseId),
    [data.quants, activeWarehouseId],
  );

  const hus = useMemo(
    () => data.handlingUnits.filter((h) => h.warehouse_id === activeWarehouseId),
    [data.handlingUnits, activeWarehouseId],
  );

  const tasks = useMemo(
    () => data.tasks.filter((t) => t.warehouse_id === activeWarehouseId),
    [data.tasks, activeWarehouseId],
  );

  const replenishmentRules = useMemo(
    () => (data.replenishmentRules || []).filter((r) => r.warehouse_id === activeWarehouseId),
    [data.replenishmentRules, activeWarehouseId],
  );

  const proposals = useMemo(
    () => (data.proposals || []).filter((p) => p.warehouse_id === activeWarehouseId),
    [data.proposals, activeWarehouseId],
  );

  const resources = useMemo(
    () => data.resources.filter((r) => r.warehouse_id === activeWarehouseId),
    [data.resources, activeWarehouseId],
  );

  const appointments = useMemo(
    () => data.appointments.filter((a) => a.warehouse_id === activeWarehouseId),
    [data.appointments, activeWarehouseId],
  );

  const effectivePolicy = useMemo(
    () => resolveEffectiveWmsPolicy(data.policies, activeWarehouseId),
    [data.policies, activeWarehouseId],
  );

  const putawayProposals = useMemo(() => {
    const checkedHus = hus.filter((h) => h.state === "STAGING_CHECKED");
    return checkedHus.map((hu) => {
      const content = data.huContents.find((c) => c.handling_unit_id === hu.id);
      const product = data.products.find((p) => p.id === content?.product_id);
      const pol = resolveEffectiveWmsPolicy(
        data.policies,
        activeWarehouseId,
        hu.owner_party_id,
        product?.id,
        product?.category_code,
      );
      return computePutawayProposal({
        hu,
        content,
        product,
        bins: data.bins,
        zones: data.zones,
        quants: data.quants,
        allHus: data.handlingUnits,
        policy: pol,
      });
    });
  }, [hus, data.huContents, data.products, data.policies, activeWarehouseId, data.bins, data.zones, data.quants, data.handlingUnits]);

  const pickProposals = useMemo(
    () =>
      computePickAllocationProposals({
        warehouseId: activeWarehouseId,
        quants,
        bins: data.bins,
        products: data.products,
        tasks,
        policy: effectivePolicy,
      }),
    [activeWarehouseId, quants, data.bins, data.products, tasks, effectivePolicy],
  );

  const metrics = useMemo(() => {
    const uncheckedCount = hus.filter((h) => h.state === "STAGING_UNCHECKED").length;
    const checkedStagingCount = hus.filter((h) => h.state === "STAGING_CHECKED").length;
    const storedCount = hus.filter((h) => h.state === "STORED").length;
    const activePickCount = tasks.filter(
      (t) => t.task_type === "PICK" && ["READY", "ASSIGNED", "IN_PROGRESS"].includes(t.state),
    ).length;
    const pendingLoadCount = hus.filter((h) => h.state === "PICKED_STAGED").length;
    const legacyNullCount = quants.filter((q) => q.flow_state === null).length;
    return [
      { label: "En playa (sin chequear / OK)", value: `${uncheckedCount} / ${checkedStagingCount}` },
      { label: "Pallets ubicados (STORED)", value: String(storedCount) },
      { label: "Picking / Expedición", value: `${activePickCount} / ${pendingLoadCount}` },
      { label: "Quants legado (NULL fail-closed)", value: String(legacyNullCount) },
    ];
  }, [hus, tasks, quants]);

  async function runAction(action: Parameters<typeof wmsMutation>[0], payload: Record<string, unknown>) {
    setBusy(true);
    setFeedback(null);
    const res = await wmsMutation(action, payload);
    setBusy(false);
    if (!res.ok) {
      setFeedback({ ok: false, code: res.code, message: res.error ?? "Operación rechazada." });
    } else {
      setFeedback({
        ok: true,
        message: `Operación ${action} ejecutada y auditada correctamente.`,
      });
      await load();
    }
  }

  const productById = useMemo(
    () => new Map(data.products.map((p) => [p.id, p])),
    [data.products],
  );
  const binById = useMemo(() => new Map(data.bins.map((b) => [b.id, b])), [data.bins]);
  const zoneById = useMemo(() => new Map(data.zones.map((z) => [z.id, z])), [data.zones]);

  return (
    <main className={styles.page}>
      <ScreenHeader
        eyebrow="WMS · OPERATIVA TRANSACCIONAL"
        title="Almacenes"
        description="Control de zonas, ubicaciones, unidades de manipulación (LPN/SSCC), recepción y chequeo en playa, ubicación dirigida, reservas y picking FEFO/FIFO, y expedición con lectura de etiqueta."
      >
        <div className={styles.toolbar}>
          <label htmlFor="wms-wh-select" className={styles.eyebrow}>
            Almacén
          </label>
          <select
            id="wms-wh-select"
            aria-label="Seleccionar almacén"
            value={activeWarehouseId}
            onChange={(e) => {
              setWarehouseId(e.target.value);
              setZoneFilter("");
            }}
          >
            {data.warehouses.map((w) => (
              <option key={w.id} value={w.id}>
                {w.code} — {w.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            className={screenButton.secondary}
            onClick={() => void load()}
            disabled={loading || busy}
          >
            Actualizar
          </button>
        </div>
      </ScreenHeader>

      <MetricGrid items={metrics} />

      {error && (
        <div role="alert" className={styles.errorBanner}>
          <span>{error}</span>
          <button
            type="button"
            className={screenButton.secondary}
            style={{ marginLeft: 12 }}
            onClick={() => setError(null)}
          >
            Cerrar
          </button>
        </div>
      )}

      {feedback && (
        <div
          role="status"
          className={feedback.ok ? styles.successBanner : styles.errorBanner}
        >
          <span>
            {feedback.code ? `[${feedback.code}] ` : ""}
            {feedback.message}
          </span>
        </div>
      )}

      <section className={`${screenPanelClass} ${styles.panel}`}>
        <div className={styles.panelHead}>
          <div className={styles.toolbar} role="tablist" aria-label="Vistas de almacén">
            {TABS.map((t) => (
              <button
                key={t}
                type="button"
                role="tab"
                aria-selected={tab === t}
                className={tab === t ? styles.selected : ""}
                onClick={() => setTab(t)}
              >
                {t}
              </button>
            ))}
          </div>
          <span className={styles.badge}>
            Rotación activa: {effectivePolicy.rotation} · Lote entrada:{" "}
            {effectivePolicy.capture_lot_on_receipt ? "SÍ" : "NO"} · Escaneo carga:{" "}
            {effectivePolicy.require_label_scan_on_load ? "SÍ" : "NO"}
          </span>
        </div>

        {/* TAB 1: MAPA Y UBICACIONES */}
        {tab === "Mapa y Ubicaciones" && (
          <div className={styles.panel}>
            <div className={styles.panelHead}>
              <div>
                <p className={styles.eyebrow}>ESTRUCTURA FÍSICA Y LÓGICA</p>
                <h2>Mapa de zonas, ubicaciones y estado de flujo</h2>
              </div>
              <div className={styles.toolbar}>
                <select
                  aria-label="Filtrar por zona"
                  value={zoneFilter}
                  onChange={(e) => setZoneFilter(e.target.value)}
                >
                  <option value="">Todas las zonas ({zones.length})</option>
                  {zones.map((z) => (
                    <option key={z.id} value={z.id}>
                      {z.zone_code} · {z.zone_name} ({z.temperature_regime})
                    </option>
                  ))}
                </select>
                <select
                  aria-label="Filtrar por temperatura"
                  value={tempFilter}
                  onChange={(e) => setTempFilter(e.target.value)}
                >
                  <option value="">Todos los regímenes térmicos</option>
                  <option value="AMBIENT">AMBIENT</option>
                  <option value="CHILLED">CHILLED</option>
                  <option value="FROZEN">FROZEN</option>
                  <option value="CONTROLLED">CONTROLLED</option>
                </select>
              </div>
            </div>

            <div className={styles.cards}>
              {bins.map((bin) => {
                const z = bin.zone_id ? zoneById.get(bin.zone_id) : undefined;
                const binHus = hus.filter(
                  (h) => h.current_bin_id === bin.id && h.state === "STORED",
                );
                const binQuants = quants.filter((q) => q.bin_id === bin.id);
                return (
                  <article key={bin.id} className={styles.card}>
                    <div className={styles.cardHeader}>
                      <strong>{bin.bin_code}</strong>
                      <span
                        className={
                          bin.is_blocked
                            ? `${styles.badge} ${styles.badgeDanger}`
                            : `${styles.badge} ${styles.badgeOk}`
                        }
                      >
                        {bin.is_blocked ? `BLOQUEADO (${bin.block_reason ?? "MANT"})` : bin.bin_type}
                      </span>
                    </div>
                    <small>
                      Zona: {z?.zone_code ?? "—"} ({z?.temperature_regime ?? "AMBIENT"}) · Pasillo{" "}
                      {bin.aisle ?? "—"} / Est. {bin.rack ?? "—"} / Nivel {bin.shelf ?? "—"}
                    </small>
                    <small>
                      Capacidad: {binHus.length}/{bin.max_pallets} pallets · Máx{" "}
                      {bin.max_weight_kg ?? "—"} kg · {bin.max_volume_m3 ?? "—"} m³
                    </small>
                    {binQuants.length > 0 && (
                      <small>
                        Quants en hueco: {binQuants.length} (
                        {binQuants
                          .map(
                            (q) =>
                              `${productById.get(q.product_id)?.sku ?? "SKU"}: ${q.quantity_on_hand} ${q.uom} [${q.flow_state ?? "NULL-LEGADO"}]`,
                          )
                          .join(", ")}
                        )
                      </small>
                    )}
                  </article>
                );
              })}
            </div>

            <div className={styles.scroll}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Ubicación</th>
                    <th>Artículo (SKU)</th>
                    <th>Lote / Caducidad</th>
                    <th>Stock físico / Reservado</th>
                    <th>Calidad (stock_status)</th>
                    <th>Estado de flujo (flow_state)</th>
                    <th> Elegibilidad Picking</th>
                  </tr>
                </thead>
                <tbody>
                  {quants.map((q) => {
                    const bin = binById.get(q.bin_id);
                    const prod = productById.get(q.product_id);
                    const eligible =
                      (q.flow_state === "STORED" || q.flow_state === "RESERVED") &&
                      q.stock_status === "AVAILABLE" &&
                      q.quantity_on_hand > q.quantity_reserved;
                    return (
                      <tr key={q.id}>
                        <td>
                          <strong>{bin?.bin_code ?? "—"}</strong>
                        </td>
                        <td>
                          <strong>{prod?.sku ?? "—"}</strong>
                          <small>{prod?.name ?? ""}</small>
                        </td>
                        <td>
                          {q.batch_number ?? "Sin lote"}
                          <small>{q.expiry_date ? `Cad: ${q.expiry_date}` : "Sin caducidad"}</small>
                        </td>
                        <td>
                          <strong>
                            {q.quantity_on_hand} {q.uom}
                          </strong>
                          <small>Reservado: {q.quantity_reserved}</small>
                        </td>
                        <td>
                          <span className={styles.badge}>{q.stock_status}</span>
                        </td>
                        <td>
                          <span className={flowBadgeClass(q.flow_state)}>
                            {q.flow_state
                              ? FLOW_STATE_LABEL[q.flow_state] ?? q.flow_state
                              : "NULL · Legado sin estado"}
                          </span>
                        </td>
                        <td>
                          {eligible ? (
                            <span className={`${styles.badge} ${styles.badgeOk}`}>
                              APTO PARA PICKING
                            </span>
                          ) : (
                            <span className={`${styles.badge} ${styles.badgeDanger}`}>
                              BLOQUEADO (WMS_STOCK_NOT_LOCATED)
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* TAB 2: RECEPCIÓN Y PLAYA */}
        {tab === "Recepción y Playa" && (
          <div className={styles.panel}>
            <div className={styles.panelHead}>
              <div>
                <p className={styles.eyebrow}>DESCARGAS EN CURSO Y CONTROL DE ENTRADA</p>
                <h2>Citas en muelle y unidades en playa (STAGING_UNCHECKED / STAGING_CHECKED)</h2>
              </div>
            </div>

            {appointments.length > 0 && (
              <div className={styles.cards}>
                {appointments.slice(0, 6).map((apt) => (
                  <article key={apt.id} className={styles.card}>
                    <div className={styles.cardHeader}>
                      <strong>{apt.code}</strong>
                      <span className={`${styles.badge} ${styles.badgeInfo}`}>{apt.status}</span>
                    </div>
                    <small>
                      Dirección: {apt.direction} · Ventana: {apt.planned_start.slice(0, 16)}
                    </small>
                  </article>
                ))}
              </div>
            )}

            <div className={styles.scroll}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>HU / LPN</th>
                    <th>Tipo</th>
                    <th>Artículo / Contenido</th>
                    <th>Estado en Playa</th>
                    <th>Captura de Lote / Caducidad y Confirmación (RECEIVE_CHECK)</th>
                  </tr>
                </thead>
                <tbody>
                  {hus
                    .filter((h) => h.state === "STAGING_UNCHECKED" || h.state === "STAGING_CHECKED")
                    .map((hu) => {
                      const content = data.huContents.find((c) => c.handling_unit_id === hu.id);
                      const prod = productById.get(content?.product_id ?? "");
                      const pol = resolveEffectiveWmsPolicy(
                        data.policies,
                        activeWarehouseId,
                        hu.owner_party_id,
                        prod?.id,
                        prod?.category_code,
                      );
                      const input = receiptInputs[hu.id] ?? {
                        batch: content?.batch_number ?? "",
                        expiry: content?.expiry_date ?? "",
                        qty: String(content?.quantity ?? 100),
                      };
                      const needsLot = pol.capture_lot_on_receipt || prod?.is_batch_managed;
                      const needsExpiry =
                        pol.capture_expiry_on_receipt || prod?.shelf_life_days !== null;
                      const canConfirm =
                        hu.state === "STAGING_UNCHECKED" &&
                        (!needsLot || input.batch.trim().length > 0) &&
                        (!needsExpiry || input.expiry.trim().length > 0);

                      return (
                        <tr key={hu.id}>
                          <td>
                            <strong>{hu.code}</strong>
                            <small>{hu.code_type}</small>
                          </td>
                          <td>{hu.hu_type}</td>
                          <td>
                            <strong>{prod?.sku ?? "—"}</strong>
                            <small>{prod?.name ?? ""}</small>
                          </td>
                          <td>
                            <span className={flowBadgeClass(hu.state)}>
                              {FLOW_STATE_LABEL[hu.state]}
                            </span>
                          </td>
                          <td>
                            {hu.state === "STAGING_UNCHECKED" ? (
                              <div className={styles.inlineForm}>
                                <input
                                  type="text"
                                  aria-label={`Lote para ${hu.code}`}
                                  placeholder={needsLot ? "Lote (obligatorio)" : "Lote (opcional)"}
                                  value={input.batch}
                                  onChange={(e) =>
                                    setReceiptInputs((prev) => ({
                                      ...prev,
                                      [hu.id]: { ...input, batch: e.target.value },
                                    }))
                                  }
                                />
                                <input
                                  type="date"
                                  aria-label={`Caducidad para ${hu.code}`}
                                  value={input.expiry}
                                  onChange={(e) =>
                                    setReceiptInputs((prev) => ({
                                      ...prev,
                                      [hu.id]: { ...input, expiry: e.target.value },
                                    }))
                                  }
                                />
                                <button
                                  type="button"
                                  className={screenButton.primary}
                                  disabled={!data.canEdit || busy || !canConfirm}
                                  title={
                                    !canConfirm
                                      ? "Completa lote y caducidad exigidos por la política antes de confirmar recepción"
                                      : "Confirmar chequeo de entrada (RECEIVE_CHECK)"
                                  }
                                  onClick={() =>
                                    void runAction("RECEIVE_CHECK", {
                                      hu_id: hu.id,
                                      product_id: prod?.id,
                                      batch_number: input.batch.trim(),
                                      expiry_date: input.expiry.trim(),
                                      quantity: Number(input.qty) || content?.quantity || 1,
                                    })
                                  }
                                >
                                  Confirmar chequeo OK
                                </button>
                              </div>
                            ) : (
                              <span className={`${styles.badge} ${styles.badgeOk}`}>
                                Chequeado OK (Lote: {content?.batch_number ?? "—"}) · Listo para
                                Putaway
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* TAB 3: UBICACIÓN DIRIGIDA (PUTAWAY) */}
        {tab === "Ubicación Dirigida" && (
          <div className={styles.panel}>
            <div className={styles.panelHead}>
              <div>
                <p className={styles.eyebrow}>MOTOR INTERACTIVO DE UBICACIÓN (TS_INTERACTIVE)</p>
                <h2>Propuestas de hueco y confirmación de Putaway</h2>
              </div>
            </div>

            <div className={styles.scroll}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>HU Chequeada</th>
                    <th>Propuesta del Motor</th>
                    <th>Justificación (Regla Aplicada)</th>
                    <th>Selección de Hueco y Recurso</th>
                    <th>Ejecutar Putaway</th>
                  </tr>
                </thead>
                <tbody>
                  {putawayProposals.map((prop) => {
                    const sel = putawayInputs[prop.hu_id] ?? {
                      binId: prop.recommended_bin_id ?? "",
                      resourceId: resources.find((r) => r.is_active && r.status === "AVAILABLE")?.id ?? "",
                    };
                    return (
                      <tr key={prop.hu_id}>
                        <td>
                          <strong>{prop.hu_code}</strong>
                          <small>STAGING_CHECKED</small>
                        </td>
                        <td>
                          <strong>{prop.recommended_bin_code ?? "Sin candidato"}</strong>
                          <small>
                            Zona: {prop.zone_code ?? "—"} ({prop.temperature_regime ?? "—"})
                          </small>
                        </td>
                        <td>
                          <small>{prop.rule_applied}</small>
                        </td>
                        <td>
                          <div className={styles.inlineForm}>
                            <select
                              aria-label={`Ubicación destino para ${prop.hu_code}`}
                              value={sel.binId}
                              onChange={(e) =>
                                setPutawayInputs((prev) => ({
                                  ...prev,
                                  [prop.hu_id]: { ...sel, binId: e.target.value },
                                }))
                              }
                            >
                              <option value="">Seleccionar ubicación...</option>
                              {bins
                                .filter((b) => !b.is_blocked && b.is_active)
                                .map((b) => (
                                  <option key={b.id} value={b.id}>
                                    {b.bin_code} ({b.bin_type})
                                  </option>
                                ))}
                            </select>
                            <select
                              aria-label={`Recurso para ${prop.hu_code}`}
                              value={sel.resourceId}
                              onChange={(e) =>
                                setPutawayInputs((prev) => ({
                                  ...prev,
                                  [prop.hu_id]: { ...sel, resourceId: e.target.value },
                                }))
                              }
                            >
                              <option value="">Sin recurso específico</option>
                              {resources
                                .filter((r) => r.is_active && r.status !== "OFFLINE" && r.status !== "MAINTENANCE")
                                .map((r) => (
                                  <option key={r.id} value={r.id}>
                                    {r.code} — {r.name} ({r.resource_type})
                                  </option>
                                ))}
                            </select>
                          </div>
                        </td>
                        <td>
                          <button
                            type="button"
                            className={screenButton.primary}
                            disabled={!data.canEdit || busy || !sel.binId}
                            onClick={() =>
                              void runAction("PUTAWAY", {
                                hu_id: prop.hu_id,
                                destination_bin_id: sel.binId,
                                resource_id: sel.resourceId || null,
                              })
                            }
                          >
                            Ubicar en hueco (PUTAWAY)
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* TAB 4: PICKING Y TAREAS */}
        {tab === "Picking y Tareas" && (
          <div className={styles.panel}>
            <div className={styles.panelHead}>
              <div>
                <p className={styles.eyebrow}>RESERVAS POR LÍNEA Y COLA DE TRABAJO</p>
                <h2>Propuestas FEFO/FIFO de reserva y confirmación de Picking con lote</h2>
              </div>
            </div>

            <div className={styles.scroll}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Ubicación (STORED)</th>
                    <th>SKU</th>
                    <th>Lote / Caducidad</th>
                    <th>Disponible</th>
                    <th>Regla de Rotación</th>
                    <th>Reservar para Picking</th>
                  </tr>
                </thead>
                <tbody>
                  {pickProposals.slice(0, 12).map((prop) => (
                    <tr key={prop.quant_id}>
                      <td>
                        <strong>{prop.bin_code}</strong>
                      </td>
                      <td>
                        <strong>{prop.sku}</strong>
                      </td>
                      <td>
                        {prop.batch_number ?? "—"}
                        <small>{prop.expiry_date ?? ""}</small>
                      </td>
                      <td>{prop.available_qty}</td>
                      <td>
                        <small>{prop.rule_applied}</small>
                      </td>
                      <td>
                        <button
                          type="button"
                          className={screenButton.secondary}
                          disabled={!data.canEdit || busy}
                          onClick={() =>
                            void runAction("RESERVE", {
                              quant_id: prop.quant_id,
                              quantity: prop.recommended_qty,
                            })
                          }
                        >
                          Reservar ({prop.recommended_qty})
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <h3>Reservas activas (ALLOCATED) pendientes de confirmar Picking</h3>
            <div className={styles.scroll}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Reserva ID</th>
                    <th>Lote Reservado</th>
                    <th>Cantidad</th>
                    <th>Estado</th>
                    <th>Verificación de Lote y Ejecución (PICK)</th>
                  </tr>
                </thead>
                <tbody>
                  {data.reservations
                    .filter((r) => r.status === "ALLOCATED")
                    .map((res) => {
                      const inp = pickInputs[res.id] ?? {
                        scannedBatch: res.batch_number ?? "",
                        resourceId: "",
                      };
                      const batchMatches =
                        !effectivePolicy.capture_lot_on_pick ||
                        !res.batch_number ||
                        inp.scannedBatch.trim() === res.batch_number;
                      return (
                        <tr key={res.id}>
                          <td>
                            <strong>{res.id.slice(0, 8)}</strong>
                          </td>
                          <td>
                            <strong>{res.batch_number ?? "S/L"}</strong>
                          </td>
                          <td>
                            {res.quantity} {res.uom}
                          </td>
                          <td>
                            <span className={`${styles.badge} ${styles.badgeInfo}`}>
                              {res.status}
                            </span>
                          </td>
                          <td>
                            <div className={styles.inlineForm}>
                              <input
                                type="text"
                                aria-label={`Escanear lote para reserva ${res.id.slice(0, 8)}`}
                                placeholder="Escanear lote..."
                                value={inp.scannedBatch}
                                onChange={(e) =>
                                  setPickInputs((prev) => ({
                                    ...prev,
                                    [res.id]: { ...inp, scannedBatch: e.target.value },
                                  }))
                                }
                              />
                              <button
                                type="button"
                                className={screenButton.primary}
                                disabled={!data.canEdit || busy || !batchMatches}
                                title={
                                  !batchMatches
                                    ? "El lote escaneado debe coincidir con el lote reservado (WMS_LOT_MISMATCH)"
                                    : "Confirmar picking"
                                }
                                onClick={() =>
                                  void runAction("PICK", {
                                    reservation_id: res.id,
                                    scanned_batch: inp.scannedBatch.trim(),
                                    quantity: res.quantity,
                                  })
                                }
                              >
                                Confirmar Picking
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* TAB 5: CARGA Y EXPEDICIÓN */}
        {tab === "Carga y Expedición" && (
          <div className={styles.panel}>
            <div className={styles.panelHead}>
              <div>
                <p className={styles.eyebrow}>ETIQUETADO SSCC/LPN Y VERIFICACIÓN DE CARGA EN MUELLE</p>
                <h2>Unidades preparadas (PICKED_STAGED) y cargadas (LOADED)</h2>
              </div>
            </div>

            <div className={styles.scroll}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>HU / Código Etiqueta</th>
                    <th>Peso / Volumen</th>
                    <th>Etiqueta Emitida</th>
                    <th>Estado</th>
                    <th>Control de Estado / Etiqueta y Lectura en Carga</th>
                  </tr>
                </thead>
                <tbody>
                  {hus
                    .filter((h) => h.state === "PICKED_STAGED" || h.state === "LOADED")
                    .map((hu) => {
                      const inp = loadInputs[hu.id] ?? {
                        scannedCode: "",
                        weight: "",
                        volume: "",
                        stateOk: true,
                      };
                      const codeMatches =
                        !effectivePolicy.require_label_scan_on_load ||
                        inp.scannedCode.trim() === hu.code;
                      return (
                        <tr key={hu.id}>
                          <td>
                            <strong>{hu.code}</strong>
                            <small>{hu.code_type}</small>
                          </td>
                          <td>
                            {hu.gross_weight_kg ?? "—"} kg · {hu.volume_m3 ?? "—"} m³
                          </td>
                          <td>
                            {hu.label_issued_at ? (
                              <span className={`${styles.badge} ${styles.badgeOk}`}>
                                Emitida ({hu.label_issued_at.slice(11, 19)})
                              </span>
                            ) : (
                              <span className={`${styles.badge} ${styles.badgeWarn}`}>
                                Pendiente de emitir
                              </span>
                            )}
                          </td>
                          <td>
                            <span className={flowBadgeClass(hu.state)}>
                              {FLOW_STATE_LABEL[hu.state]}
                            </span>
                            {hu.state_controlled_at ? (
                              <small className={styles.controlOk}>
                                Control OK ({hu.state_controlled_at.slice(11, 19)})
                              </small>
                            ) : effectivePolicy.require_state_control_on_load && hu.state !== "LOADED" ? (
                              <small className={styles.controlPending}>
                                Control Pendiente
                              </small>
                            ) : null}
                          </td>
                          <td>
                            {hu.state === "PICKED_STAGED" && (
                              <div className={styles.controlStack}>
                                {!hu.state_controlled_at ? (
                                  <div className={styles.inlineForm}>
                                    <button
                                      type="button"
                                      className={screenButton.secondary}
                                      disabled={!data.canEdit || busy}
                                      title="Registrar control físico conforme (CONTROL_STATE PASSED)"
                                      onClick={() =>
                                        void runAction("CONTROL_STATE", {
                                          hu_id: hu.id,
                                          status: "PASSED",
                                        })
                                      }
                                    >
                                      Superar Control de Estado
                                    </button>
                                    <button
                                      type="button"
                                      className={screenButton.secondary}
                                      disabled={!data.canEdit || busy}
                                      title="Rechazar por defecto físico y enviar a cuarentena (CONTROL_STATE REJECTED)"
                                      onClick={() =>
                                        void runAction("CONTROL_STATE", {
                                          hu_id: hu.id,
                                          status: "REJECTED",
                                          disposition: "QUARANTINE",
                                          reason: "Defecto en embalaje o precinto",
                                        })
                                      }
                                    >
                                      Rechazar Estado
                                    </button>
                                  </div>
                                ) : (
                                  <span className={`${styles.badge} ${styles.badgeOk}`}>
                                    Control de Estado Superado
                                  </span>
                                )}

                                {!hu.label_issued_at && (
                                  <div className={styles.inlineForm}>
                                    <input
                                      type="number"
                                      step="any"
                                      aria-label={`Peso medido para ${hu.code}`}
                                      placeholder="Peso medido (kg)"
                                      value={inp.weight}
                                      onChange={(e) =>
                                        setLoadInputs((prev) => ({
                                          ...prev,
                                          [hu.id]: { ...inp, weight: e.target.value },
                                        }))
                                      }
                                    />
                                    <input
                                      type="number"
                                      step="any"
                                      aria-label={`Volumen medido para ${hu.code}`}
                                      placeholder="Volumen medido (m³)"
                                      value={inp.volume}
                                      onChange={(e) =>
                                        setLoadInputs((prev) => ({
                                          ...prev,
                                          [hu.id]: { ...inp, volume: e.target.value },
                                        }))
                                      }
                                    />
                                    <button
                                      type="button"
                                      className={screenButton.secondary}
                                      disabled={!data.canEdit || busy}
                                      onClick={() =>
                                        void runAction("LABEL", {
                                          hu_id: hu.id,
                                          ...(inp.weight !== undefined && inp.weight !== "" && !isNaN(Number(inp.weight))
                                            ? { measured_weight_kg: Number(inp.weight) }
                                            : {}),
                                          ...(inp.volume !== undefined && inp.volume !== "" && !isNaN(Number(inp.volume))
                                            ? { measured_volume_m3: Number(inp.volume) }
                                            : {}),
                                        })
                                      }
                                    >
                                      Emitir Etiqueta (LABEL)
                                    </button>
                                  </div>
                                )}

                                {hu.label_issued_at && (
                                  <div className={styles.inlineForm}>
                                    <input
                                      type="text"
                                      aria-label={`Escanear etiqueta en carga para ${hu.code}`}
                                      placeholder={`Escanear ${hu.code}...`}
                                      value={inp.scannedCode}
                                      onChange={(e) =>
                                        setLoadInputs((prev) => ({
                                          ...prev,
                                          [hu.id]: { ...inp, scannedCode: e.target.value },
                                        }))
                                      }
                                    />
                                    <button
                                      type="button"
                                      className={screenButton.primary}
                                      disabled={
                                        !data.canEdit ||
                                        busy ||
                                        !codeMatches ||
                                        (effectivePolicy.require_state_control_on_load && !hu.state_controlled_at)
                                      }
                                      title={
                                        effectivePolicy.require_state_control_on_load && !hu.state_controlled_at
                                          ? "Requiere superar el control de estado previo a la carga (WMS_CONTROL_PENDING)"
                                          : !codeMatches
                                          ? "Escanea el código exacto de la etiqueta SSCC/LPN antes de cargar (WMS_LABEL_MISMATCH)"
                                          : "Confirmar carga en vehículo (LOAD)"
                                      }
                                      onClick={() =>
                                        void runAction("LOAD", {
                                          hu_id: hu.id,
                                          scanned_code: inp.scannedCode.trim(),
                                        })
                                      }
                                    >
                                      Confirmar Carga (LOAD)
                                    </button>
                                  </div>
                                )}
                              </div>
                            )}
                            {hu.state === "LOADED" && (
                              <span className={`${styles.badge} ${styles.badgeOk}`}>
                                Expedición cargada y auditada
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* TAB 6: RECURSOS Y POLÍTICAS */}
        {tab === "Recursos y Políticas" && (
          <div className={styles.panel}>
            <div className={styles.panelHead}>
              <div>
                <p className={styles.eyebrow}>
                  HERENCIA DE POLÍTICAS (WAREHOUSE → OWNER → CATEGORY → PRODUCT) Y RECURSOS
                </p>
                <h2>Política efectiva vigente y parque de recursos del almacén</h2>
              </div>
            </div>

            <div className={styles.policyGrid}>
              <div className={styles.policyItem}>
                <span>Capturar lote en entrada</span>
                <strong>{effectivePolicy.capture_lot_on_receipt ? "SÍ" : "NO"}</strong>
              </div>
              <div className={styles.policyItem}>
                <span>Capturar caducidad en entrada</span>
                <strong>{effectivePolicy.capture_expiry_on_receipt ? "SÍ" : "NO"}</strong>
              </div>
              <div className={styles.policyItem}>
                <span>Estrategia de ubicación (Putaway)</span>
                <strong>{effectivePolicy.putaway_strategy}</strong>
              </div>
              <div className={styles.policyItem}>
                <span>Permitir mezcla de lotes en hueco</span>
                <strong>{effectivePolicy.allow_mixed_lots_in_bin ? "SÍ" : "NO"}</strong>
              </div>
              <div className={styles.policyItem}>
                <span>Rotación de salida</span>
                <strong>{effectivePolicy.rotation}</strong>
              </div>
              <div className={styles.policyItem}>
                <span>Capturar lote en picking</span>
                <strong>{effectivePolicy.capture_lot_on_pick ? "SÍ" : "NO"}</strong>
              </div>
              <div className={styles.policyItem}>
                <span>Prohibir picking no ubicado (Regla de Oro)</span>
                <strong>SIEMPRE ACTIVO (TRUE)</strong>
              </div>
              <div className={styles.policyItem}>
                <span>Consolidación de reposiciones</span>
                <strong>{effectivePolicy.consolidation}</strong>
              </div>
              <div className={styles.policyItem}>
                <span>Lectura de etiqueta en carga</span>
                <strong>{effectivePolicy.require_label_scan_on_load ? "OBLIGATORIA" : "OPCIONAL"}</strong>
              </div>
              <div className={styles.policyItem}>
                <span>Tolerancia de peso / volumen</span>
                <strong>
                  ±{effectivePolicy.weight_tolerance_pct}% / ±{effectivePolicy.volume_tolerance_pct}%
                </strong>
              </div>
            </div>

            <h3>Recursos operativos (carretillas, operarios, AGV, transelevadores)</h3>
            <div className={styles.scroll}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Código</th>
                    <th>Nombre</th>
                    <th>Tipo</th>
                    <th>Estado</th>
                    <th>Altura / Peso máx.</th>
                    <th>Certificaciones</th>
                  </tr>
                </thead>
                <tbody>
                  {resources.map((r) => (
                    <tr key={r.id}>
                      <td>
                        <strong>{r.code}</strong>
                      </td>
                      <td>{r.name}</td>
                      <td>{r.resource_type}</td>
                      <td>
                        <span
                          className={
                            r.is_active && r.status === "AVAILABLE"
                              ? `${styles.badge} ${styles.badgeOk}`
                              : `${styles.badge} ${styles.badgeWarn}`
                          }
                        >
                          {r.status}
                        </span>
                      </td>
                      <td>
                        {r.max_lift_height_m ?? "—"} m · {r.max_weight_kg ?? "—"} kg
                      </td>
                      <td>{r.certifications.join(", ") || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* TAB 7: REPOSICIÓN INTERNA (E2) */}
        {tab === "Reposición Interna" && (
          <div className={styles.panel}>
            <div className={styles.panelHead}>
              <div>
                <p className={styles.eyebrow}>REPOSICIÓN INTERNA PREVENTIVA Y DINÁMICA (E2)</p>
                <h2>Reglas de reposición, propuestas y ejecución de traslados a picking</h2>
              </div>
              <div className={styles.toolbar}>
                <button
                  type="button"
                  className={screenButton.primary}
                  disabled={busy || !data.canConfigure}
                  onClick={() =>
                    void runAction("EVALUATE_REPLENISHMENT", { warehouse_id: activeWarehouseId })
                  }
                >
                  Evaluar reposición automática
                </button>
              </div>
            </div>

            <h3>Reglas de reposición por ubicación de picking</h3>
            <div className={styles.scroll}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Hueco destino</th>
                    <th>Producto (SKU)</th>
                    <th>Stock Mín.</th>
                    <th>Stock Máx.</th>
                    <th>Múltiplo Reorder</th>
                    <th>Consolidación</th>
                    <th>Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {replenishmentRules.length === 0 ? (
                    <tr>
                      <td colSpan={7} style={{ textAlign: "center", color: "var(--ui-muted)" }}>
                        No hay reglas de reposición configuradas para este almacén.
                      </td>
                    </tr>
                  ) : (
                    replenishmentRules.map((rule) => {
                      const bin = binById.get(rule.destination_bin_id);
                      const prod = productById.get(rule.product_id);
                      return (
                        <tr key={rule.id}>
                          <td>
                            <strong>{bin?.bin_code ?? rule.destination_bin_id}</strong>
                          </td>
                          <td>
                            {prod?.sku ?? rule.product_id} · {prod?.name ?? ""}
                          </td>
                          <td>{rule.min_quantity}</td>
                          <td>{rule.max_quantity}</td>
                          <td>{rule.reorder_quantity}</td>
                          <td>
                            <span className={styles.badge}>{rule.consolidation}</span>
                          </td>
                          <td>
                            <span
                              className={
                                (rule.is_active ?? rule.active)
                                  ? `${styles.badge} ${styles.badgeOk}`
                                  : `${styles.badge} ${styles.badgeWarn}`
                              }
                            >
                              {(rule.is_active ?? rule.active) ? "ACTIVA" : "INACTIVA"}
                            </span>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            <h3>Propuestas de reposición y tareas de traslado</h3>
            <div className={styles.scroll}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>ID Propuesta</th>
                    <th>Producto</th>
                    <th>Origen (Pulmón)</th>
                    <th>Destino (Picking)</th>
                    <th>Cantidad</th>
                    <th>HU Destino</th>
                    <th>Estado</th>
                    <th>Motivo / Tarea</th>
                    <th>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {proposals.length === 0 ? (
                    <tr>
                      <td colSpan={9} style={{ textAlign: "center", color: "var(--ui-muted)" }}>
                        No hay propuestas de reposición registradas en este almacén.
                      </td>
                    </tr>
                  ) : (
                    proposals.map((prop) => {
                      const prod = productById.get(prop.product_id);
                      const srcBin = binById.get(prop.source_bin_id);
                      const destBin = binById.get(prop.destination_bin_id);
                      return (
                        <tr key={prop.id}>
                          <td>
                            <code style={{ fontSize: 11 }}>{prop.id.slice(0, 8)}...</code>
                          </td>
                          <td>
                            {prod?.sku ?? prop.product_id} · {prod?.name ?? ""}
                          </td>
                          <td>{srcBin?.bin_code ?? prop.source_bin_id}</td>
                          <td>{destBin?.bin_code ?? prop.destination_bin_id}</td>
                          <td>
                            <strong>{prop.suggested_quantity}</strong>
                          </td>
                          <td>{prop.target_hu_id ? <code>{prop.target_hu_id.slice(0, 8)}</code> : "—"}</td>
                          <td>
                            <span
                              className={
                                prop.status === "APPROVED" || prop.status === "EXECUTED"
                                  ? `${styles.badge} ${styles.badgeOk}`
                                  : prop.status === "DRAFT"
                                  ? `${styles.badge} ${styles.badgeInfo}`
                                  : prop.status === "CANCELLED"
                                  ? `${styles.badge} ${styles.badgeWarn}`
                                  : `${styles.badge} ${styles.badgeDanger}`
                              }
                            >
                              {prop.status}
                            </span>
                          </td>
                          <td>
                            {prop.rejection_reason ? (
                              <span style={{ fontSize: 11, color: "var(--ui-danger, #8a1f1f)" }}>
                                {prop.rejection_reason}
                              </span>
                            ) : prop.task_id ? (
                              <span style={{ fontSize: 11 }}>
                                Tarea: <code>{prop.task_id.slice(0, 8)}</code>
                              </span>
                            ) : (
                              "—"
                            )}
                          </td>
                          <td>
                            <div className={styles.toolbar}>
                              {prop.status === "DRAFT" && (
                                <>
                                  <button
                                    type="button"
                                    className={screenButton.primary}
                                    disabled={busy || !data.canConfigure}
                                    onClick={() =>
                                      void runAction("APPROVE_PROPOSAL", { proposal_id: prop.id })
                                    }
                                  >
                                    Aprobar
                                  </button>
                                  <button
                                    type="button"
                                    className={screenButton.secondary}
                                    disabled={busy || !data.canConfigure}
                                    onClick={() => {
                                      const reason = window.prompt(
                                        "Motivo del rechazo de la propuesta:",
                                        "RECHAZADA_POR_OPERADOR",
                                      );
                                      if (reason) {
                                        void runAction("REJECT_PROPOSAL", {
                                          proposal_id: prop.id,
                                          reason,
                                        });
                                      }
                                    }}
                                  >
                                    Rechazar
                                  </button>
                                </>
                              )}
                              {prop.status === "APPROVED" && (
                                <>
                                  <button
                                    type="button"
                                    className={screenButton.primary}
                                    disabled={busy || !data.canEdit}
                                    onClick={() =>
                                      void runAction("REPLENISH", { proposal_id: prop.id })
                                    }
                                  >
                                    Ejecutar
                                  </button>
                                  <button
                                    type="button"
                                    className={screenButton.secondary}
                                    disabled={busy || !data.canConfigure}
                                    onClick={() => {
                                      const reason = window.prompt(
                                        "Motivo de cancelación de la propuesta:",
                                        "CANCELADA_POR_PLANIFICADOR",
                                      );
                                      if (reason) {
                                        void runAction("CANCEL_PROPOSAL", {
                                          proposal_id: prop.id,
                                          reason,
                                        });
                                      }
                                    }}
                                  >
                                    Cancelar
                                  </button>
                                </>
                              )}
                              {prop.status !== "DRAFT" && prop.status !== "APPROVED" && (
                                <span style={{ fontSize: 12, color: "var(--ui-muted)" }}>
                                  —
                                </span>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>
    </main>
  );
}
