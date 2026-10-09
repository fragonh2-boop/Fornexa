"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import AppShell from "./AppShell";
import { getComboConfig, COMBO_UPDATED_EVENT } from "@/lib/combo-config";
import { getStorageConfig, STORAGE_UPDATED_EVENT } from "@/lib/storage-config";
import { STATUS_FROM_LABEL, ALLOWED_ORDER_TRANSITIONS } from "@/lib/order-status";
import styles from "./order-editor.module.css";

export type OrderAttachment = {
  id: string;
  name: string;
  size: number;
  type: string;
  uploadedAt: string;
  path: string;
};

export type OrderDetailData = {
  id: string;
  code: string;
  status: string;
  customer?: string;
  customerCode?: string;
  reference?: string;
  service?: string;
  requestedDate?: string;
  origin?: {
    code?: string;
    name?: string;
    address?: string;
    postalCode?: string;
    city?: string;
    countryCode?: string;
  };
  destination?: {
    code?: string;
    name?: string;
    address?: string;
    postalCode?: string;
    city?: string;
    countryCode?: string;
  };
  goodsDescription?: string;
  packages?: number | string;
  grossWeight?: number | string;
  volume?: number | string;
  linearMeters?: number | string;
  adr?: {
    declared?: boolean | string;
    regime?: string;
    unNumber?: string;
    description?: string;
    classCode?: string;
  } | string;
  expedition?: string | null;
  createdAt?: string;
  updatedAt?: string;
  attachments?: OrderAttachment[];
};

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(iso: string | null | undefined) {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    return isNaN(d.getTime()) ? iso : d.toLocaleString("es-ES", { dateStyle: "short", timeStyle: "short" });
  } catch {
    return iso;
  }
}

export default function OrderEditorWorkspace({
  order: initialOrder,
  basePath = "/dashboard",
  readOnly = false,
  simulation = false,
}: {
  order: OrderDetailData;
  basePath?: "/dashboard" | "/demo";
  readOnly?: boolean;
  simulation?: boolean;
}) {
  const [order, setOrder] = useState<OrderDetailData>(initialOrder);
  const [reference, setReference] = useState(initialOrder.reference ?? "");
  const [service, setService] = useState(initialOrder.service ?? "Grupaje");
  const [selectedServices, setSelectedServices] = useState<string[]>(() => {
    return initialOrder.service ? [initialOrder.service] : ["Grupaje"];
  });
  const [status, setStatus] = useState(initialOrder.status ?? "Preparada");
  const [packages, setPackages] = useState(String(initialOrder.packages ?? ""));
  const [grossWeight, setGrossWeight] = useState(String(initialOrder.grossWeight ?? ""));
  const [volume, setVolume] = useState(String(initialOrder.volume ?? ""));
  const [linearMeters, setLinearMeters] = useState(String(initialOrder.linearMeters ?? ""));
  const [goodsDescription, setGoodsDescription] = useState(initialOrder.goodsDescription ?? "");
  const [requestedDate, setRequestedDate] = useState(initialOrder.requestedDate ?? "");
  
  const [attachments, setAttachments] = useState<OrderAttachment[]>(() => {
    if (initialOrder.attachments && initialOrder.attachments.length) return initialOrder.attachments;
    if (typeof window !== "undefined") {
      try {
        const saved = localStorage.getItem(`fornexa_order_attachments_${initialOrder.code}`);
        if (saved) {
          const parsed = JSON.parse(saved);
          if (Array.isArray(parsed)) return parsed;
        }
      } catch {}
    }
    return [];
  });

  const [comboConfig, setComboConfig] = useState(() => getComboConfig("order_service"));
  const [statusComboConfig, setStatusComboConfig] = useState(() => getComboConfig("order_status"));
  const [storageConfig, setStorageConfig] = useState(() => getStorageConfig());
  const [banner, setBanner] = useState<string | null>(null);
  const [bannerType, setBannerType] = useState<"success" | "error">("success");
  const [saving, setSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    function onComboUpdated() {
      setComboConfig(getComboConfig("order_service"));
      setStatusComboConfig(getComboConfig("order_status"));
    }
    function onStorageUpdated() {
      setStorageConfig(getStorageConfig());
    }
    window.addEventListener(COMBO_UPDATED_EVENT, onComboUpdated);
    window.addEventListener(STORAGE_UPDATED_EVENT, onStorageUpdated);
    return () => {
      window.removeEventListener(COMBO_UPDATED_EVENT, onComboUpdated);
      window.removeEventListener(STORAGE_UPDATED_EVENT, onStorageUpdated);
    };
  }, []);

  // Save attachments to localStorage
  useEffect(() => {
    if (typeof window !== "undefined") {
      try {
        localStorage.setItem(`fornexa_order_attachments_${order.code}`, JSON.stringify(attachments));
      } catch {}
    }
  }, [attachments, order.code]);

  const serviceOptions = useMemo(() => {
    const defaultList = comboConfig.options.map(o => o.value);
    if (order.service && !defaultList.includes(order.service)) {
      return [order.service, ...defaultList];
    }
    return defaultList;
  }, [comboConfig.options, order.service]);

  const statusOptions = useMemo(() => {
    const dbStatus = STATUS_FROM_LABEL[order.status] ?? order.status;
    const allowedNextEnums = ALLOWED_ORDER_TRANSITIONS[dbStatus] ?? [];
    const list = statusComboConfig.options.map(o => o.value);
    return list.filter(opt => {
      if (opt === order.status) return true;
      const optEnum = STATUS_FROM_LABEL[opt] ?? opt;
      return allowedNextEnums.includes(optEnum);
    });
  }, [statusComboConfig.options, order.status]);

  function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const newAttachments: OrderAttachment[] = Array.from(files).map(file => ({
      id: typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : `att_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
      name: file.name,
      size: file.size,
      type: file.type || "application/octet-stream",
      uploadedAt: new Date().toISOString(),
      path: `${storageConfig.localDirectory}/${order.code}/${file.name}`,
    }));

    setAttachments(prev => [...prev, ...newAttachments]);
    setBannerType("success");
    setBanner(`Se han vinculado ${files.length} archivo(s) como referencia local en el equipo (almacenamiento local no sincronizado con cloud).`);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function removeAttachment(id: string) {
    setAttachments(prev => prev.filter(a => a.id !== id));
    setBannerType("success");
    setBanner("Archivo adjunto eliminado de la orden.");
  }

  async function handleRelaunch() {
    setSaving(true);
    setBanner(null);
    const nowIso = new Date().toISOString();

    let relaunchError: string | null = null;
    if (!simulation && basePath !== "/demo") {
      try {
        const res = await fetch("/api/orders", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            code: order.code,
            status: "READY",
          }),
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          relaunchError = body.error || `Error HTTP ${res.status} al relanzar la orden.`;
        }
      } catch (err: any) {
        relaunchError = err?.message || "Error de conexión al relanzar la orden.";
      }
    }

    setSaving(false);
    if (relaunchError) {
      setBannerType("error");
      setBanner(`No se pudo relanzar la orden en producción: ${relaunchError}`);
      return;
    }

    setStatus("Preparada");
    setOrder(prev => ({ ...prev, status: "Preparada", updatedAt: nowIso }));
    
    if (typeof window !== "undefined") {
      try {
        localStorage.setItem(`fornexa_order_status_${order.code}`, "Preparada");
        localStorage.setItem(`fornexa_order_updated_${order.code}`, nowIso);
      } catch {}
    }

    setBannerType("success");
    setBanner(`¡Orden ${order.code} relanzada con éxito! Estado actualizado a "Preparada" en base de datos y lista para planificación operativa.`);
  }

  async function handleSave(e?: React.FormEvent) {
    if (e) e.preventDefault();
    setSaving(true);
    setBanner(null);

    const nowIso = new Date().toISOString();
    const primaryService = comboConfig.selectionMode === "multi" ? (selectedServices[0] || service) : service;
    const finalServiceDisplay = comboConfig.selectionMode === "multi" ? selectedServices.join(", ") : service;

    const updatedData: Partial<OrderDetailData> = {
      reference,
      service: finalServiceDisplay,
      status,
      packages,
      grossWeight,
      volume,
      linearMeters,
      goodsDescription,
      requestedDate,
      updatedAt: nowIso,
    };

    let saveError: string | null = null;
    if (!simulation && basePath !== "/demo") {
      try {
        const res = await fetch("/api/orders", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            code: order.code,
            ...updatedData,
            service: primaryService,
            selectedServices: comboConfig.selectionMode === "multi" ? selectedServices : undefined,
          }),
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          saveError = body.error || `Error HTTP ${res.status} al guardar la orden.`;
        }
      } catch (err: any) {
        saveError = err?.message || "Error de conexión al guardar la orden.";
      }
    }

    setSaving(false);

    if (saveError) {
      setBannerType("error");
      setBanner(`No se pudieron guardar los cambios en la orden: ${saveError}`);
      return;
    }

    setOrder(prev => ({ ...prev, ...updatedData }));

    if (typeof window !== "undefined") {
      try {
        localStorage.setItem(`fornexa_order_${order.code}`, JSON.stringify({
          ...order,
          ...updatedData,
          attachments,
        }));
      } catch {}
    }

    setBannerType("success");
    setBanner(`Cambios guardados correctamente en la orden ${order.code}.`);
  }

  const originText = order.origin
    ? [order.origin.name || order.origin.code, order.origin.address, `${order.origin.postalCode ?? ""} ${order.origin.city ?? ""}`.trim(), order.origin.countryCode].filter(Boolean).join(" · ")
    : "Sin punto de recogida definido";

  const destinationText = order.destination
    ? [order.destination.name || order.destination.code, order.destination.address, `${order.destination.postalCode ?? ""} ${order.destination.city ?? ""}`.trim(), order.destination.countryCode].filter(Boolean).join(" · ")
    : "Sin punto de entrega definido";

  const adrText = typeof order.adr === "string"
    ? order.adr
    : order.adr?.declared
      ? `ADR · UN ${order.adr.unNumber ?? "—"} · ${order.adr.description ?? "Mercancía peligrosa"}`
      : "No contiene ADR";

  return (
    <AppShell>
      <div className={styles.page}>
        <header className={styles.header}>
          <div className={styles.headerTitleBlock}>
            <p className={styles.eyebrow}>PEDIDO DE CLIENTE · EDICIÓN Y RELANZAMIENTO</p>
            <div className={styles.titleRow}>
              <h1 className={styles.title}>Orden {order.code}</h1>
              <span className={`${styles.statusBadge} ${status === "Preparada" ? styles.statusReady : status === "Borrador" ? styles.statusDraft : status === "Completada" ? styles.statusCompleted : status === "Cancelada" ? styles.statusCancelled : styles.statusTransit}`}>
                {status}
              </span>
            </div>
          </div>
          <div className={styles.headerActions}>
            <Link href={`${basePath}/partidas`} className={styles.btnSecondary}>
              ← Volver a Órdenes
            </Link>
            <button
              type="button"
              onClick={handleRelaunch}
              className={styles.btnRelaunch}
              disabled={readOnly || saving}
              title="Relanzar el pedido para que vuelva a estar disponible en la planificación operativa"
            >
              ↻ Volver a lanzar orden
            </button>
            <button
              type="button"
              onClick={() => handleSave()}
              className={styles.btnPrimary}
              disabled={saving || readOnly}
            >
              {saving ? "Guardando…" : "Guardar cambios"}
            </button>
          </div>
        </header>

        {banner && (
          <div className={bannerType === "error" ? styles.bannerError : styles.bannerSuccess} role="status">
            <span>{banner}</span>
            <button type="button" onClick={() => setBanner(null)} aria-label="Cerrar aviso">×</button>
          </div>
        )}

        <form onSubmit={handleSave} className={styles.formGrid}>
          {/* Card 1: Cliente y Servicio */}
          <section className={styles.card}>
            <div className={styles.cardHeader}>
              <div>
                <p>DATOS GENERALES</p>
                <h2>Cliente y Servicio</h2>
              </div>
              <span className={styles.cardHeaderBadge}>
                {order.customerCode ? `${order.customerCode} · Verificado` : "Verificado"}
              </span>
            </div>
            <div className={styles.grid}>
              <label>
                Cliente
                <input
                  value={order.customer ? `${order.customerCode ? `${order.customerCode} · ` : ""}${order.customer}` : "—"}
                  readOnly
                />
              </label>
              <label>
                Referencia de cliente
                <input
                  value={reference}
                  onChange={e => setReference(e.target.value)}
                  placeholder="Referencia comercial o pedido del cliente"
                />
              </label>
              
              {/* Dynamic Combo Service */}
              <label>
                Servicio ({comboConfig.selectionMode === "multi" ? "Selección múltiple" : "Selección única"})
                {comboConfig.selectionMode === "multi" ? (
                  <select
                    multiple
                    value={selectedServices}
                    onChange={e => {
                      const vals = Array.from(e.target.selectedOptions, o => o.value);
                      setSelectedServices(vals);
                    }}
                    style={{ minHeight: "80px" }}
                  >
                    {serviceOptions.map(opt => (
                      <option key={opt} value={opt}>{opt}</option>
                    ))}
                  </select>
                ) : (
                  <select
                    value={service}
                    onChange={e => setService(e.target.value)}
                  >
                    {serviceOptions.map(opt => (
                      <option key={opt} value={opt}>{opt}</option>
                    ))}
                  </select>
                )}
              </label>

              {/* Status Combo */}
              <label>
                Estado actual
                <select
                  value={status}
                  onChange={e => setStatus(e.target.value)}
                >
                  {statusOptions.map(opt => (
                    <option key={opt} value={opt}>{opt}</option>
                  ))}
                </select>
              </label>

              <label>
                Fecha prevista de operación
                <input
                  type="date"
                  value={requestedDate}
                  onChange={e => setRequestedDate(e.target.value)}
                />
              </label>
              <label>
                Expediente asociado
                <input
                  value={order.expedition ?? "Sin asignar a expediente"}
                  readOnly
                />
              </label>
            </div>
          </section>

          {/* Card 2: Ruta y Puntos */}
          <section className={styles.card}>
            <div className={styles.cardHeader}>
              <div>
                <p>LOGÍSTICA</p>
                <h2>Ruta operativa</h2>
              </div>
            </div>
            <div className={styles.grid}>
              <label className={styles.wide}>
                Punto de recogida (Origen)
                <input value={originText} readOnly />
              </label>
              <label className={styles.wide}>
                Punto de entrega (Destino)
                <input value={destinationText} readOnly />
              </label>
            </div>
          </section>

          {/* Card 3: Mercancía y Magnitudes */}
          <section className={styles.card}>
            <div className={styles.cardHeader}>
              <div>
                <p>CARGA Y VOLUMETRÍA</p>
                <h2>Mercancía y magnitudes</h2>
              </div>
            </div>
            <div className={styles.grid}>
              <label>
                Bultos totales
                <input
                  type="number"
                  min="0"
                  value={packages}
                  onChange={e => setPackages(e.target.value)}
                  placeholder="Número de bultos"
                />
              </label>
              <label>
                Peso bruto (kg)
                <input
                  value={grossWeight}
                  onChange={e => setGrossWeight(e.target.value)}
                  placeholder="Peso en kilogramos"
                />
              </label>
              <label>
                Volumen (m³)
                <input
                  value={volume}
                  onChange={e => setVolume(e.target.value)}
                  placeholder="Volumen en metros cúbicos"
                />
              </label>
              <label>
                Metros lineales
                <input
                  value={linearMeters}
                  onChange={e => setLinearMeters(e.target.value)}
                  placeholder="Metros lineales de suelo"
                />
              </label>
              <label className={styles.wide}>
                Descripción de la mercancía
                <textarea
                  value={goodsDescription}
                  onChange={e => setGoodsDescription(e.target.value)}
                  placeholder="Detalle operativo de los artículos transportados"
                />
              </label>
              <label className={styles.wide}>
                Clasificación ADR
                <input value={adrText} readOnly />
              </label>
            </div>
          </section>

          {/* Card 4: Documentación y Archivos Adjuntos */}
          <section className={styles.card}>
            <div className={styles.cardHeader}>
              <div>
                <p>DOCUMENTACIÓN Y EXPEDIENTE</p>
                <h2>Archivos adjuntos de la orden</h2>
              </div>
              <span className={styles.cardHeaderBadge}>
                {attachments.length} adjunto(s) · Referencia local en equipo
              </span>
            </div>

            <div className={styles.storageInfoBar}>
              <div>
                <span>Destino activo: </span>
                <strong>{storageConfig.provider === "local" ? "Directorio local del equipo" : "Espacio Claude / Cloud"}</strong>
                {" · "}
                <code>{storageConfig.localDirectory}</code>
              </div>
              <Link href={`${basePath}/integraciones`} className={styles.storageLink}>
                Configurar ruta en Configuración →
              </Link>
            </div>
            <p style={{ fontSize: "12px", color: "#637083", margin: "0 0 14px", lineHeight: "1.4" }}>
              Nota: Los archivos adjuntos se registran como referencias locales en esta estación de trabajo (sin sincronización con la nube). Para almacenamiento centralizado empresarial, configure el conector Cloud en Integraciones.
            </p>

            <div
              className={styles.attachmentDropzone}
              role="button"
              tabIndex={0}
              onClick={() => fileInputRef.current?.click()}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  fileInputRef.current?.click();
                }
              }}
              aria-label="Zona para adjuntar archivos a la orden"
            >
              <input
                ref={fileInputRef}
                type="file"
                multiple
                style={{ display: "none" }}
                onChange={handleFileUpload}
              />
              <span className={styles.attachmentIcon}>📎</span>
              <p className={styles.dropzoneTitle}>Haz clic para seleccionar o adjuntar archivos a la orden</p>
              <p className={styles.dropzoneSubtitle}>
                Albaranes, facturas, órdenes de carga, fotos de mercancía o documentación técnica
              </p>
            </div>

            {attachments.length > 0 && (
              <div className={styles.attachmentList}>
                {attachments.map(att => (
                  <div key={att.id} className={styles.attachmentItem}>
                    <div className={styles.attachmentMeta}>
                      <span className={styles.attachmentIcon}>📄</span>
                      <div className={styles.attachmentDetails}>
                        <span className={styles.attachmentName}>{att.name}</span>
                        <span className={styles.attachmentSub}>
                          {formatBytes(att.size)} · {formatDate(att.uploadedAt)} · <code>{att.path}</code>
                        </span>
                      </div>
                    </div>
                    <div className={styles.attachmentActions}>
                      <button
                        type="button"
                        className={styles.btnSmall}
                        onClick={() => {
                          setBannerType("success");
                          setBanner(`Ruta local de referencia en equipo: ${att.path}`);
                        }}
                      >
                        Ver ruta
                      </button>
                      <button
                        type="button"
                        className={styles.btnSmallDanger}
                        onClick={() => removeAttachment(att.id)}
                      >
                        Eliminar
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </form>

        <footer className={styles.saveBar}>
          <Link href={`${basePath}/partidas`}>← Volver a Órdenes</Link>
          <div className={styles.saveActions}>
            <button
              type="button"
              onClick={handleRelaunch}
              className={styles.btnRelaunch}
              disabled={readOnly || saving}
            >
              ↻ Volver a lanzar orden
            </button>
            <button
              type="button"
              onClick={() => handleSave()}
              className={styles.btnPrimary}
              disabled={saving || readOnly}
            >
              {saving ? "Guardando…" : "Guardar cambios"}
            </button>
          </div>
        </footer>
      </div>
    </AppShell>
  );
}
