"use client";

import { useEffect, useState } from "react";
import styles from "./record.module.css";

type Contact = { id?: string; name: string; role: string; department: string; phone: string; email: string; language: string; isPrimary: boolean };
type Tariff = { id: string; code: string; name: string; status: string; version: number; valid_from: string; valid_to: string | null; currency: string; service?: { code: string; name: string } | null; lines?: Array<{ pricing_unit: string; unit_price: number }> };
type Service = { code: string; name: string };
const emptyContact = (): Contact => ({ name: "", role: "", department: "", phone: "", email: "", language: "es", isPrimary: false });

export default function CustomerSubmasters({ id }: { id: string }) {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [tariffs, setTariffs] = useState<Tariff[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [message, setMessage] = useState("");
  const [tariffForm, setTariffForm] = useState({ code: "", name: "", serviceCode: "", validFrom: "", validTo: "", pricingUnit: "SHIPMENT", unitPrice: "", currency: "EUR", activate: true });

  useEffect(() => {
    if (id === "nuevo") return;
    let active = true;
    Promise.all([
      fetch(`/api/customers/contacts?customerCode=${encodeURIComponent(id)}`, { cache: "no-store" }).then(response => response.json().then(result => ({ response, result }))),
      fetch(`/api/customers/tariffs?customerCode=${encodeURIComponent(id)}`, { cache: "no-store" }).then(response => response.json().then(result => ({ response, result }))),
      fetch(`/api/customers/services?partyCode=${encodeURIComponent(id)}&relationship=CONTRACTED`, { cache: "no-store" }).then(response => response.json().then(result => ({ response, result }))),
    ]).then(([contactsResult, tariffsResult, servicesResult]) => {
      if (!active) return;
      if (contactsResult.response.ok) setContacts((contactsResult.result.items ?? []).map((item: any) => ({ id: item.id, name: item.name ?? "", role: item.role ?? "", department: item.department ?? "", phone: item.phone ?? "", email: item.email ?? "", language: item.language ?? "es", isPrimary: Boolean(item.is_primary) })));
      if (tariffsResult.response.ok) setTariffs(tariffsResult.result.items ?? []);
      if (servicesResult.response.ok) setServices((servicesResult.result.items ?? []).map((item: any) => ({ code: item.code, name: item.name })));
    }).catch(() => active && setMessage("No se pudieron cargar todos los submaestros."));
    return () => { active = false; };
  }, [id]);

  function updateContact(index: number, field: keyof Contact, value: string | boolean) {
    setContacts(current => current.map((contact, contactIndex) => contactIndex === index ? { ...contact, [field]: value } : field === "isPrimary" && value ? { ...contact, isPrimary: false } : contact));
  }
  async function saveContacts() {
    setMessage("");
    const response = await fetch("/api/customers/contacts", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ customerCode: id, contacts }) });
    const result = await response.json();
    if (!response.ok) return setMessage(result.error || "No se pudieron guardar los contactos.");
    setContacts((result.items ?? []).map((item: any) => ({ id: item.id, name: item.name ?? "", role: item.role ?? "", department: item.department ?? "", phone: item.phone ?? "", email: item.email ?? "", language: item.language ?? "es", isPrimary: Boolean(item.is_primary) })));
    setMessage("Contactos guardados y auditados.");
  }
  async function createTariff() {
    setMessage("");
    const response = await fetch("/api/customers/tariffs", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ customerCode: id, ...tariffForm }) });
    const result = await response.json();
    if (!response.ok) return setMessage(result.error || "No se pudo crear la tarifa.");
    const refreshed = await fetch(`/api/customers/tariffs?customerCode=${encodeURIComponent(id)}`, { cache: "no-store" }).then(value => value.json());
    setTariffs(refreshed.items ?? []); setTariffForm(current => ({ ...current, code: "", name: "", validFrom: "", validTo: "", unitPrice: "" }));
    setMessage(`Tarifa ${result.item.code} v${result.item.version} creada${result.item.status === "ACTIVE" ? " y activada" : " como borrador"}.`);
  }

  if (id === "nuevo") return null;
  return <>
    <section className={styles.card} id="contactos"><h2>Contactos</h2><p>Responsables diferenciados para tráfico, pedidos, facturación, incidencias y emergencia ADR.</p>
      <div className={styles.stack}>{contacts.map((contact, index) => <div className={styles.submasterRow} key={contact.id ?? index}>
        <label>Nombre<input value={contact.name} onChange={event => updateContact(index, "name", event.target.value)} /></label><label>Función<input value={contact.role} onChange={event => updateContact(index, "role", event.target.value)} placeholder="Tráfico, facturación…" /></label><label>Departamento<input value={contact.department} onChange={event => updateContact(index, "department", event.target.value)} /></label><label>Teléfono<input value={contact.phone} onChange={event => updateContact(index, "phone", event.target.value)} /></label><label>Email<input type="email" value={contact.email} onChange={event => updateContact(index, "email", event.target.value)} /></label><label className={styles.checkLabel}><input type="checkbox" checked={contact.isPrimary} onChange={event => updateContact(index, "isPrimary", event.target.checked)} /> Principal</label><button type="button" onClick={() => setContacts(current => current.filter((_, contactIndex) => contactIndex !== index))}>Quitar</button>
      </div>)}</div><div className={styles.inlineActions}><button type="button" onClick={() => setContacts(current => [...current, emptyContact()])}>+ Añadir contacto</button><button type="button" onClick={saveContacts}>Guardar contactos</button></div>
    </section>
    <section className={styles.card} id="tarifas"><h2>Tarifas</h2><p>Versiones con vigencia. Una tarifa activa se sustituye mediante una nueva versión y los pedidos conservan su fotografía histórica.</p>
      <div className={styles.tariffList}>{tariffs.map(tariff => <article key={tariff.id}><div><strong>{tariff.code} · v{tariff.version}</strong><span>{tariff.name}</span></div><div><b>{tariff.status === "ACTIVE" ? "Activa" : tariff.status === "DRAFT" ? "Borrador" : "Inactiva"}</b><small>{tariff.valid_from} → {tariff.valid_to ?? "sin baja"} · {tariff.service?.name ?? "General"}</small></div><strong>{tariff.lines?.[0]?.unit_price ?? "—"} {tariff.currency}</strong></article>)}</div>
      <div className={styles.tariffForm}><label>Código<input value={tariffForm.code} onChange={event => setTariffForm(current => ({ ...current, code: event.target.value.toUpperCase() }))} placeholder="TF-CLIENTE-01" /></label><label>Nombre<input value={tariffForm.name} onChange={event => setTariffForm(current => ({ ...current, name: event.target.value }))} /></label><label>Servicio<select value={tariffForm.serviceCode} onChange={event => setTariffForm(current => ({ ...current, serviceCode: event.target.value }))}><option value="">General</option>{services.map(service => <option value={service.code} key={service.code}>{service.name} · {service.code}</option>)}</select></label><label>Alta<input type="date" value={tariffForm.validFrom} onChange={event => setTariffForm(current => ({ ...current, validFrom: event.target.value }))} /></label><label>Baja<input type="date" value={tariffForm.validTo} onChange={event => setTariffForm(current => ({ ...current, validTo: event.target.value }))} /></label><label>Unidad<select value={tariffForm.pricingUnit} onChange={event => setTariffForm(current => ({ ...current, pricingUnit: event.target.value }))}><option value="SHIPMENT">Envío</option><option value="PALLET">Palet</option><option value="KG">kg</option><option value="TON">Tonelada</option><option value="KM">km</option><option value="STOP">Parada</option></select></label><label>Importe<input inputMode="decimal" value={tariffForm.unitPrice} onChange={event => setTariffForm(current => ({ ...current, unitPrice: event.target.value.replace(/[^0-9.,]/g, "") }))} /></label><label className={styles.checkLabel}><input type="checkbox" checked={tariffForm.activate} onChange={event => setTariffForm(current => ({ ...current, activate: event.target.checked }))} /> Activar</label></div><div className={styles.inlineActions}><button type="button" onClick={createTariff}>Crear nueva versión</button></div>
      {message && <p className={styles.message}>{message}</p>}
    </section>
  </>;
}
