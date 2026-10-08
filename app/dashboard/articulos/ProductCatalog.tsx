"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import styles from "./products.module.css";

type ProductItem = {
  id: string; sku: string; name: string; description: string; gtin: string;
  ownerCustomerCode: string; ownerCustomerName: string; uomBase: string;
  netWeightKg: number | null; grossWeightKg: number | null; lengthCm: number | null;
  widthCm: number | null; heightCm: number | null; volumeM3: number | null;
  hazardStatus: string; status: "ACTIVE" | "INACTIVE";
};
type CustomerOption = { code: string; name: string; status: string };
type UomOption = { code: string; name: string; category: string };
export type Catalog = { items: ProductItem[]; customers: CustomerOption[]; uoms: UomOption[]; canEdit: boolean; truncated: boolean };
type Draft = {
  id?: string; sku: string; name: string; description: string; gtin: string; ownerCustomerCode: string; uomBase: string;
  netWeightKg: string; grossWeightKg: string; lengthCm: string; widthCm: string; heightCm: string; volumeM3: string;
  status: "ACTIVE" | "INACTIVE";
};

const EMPTY_CATALOG: Catalog = { items: [], customers: [], uoms: [], canEdit: false, truncated: false };
const EMPTY_DRAFT: Draft = { sku: "", name: "", description: "", gtin: "", ownerCustomerCode: "", uomBase: "UN", netWeightKg: "", grossWeightKg: "", lengthCm: "", widthCm: "", heightCm: "", volumeM3: "", status: "ACTIVE" };

function valueText(value: number | null) {
  return value == null ? "" : String(value);
}

function toDraft(item: ProductItem): Draft {
  return {
    id: item.id, sku: item.sku, name: item.name, description: item.description, gtin: item.gtin,
    ownerCustomerCode: item.ownerCustomerCode, uomBase: item.uomBase,
    netWeightKg: valueText(item.netWeightKg), grossWeightKg: valueText(item.grossWeightKg), lengthCm: valueText(item.lengthCm),
    widthCm: valueText(item.widthCm), heightCm: valueText(item.heightCm), volumeM3: valueText(item.volumeM3), status: item.status,
  };
}

export default function ProductCatalog({ initialDemoCatalog }: { initialDemoCatalog?: Catalog } = {}) {
  const [catalog, setCatalog] = useState<Catalog>(initialDemoCatalog ?? EMPTY_CATALOG);
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(!initialDemoCatalog);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  const loadCatalog = useCallback(async () => {
    if (initialDemoCatalog) return;
    setLoading(true);
    try {
      const response = await fetch("/api/products", { cache: "no-store" });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "No se pudo cargar el catálogo.");
      setCatalog(result);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No se pudo cargar el catálogo.");
    } finally {
      setLoading(false);
    }
  }, [initialDemoCatalog]);

  useEffect(() => { void loadCatalog(); }, [loadCatalog]);

  const visibleItems = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase("es-ES");
    if (!normalized) return catalog.items;
    return catalog.items.filter(item => [item.sku, item.name, item.description, item.gtin, item.ownerCustomerCode, item.ownerCustomerName]
      .some(value => value.toLocaleLowerCase("es-ES").includes(normalized)));
  }, [catalog.items, query]);
  const activeCustomers = useMemo(() => catalog.customers.filter(item => item.status === "ACTIVE"), [catalog.customers]);
  const currentHazardStatus = draft.id ? catalog.items.find(item => item.id === draft.id)?.hazardStatus ?? "UNKNOWN" : "UNKNOWN";

  function patchDraft<K extends keyof Draft>(key: K, value: Draft[K]) {
    setDraft(current => ({ ...current, [key]: value }));
  }

  function startNew() {
    setDraft({ ...EMPTY_DRAFT, ownerCustomerCode: activeCustomers[0]?.code ?? "", uomBase: catalog.uoms.some(item => item.code === "UN") ? "UN" : catalog.uoms[0]?.code ?? "" });
    setMessage("");
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!catalog.canEdit || saving) return;
    if (initialDemoCatalog) { setMessage("Guardado simulado: no se han enviado ni persistido datos."); return; }
    setSaving(true);
    setMessage("");
    try {
      const response = await fetch("/api/products", {
        method: draft.id ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error([result.error, ...(result.errors ?? [])].filter(Boolean).join(" ") || "No se pudo guardar el artículo.");
      const ownerCustomerCode = draft.ownerCustomerCode;
      const uomBase = draft.uomBase;
      setMessage(draft.id ? "Artículo actualizado." : "Artículo creado.");
      await loadCatalog();
      if (!draft.id) setDraft({ ...EMPTY_DRAFT, ownerCustomerCode, uomBase });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No se pudo guardar el artículo.");
    } finally {
      setSaving(false);
    }
  }

  return <div className={styles.page}>
    <header className={styles.header}>
      <div><p>MAESTROS · PRODUCTOS</p><h1>Artículos</h1><span>Catálogo persistente por cliente. Las clasificaciones ADR siguen gestionándose desde el flujo regulatorio.</span></div>
      {catalog.canEdit && <button type="button" className={styles.primary} onClick={startNew}>+ Nuevo artículo</button>}
    </header>

    <section className={styles.summary} aria-label="Resumen de catálogo">
      <article><span>Artículos cargados</span><strong>{catalog.items.length}</strong></article>
      <article><span>Activos</span><strong>{catalog.items.filter(item => item.status === "ACTIVE").length}</strong></article>
      <article><span>Clientes con catálogo</span><strong>{new Set(catalog.items.map(item => item.ownerCustomerCode).filter(Boolean)).size}</strong></article>
    </section>

    <section className={styles.workspace}>
      <div className={styles.listPanel}>
        <div className={styles.toolbar}><label>Buscar artículo<input value={query} onChange={event => setQuery(event.target.value)} placeholder="SKU, nombre, GTIN o cliente" /></label><span>{loading ? "Cargando…" : `${visibleItems.length} resultado${visibleItems.length === 1 ? "" : "s"}`}</span></div>
        {catalog.truncated && <p className={styles.notice}>Se muestra una primera página del catálogo. La selección de Partidas se limita igualmente a los artículos activos del cliente.</p>}
        <div className={styles.tableWrap}>
          <table><thead><tr><th>SKU</th><th>Artículo</th><th>Cliente propietario</th><th>Unidad</th><th>Estado</th><th><span className={styles.srOnly}>Acciones</span></th></tr></thead>
            <tbody>{visibleItems.map(item => <tr key={item.id}><td><strong>{item.sku}</strong>{item.gtin && <small>GTIN {item.gtin}</small>}</td><td><span>{item.name}</span>{item.description && <small>{item.description}</small>}</td><td>{item.ownerCustomerCode}<small>{item.ownerCustomerName}</small></td><td>{item.uomBase}</td><td><span className={item.status === "ACTIVE" ? styles.active : styles.inactive}>{item.status === "ACTIVE" ? "Activo" : "Inactivo"}</span></td><td>{catalog.canEdit && <button type="button" className={styles.edit} onClick={() => { setDraft(toDraft(item)); setMessage(""); }}>Editar</button>}</td></tr>)}</tbody>
          </table>
          {!loading && !visibleItems.length && <p className={styles.empty}>No hay artículos que coincidan con la búsqueda.</p>}
        </div>
      </div>

      <form className={styles.editor} onSubmit={save}>
        <div className={styles.editorHeader}><div><p>{draft.id ? "EDICIÓN" : "ALTA"}</p><h2>{draft.id ? "Ficha de artículo" : "Nuevo artículo"}</h2></div>{draft.id && catalog.canEdit && <button type="button" className={styles.reset} onClick={startNew}>Nueva ficha</button>}</div>
        {!catalog.canEdit && <p className={styles.readOnly}>Tu sesión permite consultar el catálogo, no modificarlo.</p>}
        <div className={styles.fields}>
          <label>Cliente propietario<select required disabled={!catalog.canEdit} value={draft.ownerCustomerCode} onChange={event => patchDraft("ownerCustomerCode", event.target.value)}><option value="">Seleccionar cliente</option>{activeCustomers.map(item => <option key={item.code} value={item.code}>{item.code} · {item.name}</option>)}</select></label>
          <label>SKU<input required maxLength={100} disabled={!catalog.canEdit} value={draft.sku} onChange={event => patchDraft("sku", event.target.value.toUpperCase())} /></label>
          <label className={styles.wide}>Nombre comercial<input required minLength={2} maxLength={240} disabled={!catalog.canEdit} value={draft.name} onChange={event => patchDraft("name", event.target.value)} /></label>
          <label className={styles.wide}>Descripción<textarea maxLength={5000} disabled={!catalog.canEdit} value={draft.description} onChange={event => patchDraft("description", event.target.value)} /></label>
          <label>GTIN / EAN<input inputMode="numeric" pattern="(?:\d{8}|\d{12,14})" disabled={!catalog.canEdit} value={draft.gtin} onChange={event => patchDraft("gtin", event.target.value.replace(/\D/g, "").slice(0, 14))} placeholder="8, 12, 13 o 14 dígitos" /></label>
          <label>Unidad base<select required disabled={!catalog.canEdit} value={draft.uomBase} onChange={event => patchDraft("uomBase", event.target.value)}>{catalog.uoms.map(item => <option key={item.code} value={item.code}>{item.code} · {item.name}</option>)}</select></label>
          <label>Estado<select disabled={!catalog.canEdit} value={draft.status} onChange={event => patchDraft("status", event.target.value as Draft["status"])}><option value="ACTIVE">Activo</option><option value="INACTIVE">Inactivo</option></select></label>
          <label>Peso neto (kg)<input type="number" min="0" step="0.001" disabled={!catalog.canEdit} value={draft.netWeightKg} onChange={event => patchDraft("netWeightKg", event.target.value)} /></label>
          <label>Peso bruto (kg)<input type="number" min="0" step="0.001" disabled={!catalog.canEdit} value={draft.grossWeightKg} onChange={event => patchDraft("grossWeightKg", event.target.value)} /></label>
          <label>Largo (cm)<input type="number" min="0" step="0.01" disabled={!catalog.canEdit} value={draft.lengthCm} onChange={event => patchDraft("lengthCm", event.target.value)} /></label>
          <label>Ancho (cm)<input type="number" min="0" step="0.01" disabled={!catalog.canEdit} value={draft.widthCm} onChange={event => patchDraft("widthCm", event.target.value)} /></label>
          <label>Alto (cm)<input type="number" min="0" step="0.01" disabled={!catalog.canEdit} value={draft.heightCm} onChange={event => patchDraft("heightCm", event.target.value)} /></label>
          <label>Volumen (m³)<input type="number" min="0" step="0.0001" disabled={!catalog.canEdit} value={draft.volumeM3} onChange={event => patchDraft("volumeM3", event.target.value)} /></label>
        </div>
        {draft.id && <div className={styles.derived}><span>ADR: {currentHazardStatus}</span><span>Dimensiones: {draft.lengthCm || "—"} × {draft.widthCm || "—"} × {draft.heightCm || "—"} cm</span></div>}
        {message && <p className={styles.message} role="status">{message}</p>}
        {catalog.canEdit && <button className={styles.primary} type="submit" disabled={saving || !activeCustomers.length || !catalog.uoms.length}>{saving ? "Guardando…" : draft.id ? "Guardar cambios" : "Crear artículo"}</button>}
      </form>
    </section>
  </div>;
}
