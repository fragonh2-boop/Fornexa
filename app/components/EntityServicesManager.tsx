"use client";

import { useEffect, useMemo, useState } from "react";
import { serviceCatalog } from "../../lib/service-catalog";
import styles from "./EntityServicesManager.module.css";

type EntityType = "cliente" | "proveedor";
type AssignmentStatus = "Activo" | "Pendiente" | "Inactivo";

type Assignment = {
  serviceId: string;
  status: AssignmentStatus;
  reference: string;
  notes: string;
};

type Props = {
  entityId: string;
  entityType: EntityType;
};

function cleanEntityId(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, "-") || "nuevo";
}

export default function EntityServicesManager({ entityId, entityType }: Props) {
  const storageKey = `fornexa-v1-${entityType}-servicios-${cleanEntityId(entityId)}`;
  const [assignments, setAssignments] = useState<Record<string, Assignment>>({});
  const [search, setSearch] = useState("");
  const [country, setCountry] = useState("Todos");
  const [mode, setMode] = useState("Todos");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey) || "{}") as Record<string, Assignment>;
      setAssignments(saved);
    } catch {
      setAssignments({});
    }
  }, [storageKey]);

  const countries = useMemo(() => [...new Set(serviceCatalog.map(service => service.country))], []);
  const modes = useMemo(() => [...new Set(serviceCatalog.map(service => service.serviceMode))], []);
  const visibleServices = useMemo(() => {
    const query = search.trim().toLowerCase();
    return serviceCatalog.filter(service => {
      const matchesCountry = country === "Todos" || service.country === country;
      const matchesMode = mode === "Todos" || service.serviceMode === mode;
      const matchesQuery = !query || [service.id, service.country, service.zone, service.partner, service.terminalCity, service.serviceMode]
        .join(" ")
        .toLowerCase()
        .includes(query);
      return matchesCountry && matchesMode && matchesQuery;
    });
  }, [country, mode, search]);

  const selected = serviceCatalog.filter(service => assignments[service.id]);
  const title = entityType === "cliente" ? "Servicios contratados" : "Servicios ofrecidos";
  const description = entityType === "cliente"
    ? "Asigna a este cliente las coberturas y modalidades que puede contratar, junto con su tarifa o acuerdo comercial."
    : "Define las coberturas que presta este proveedor y conserva su referencia operativa en la propia ficha.";
  const assignmentLabel = entityType === "cliente" ? "Contratado" : "Ofrecido";

  function toggle(serviceId: string) {
    setAssignments(current => {
      const next = { ...current };
      if (next[serviceId]) delete next[serviceId];
      else next[serviceId] = { serviceId, status: "Activo", reference: "", notes: "" };
      return next;
    });
    setNotice("");
  }

  function update(serviceId: string, field: keyof Omit<Assignment, "serviceId">, value: string) {
    setAssignments(current => {
      const existing = current[serviceId] ?? { serviceId, status: "Activo", reference: "", notes: "" };
      const updated = { ...existing, [field]: value } as Assignment;
      return { ...current, [serviceId]: updated };
    });
    setNotice("");
  }

  function save() {
    localStorage.setItem(storageKey, JSON.stringify(assignments));
    setNotice(`${selected.length} servicio(s) guardado(s) en la ficha de ${entityType === "cliente" ? "cliente" : "proveedor"}.`);
  }

  return (
    <section className={styles.manager} id="servicios">
      <div className={styles.heading}>
        <div>
          <p className={styles.eyebrow}>SERVICIOS · FICHA INTEGRADA</p>
          <h2>{title}</h2>
          <p className={styles.description}>{description}</p>
        </div>
        <div className={styles.summary}>
          <strong>{selected.length}</strong>
          <span>asignados</span>
        </div>
      </div>

      {selected.length > 0 && (
        <div className={styles.assigned}>
          <div className={styles.sectionTitle}>
            <div><span>Configuración</span><strong>{title} en esta ficha</strong></div>
            <small>Los cambios se guardan por cliente o proveedor.</small>
          </div>
          <div className={styles.assignedGrid}>
            {selected.map(service => {
              const assignment = assignments[service.id];
              return (
                <article key={service.id} className={styles.assignmentCard}>
                  <div className={styles.assignmentTop}>
                    <div><strong>{service.country} · {service.zone}</strong><small>{service.id} · {service.serviceMode}</small></div>
                    <button type="button" onClick={() => toggle(service.id)} aria-label={`Quitar ${service.id}`}>Quitar</button>
                  </div>
                  <div className={styles.assignmentFields}>
                    <label>Estado
                      <select value={assignment.status} onChange={event => update(service.id, "status", event.target.value)}>
                        <option>Activo</option><option>Pendiente</option><option>Inactivo</option>
                      </select>
                    </label>
                    <label>{entityType === "cliente" ? "Tarifa / acuerdo" : "Referencia proveedor"}
                      <input value={assignment.reference} onChange={event => update(service.id, "reference", event.target.value)} placeholder={entityType === "cliente" ? "TF-ES-FR-04" : "REF-PROV-001"} />
                    </label>
                    <label className={styles.notes}>Condiciones particulares
                      <input value={assignment.notes} onChange={event => update(service.id, "notes", event.target.value)} placeholder="Vigencia, cupo, restricciones o instrucciones…" />
                    </label>
                  </div>
                </article>
              );
            })}
          </div>
        </div>
      )}

      <div className={styles.catalogHeader}>
        <div className={styles.sectionTitle}><div><span>Catálogo disponible</span><strong>Asignar coberturas y modalidades</strong></div></div>
        <div className={styles.filters}>
          <input value={search} onChange={event => setSearch(event.target.value)} placeholder="Buscar país, zona, terminal…" aria-label="Buscar servicios" />
          <select value={country} onChange={event => setCountry(event.target.value)} aria-label="Filtrar por país"><option>Todos</option>{countries.map(value => <option key={value}>{value}</option>)}</select>
          <select value={mode} onChange={event => setMode(event.target.value)} aria-label="Filtrar por modalidad"><option>Todos</option>{modes.map(value => <option key={value}>{value}</option>)}</select>
        </div>
      </div>

      <div className={styles.catalog}>
        <div className={`${styles.row} ${styles.head}`}><span>Zona</span><span>Cobertura</span><span>Terminal / red</span><span>Servicio</span><span>Tránsito</span><span>ADR</span><span>Asignación</span></div>
        {visibleServices.map(service => {
          const isAssigned = Boolean(assignments[service.id]);
          return (
            <div className={`${styles.row} ${isAssigned ? styles.selected : ""}`} key={service.id}>
              <span><strong>{service.country}</strong><small>{service.zone}</small></span>
              <span>{service.postalCodeRules.join(", ")}</span>
              <span><strong>{service.terminalCity}</strong><small>{service.partner}</small></span>
              <span><b>{service.serviceMode}</b><small>{service.departureDays.join(" · ")}</small></span>
              <span>{service.estimatedTransitDays} días</span>
              <span>{service.adr}</span>
              <span><button type="button" aria-pressed={isAssigned} onClick={() => toggle(service.id)}>{isAssigned ? `✓ ${assignmentLabel}` : "Asignar"}</button></span>
            </div>
          );
        })}
        {!visibleServices.length && <div className={styles.empty}>No hay servicios que coincidan con los filtros.</div>}
      </div>

      <div className={styles.actions}>
        <span>{notice || "La asignación permanece vinculada a esta ficha, no a una pantalla independiente."}</span>
        <button type="button" onClick={save}>Guardar servicios</button>
      </div>
    </section>
  );
}
