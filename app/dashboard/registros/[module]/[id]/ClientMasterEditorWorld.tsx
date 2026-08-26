"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { inferSubdivisionFromPostalCode, subdivisionMatchesPostalCode, type GeographyCountry, type GeographySubdivision } from "@/lib/geography-master";
import { fiscalRuleForCountry } from "@/lib/fiscal-id";
import styles from "./client-master.module.css";

type Address = {
  id: string;
  code: string;
  persisted: boolean;
  name: string;
  street: string;
  postalCode: string;
  city: string;
  province: string;
  subdivisionKey: string;
  country: string;
  contact: string;
  phone: string;
  email: string;
  restrictions: string;
  active: boolean;
  useForPickup: boolean;
  useForDelivery: boolean;
  isDefaultPickup: boolean;
  isDefaultDelivery: boolean;
  assignedCustomerCodes: string[];
  hasDock: boolean;
  needsForklift: boolean;
  requiresAppointment: boolean;
  palletExchange: boolean;
  adrCapable: boolean;
  temperatureControlled: boolean;
  temperatureMin: string;
  temperatureMax: string;
  geofenceRadiusM: string;
  averageWaitMinutes: string;
};

type AssignableCustomer = { code: string; name: string };
type TenantUser = { id: string; name: string; email: string; role: string };
type PostalResult = { places?: string[]; region?: string; regionCode?: string; error?: string };
type CustomerItem = {
  code: string;
  legalName: string;
  tradeName: string;
  taxId: string;
  countryCode: string;
  language: string;
  currency: string;
  partyType: string;
  status: string;
  metadata?: Record<string, unknown>;
  eori?: string;
  gln?: string;
  cnaeCode?: string;
  commercialRegister?: string;
  accountManagerUserId?: string;
  billing?: { paymentMethod?: string; paymentTermsDays?: number | null; creditLimit?: number | null; billingEmail?: string; salesEmail?: string } | null;
};

type PostalRule = {
  postalPattern: RegExp;
  postalHint: string;
  postalRequired: boolean;
};

const fallbackCountries: GeographyCountry[] = [
  { code: "ES", name: "España" },
  { code: "FR", name: "Francia" },
  { code: "PT", name: "Portugal" },
];

const postalRules: Record<string, PostalRule> = {
  ES: { postalPattern: /^[0-5][0-9]{4}$/, postalHint: "5 dígitos; p. ej. 46023", postalRequired: true },
  FR: { postalPattern: /^[0-9]{5}$/, postalHint: "5 dígitos; p. ej. 66000", postalRequired: true },
  PT: { postalPattern: /^[0-9]{4}-[0-9]{3}$/, postalHint: "Formato 0000-000", postalRequired: true },
};

const genericPostalRule: PostalRule = {
  postalPattern: /^[A-Z0-9][A-Z0-9 -]{1,11}$/i,
  postalHint: "Código postal según formato local",
  postalRequired: false,
};

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const phonePattern = /^\+?[0-9][0-9\s()-]{7,18}$/;

function postalRule(country: string) {
  return postalRules[country.toUpperCase()] ?? genericPostalRule;
}

function postalIsValid(country: string, postalCode: string) {
  const rules = postalRule(country);
  if (!postalCode.trim()) return !rules.postalRequired;
  return rules.postalPattern.test(postalCode.trim().toUpperCase());
}

function validationClass(valid: boolean | null) {
  return valid === null ? "" : valid ? styles.valid : styles.invalid;
}

function Check({ valid, hint }: { valid: boolean | null; hint: string }) {
  return <small className={validationClass(valid)}>{valid === null ? "○" : valid ? "✓" : "!"} {hint}</small>;
}

function statusLabel(value: string) {
  const status = value.toUpperCase();
  if (status === "ACTIVE") return "Activo";
  if (status === "REVIEW" || status === "EN REVISIÓN") return "En revisión";
  if (status === "BLOCKED" || status === "BLOQUEADO") return "Bloqueado";
  if (status === "INACTIVE" || status === "INACTIVO") return "Inactivo";
  return "Activo";
}

function languageValue(value: string) {
  const lang = value.toLowerCase();
  if (lang.startsWith("fr")) return "fr";
  if (lang.startsWith("en")) return "en";
  return "es";
}

export default function ClientMasterEditorWorld({ id }: { id: string }) {
  const router = useRouter();
  const isNew = id === "nuevo";
  const code = isNew ? "" : id.toUpperCase();

  const [countries, setCountries] = useState<GeographyCountry[]>(fallbackCountries);
  const [geographyError, setGeographyError] = useState("");
  const [subdivisionsByCountry, setSubdivisionsByCountry] = useState<Record<string, GeographySubdivision[]>>({});
  const [subdivisionLoading, setSubdivisionLoading] = useState<Record<string, boolean>>({});

  const [partyCountry, setPartyCountry] = useState("ES");
  const [taxId, setTaxId] = useState("");
  const [legalName, setLegalName] = useState("");
  const [tradeName, setTradeName] = useState("");
  const [partyType, setPartyType] = useState("Cliente");
  const [language, setLanguage] = useState("es");
  const [currency, setCurrency] = useState("EUR");
  const [paymentMethod, setPaymentMethod] = useState("Transferencia");
  const [paymentTerms, setPaymentTerms] = useState("30 días");
  const [creditLimit, setCreditLimit] = useState("25.000,00 €");
  const [billingEmail, setBillingEmail] = useState("");
  const [salesEmail, setSalesEmail] = useState("");
  const [eori, setEori] = useState("");
  const [gln, setGln] = useState("");
  const [cnaeCode, setCnaeCode] = useState("");
  const [commercialRegister, setCommercialRegister] = useState("");
  const [accountManagerUserId, setAccountManagerUserId] = useState("");
  const [tenantUsers, setTenantUsers] = useState<TenantUser[]>([]);
  const [status, setStatus] = useState("Activo");
  const [notes, setNotes] = useState("");
  const [canEdit, setCanEdit] = useState(isNew);
  const [customerLoading, setCustomerLoading] = useState(!isNew);
  const [savingCustomer, setSavingCustomer] = useState(false);
  const [formErrors, setFormErrors] = useState<string[]>([]);
  const [notice, setNotice] = useState("");

  const [addresses, setAddresses] = useState<Address[]>([]);
  const [assignableCustomers, setAssignableCustomers] = useState<AssignableCustomer[]>([]);
  const [addressesLoading, setAddressesLoading] = useState(!isNew);
  const [addressSaving, setAddressSaving] = useState<string | null>(null);
  const [postalPlaces, setPostalPlaces] = useState<Record<string, string[]>>({});
  const [postalErrors, setPostalErrors] = useState<Record<string, string>>({});

  const fiscalRule = useMemo(() => fiscalRuleForCountry(partyCountry), [partyCountry]);
  const taxValid = taxId ? fiscalRule.validate(taxId) : null;

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

  useEffect(() => {
    fetch("/api/tenant/users", { cache: "no-store" })
      .then(async response => response.ok ? response.json() : { items: [] })
      .then(result => setTenantUsers(result.items ?? []))
      .catch(() => setTenantUsers([]));
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

  useEffect(() => { void loadSubdivisions(partyCountry); }, [loadSubdivisions, partyCountry]);

  useEffect(() => {
    if (isNew) return;
    let active = true;
    fetch(`/api/customers?customerCode=${encodeURIComponent(code)}`, { cache: "no-store" })
      .then(async response => {
        const result = await response.json() as { item?: CustomerItem; canEdit?: boolean; error?: string };
        if (!response.ok || !result.item) throw new Error(result.error || "No se pudo cargar la empresa.");
        if (!active) return;
        const item = result.item;
        const metadata = item.metadata ?? {};
        setLegalName(item.legalName ?? "");
        setTradeName(item.tradeName ?? "");
        setPartyCountry(item.countryCode || "ES");
        setTaxId(item.taxId ?? "");
        setPartyType(item.partyType || "Cliente");
        setLanguage(languageValue(item.language || "es"));
        setCurrency(item.currency || "EUR");
        setPaymentMethod(String(item.billing?.paymentMethod ?? metadata.payment_method ?? "Transferencia"));
        setPaymentTerms(item.billing?.paymentTermsDays == null ? String(metadata.payment_terms ?? "30 días") : `${item.billing.paymentTermsDays} días`);
        setCreditLimit(item.billing?.creditLimit == null ? String(metadata.credit_limit ?? "") : String(item.billing.creditLimit));
        setBillingEmail(String(item.billing?.billingEmail ?? metadata.billing_email ?? ""));
        setSalesEmail(String(item.billing?.salesEmail ?? metadata.sales_email ?? ""));
        setEori(item.eori ?? "");
        setGln(item.gln ?? "");
        setCnaeCode(item.cnaeCode ?? "");
        setCommercialRegister(item.commercialRegister ?? "");
        setAccountManagerUserId(item.accountManagerUserId ?? "");
        setNotes(String(metadata.notes ?? ""));
        setStatus(statusLabel(item.status));
        setCanEdit(Boolean(result.canEdit));
        void loadSubdivisions(item.countryCode || "ES");
      })
      .catch(error => active && setFormErrors([error instanceof Error ? error.message : "No se pudo cargar la empresa."]))
      .finally(() => active && setCustomerLoading(false));
    return () => { active = false; };
  }, [code, isNew, loadSubdivisions]);

  useEffect(() => {
    if (isNew) return;
    let active = true;
    fetch(`/api/customers/addresses?customerCode=${encodeURIComponent(code)}`, { cache: "no-store" })
      .then(async response => {
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || "No se pudieron cargar las direcciones.");
        if (!active) return;
        setAssignableCustomers(result.customers ?? []);
        setCanEdit(Boolean(result.canEdit));
        const loaded: Address[] = (result.item?.addresses ?? []).map((address: any) => ({
          id: address.id,
          code: address.code ?? "",
          persisted: true,
          name: address.name ?? "",
          street: address.addressLine1 ?? "",
          postalCode: address.postalCode ?? "",
          city: address.city ?? "",
          province: address.region ?? "",
          subdivisionKey: address.subdivisionKey ?? "",
          country: address.countryCode ?? "",
          contact: address.contactName ?? "",
          phone: address.contactPhone ?? "",
          email: address.contactEmail ?? "",
          restrictions: address.instructions ?? "",
          active: address.isActive !== false,
          useForPickup: Boolean(address.useForPickup),
          useForDelivery: Boolean(address.useForDelivery),
          isDefaultPickup: Boolean(address.isDefaultPickup),
          isDefaultDelivery: Boolean(address.isDefaultDelivery),
          assignedCustomerCodes: address.assignedCustomerCodes ?? [code],
          hasDock: Boolean(address.operationalProfile?.has_dock),
          needsForklift: Boolean(address.operationalProfile?.needs_forklift),
          requiresAppointment: Boolean(address.operationalProfile?.requires_appointment),
          palletExchange: Boolean(address.operationalProfile?.pallet_exchange),
          adrCapable: Boolean(address.operationalProfile?.adr_capable),
          temperatureControlled: Boolean(address.operationalProfile?.temperature_controlled),
          temperatureMin: address.operationalProfile?.temperature_min == null ? "" : String(address.operationalProfile.temperature_min),
          temperatureMax: address.operationalProfile?.temperature_max == null ? "" : String(address.operationalProfile.temperature_max),
          geofenceRadiusM: address.operationalProfile?.geofence_radius_m == null ? "" : String(address.operationalProfile.geofence_radius_m),
          averageWaitMinutes: address.operationalProfile?.average_wait_minutes == null ? "" : String(address.operationalProfile.average_wait_minutes),
        }));
        setAddresses(loaded);
        [...new Set(loaded.map(address => address.country).filter(Boolean))].forEach(country => void loadSubdivisions(country));
      })
      .catch(error => active && setNotice(error instanceof Error ? error.message : "No se pudieron cargar las direcciones."))
      .finally(() => active && setAddressesLoading(false));
    return () => { active = false; };
  }, [code, isNew, loadSubdivisions]);

  useEffect(() => {
    setAddresses(current => current.map(address => {
      if (address.subdivisionKey || !address.country || !address.province) return address;
      const subdivisions = subdivisionsByCountry[address.country] ?? [];
      const match = subdivisions.find(item => item.name.localeCompare(address.province, "es", { sensitivity: "base" }) === 0);
      return match ? { ...address, subdivisionKey: match.id } : address;
    }));
  }, [subdivisionsByCountry]);

  function customerErrors() {
    const errors: string[] = [];
    if (!partyCountry) errors.push("País fiscal: selecciona un país.");
    if (!taxId.trim()) errors.push(`${fiscalRule.label}: es obligatorio.`);
    else if (!fiscalRule.validate(taxId)) errors.push(`${fiscalRule.label}: ${fiscalRule.hint}.`);
    if (legalName.trim().length < 3) errors.push("Razón social: introduce al menos 3 caracteres.");
    if (tradeName.trim().length < 2) errors.push("Nombre comercial: introduce al menos 2 caracteres.");
    if (billingEmail && !emailPattern.test(billingEmail)) errors.push("Email de facturación: formato no válido.");
    if (salesEmail && !emailPattern.test(salesEmail)) errors.push("Email comercial: formato no válido.");
    if (!partyType) errors.push("Relación comercial: selecciona una opción.");
    return errors;
  }

  async function saveCustomer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const errors = customerErrors();
    setFormErrors(errors);
    setNotice("");
    if (errors.length) {
      requestAnimationFrame(() => document.querySelector(`.${styles.invalid}`)?.scrollIntoView({ behavior: "smooth", block: "center" }));
      return;
    }

    setSavingCustomer(true);
    try {
      const response = await fetch("/api/customers", {
        method: isNew ? "POST" : "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerCode: code || undefined,
          legalName,
          tradeName,
          countryCode: partyCountry,
          taxId,
          partyType,
          language,
          currency,
          paymentMethod,
          paymentTerms,
          creditLimit,
          billingEmail,
          salesEmail,
          eori,
          gln,
          cnaeCode,
          commercialRegister,
          accountManagerUserId,
          billing: { paymentMethod, paymentTermsDays: paymentTerms, creditLimit, billingEmail, salesEmail },
          status,
          notes,
        }),
      });
      const result = await response.json() as { item?: { code?: string }; error?: string; errors?: string[] };
      if (!response.ok) {
        const messages = result.errors?.length ? result.errors : [result.error || "No se pudo guardar la empresa."];
        setFormErrors(messages);
        return;
      }
      const savedCode = result.item?.code || code;
      setFormErrors([]);
      setNotice(`Empresa ${savedCode} guardada correctamente.`);
      if (isNew && savedCode) {
        router.replace(`/dashboard/registros/clientes/${encodeURIComponent(savedCode)}`);
        router.refresh();
      }
    } catch (error) {
      setFormErrors([error instanceof Error ? error.message : "No se pudo guardar la empresa."]);
    } finally {
      setSavingCustomer(false);
    }
  }

  function addAddress() {
    if (isNew) return;
    const temporaryId = `new-${crypto.randomUUID()}`;
    void loadSubdivisions(partyCountry);
    setAddresses(current => [...current, {
      id: temporaryId,
      code: "",
      persisted: false,
      name: "",
      street: "",
      postalCode: "",
      city: "",
      province: "",
      subdivisionKey: "",
      country: partyCountry,
      contact: "",
      phone: "",
      email: "",
      restrictions: "",
      active: true,
      useForPickup: true,
      useForDelivery: true,
      isDefaultPickup: false,
      isDefaultDelivery: false,
      assignedCustomerCodes: [code],
      hasDock: false,
      needsForklift: false,
      requiresAppointment: false,
      palletExchange: false,
      adrCapable: false,
      temperatureControlled: false,
      temperatureMin: "",
      temperatureMax: "",
      geofenceRadiusM: "",
      averageWaitMinutes: "",
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
    const addressId = addresses[index].id;
    updateAddress(index, "country", country);
    setPostalErrors(current => ({ ...current, [addressId]: "" }));
    setPostalPlaces(current => ({ ...current, [addressId]: [] }));
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

  function addressErrors(address: Address) {
    const errors: string[] = [];
    if (!address.country) errors.push("País obligatorio.");
    const subdivisions = subdivisionsByCountry[address.country] ?? [];
    const selected = subdivisions.find(item => item.id === address.subdivisionKey);
    if (subdivisions.length && !selected) errors.push("Provincia/región obligatoria.");
    if (!address.name.trim()) errors.push("Nombre del centro obligatorio.");
    if (address.street.trim().length < 5) errors.push("Dirección: mínimo 5 caracteres.");
    if (!postalIsValid(address.country, address.postalCode)) errors.push(`Código postal: ${postalRule(address.country).postalHint}.`);
    if (selected?.postalPrefix && address.postalCode && !subdivisionMatchesPostalCode(selected, address.postalCode)) errors.push(`El CP no corresponde a ${selected.code} · ${selected.name}.`);
    if (!address.city.trim()) errors.push("Población obligatoria.");
    if (postalErrors[address.id]) errors.push(postalErrors[address.id]);
    if (address.email && !emailPattern.test(address.email)) errors.push("Email de contacto no válido.");
    if (address.phone && !phonePattern.test(address.phone)) errors.push("Teléfono no válido.");
    if (!address.useForPickup && !address.useForDelivery) errors.push("Selecciona al menos un uso: recogida o entrega.");
    return errors;
  }

  async function resolvePostal(index: number) {
    const address = addresses[index];
    if (!address.country || !address.postalCode || !postalIsValid(address.country, address.postalCode)) return;
    const subdivisions = subdivisionsByCountry[address.country] ?? await loadSubdivisions(address.country);
    const inferred = inferSubdivisionFromPostalCode(subdivisions, address.postalCode);
    const selected = subdivisions.find(item => item.id === address.subdivisionKey);

    if (selected?.postalPrefix && !subdivisionMatchesPostalCode(selected, address.postalCode)) {
      setPostalErrors(current => ({ ...current, [address.id]: `El CP ${address.postalCode} no corresponde a ${selected.code} · ${selected.name}.` }));
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
      const strictCountry = Boolean(postalRules[address.country]);
      const message = error instanceof Error ? error.message : "No se pudo validar el código postal.";
      setPostalErrors(current => ({ ...current, [address.id]: strictCountry ? message : "" }));
    }
  }

  async function saveAddress(index: number) {
    const address = addresses[index];
    const errors = addressErrors(address);
    if (errors.length) {
      setFormErrors(errors.map(message => `Dirección ${address.code || index + 1}: ${message}`));
      return;
    }
    setAddressSaving(address.id);
    setFormErrors([]);
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
          operationalProfile: {
            hasDock: address.hasDock,
            needsForklift: address.needsForklift,
            requiresAppointment: address.requiresAppointment,
            palletExchange: address.palletExchange,
            adrCapable: address.adrCapable,
            temperatureControlled: address.temperatureControlled,
            temperatureMin: address.temperatureMin,
            temperatureMax: address.temperatureMax,
            geofenceRadiusM: address.geofenceRadiusM,
            averageWaitMinutes: address.averageWaitMinutes,
            accessInstructions: address.restrictions,
          },
        } }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "No se pudo guardar la dirección.");
      setAddresses(current => current.map((item, addressIndex) => addressIndex === index ? { ...item, id: result.item.id, code: result.item.code, persisted: true } : item));
      setNotice(`Dirección ${result.item.code} guardada correctamente.`);
    } catch (error) {
      setFormErrors([error instanceof Error ? error.message : "No se pudo guardar la dirección."]);
    } finally {
      setAddressSaving(null);
    }
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

  if (customerLoading) return <main className={styles.page}><div className={styles.empty}>Cargando ficha del cliente…</div></main>;

  return <main className={styles.page}>
    <header className={styles.header}>
      <div><Link href="/dashboard/clientes">← Clientes</Link><p>FICHA DE EMPRESA</p><h1>{isNew ? "Nueva empresa" : (tradeName || legalName || code)}</h1><span>{isNew ? "Código pendiente de asignación" : code} · Cliente / proveedor</span></div>
      <div className={styles.headerActions}><span>{status}</span><button form="party-form" disabled={savingCustomer || !canEdit}>{savingCustomer ? "Guardando…" : "Guardar ficha"}</button></div>
    </header>

    <form id="party-form" className={styles.form} onSubmit={saveCustomer} noValidate>
      <section className={styles.card}>
        <div className={styles.cardTitle}><span>01</span><div><h2>Identificación y clasificación</h2><p>Información legal, comercial y operativa de la empresa.</p></div></div>
        <div className={styles.grid4}>
          <label>País fiscal<select value={partyCountry} onChange={event => { const country = event.target.value; setPartyCountry(country); setTaxId(""); void loadSubdivisions(country); }} disabled={!canEdit}>{countries.map(country => <option key={country.code} value={country.code}>{country.name}</option>)}</select><Check valid={Boolean(partyCountry)} hint="Catálogo mundial ISO 3166-1" /></label>
          <label>Código<input value={isNew ? "Se asignará al guardar" : code} readOnly /></label>
          <label>Relación comercial<select value={partyType} onChange={event => setPartyType(event.target.value)} disabled={!canEdit}><option>Cliente</option><option>Proveedor</option><option>Cliente y proveedor</option></select></label>
          <label>{fiscalRule.label}<input value={taxId} onChange={event => setTaxId(event.target.value.toUpperCase())} onBlur={() => taxId && setTaxId(fiscalRule.normalize(taxId))} disabled={!canEdit} className={validationClass(taxValid)} aria-invalid={taxValid === false} /><Check valid={taxValid} hint={fiscalRule.hint} /></label>
          <label>Razón social<input value={legalName} onChange={event => setLegalName(event.target.value)} disabled={!canEdit} className={validationClass(legalName ? legalName.trim().length >= 3 : null)} /><Check valid={legalName ? legalName.trim().length >= 3 : null} hint="Mínimo 3 caracteres" /></label>
          <label>Nombre comercial<input value={tradeName} onChange={event => setTradeName(event.target.value)} disabled={!canEdit} className={validationClass(tradeName ? tradeName.trim().length >= 2 : null)} /><Check valid={tradeName ? tradeName.trim().length >= 2 : null} hint="Mínimo 2 caracteres" /></label>
          <label>Idioma<select value={language} onChange={event => setLanguage(event.target.value)} disabled={!canEdit}><option value="es">Español</option><option value="fr">Francés</option><option value="en">Inglés</option></select></label>
          <label>Moneda<select value={currency} onChange={event => setCurrency(event.target.value)} disabled={!canEdit}><option>EUR</option><option>GBP</option><option>USD</option></select></label>
        </div>
        {geographyError && <small className={styles.invalid}>{geographyError}</small>}
      </section>

      <section className={styles.card}>
        <div className={styles.cardTitle}><span>02</span><div><h2>Condiciones comerciales y fiscales</h2><p>Configuración utilizada en ofertas, tarifas y facturación.</p></div></div>
        <div className={styles.grid4}>
          <label>Forma de pago<select value={paymentMethod} onChange={event => setPaymentMethod(event.target.value)} disabled={!canEdit}><option>Transferencia</option><option>Domiciliación</option><option>Tarjeta</option></select></label>
          <label>Vencimiento<select value={paymentTerms} onChange={event => setPaymentTerms(event.target.value)} disabled={!canEdit}><option>30 días</option><option>60 días</option><option>Contado</option></select></label>
          <label>Límite de crédito<input value={creditLimit} onChange={event => setCreditLimit(event.target.value)} disabled={!canEdit} /></label>
          <label>Tarifas<Link className={styles.submasterLink} href="#tarifas">Gestionar versiones y vigencias →</Link></label>
          <label>Email facturación<input type="email" value={billingEmail} onChange={event => setBillingEmail(event.target.value)} disabled={!canEdit} className={validationClass(billingEmail ? emailPattern.test(billingEmail) : null)} /><Check valid={billingEmail ? emailPattern.test(billingEmail) : null} hint="Formato usuario@dominio" /></label>
          <label>Email comercial<input type="email" value={salesEmail} onChange={event => setSalesEmail(event.target.value)} disabled={!canEdit} className={validationClass(salesEmail ? emailPattern.test(salesEmail) : null)} /><Check valid={salesEmail ? emailPattern.test(salesEmail) : null} hint="Formato usuario@dominio" /></label>
          <label>Responsable comercial<select value={accountManagerUserId} onChange={event => setAccountManagerUserId(event.target.value)} disabled={!canEdit}><option value="">Sin asignar</option>{tenantUsers.map(user => <option key={user.id} value={user.id}>{user.name} · {user.role}</option>)}</select></label>
          <label>Estado<select value={status} onChange={event => setStatus(event.target.value)} disabled={!canEdit}><option>Activo</option><option>En revisión</option><option>Bloqueado</option><option>Inactivo</option></select></label>
          <label>EORI<input value={eori} onChange={event => setEori(event.target.value.toUpperCase())} disabled={!canEdit} /></label>
          <label>GLN<input value={gln} onChange={event => setGln(event.target.value)} disabled={!canEdit} inputMode="numeric" /></label>
          <label>CNAE<input value={cnaeCode} onChange={event => setCnaeCode(event.target.value)} disabled={!canEdit} /></label>
          <label>Registro mercantil<input value={commercialRegister} onChange={event => setCommercialRegister(event.target.value)} disabled={!canEdit} /></label>
        </div>
      </section>

      <section className={styles.card} id="direcciones">
        <div className={styles.addressHeader}><div className={styles.cardTitle}><span>03</span><div><h2>Maestro de direcciones</h2><p>Países y subdivisiones oficiales normalizados; la clave geográfica se conserva junto a la dirección.</p></div></div>{!isNew && canEdit && <button type="button" onClick={addAddress}>+ Añadir dirección</button>}</div>
        {addressesLoading && <div className={styles.empty}>Cargando direcciones…</div>}
        <div className={styles.addresses}>{addresses.map((address, index) => {
          const subdivisions = subdivisionsByCountry[address.country] ?? [];
          const selectedKey = address.subdivisionKey || subdivisions.find(item => item.name.localeCompare(address.province, "es", { sensitivity: "base" }) === 0)?.id || "";
          const rules = postalRule(address.country);
          const postalValid = address.postalCode ? postalIsValid(address.country, address.postalCode) && !postalErrors[address.id] : null;
          return <article key={address.id} className={styles.address}>
            <div className={styles.addressTop}><div><small>CÓDIGO DE DIRECCIÓN</small><strong>{address.code || "Se asignará al guardar"}</strong></div><div className={styles.addressActions}><label className={styles.switch}><input type="checkbox" checked={address.active} onChange={event => updateAddress(index, "active", event.target.checked)} disabled={!canEdit} /> Activa</label>{canEdit && <button type="button" onClick={() => saveAddress(index)} disabled={addressSaving === address.id}>{addressSaving === address.id ? "Guardando…" : "Guardar dirección"}</button>}</div></div>
            <div className={styles.grid3}>
              <label>País<select value={address.country} onChange={event => selectCountry(index, event.target.value)} disabled={!canEdit}><option value="">Seleccionar</option>{countries.map(country => <option key={country.code} value={country.code}>{country.name}</option>)}</select><Check valid={address.country ? true : null} hint="ISO 3166-1 · catálogo mundial" /></label>
              <label>Nombre del centro<input value={address.name} onChange={event => updateAddress(index, "name", event.target.value)} disabled={!canEdit} /></label>
              <label>Provincia / región<select value={selectedKey} onChange={event => selectSubdivision(index, event.target.value)} disabled={!canEdit || !address.country || subdivisionLoading[address.country]}><option value="">{subdivisionLoading[address.country] ? "Cargando…" : subdivisions.length ? "Seleccionar" : "Sin subdivisiones oficiales"}</option>{subdivisions.map(subdivision => <option key={subdivision.id} value={subdivision.id}>{subdivision.code} · {subdivision.name}</option>)}</select><Check valid={subdivisions.length ? Boolean(selectedKey) : address.country ? true : null} hint={selectedKey ? `Clave: ${selectedKey}` : "Selecciona una subdivisión oficial"} /></label>
              <label>CP<input value={address.postalCode} onChange={event => { updateAddress(index, "postalCode", event.target.value.toUpperCase()); setPostalErrors(current => ({ ...current, [address.id]: "" })); }} onBlur={() => resolvePostal(index)} disabled={!canEdit} className={validationClass(postalValid)} /><Check valid={postalValid} hint={postalErrors[address.id] || rules.postalHint} /></label>
              <label>Población<input value={address.city} list={`cities-${address.id}`} onChange={event => updateAddress(index, "city", event.target.value)} disabled={!canEdit} /><datalist id={`cities-${address.id}`}>{(postalPlaces[address.id] ?? []).map(city => <option key={city} value={city} />)}</datalist><Check valid={address.city ? true : null} hint="Puede validarse al salir del código postal" /></label>
              <label>Dirección<input value={address.street} onChange={event => updateAddress(index, "street", event.target.value)} disabled={!canEdit} /><Check valid={address.street ? address.street.trim().length >= 5 : null} hint="Mínimo calle y número" /></label>
              <label>Contacto<input value={address.contact} onChange={event => updateAddress(index, "contact", event.target.value)} disabled={!canEdit} /></label>
              <label>Teléfono<input value={address.phone} onChange={event => updateAddress(index, "phone", event.target.value)} disabled={!canEdit} className={validationClass(address.phone ? phonePattern.test(address.phone) : null)} /><Check valid={address.phone ? phonePattern.test(address.phone) : null} hint="Formato de teléfono válido" /></label>
              <label>Email<input type="email" value={address.email} onChange={event => updateAddress(index, "email", event.target.value)} disabled={!canEdit} className={validationClass(address.email ? emailPattern.test(address.email) : null)} /><Check valid={address.email ? emailPattern.test(address.email) : null} hint="Formato usuario@dominio" /></label>
              <label className={styles.span2}>Restricciones e instrucciones<input value={address.restrictions} onChange={event => updateAddress(index, "restrictions", event.target.value)} disabled={!canEdit} /></label>
            </div>
            <div className={styles.addressConfiguration}>
              <fieldset><legend>Usos operativos</legend><label><input type="checkbox" checked={address.useForPickup} onChange={event => updateAddress(index, "useForPickup", event.target.checked)} disabled={!canEdit} /> Recogida</label><label><input type="checkbox" checked={address.useForDelivery} onChange={event => updateAddress(index, "useForDelivery", event.target.checked)} disabled={!canEdit} /> Entrega</label><label><input type="checkbox" checked={address.isDefaultPickup} onChange={event => updateAddress(index, "isDefaultPickup", event.target.checked)} disabled={!canEdit || !address.useForPickup} /> Predeterminada para recogida</label><label><input type="checkbox" checked={address.isDefaultDelivery} onChange={event => updateAddress(index, "isDefaultDelivery", event.target.checked)} disabled={!canEdit || !address.useForDelivery} /> Predeterminada para entrega</label></fieldset>
              <fieldset><legend>Clientes que pueden utilizarla</legend><div className={styles.assignmentList}>{assignableCustomers.map(customer => <label key={customer.code}><input type="checkbox" checked={address.assignedCustomerCodes.includes(customer.code)} disabled={!canEdit || customer.code === code} onChange={() => toggleAssignedCustomer(index, customer.code)} /><span>{customer.code}<small>{customer.name}</small></span></label>)}</div></fieldset>
              <fieldset className={styles.capabilities}><legend>Capacidades operativas</legend><label><input type="checkbox" checked={address.hasDock} onChange={event => updateAddress(index, "hasDock", event.target.checked)} disabled={!canEdit} /> Muelle</label><label><input type="checkbox" checked={address.needsForklift} onChange={event => updateAddress(index, "needsForklift", event.target.checked)} disabled={!canEdit} /> Carretilla necesaria</label><label><input type="checkbox" checked={address.requiresAppointment} onChange={event => updateAddress(index, "requiresAppointment", event.target.checked)} disabled={!canEdit} /> Cita previa</label><label><input type="checkbox" checked={address.palletExchange} onChange={event => updateAddress(index, "palletExchange", event.target.checked)} disabled={!canEdit} /> Intercambio de palés</label><label><input type="checkbox" checked={address.adrCapable} onChange={event => updateAddress(index, "adrCapable", event.target.checked)} disabled={!canEdit} /> Preparada para ADR</label><label><input type="checkbox" checked={address.temperatureControlled} onChange={event => updateAddress(index, "temperatureControlled", event.target.checked)} disabled={!canEdit} /> Temperatura controlada</label><label>Temperatura mínima<input inputMode="decimal" value={address.temperatureMin} onChange={event => updateAddress(index, "temperatureMin", event.target.value)} disabled={!canEdit || !address.temperatureControlled} /></label><label>Temperatura máxima<input inputMode="decimal" value={address.temperatureMax} onChange={event => updateAddress(index, "temperatureMax", event.target.value)} disabled={!canEdit || !address.temperatureControlled} /></label><label>Radio geocerca (m)<input inputMode="numeric" value={address.geofenceRadiusM} onChange={event => updateAddress(index, "geofenceRadiusM", event.target.value)} disabled={!canEdit} /></label><label>Espera media (min)<input inputMode="numeric" value={address.averageWaitMinutes} onChange={event => updateAddress(index, "averageWaitMinutes", event.target.value)} disabled={!canEdit} /></label></fieldset>
            </div>
          </article>;
        })}</div>
        {!addressesLoading && !addresses.length && <div className={styles.empty}>{isNew ? "Guarda primero la empresa. Después podrás añadir sus direcciones." : "Esta empresa todavía no tiene direcciones. Puedes guardar la ficha sin direcciones y añadirlas cuando corresponda."}</div>}
      </section>

      <section className={styles.card}><div className={styles.cardTitle}><span>04</span><div><h2>Notas y control</h2><p>Información interna y trazabilidad del maestro.</p></div></div><label>Observaciones<textarea value={notes} onChange={event => setNotes(event.target.value)} rows={5} disabled={!canEdit} /></label></section>

      {formErrors.length > 0 && <div className={styles.notice} role="alert"><strong>No se puede guardar todavía:</strong><ul>{formErrors.map(error => <li key={error}>{error}</li>)}</ul></div>}
      {notice && <div className={styles.notice} role="status">{notice}</div>}
      <div className={styles.footerActions}><Link href="/dashboard/clientes">Cancelar</Link><button disabled={savingCustomer || !canEdit}>{savingCustomer ? "Guardando…" : "Guardar ficha"}</button></div>
    </form>
  </main>;
}
