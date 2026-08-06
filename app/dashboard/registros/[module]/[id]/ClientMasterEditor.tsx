"use client";

import Link from "next/link";
import { FormEvent, useMemo, useState } from "react";
import styles from "./client-master.module.css";

type Address = {
  id: string; name: string; type: string; street: string; postalCode: string; city: string; province: string; country: string;
  contact: string; phone: string; email: string; schedule: string; restrictions: string; defaultFor: string; active: boolean;
};

const customerExamples: Record<string, { legalName: string; tradeName: string; taxId: string; city: string }> = {
  "Mediterránea Retail": { legalName: "Mediterránea Retail, S.L.", tradeName: "Mediterránea Retail", taxId: "B-46928173", city: "Valencia" },
  "Nova Distribution": { legalName: "Nova Distribution, S.L.", tradeName: "Nova Distribution", taxId: "B-63810452", city: "Barcelona" },
  "Atlas Components": { legalName: "Atlas Components, S.A.", tradeName: "Atlas Components", taxId: "A-28469175", city: "Madrid" },
};

function customerCode(id: string) {
  const known: Record<string, string> = { "Mediterránea Retail": "CLI-000146", "Nova Distribution": "CLI-000145", "Atlas Components": "CLI-000144" };
  return known[id] ?? `TER-${String(Math.abs([...id].reduce((total, char) => total + char.charCodeAt(0), 0))).padStart(6, "0")}`;
}

export default function ClientMasterEditor({ id }: { id: string }) {
  const example = customerExamples[id] ?? { legalName: "", tradeName: id === "nuevo" ? "" : id, taxId: "", city: "" };
  const code = useMemo(() => customerCode(id), [id]);
  const [notice, setNotice] = useState("");
  const [addresses, setAddresses] = useState<Address[]>(id === "nuevo" ? [] : [{ id: `${code}-DIR-001`, name: `Centro principal · ${example.city}`, type: "Fiscal y operativa", street: "", postalCode: "", city: example.city, province: "", country: "España", contact: "", phone: "", email: "", schedule: "L–V · 08:00–18:00", restrictions: "", defaultFor: "Fiscal, facturación, recogida y entrega", active: true }]);

  function addAddress() {
    const sequence = String(addresses.length + 1).padStart(3, "0");
    setAddresses(current => [...current, { id: `${code}-DIR-${sequence}`, name: "Nueva dirección", type: "Operativa", street: "", postalCode: "", city: "", province: "", country: "España", contact: "", phone: "", email: "", schedule: "", restrictions: "", defaultFor: "", active: true }]);
  }

  function updateAddress(index: number, key: keyof Address, value: string | boolean) {
    setAddresses(current => current.map((address, addressIndex) => addressIndex === index ? { ...address, [key]: value } : address));
  }

  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const record = Object.fromEntries(form.entries());
    localStorage.setItem(`fornexa-party-${code}`, JSON.stringify({ ...record, code, addresses, updatedAt: new Date().toISOString() }));
    setNotice(`Tercero ${code} guardado con ${addresses.length} dirección${addresses.length === 1 ? "" : "es"}.`);
  }

  return <main className={styles.page}>
    <header className={styles.header}><div><Link href="/dashboard/clientes">← Clientes</Link><p>MAESTRO DE TERCEROS</p><h1>{id === "nuevo" ? "Nuevo tercero" : example.tradeName}</h1><span>{code} · Cliente / proveedor</span></div><div className={styles.headerActions}><span>Activo</span><button form="party-form">Guardar maestro</button></div></header>
    <form id="party-form" className={styles.form} onSubmit={save}>
      <section className={styles.card}><div className={styles.cardTitle}><span>01</span><div><h2>Identificación y clasificación</h2><p>Información legal, comercial y operativa del tercero.</p></div></div><div className={styles.grid4}>
        <label>Código<input value={code} readOnly /></label><label>Tipo<select name="partyType" defaultValue="Cliente"><option>Cliente</option><option>Proveedor</option><option>Cliente y proveedor</option></select></label><label>Razón social<input name="legalName" defaultValue={example.legalName} required /></label><label>Nombre comercial<input name="tradeName" defaultValue={example.tradeName} required /></label>
        <label>NIF / CIF / VAT<input name="taxId" defaultValue={example.taxId} required /></label><label>Idioma<select name="language"><option>Español</option><option>Francés</option><option>Inglés</option></select></label><label>Moneda<select name="currency"><option>EUR</option><option>GBP</option><option>USD</option></select></label><label>Zona horaria<input name="timezone" defaultValue="Europe/Madrid" /></label>
      </div></section>
      <section className={styles.card}><div className={styles.cardTitle}><span>02</span><div><h2>Condiciones comerciales y fiscales</h2><p>Configuración utilizada en ofertas, tarifas y facturación.</p></div></div><div className={styles.grid4}>
        <label>Forma de pago<select name="paymentMethod"><option>Transferencia</option><option>Domiciliación</option><option>Tarjeta</option></select></label><label>Vencimiento<select name="paymentTerms"><option>30 días</option><option>60 días</option><option>Contado</option></select></label><label>Límite de crédito<input name="creditLimit" defaultValue="25.000,00 €" /></label><label>Tarifa asignada<input name="rate" defaultValue="TF-ES-FR-04" /></label>
        <label>Email facturación<input type="email" name="billingEmail" placeholder="facturacion@cliente.com" /></label><label>Email comercial<input type="email" name="salesEmail" placeholder="compras@cliente.com" /></label><label>Responsable comercial<input name="accountManager" defaultValue="Francisco González" /></label><label>Estado<select name="status"><option>Activo</option><option>En revisión</option><option>Bloqueado</option><option>Inactivo</option></select></label>
      </div></section>
      <section className={styles.card}><div className={styles.addressHeader}><div className={styles.cardTitle}><span>03</span><div><h2>Maestro de direcciones</h2><p>Toda dirección está vinculada a {code} y recibe un código automático no reutilizable.</p></div></div><button type="button" onClick={addAddress}>+ Añadir dirección</button></div>
        <div className={styles.addresses}>{addresses.map((address, index) => <article key={address.id} className={styles.address}>
          <div className={styles.addressTop}><div><small>CÓDIGO DE DIRECCIÓN</small><strong>{address.id}</strong></div><label className={styles.switch}><input type="checkbox" checked={address.active} onChange={event => updateAddress(index, "active", event.target.checked)} /> Activa</label></div>
          <div className={styles.grid3}><label>Nombre del centro<input value={address.name} onChange={event => updateAddress(index, "name", event.target.value)} /></label><label>Tipo<select value={address.type} onChange={event => updateAddress(index, "type", event.target.value)}><option>Fiscal y operativa</option><option>Fiscal</option><option>Facturación</option><option>Recogida</option><option>Entrega</option><option>Almacén</option><option>Oficina</option><option>Operativa</option></select></label><label>Predeterminada para<input value={address.defaultFor} onChange={event => updateAddress(index, "defaultFor", event.target.value)} placeholder="Recogida, entrega…" /></label>
            <label className={styles.span2}>Dirección<input value={address.street} onChange={event => updateAddress(index, "street", event.target.value)} placeholder="Calle, número, nave…" /></label><label>CP<input value={address.postalCode} onChange={event => updateAddress(index, "postalCode", event.target.value)} /></label><label>Población<input value={address.city} onChange={event => updateAddress(index, "city", event.target.value)} /></label><label>Provincia<input value={address.province} onChange={event => updateAddress(index, "province", event.target.value)} /></label><label>País<input value={address.country} onChange={event => updateAddress(index, "country", event.target.value)} /></label>
            <label>Contacto<input value={address.contact} onChange={event => updateAddress(index, "contact", event.target.value)} /></label><label>Teléfono<input value={address.phone} onChange={event => updateAddress(index, "phone", event.target.value)} /></label><label>Email<input type="email" value={address.email} onChange={event => updateAddress(index, "email", event.target.value)} /></label><label>Horario<input value={address.schedule} onChange={event => updateAddress(index, "schedule", event.target.value)} /></label><label className={styles.span2}>Restricciones e instrucciones<input value={address.restrictions} onChange={event => updateAddress(index, "restrictions", event.target.value)} placeholder="Acceso, vehículo, muelle, cita previa…" /></label>
          </div>
        </article>)}</div>{!addresses.length && <div className={styles.empty}>Este tercero todavía no tiene direcciones. Añade al menos una antes de utilizarlo en operaciones.</div>}
      </section>
      <section className={styles.card}><div className={styles.cardTitle}><span>04</span><div><h2>Notas y control</h2><p>Información interna y trazabilidad del maestro.</p></div></div><label>Observaciones<textarea name="notes" rows={5} placeholder="Acuerdos, documentación pendiente, instrucciones internas…" /></label></section>
      {notice && <div className={styles.notice}>{notice}</div>}<div className={styles.footerActions}><Link href="/dashboard/clientes">Cancelar</Link><button>Guardar maestro</button></div>
    </form>
  </main>;
}
