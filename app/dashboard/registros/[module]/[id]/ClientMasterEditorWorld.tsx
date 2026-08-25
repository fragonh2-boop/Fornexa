"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { getCustomer } from "../../../../../lib/customer-master";
import { normalizeCustomerRouteCode } from "@/lib/address-master";
import { inferSubdivisionFromPostalCode, subdivisionMatchesPostalCode, type GeographyCountry, type GeographySubdivision } from "@/lib/geography-master";
import styles from "./client-master.module.css";

type Address = {
  id: string;
  code: string;
  persisted: boolean;
  name: string;
  type: string;
  street: string;
  postalCode: string;
  city: string;
  province: string;
  subdivisionKey: string;
  country: string;
  contact: string;
  phone: string;
  email: string;
  schedule: string;
  restrictions: string;
  defaultFor: string;
  active: boolean;
  useForPickup: boolean;
  useForDelivery: boolean;
  isDefaultPickup: boolean;
  isDefaultDelivery: boolean;
  assignedCustomerCodes: string[];
};

type AssignableCustomer = { code: string; name: string };
type PostalResult = { places?: string[]; region?: string; regionCode?: string; error?: string };

type CountryRule = {
  taxLabel: string;
  taxPattern: RegExp;
  taxHint: string;
  postalPattern: RegExp;
  postalHint: string;
  postalRequired: boolean;
};

const fallbackCountries: GeographyCountry[] = [
  { code: "ES", name: "España" },
  { code: "FR", name: "Francia" },
  { code: "PT", name: "Portugal" },
];

const specialRules: Record<string, CountryRule> = {
  ES: { taxLabel: "NIF / CIF", taxPattern: /^[A-Z0-9][0-9]{7}[A-Z0-9]$/, taxHint: "9 caracteres; p. ej. B46928173", postalPattern: /^[0-5][0-9]{4}$/, postalHint: "5 dígitos; p. ej. 46023", postalRequired: true },
  FR: { taxLabel: "TVA", taxPattern: /^FR[A-Z0-9]{2}[0-9]{9}$/, taxHint: "FR + 2 caracteres + 9 dígitos", postalPattern: /^[0-9]{5}$/, postalHint: "5 dígitos; p. ej. 66000", postalRequired: true },
  PT: { taxLabel: "NIF", taxPattern: /^PT[0-9]{9}$/, taxHint: "PT + 9 dígitos", postalPattern: /^[0-9]{4}-[0-9]{3}$/, postalHint: "Formato 0000-000", postalRequired: true },
};

const genericRule: CountryRule = {
  taxLabel: "Identificador fiscal",
  taxPattern: /^.{3,32}$/,
  taxHint: "Identificador fiscal según normativa del país",
  postalPattern: /^[A-Z0-9][A-Z0-9 -]{1,11}$/i,
  postalHint: "Código postal según formato local",
  postalRequired: false,
};

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const phonePattern = /^\+?[0-9][0-9\s()-]{7,18}$/;

function countryRule(countryCode: string) {
  return specialRules[countryCode.toUpperCase()] ?? genericRule;
}

function normalizeTaxId(value: string) {
  return value.toUpperCase().replace(/[\s.-]/g, "");
}

function validationClass(valid: boolean | null) {
  return valid === null ? "" : valid ? styles.valid : styles.invalid;
}

function Check({ valid, hint }: { valid: boolean | null; hint: string }) {
  return <small className={validationClass(valid)}>{valid === null ? "○" : valid ? "✓" : "!"} {hint}</small>;
}

function customerCode(id: string) {
  return normalizeCustomerRouteCode(id);
}

function postalIsValid(country: string, postalCode: string) {
  const rules = countryRule(country);
  if (!postalCode.trim()) return !rules.postalRequired;
  return rules.postalPattern.test(postalCode.trim().toUpperCase());
}

const customerExamples: Record<string, { legalName: string; tradeName: string; taxId: string; city: string }> = {
  "Mediterránea Retail": { legalName: "Mediterránea Retail, S.L.", tradeName: "Mediterránea Retail", taxId: "B-46928173", city: "Valencia" },
  "Nova Distribution": { legalName: "Nova Distribution, S.L.", tradeName: "Nova Distribution", taxId: "B-63810452", city: "Barcelona" },
  "Atlas Components": { legalName: "Atlas Components, S.A.", tradeName: "Atlas Components", taxId: "A-28469175", city: "Madrid" },
};

export default function ClientMasterEditorWorld({ id }: { id: string }) {
  const master = getCustomer(id);
  const example = master ?? customerExamples[id] ?? { legalName: "", tradeName: id === "nuevo" ? "" : id, taxId: "", city: "" };
  const code = useMemo(() => customerCode(id), [id]);
  const [notice, setNotice] = useState("");
  const [countries, setCountries] = useState<GeographyCountry[]>(fallbackCountries);
  const [geographyError, setGeographyError] = useState("");
  const [subdivisionsByCountry, setSubdivisionsByCountry] = useState<Record<string, GeographySubdivision[]>>({});
  const [subdivisionLoading, setSubdivisionLoading] = useState<Record<string, boolean>>({});
  const [partyCountry, setPartyCountry] = useState("ES");
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
  const fiscalRules = countryRule(partyCountry);
  const taxValid = taxId ? fiscalRules.taxPattern.test(normalizeTaxId(taxId)) : null;

  useEffect(() => {
    let active = true;
    fetch("/api/geography", { cache: "no-store" })
      .then(async response => {
        const result = await response.json() as { countries?: GeographyCountry[]; error?: string };
        if (!response.ok || !result.countries?.length) throw new Error(result.error || "No se pudo cargar el catálogo de países.");
        if (active) {
          setCountries(result.countries);
          setGeographyError("");
        }
      })
      .catch(error => active && setGeographyError(error instanceof Error ? error.message : "No se pudo cargar el catálogo mundial."));
    return () => { active = false; };
  }, []);

  const loadSubdivisions = useCallback(async (countryCode: string) => {
    const country = countryCode.trim().toUpperCase();
    if (!country || subdivisionsByCountry[country] || subdivisionLoading[country]) return subdivisionsByCountry[country] ?? [];
    setSubdivisionLoading(current => ({ ...current, [country]: true }));
    try {
      const response = await fetch(`/api/geography?country=${encodeURIComponent(country)}`, { cache: "no-store" });
      const result = await response.json() as { subdivisions?: GeographySubdivision[]; error?: string };
      if (!response.ok) throw new Error(result.error || "No se pudieron cargar las provincias/regiones.");
      const subdivisions = result.subdivisions ?? [];
      setSubdivisionsByCountry(current => ({ ...current, [country]: subdivisions }));
      return subdivisions;
    } catch (error) {
      setGeographyError(error instanceof Error ? error.message : "No se pudieron cargar las provincias/regiones.");
      return [];
    } finally {
      setSubdivisionLoading(current => ({ ...current, [country]: false }));
    }
  }, [subdivisionLoading, subdivisionsByCountry]);

  useEffect(() => {
    void loadSubdivisions(partyCountry);
  }, [loadSubdivisions, partyCountry]);

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
        const loaded: Address[] = (result.item?.addresses ?? []).map((address: any) => ({
          id: address.id,
          code: address.code ?? "",
          persisted: true,
          name: address.name ?? "",
          type: "Operativa",
          street: address.addressLine1 ?? "",
          postalCode: address.postalCode ?? "",
          city: address.city ?? "",
          province: address.region ?? "",
          subdivisionKey: address.subdivisionKey ?? "",
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
        }));
        setAddresses(loaded);
        [...new Set(loaded.map(address => address.country).filter(Boolean))].forEach(country => void loadSubdivisions(country));
        setNotice("");
      })
      .catch(error => active && setNotice(error instanceof Error ? error.message : "No se pudieron cargar las direcciones."))
      .finally(() => active && setAddressesLoading(false));
    return () => { active = false; };
  }, [code, id, loadSubdivisions]);

  useEffect(() => {
    setAddresses(current => current.map(address => {
      if (address.subdivisionKey || !address.country || !address.province) return address;
      const subdivisions = subdivisionsByCountry[address.country] ?? [];
      const match = subdivisions.find(item => item.name.localeCompare(address.province, "es", { sensitivity: "base" }) === 0);
      return match ? { ...address, subdivisionKey: match.id } : address;
    }));
  }, [subdivisionsByCountry]);

  function addAddress() {
    const temporaryId = `new-${crypto.randomUUID()}`;
    void loadSubdivisions(partyCountry);
    setAddresses(current => [...current, {
      id: temporaryId, code: "", persisted: false, name: "", type: "Operativa", street: "", postalCode: "", city: "", province: "", subdivisionKey: "", country: partyCountry,
      contact: "", phone: "", email: "", schedule: "", restrictions: "", defaultFor: "Ninguna", active: true,
      useForPickup: true, useForDelivery: true, isDefaultPickup: false, isDefaultDelivery: false, assignedCustomerCodes: [code],
    }]);
  }

  function updateAddress(index: number, key: keyof Address, value: string | boolean) {
    setAddresses(current => current.map((address, addressIndex) => addressIndex === index ? {
      ...address,
      [key]: value,
      ...(key === "country" ? { province: "", subdivisionKey: "", city: "", postalCode: "" } : {}),
    } : address));
  }

  function selectCountry(index: number, country: string) {
    updateAddress(index, "country", country);
    setPostalErrors(current => ({ ...current, [addresses[index].id]: "" }));
    setPostalPlaces(current => ({ ...current, [addresses[index].id]: [] }));
    void loadSubdivisions(country);
  }

  function selectSubdivision(index: number, subdivisionKey: string) {
    const address = addresses[index];
    const subdivision = (subdivisionsByCountry[address.country] ?? []).find(item => item.id === subdivisionKey);
    setAddresses(current => current.map((item, itemIndex) => itemIndex === index ? {
      ...item,
      subdivisionKey,
      province: subdivision?.name ?? "",
      city: "",
    } : item));
    setPostalErrors(current => ({ ...current, [address.id]: "" }));
  }

  function toggleAssignedCustomer(index: number, customerCodeValue: string) {
    if (customerCodeValue === code) return;
    setAddresses(current => current.map((address, addressIndex) => addressIndex !== index ? address : {
      ...address,
      assignedCustomerCodes: address.assignedCustomerCodes.includes(customerCodeValue)
        ? address.assignedCustomerCodes.filter(item => item !== customerCodeValue)
        : [...address.assignedCustomerCodes, customerCodeValue],
    }));
  }

  function addressValid(address: Address) {
    if (!address.country) return false;
    const subdivisions = subdivisionsByCountry[address.country] ?? [];
    const selected = subdivisions.find(item => item.id === address.subdivisionKey);
    const subdivisionRequired = subdivisions.length > 0;
    const subdivisionMatches = !selected?.postalPrefix || !address.postalCode || subdivisionMatchesPostalCode(selected, address.postalCode);
    const allowedPlaces = postalPlaces[address.id] ?? [];
    return Boolean(
      address.name.trim()
      && address.street.trim().length >= 5
      && postalIsValid(address.country, address.postalCode)
      && subdivisionMatches
      && (!subdivisionRequired || Boolean(address.subdivisionKey && address.province))
      && address.city
      && (!allowedPlaces.length || allowedPlaces.includes(address.city))
      && !postalErrors[address.id]
      && (!address.email || emailPattern.test(address.email))
      && (!address.phone || phonePattern.test(address.phone))
    );
  }

  async function resolvePostal(index: number) {
    const address = addresses[index];
    if (!address.country || !address.postalCode || !postalIsValid(address.country, address.postalCode)) return;
    const subdivisions = subdivisionsByCountry[address.country] ?? await loadSubdivisions(address.country);
    const inferred = inferSubdivisionFromPostalCode(subdivisions, address.postalCode);
    const selected = subdivisions.find(item => item.id === address.subdivisionKey);

    if (selected?.postalPrefix && !subdivisionMatchesPostalCode(selected, address.postalCode)) {
      setPostalErrors(current => ({ ...current, [address.id]: `El CP ${address.postalCode} no corresponde a ${selected.code} · ${selected.name}.` }));
      setPostalPlaces(current => ({ ...current, [address.id]: [] }));
      return;
    }

    if (inferred && inferred.id !== address.subdivisionKey) {
      setAddresses(current => current.map((item, itemIndex) => itemIndex === index ? { ...item, subdivisionKey: inferred.id, province: inferred.name } : item));
    }

    try {
      const response = await fetch(`/api/postal/${address.country}/${encodeURIComponent(address.postalCode)}`);
      const result = await response.json() as PostalResult;
      if (!response.ok || !result.places?.length) throw new Error(result.error || "Código postal no encontrado.");
      setPostalPlaces(current => ({ ...current, [address.id]: result.places! }));
      setPostalErrors(current => ({ ...current, [address.id]: "" }));

      if (!inferred && !address.subdivisionKey) {
        const apiRegionCode = String(result.regionCode ?? "").trim().toUpperCase();
        const apiRegion = String(result.region ?? "").trim();
        const matched = subdivisions.find(item => item.code.toUpperCase() === apiRegionCode)
          ?? subdivisions.find(item => item.name.localeCompare(apiRegion, "es", { sensitivity: "base" }) === 0);
        if (matched) setAddresses(current => current.map((item, itemIndex) => itemIndex === index ? { ...item, subdivisionKey: matched.id, province: matched.name } : item));
      }

      if (result.places.length === 1) updateAddress(index, "city", result.places[0]);
    } catch (error) {
      const strictCountry = Boolean(specialRules[address.country]);
      const message = error instanceof Error ? error.message : "No se pudo validar el código postal.";
      setPostalErrors(current => ({ ...current, [address.id]: strictCountry ? message : "" }));
    }
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
          subdivisionKey: address.subdivisionKey,
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
      setNotice(`Dirección ${result.item.code} guardada con geografía normalizada.`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "No se pudo guardar la dirección.");
    } finally {
      setAddressSaving(null);
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
    <header className={styles.header}>
      <div><Link href="/dashboard/clientes">← Clientes</Link><p>FICHA DE EMPRESA</p><h1>{id === "nuevo" ? "Nueva empresa" : example.tradeName}</h1><span>{code} · Cliente / proveedor</span></div>
      <div className={styles.headerActions}><span>Activo</span><button form="party-form">Guardar ficha</button></div>
    </header>

    <form id="party-form" className={styles.form} onSubmit={save}>
      <section className={styles.card}>
        <div className={styles.cardTitle}><span>01</span><div><h2>Identificación y clasificación</h2><p>Información legal, comercial y operativa de la empresa.</p></div></div>
        <div className={styles.grid4}>
          <label>País fiscal<select name="country" value={partyCountry} onChange={event => { const country = event.target.value; setPartyCountry(country); setTaxId(""); void loadSubdivisions(country); }}>{countries.map(country => <option key={country.code} value={country.code}>{country.name}</option>)}</select><Check valid={true} hint="Catálogo mundial ISO 3166-1" /></label>
          <label>Código<input value={code} readOnly /></label>
          <label>Relación comercial<select name="partyType" defaultValue="Cliente"><option>Cliente</option><option>Proveedor</option><option>Cliente y proveedor</option></select></label>
          <label>{fiscalRules.taxLabel}<input name="taxId" value={taxId} onChange={event => setTaxId(event.target.value.toUpperCase())} required className={validationClass(taxValid)} /><Check valid={taxValid} hint={fiscalRules.taxHint} /></label>
          <label>Razón social<input name="legalName" defaultValue={example.legalName} required minLength={3} /></label>
          <label>Nombre comercial<input name="tradeName" defaultValue={example.tradeName} required minLength={2} /></label>
          <label>Idioma<select name="language"><option>Español</option><option>Francés</option><option>Inglés</option></select></label>
          <label>Moneda<select name="currency"><option>EUR</option><option>GBP</option><option>USD</option></select></label>
        </div>
        {geographyError && <small className={styles.invalid}>{geographyError}</small>}
      </section>

      <section className={styles.card}>
        <div className={styles.cardTitle}><span>02</span><div><h2>Condiciones comerciales y fiscales</h2><p>Configuración utilizada en ofertas, tarifas y facturación.</p></div></div>
        <div className={styles.grid4}>
          <label>Forma de pago<select name="paymentMethod"><option>Transferencia</option><option>Domiciliación</option><option>Tarjeta</option></select></label>
          <label>Vencimiento<select name="paymentTerms" defaultValue={master?.paymentTerms ?? "30 días"}><option>30 días</option><option>60 días</option><option>Contado</option></select></label>
          <label>Límite de crédito<input name="creditLimit" defaultValue={master?.creditLimit ?? "25.000,00 €"} /></label>
          <label>Tarifa asignada<input name="rate" defaultValue={master?.rate ?? "TF-ES-FR-04"} /></label>
          <label>Email facturación<input type="email" name="billingEmail" value={billingEmail} onChange={event => setBillingEmail(event.target.value)} placeholder="facturacion@cliente.com" className={validationClass(billingEmail ? emailPattern.test(billingEmail) : null)} /><Check valid={billingEmail ? emailPattern.test(billingEmail) : null} hint="Formato usuario@dominio" /></label>
          <label>Email comercial<input type="email" name="salesEmail" value={salesEmail} onChange={event => setSalesEmail(event.target.value)} placeholder="compras@cliente.com" className={validationClass(salesEmail ? emailPattern.test(salesEmail) : null)} /><Check valid={salesEmail ? emailPattern.test(salesEmail) : null} hint="Formato usuario@dominio" /></label>
          <label>Responsable comercial<input name="accountManager" defaultValue={master?.accountManager ?? "Francisco González"} /></label>
          <label>Estado<select name="status" defaultValue={master?.status ?? "Activo"}><option>Activo</option><option>En revisión</option><option>Bloqueado</option><option>Inactivo</option></select></label>
        </div>
      </section>

      <section className={styles.card} id="direcciones">
        <div className={styles.addressHeader}><div className={styles.cardTitle}><span>03</span><div><h2>Maestro de direcciones</h2><p>Países y subdivisiones oficiales normalizados; la clave geográfica se conserva junto a la dirección.</p></div></div>{id !== "nuevo" && canEditAddresses && <button type="button" onClick={addAddress}>+ Añadir dirección</button>}</div>
        {addressesLoading && <div className={styles.empty}>Cargando direcciones canónicas…</div>}
        <div className={styles.addresses}>{addresses.map((address, index) => {
          const subdivisions = subdivisionsByCountry[address.country] ?? [];
          const selectedKey = address.subdivisionKey || subdivisions.find(item => item.name.localeCompare(address.province, "es", { sensitivity: "base" }) === 0)?.id || "";
          const rules = countryRule(address.country);
          const postalValid = address.postalCode ? postalIsValid(address.country, address.postalCode) && !postalErrors[address.id] : null;
          return <article key={address.id} className={styles.address}>
            <div className={styles.addressTop}><div><small>CÓDIGO DE DIRECCIÓN</small><strong>{address.code || "Se asignará al guardar"}</strong></div><div className={styles.addressActions}><label className={styles.switch}><input type="checkbox" checked={address.active} onChange={event => updateAddress(index, "active", event.target.checked)} disabled={!canEditAddresses} /> Activa</label>{canEditAddresses && <button type="button" onClick={() => saveAddress(index)} disabled={addressSaving === address.id}>{addressSaving === address.id ? "Guardando…" : "Guardar dirección"}</button>}</div></div>
            <div className={styles.grid3}>
              <label>País<select value={address.country} onChange={event => selectCountry(index, event.target.value)} disabled={!canEditAddresses}><option value="">Seleccionar</option>{countries.map(country => <option key={country.code} value={country.code}>{country.name}</option>)}</select><Check valid={address.country ? true : null} hint="ISO 3166-1 · catálogo mundial" /></label>
              <label>Nombre del centro<input value={address.name} minLength={3} onChange={event => updateAddress(index, "name", event.target.value)} placeholder="Nombre identificable" disabled={!canEditAddresses} /></label>
              <label>Provincia / región<select value={selectedKey} onChange={event => selectSubdivision(index, event.target.value)} disabled={!canEditAddresses || !address.country || subdivisionLoading[address.country]}><option value="">{subdivisionLoading[address.country] ? "Cargando…" : subdivisions.length ? "Seleccionar" : "Sin subdivisiones oficiales"}</option>{subdivisions.map(subdivision => <option key={subdivision.id} value={subdivision.id}>{subdivision.code} · {subdivision.name}</option>)}</select><Check valid={subdivisions.length ? Boolean(selectedKey) : address.country ? true : null} hint={selectedKey ? `Clave: ${selectedKey}` : "Selecciona una subdivisión oficial"} /></label>
              <label>CP<input value={address.postalCode} onChange={event => { updateAddress(index, "postalCode", event.target.value.toUpperCase()); setPostalErrors(current => ({ ...current, [address.id]: "" })); }} onBlur={() => resolvePostal(index)} className={validationClass(postalValid)} /><Check valid={postalValid} hint={postalErrors[address.id] || rules.postalHint} /></label>
              <label>Población<input value={address.city} list={`cities-${address.id}`} onChange={event => updateAddress(index, "city", event.target.value)} placeholder="Seleccionar o escribir" /><datalist id={`cities-${address.id}`}>{(postalPlaces[address.id] ?? []).map(city => <option key={city} value={city} />)}</datalist><Check valid={address.city ? true : null} hint="Puede validarse al salir del código postal" /></label>
              <label>Dirección<input value={address.street} minLength={5} onChange={event => updateAddress(index, "street", event.target.value)} placeholder="Calle, número, nave…" /><Check valid={address.street ? address.street.trim().length >= 5 : null} hint="Mínimo calle y número" /></label>
              <label>Contacto<input value={address.contact} onChange={event => updateAddress(index, "contact", event.target.value)} /></label>
              <label>Teléfono<input value={address.phone} onChange={event => updateAddress(index, "phone", event.target.value)} className={validationClass(address.phone ? phonePattern.test(address.phone) : null)} /><Check valid={address.phone ? phonePattern.test(address.phone) : null} hint="Incluye prefijo internacional" /></label>
              <label>Email<input type="email" value={address.email} onChange={event => updateAddress(index, "email", event.target.value)} className={validationClass(address.email ? emailPattern.test(address.email) : null)} /><Check valid={address.email ? emailPattern.test(address.email) : null} hint="Formato usuario@dominio" /></label>
              <label className={styles.span2}>Restricciones e instrucciones<input value={address.restrictions} onChange={event => updateAddress(index, "restrictions", event.target.value)} placeholder="Acceso, vehículo, muelle, cita previa…" /></label>
            </div>
            <div className={styles.addressConfiguration}>
              <fieldset><legend>Usos operativos</legend><label><input type="checkbox" checked={address.useForPickup} onChange={event => updateAddress(index, "useForPickup", event.target.checked)} disabled={!canEditAddresses} /> Recogida</label><label><input type="checkbox" checked={address.useForDelivery} onChange={event => updateAddress(index, "useForDelivery", event.target.checked)} disabled={!canEditAddresses} /> Entrega</label><label><input type="checkbox" checked={address.isDefaultPickup} onChange={event => updateAddress(index, "isDefaultPickup", event.target.checked)} disabled={!canEditAddresses || !address.useForPickup} /> Predeterminada para recogida</label><label><input type="checkbox" checked={address.isDefaultDelivery} onChange={event => updateAddress(index, "isDefaultDelivery", event.target.checked)} disabled={!canEditAddresses || !address.useForDelivery} /> Predeterminada para entrega</label></fieldset>
              <fieldset><legend>Clientes que pueden utilizarla</legend><div className={styles.assignmentList}>{assignableCustomers.map(customer => <label key={customer.code}><input type="checkbox" checked={address.assignedCustomerCodes.includes(customer.code)} disabled={!canEditAddresses || customer.code === code} onChange={() => toggleAssignedCustomer(index, customer.code)} /><span>{customer.code}<small>{customer.name}</small></span></label>)}</div></fieldset>
            </div>
          </article>;
        })}</div>
        {!addressesLoading && !addresses.length && <div className={styles.empty}>{id === "nuevo" ? "Guarda primero el cliente para poder añadir direcciones." : "Este cliente todavía no tiene direcciones. Añade una antes de utilizarlo en una partida."}</div>}
      </section>

      <section className={styles.card}><div className={styles.cardTitle}><span>04</span><div><h2>Notas y control</h2><p>Información interna y trazabilidad del maestro.</p></div></div><label>Observaciones<textarea name="notes" rows={5} placeholder="Acuerdos, documentación pendiente, instrucciones internas…" /></label></section>
      {notice && <div className={styles.notice}>{notice}</div>}
      <div className={styles.footerActions}><Link href="/dashboard/clientes">Cancelar</Link><button>Guardar ficha</button></div>
    </form>
  </main>;
}
