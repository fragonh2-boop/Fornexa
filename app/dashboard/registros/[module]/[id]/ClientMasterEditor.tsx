"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { getCustomer } from "../../../../../lib/customer-master";
import styles from "./client-master.module.css";

type Address = {
  id: string; code: string; persisted: boolean; name: string; type: string; street: string; postalCode: string; city: string; province: string; country: string;
  contact: string; phone: string; email: string; schedule: string; restrictions: string; defaultFor: string; active: boolean;
  useForPickup: boolean; useForDelivery: boolean; isDefaultPickup: boolean; isDefaultDelivery: boolean; assignedCustomerCodes: string[];
};

type AssignableCustomer = { code: string; name: string };

type CountryCode = "ES" | "FR" | "PT";
const countries: { code: CountryCode; label: string; taxLabel: string; taxPattern: RegExp; taxHint: string; postalPattern: RegExp; postalHint: string }[] = [
  { code: "ES", label: "España", taxLabel: "NIF / CIF", taxPattern: /^[A-Z0-9][0-9]{7}[A-Z0-9]$/, taxHint: "9 caracteres; p. ej. B46928173", postalPattern: /^[0-5][0-9]{4}$/, postalHint: "5 dígitos; p. ej. 46023" },
  { code: "FR", label: "Francia", taxLabel: "TVA", taxPattern: /^FR[A-Z0-9]{2}[0-9]{9}$/, taxHint: "FR + 2 caracteres + 9 dígitos", postalPattern: /^[0-9]{5}$/, postalHint: "5 dígitos; p. ej. 69007" },
  { code: "PT", label: "Portugal", taxLabel: "NIF", taxPattern: /^PT[0-9]{9}$/, taxHint: "PT + 9 dígitos", postalPattern: /^[0-9]{4}-[0-9]{3}$/, postalHint: "Formato 0000-000" },
];
const geography: Record<CountryCode, Record<string, string[]>> = {
  ES: { Valencia: ["Valencia", "Riba-roja de Túria", "Paterna"], Barcelona: ["Barcelona", "El Prat de Llobregat", "Martorell"], Madrid: ["Madrid", "Getafe", "Alcalá de Henares"], Alicante: ["Alicante", "Elche", "Ibi"] },
  FR: { Rhône: ["Lyon", "Villeurbanne", "Vénissieux"], "Bouches-du-Rhône": ["Marseille", "Aix-en-Provence", "Vitrolles"], "Haute-Garonne": ["Toulouse", "Blagnac", "Colomiers"] },
  PT: { Lisboa: ["Lisboa", "Sintra", "Loures"], Porto: ["Porto", "Maia", "Matosinhos"], Braga: ["Braga", "Guimarães", "Vila Nova de Famalicão"] },
};
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const phonePattern = /^\+?[0-9][0-9\s()-]{7,18}$/;
const spanishProvinces = [
  ["01","Álava"],["02","Albacete"],["03","Alicante"],["04","Almería"],["05","Ávila"],["06","Badajoz"],["07","Illes Balears"],["08","Barcelona"],["09","Burgos"],["10","Cáceres"],["11","Cádiz"],["12","Castellón"],["13","Ciudad Real"],["14","Córdoba"],["15","A Coruña"],["16","Cuenca"],["17","Girona"],["18","Granada"],["19","Guadalajara"],["20","Gipuzkoa"],["21","Huelva"],["22","Huesca"],["23","Jaén"],["24","León"],["25","Lleida"],["26","La Rioja"],["27","Lugo"],["28","Madrid"],["29","Málaga"],["30","Murcia"],["31","Navarra"],["32","Ourense"],["33","Asturias"],["34","Palencia"],["35","Las Palmas"],["36","Pontevedra"],["37","Salamanca"],["38","Santa Cruz de Tenerife"],["39","Cantabria"],["40","Segovia"],["41","Sevilla"],["42","Soria"],["43","Tarragona"],["44","Teruel"],["45","Toledo"],["46","Valencia"],["47","Valladolid"],["48","Bizkaia"],["49","Zamora"],["50","Zaragoza"],["51","Ceuta"],["52","Melilla"],
] as const;
const spanishProvinceByPrefix = Object.fromEntries(spanishProvinces);

function normalizeTaxId(value: string) { return value.toUpperCase().replace(/[\s.-]/g, ""); }
function validationClass(valid: boolean | null) { return valid === null ? "" : valid ? styles.valid : styles.invalid; }
function Check({ valid, hint }: { valid: boolean | null; hint: string }) { return <small className={validationClass(valid)}>{valid === null ? "○" : valid ? "✓" : "!"} {hint}</small>; }

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
  const master = getCustomer(id);
  const example = master ?? customerExamples[id] ?? { legalName: "", tradeName: id === "nuevo" ? "" : id, taxId: "", city: "" };
  const code = useMemo(() => customerCode(id), [id]);
  const [notice, setNotice] = useState("");
  const [partyCountry, setPartyCountry] = useState<CountryCode>("ES");
  const [taxId, setTaxId] = useState(example.taxId);
  const [billingEmail, setBillingEmail] = useState("");
  const [salesEmail, setSalesEmail] = useState(master?.salesEmail ?? "");
  const [postalPlaces, setPostalPlaces] = useState<Record<string, string[]>>({});
  const [postalErrors, setPostalErrors] = useState<Record<string, string>>({});
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [assignableCustomers, setAssignableCustomers] = useState<AssignableCustomer[]>([]);
  const [addressesLoading, setAddressesLoading] = useState(id !== "nuevo");
  const [addressSaving, setAddressSaving] = useState<string | null>(null);
  const [canEditAddresses, setCanEditAddresses] = useState(false);
  const countryRules = countries.find(country => country.code === partyCountry)!;
  const taxValid = taxId ? countryRules.taxPattern.test(normalizeTaxId(taxId)) : null;

  useEffect(() => {
    if (id === "nuevo") return;
    let active = true;
    fetch(`/api/customers/addresses?customerCode=${encodeURIComponent(code)}`, { cache: "no-store" })
      .then(async response => {
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || "No se pudieron cargar las direcciones.");
        if (!active) return;
        setAssignableCustomers(result.customers ?? []);
        setCanEditAddresses(Boolean(result.canEdit));
        setAddresses((result.item?.addresses ?? []).map((address: any) => ({
          id: address.id,
          code: address.code ?? "",
          persisted: true,
          name: address.name ?? "",
          type: "Operativa",
          street: address.addressLine1 ?? "",
          postalCode: address.postalCode ?? "",
          city: address.city ?? "",
          province: address.region ?? "",
          country: address.countryCode ?? "",
          contact: address.contactName ?? "",
          phone: address.contactPhone ?? "",
          email: address.contactEmail ?? "",
          schedule: "",
          restrictions: address.instructions ?? "",
          defaultFor: "Ninguna",
          active: address.isActive !== false,
          useForPickup: Boolean(address.useForPickup),
          useForDelivery: Boolean(address.useForDelivery),
          isDefaultPickup: Boolean(address.isDefaultPickup),
          isDefaultDelivery: Boolean(address.isDefaultDelivery),
          assignedCustomerCodes: address.assignedCustomerCodes ?? [code],
        })));
        setNotice("");
      })
      .catch(error => active && setNotice(error instanceof Error ? error.message : "No se pudieron cargar las direcciones."))
      .finally(() => active && setAddressesLoading(false));
    return () => { active = false; };
  }, [code, id]);

  function addAddress() {
    const temporaryId = `new-${crypto.randomUUID()}`;
    setAddresses(current => [...current, { id: temporaryId, code: "", persisted: false, name: "", type: "Operativa", street: "", postalCode: "", city: "", province: "", country: partyCountry, contact: "", phone: "", email: "", schedule: "", restrictions: "", defaultFor: "Ninguna", active: true, useForPickup: true, useForDelivery: true, isDefaultPickup: false, isDefaultDelivery: false, assignedCustomerCodes: [code] }]);
  }

  function updateAddress(index: number, key: keyof Address, value: string | boolean) {
    setAddresses(current => current.map((address, addressIndex) => addressIndex === index ? { ...address, [key]: value, ...(key === "country" ? { province: "", city: "", postalCode: "" } : {}), ...(key === "province" ? { city: "" } : {}) } : address));
  }

  function toggleAssignedCustomer(index: number, customerCode: string) {
    if (customerCode === code) return;
    setAddresses(current => current.map((address, addressIndex) => addressIndex !== index ? address : {
      ...address,
      assignedCustomerCodes: address.assignedCustomerCodes.includes(customerCode)
        ? address.assignedCustomerCodes.filter(item => item !== customerCode)
        : [...address.assignedCustomerCodes, customerCode],
    }));
  }

  async function saveAddress(index: number) {
    const address = addresses[index];
    if (!addressValid(address) || (!address.useForPickup && !address.useForDelivery)) {
      setNotice("Revisa la dirección y selecciona al menos un uso: recogida o entrega.");
      return;
    }
    setAddressSaving(address.id);
    setNotice("");
    try {
      const response = await fetch("/api/customers/addresses", {
        method: address.persisted ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ customerCode: code, addressId: address.persisted ? address.id : undefined, address: {
          name: address.name,
          addressLine1: address.street,
          postalCode: address.postalCode,
          city: address.city,
          region: address.province,
          countryCode: address.country,
          contactName: address.contact,
          contactPhone: address.phone,
          contactEmail: address.email,
          instructions: address.restrictions,
          isActive: address.active,
          useForPickup: address.useForPickup,
          useForDelivery: address.useForDelivery,
          isDefaultPickup: address.isDefaultPickup,
          isDefaultDelivery: address.isDefaultDelivery,
          assignedCustomerCodes: address.assignedCustomerCodes,
        } }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "No se pudo guardar la dirección.");
      setAddresses(current => current.map((item, addressIndex) => addressIndex === index ? { ...item, id: result.item.id, code: result.item.code, persisted: true } : item));
      setNotice(`Dirección ${result.item.code} guardada y disponible para ${address.assignedCustomerCodes.length} cliente${address.assignedCustomerCodes.length === 1 ? "" : "s"}.`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "No se pudo guardar la dirección.");
    } finally {
      setAddressSaving(null);
    }
  }

  function addressValid(address: Address) {
    const rules = countries.find(country => country.code === address.country);
    if (!rules) return false;
    const provinceMatches = address.country !== "ES" || spanishProvinceByPrefix[address.postalCode.slice(0, 2)] === address.province;
    const allowedPlaces = postalPlaces[address.id] ?? [];
    return Boolean(address.name.trim() && address.street.trim().length >= 5 && rules.postalPattern.test(address.postalCode) && provinceMatches && address.province && address.city && (!allowedPlaces.length || allowedPlaces.includes(address.city)) && !postalErrors[address.id] && (!address.email || emailPattern.test(address.email)) && (!address.phone || phonePattern.test(address.phone)));
  }

  function provinceOptions(address: Address) {
    if (!address.country) return [];
    return address.country === "ES" ? spanishProvinces.map(([, name]) => name) : Object.keys(geography[address.country as CountryCode] ?? {});
  }

  async function resolvePostal(index: number) {
    const address = addresses[index];
    const rules = countries.find(country => country.code === address.country);
    if (!rules) return;
    if (!rules.postalPattern.test(address.postalCode)) return;
    if (address.country === "ES" && spanishProvinceByPrefix[address.postalCode.slice(0, 2)] !== address.province) {
      setPostalErrors(current => ({ ...current, [address.id]: `El CP ${address.postalCode} pertenece a ${spanishProvinceByPrefix[address.postalCode.slice(0, 2)] ?? "otra provincia"}, no a ${address.province || "la provincia seleccionada"}.` }));
      setPostalPlaces(current => ({ ...current, [address.id]: [] }));
      return;
    }
    try {
      const response = await fetch(`/api/postal/${address.country}/${encodeURIComponent(address.postalCode)}`);
      const result = await response.json() as { places?: string[]; error?: string };
      if (!response.ok || !result.places?.length) throw new Error(result.error || "Código postal no encontrado.");
      setPostalPlaces(current => ({ ...current, [address.id]: result.places! }));
      setPostalErrors(current => ({ ...current, [address.id]: "" }));
      if (result.places.length === 1) updateAddress(index, "city", result.places[0]);
    } catch (error) {
      setPostalErrors(current => ({ ...current, [address.id]: error instanceof Error ? error.message : "No se pudo validar el código postal." }));
    }
  }

  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!taxValid || (billingEmail && !emailPattern.test(billingEmail)) || (salesEmail && !emailPattern.test(salesEmail)) || !addresses.length || addresses.some(address => !addressValid(address))) {
      setNotice("Revisa los campos marcados. No se guardará información que no cumpla el formato normalizado.");
      return;
    }
    const form = new FormData(event.currentTarget);
    const record = Object.fromEntries(form.entries());
    localStorage.setItem(`fornexa-party-${code}`, JSON.stringify({ ...record, code, addresses, updatedAt: new Date().toISOString() }));
    setNotice(`Empresa ${code} guardada con ${addresses.length} dirección${addresses.length === 1 ? "" : "es"}.`);
  }

  return <main className={styles.page}>
    <header className={styles.header}><div><Link href="/dashboard/clientes">← Clientes</Link><p>FICHA DE EMPRESA</p><h1>{id === "nuevo" ? "Nueva empresa" : example.tradeName}</h1><span>{code} · Cliente / proveedor</span></div><div className={styles.headerActions}><span>Activo</span><button form="party-form">Guardar ficha</button></div></header>
    <form id="party-form" className={styles.form} onSubmit={save}>
      <section className={styles.card}><div className={styles.cardTitle}><span>01</span><div><h2>Identificación y clasificación</h2><p>Información legal, comercial y operativa de la empresa.</p></div></div><div className={styles.grid4}>
        <label>País fiscal<select name="country" value={partyCountry} onChange={event => { setPartyCountry(event.target.value as CountryCode); setTaxId(""); }}><option value="ES">España</option><option value="FR">Francia</option><option value="PT">Portugal</option></select><Check valid={true} hint="Determina formatos y catálogos" /></label><label>Código<input value={code} readOnly /></label><label>Relación comercial<select name="partyType" defaultValue="Cliente"><option>Cliente</option><option>Proveedor</option><option>Cliente y proveedor</option></select></label><label>{countryRules.taxLabel}<input name="taxId" value={taxId} onChange={event => setTaxId(event.target.value.toUpperCase())} required className={validationClass(taxValid)} /><Check valid={taxValid} hint={countryRules.taxHint} /></label>
        <label>Razón social<input name="legalName" defaultValue={example.legalName} required minLength={3} /></label><label>Nombre comercial<input name="tradeName" defaultValue={example.tradeName} required minLength={2} /></label><label>Idioma<select name="language"><option>Español</option><option>Francés</option><option>Inglés</option></select></label><label>Moneda<select name="currency"><option>EUR</option><option>GBP</option><option>USD</option></select></label>
      </div></section>
      <section className={styles.card}><div className={styles.cardTitle}><span>02</span><div><h2>Condiciones comerciales y fiscales</h2><p>Configuración utilizada en ofertas, tarifas y facturación.</p></div></div><div className={styles.grid4}>
        <label>Forma de pago<select name="paymentMethod"><option>Transferencia</option><option>Domiciliación</option><option>Tarjeta</option></select></label><label>Vencimiento<select name="paymentTerms" defaultValue={master?.paymentTerms ?? "30 días"}><option>30 días</option><option>60 días</option><option>Contado</option></select></label><label>Límite de crédito<input name="creditLimit" defaultValue={master?.creditLimit ?? "25.000,00 €"} /></label><label>Tarifa asignada<input name="rate" defaultValue={master?.rate ?? "TF-ES-FR-04"} /></label>
        <label>Email facturación<input type="email" name="billingEmail" value={billingEmail} onChange={event => setBillingEmail(event.target.value)} placeholder="facturacion@cliente.com" className={validationClass(billingEmail ? emailPattern.test(billingEmail) : null)} /><Check valid={billingEmail ? emailPattern.test(billingEmail) : null} hint="Formato usuario@dominio" /></label><label>Email comercial<input type="email" name="salesEmail" value={salesEmail} onChange={event => setSalesEmail(event.target.value)} placeholder="compras@cliente.com" className={validationClass(salesEmail ? emailPattern.test(salesEmail) : null)} /><Check valid={salesEmail ? emailPattern.test(salesEmail) : null} hint="Formato usuario@dominio" /></label><label>Responsable comercial<input name="accountManager" defaultValue={master?.accountManager ?? "Francisco González"} /></label><label>Estado<select name="status" defaultValue={master?.status ?? "Activo"}><option>Activo</option><option>En revisión</option><option>Bloqueado</option><option>Inactivo</option></select></label>
      </div></section>
      <section className={styles.card}><div className={styles.addressHeader}><div className={styles.cardTitle}><span>03</span><div><h2>Maestro de direcciones</h2><p>Una dirección puede utilizarse para recogida y entrega, y compartirse con varios clientes sin duplicarla.</p></div></div>{id !== "nuevo" && canEditAddresses && <button type="button" onClick={addAddress}>+ Añadir dirección</button>}</div>
        {addressesLoading && <div className={styles.empty}>Cargando direcciones canónicas…</div>}
        <div className={styles.addresses}>{addresses.map((address, index) => <article key={address.id} className={styles.address}>
          <div className={styles.addressTop}><div><small>CÓDIGO DE DIRECCIÓN</small><strong>{address.code || "Se asignará al guardar"}</strong></div><div className={styles.addressActions}><label className={styles.switch}><input type="checkbox" checked={address.active} onChange={event => updateAddress(index, "active", event.target.checked)} disabled={!canEditAddresses} /> Activa</label>{canEditAddresses && <button type="button" onClick={() => saveAddress(index)} disabled={addressSaving === address.id}>{addressSaving === address.id ? "Guardando…" : "Guardar dirección"}</button>}</div></div>
          <div className={styles.grid3}><label>País<select value={address.country} onChange={event => updateAddress(index, "country", event.target.value)} disabled={!canEditAddresses}><option value="">Seleccionar</option><option value="ES">España</option><option value="FR">Francia</option><option value="PT">Portugal</option></select><Check valid={address.country ? true : null} hint="Selecciona primero el país" /></label><label>Nombre del centro<input value={address.name} minLength={3} onChange={event => updateAddress(index, "name", event.target.value)} placeholder="Nombre identificable" disabled={!canEditAddresses} /></label>
            <label>Provincia / región<input value={address.province} list={`regions-${address.id}`} onChange={event => { updateAddress(index, "province", event.target.value); setPostalErrors(current => ({ ...current, [address.id]: "" })); }} placeholder="Seleccionar o escribir" /><datalist id={`regions-${address.id}`}>{provinceOptions(address).map(province => <option key={province} value={province} />)}</datalist></label><label>CP<input value={address.postalCode} onChange={event => { updateAddress(index, "postalCode", event.target.value.toUpperCase()); setPostalErrors(current => ({ ...current, [address.id]: "" })); }} onBlur={() => resolvePostal(index)} className={validationClass(address.postalCode ? countries.find(country => country.code === address.country)!.postalPattern.test(address.postalCode) && !postalErrors[address.id] : null)} /><Check valid={address.postalCode ? countries.find(country => country.code === address.country)!.postalPattern.test(address.postalCode) && !postalErrors[address.id] : null} hint={postalErrors[address.id] || countries.find(country => country.code === address.country)!.postalHint} /></label><label>Población<input value={address.city} list={`cities-${address.id}`} onChange={event => updateAddress(index, "city", event.target.value)} placeholder="Seleccionar o escribir" /><datalist id={`cities-${address.id}`}>{(postalPlaces[address.id] ?? []).map(city => <option key={city} value={city} />)}</datalist><Check valid={address.city ? true : null} hint="Puede validarse al salir del código postal" /></label><label>Dirección<input value={address.street} minLength={5} onChange={event => updateAddress(index, "street", event.target.value)} placeholder="Calle, número, nave…" /><Check valid={address.street ? address.street.trim().length >= 5 : null} hint="Mínimo calle y número" /></label>
            <label>Contacto<input value={address.contact} onChange={event => updateAddress(index, "contact", event.target.value)} /></label><label>Teléfono<input value={address.phone} onChange={event => updateAddress(index, "phone", event.target.value)} className={validationClass(address.phone ? phonePattern.test(address.phone) : null)} /><Check valid={address.phone ? phonePattern.test(address.phone) : null} hint="Incluye prefijo internacional" /></label><label>Email<input type="email" value={address.email} onChange={event => updateAddress(index, "email", event.target.value)} className={validationClass(address.email ? emailPattern.test(address.email) : null)} /><Check valid={address.email ? emailPattern.test(address.email) : null} hint="Formato usuario@dominio" /></label><label className={styles.span2}>Restricciones e instrucciones<input value={address.restrictions} onChange={event => updateAddress(index, "restrictions", event.target.value)} placeholder="Acceso, vehículo, muelle, cita previa…" /></label>
          </div>
          <div className={styles.addressConfiguration}><fieldset><legend>Usos operativos</legend><label><input type="checkbox" checked={address.useForPickup} onChange={event => updateAddress(index, "useForPickup", event.target.checked)} disabled={!canEditAddresses} /> Recogida</label><label><input type="checkbox" checked={address.useForDelivery} onChange={event => updateAddress(index, "useForDelivery", event.target.checked)} disabled={!canEditAddresses} /> Entrega</label><label><input type="checkbox" checked={address.isDefaultPickup} onChange={event => updateAddress(index, "isDefaultPickup", event.target.checked)} disabled={!canEditAddresses || !address.useForPickup} /> Predeterminada para recogida</label><label><input type="checkbox" checked={address.isDefaultDelivery} onChange={event => updateAddress(index, "isDefaultDelivery", event.target.checked)} disabled={!canEditAddresses || !address.useForDelivery} /> Predeterminada para entrega</label></fieldset><fieldset><legend>Clientes que pueden utilizarla</legend><div className={styles.assignmentList}>{assignableCustomers.map(customer => <label key={customer.code}><input type="checkbox" checked={address.assignedCustomerCodes.includes(customer.code)} disabled={!canEditAddresses || customer.code === code} onChange={() => toggleAssignedCustomer(index, customer.code)} /><span>{customer.code}<small>{customer.name}</small></span></label>)}</div></fieldset></div>
        </article>)}</div>{!addressesLoading && !addresses.length && <div className={styles.empty}>{id === "nuevo" ? "Guarda primero el cliente para poder añadir direcciones." : "Este cliente todavía no tiene direcciones. Añade una antes de utilizarlo en una partida."}</div>}
      </section>
      <section className={styles.card}><div className={styles.cardTitle}><span>04</span><div><h2>Notas y control</h2><p>Información interna y trazabilidad del maestro.</p></div></div><label>Observaciones<textarea name="notes" rows={5} placeholder="Acuerdos, documentación pendiente, instrucciones internas…" /></label></section>
      {notice && <div className={styles.notice}>{notice}</div>}<div className={styles.footerActions}><Link href="/dashboard/clientes">Cancelar</Link><button>Guardar ficha</button></div>
    </form>
  </main>;
}
