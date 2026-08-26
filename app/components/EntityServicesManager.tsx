"use client";

import { useEffect, useMemo, useState } from "react";
import styles from "./EntityServicesManager.module.css";

type EntityType = "cliente" | "proveedor";
type AssignmentStatus = "ACTIVE" | "PENDING" | "INACTIVE";
type Assignment = { status: AssignmentStatus; reference: string; price: string; currency: string; validFrom: string; validTo: string; notes: string };
type CatalogItem = {
  id: string; code: string; name: string; description: string | null; mode: string; service_type: string; unit: string | null;
  assignment: null | { reference: string | null; price: number | null; currency: string; valid_from: string | null; valid_to: string | null; conditions: { notes?: string | null; status?: AssignmentStatus } | null; is_active: boolean };
};

export default function EntityServicesManager({ entityId, entityType }: { entityId: string; entityType: EntityType }) {
  const [catalog, setCatalog] = useState<CatalogItem[]>([]);
  const [assignments, setAssignments] = useState<Record<string, Assignment>>({});
  const [search, setSearch] = useState("");
  const [mode, setMode] = useState("Todos");
  const [notice, setNotice] = useState("Cargando servicios…");
  const [saving, setSaving] = useState(false);
  const relationship = entityType === "cliente" ? "CONTRACTED" : "OFFERED";

  useEffect(() => {
    if (entityId === "nuevo") { setNotice("Guarda primero la empresa para asignar servicios."); return; }
    let active = true;
    fetch(`/api/customers/services?partyCode=${encodeURIComponent(entityId)}&relationship=${relationship}`, { cache: "no-store" })
      .then(async response => { const result = await response.json(); if (!response.ok) throw new Error(result.error || "No se pudieron cargar los servicios."); return result; })
      .then(result => {
        if (!active) return;
        const items = (result.items ?? []) as CatalogItem[];
        setCatalog(items);
        setAssignments(Object.fromEntries(items.flatMap(service => {
          const value = service.assignment;
          if (!value || (!value.is_active && value.conditions?.status !== "PENDING")) return [];
          return [[service.code, {
            status: value.conditions?.status ?? (value.is_active ? "ACTIVE" : "INACTIVE"),
            reference: value.reference ?? "", price: value.price === null ? "" : String(value.price),
            currency: value.currency?.trim() || "EUR", validFrom: value.valid_from ?? "", validTo: value.valid_to ?? "",
            notes: value.conditions?.notes ?? "",
          } satisfies Assignment]];
        })));
        setNotice("");
      })
      .catch(error => active && setNotice(error instanceof Error ? error.message : "No se pudieron cargar los servicios."));
    return () => { active = false; };
  }, [entityId, relationship]);

  const modes = useMemo(() => [...new Set(catalog.map(service => service.mode))], [catalog]);
  const visibleServices = useMemo(() => {
    const query = search.trim().toLowerCase();
    return catalog.filter(service => (mode === "Todos" || service.mode === mode) && (!query || [service.code, service.name, service.description, service.service_type].join(" ").toLowerCase().includes(query)));
  }, [catalog, mode, search]);
  const selected = catalog.filter(service => assignments[service.code]);
  const title = entityType === "cliente" ? "Servicios contratados" : "Servicios ofrecidos";

  function toggle(serviceCode: string) {
    setAssignments(current => {
      const next = { ...current };
      if (next[serviceCode]) delete next[serviceCode];
      else next[serviceCode] = { status: "ACTIVE", reference: "", price: "", currency: "EUR", validFrom: "", validTo: "", notes: "" };
      return next;
    });
    setNotice("");
  }
  function update(serviceCode: string, field: keyof Assignment, value: string) {
    setAssignments(current => ({ ...current, [serviceCode]: { ...current[serviceCode], [field]: value } }));
    setNotice("");
  }
  async function save() {
    setSaving(true); setNotice("");
    try {
      const response = await fetch("/api/customers/services", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
        partyCode: entityId, relationship,
        assignments: Object.entries(assignments).map(([serviceCode, assignment]) => ({ serviceCode, ...assignment })),
      }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "No se pudieron guardar los servicios.");
      setNotice(`${result.count} servicio(s) guardado(s) y registrados en auditoría.`);
    } catch (error) { setNotice(error instanceof Error ? error.message : "No se pudieron guardar los servicios."); }
    finally { setSaving(false); }
  }

  return <section className={styles.manager} id="servicios">
    <div className={styles.heading}><div><p className={styles.eyebrow}>SERVICIOS · PERFIL OPERATIVO</p><h2>{title}</h2><p className={styles.description}>Asignaciones reales vinculadas al maestro de la empresa, con vigencia, referencia e importe.</p></div><div className={styles.summary}><strong>{selected.length}</strong><span>asignados</span></div></div>
    {selected.length > 0 && <div className={styles.assigned}><div className={styles.sectionTitle}><div><span>Configuración</span><strong>Vigencia y condiciones</strong></div><small>La tarifa completa se gestiona en el submaestro de tarifas.</small></div><div className={styles.assignedGrid}>{selected.map(service => {
      const assignment = assignments[service.code];
      return <article key={service.code} className={styles.assignmentCard}><div className={styles.assignmentTop}><div><strong>{service.name}</strong><small>{service.code} · {service.mode}</small></div><button type="button" onClick={() => toggle(service.code)}>Quitar</button></div><div className={styles.assignmentFields}>
        <label>Estado<select value={assignment.status} onChange={event => update(service.code, "status", event.target.value)}><option value="ACTIVE">Activo</option><option value="PENDING">Pendiente</option><option value="INACTIVE">Inactivo</option></select></label>
        <label>Referencia<input value={assignment.reference} onChange={event => update(service.code, "reference", event.target.value)} placeholder="Acuerdo o referencia" /></label>
        <label>Precio orientativo<input inputMode="decimal" value={assignment.price} onChange={event => update(service.code, "price", event.target.value.replace(/[^0-9.,]/g, ""))} placeholder="0,00" /></label>
        <label>Alta<input type="date" value={assignment.validFrom} onChange={event => update(service.code, "validFrom", event.target.value)} /></label>
        <label>Baja<input type="date" value={assignment.validTo} onChange={event => update(service.code, "validTo", event.target.value)} /></label>
        <label className={styles.notes}>Condiciones<input value={assignment.notes} onChange={event => update(service.code, "notes", event.target.value)} placeholder="Cupo, restricciones o instrucciones" /></label>
      </div></article>;
    })}</div></div>}
    <div className={styles.catalogHeader}><div className={styles.sectionTitle}><div><span>Catálogo</span><strong>Asignar servicios existentes</strong></div></div><div className={styles.filters}><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Buscar código, nombre o modalidad…" /><select value={mode} onChange={event => setMode(event.target.value)}><option>Todos</option>{modes.map(value => <option key={value}>{value}</option>)}</select></div></div>
    <div className={styles.catalog}><div className={`${styles.row} ${styles.head}`}><span>Código</span><span>Modo</span><span>Servicio</span><span>Tipo</span><span>Unidad</span><span>Estado</span><span>Asignación</span></div>{visibleServices.map(service => <div className={`${styles.row} ${assignments[service.code] ? styles.selected : ""}`} key={service.id}><span><strong>{service.code}</strong></span><span>{service.mode}</span><span><strong>{service.name}</strong><small>{service.description || "Sin descripción"}</small></span><span><b>{service.service_type}</b></span><span>{service.unit || "—"}</span><span>Activo</span><span><button type="button" aria-pressed={Boolean(assignments[service.code])} onClick={() => toggle(service.code)}>{assignments[service.code] ? "✓ Asignado" : "Asignar"}</button></span></div>)}{!visibleServices.length && <div className={styles.empty}>No hay servicios que coincidan.</div>}</div>
    <div className={styles.actions}><span>{notice || "Los cambios se conservarán en el maestro compartido."}</span><button type="button" onClick={save} disabled={saving || entityId === "nuevo"}>{saving ? "Guardando…" : "Guardar servicios"}</button></div>
  </section>;
}
