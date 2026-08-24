"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { defaultAdrDeclaration, evaluateAdrWarnings, shouldBlockForPolicy, type AdrDeclaration, type AdrFrequency, type AdrPolicy, type HazardStatus } from "@/lib/adr";
import styles from "./partida-form.module.css";

export type CustomerOption = { code: string; name: string; adrControl: boolean; adrFrequency: AdrFrequency; adrPolicy: AdrPolicy; preferredClasses: string[] };
export type AddressOption = {
  id: string; code: string; name: string; address: string; postalCode: string; city: string; countryCode: string; partyCode: string;
  assignments: Array<{ customerCode: string; useForPickup: boolean; useForDelivery: boolean }>;
};
export type ServiceOption = { code: string; name: string };

type SaveMode = "new" | "keep" | "exit";
type PackagingOption = { id: string; packing_instruction_code?: string | null; packaging_type?: { id: string; code: string; name_es: string; family: string } | null };
type HazmatEntry = {
  id: string; entry_key: string; un_number: string; proper_shipping_name_es: string; class_code: string;
  subsidiary_risks: string[]; packing_group: string | null; hazard_identification_number: string | null;
  tunnel_restriction_code: string | null; limited_quantity_value: number | null; limited_quantity_uom: string | null;
  excepted_quantity_code: string | null; transport_category: number | null; technical_name_required: boolean;
  environmentally_hazardous: boolean | null; edition?: { code: string; status: string } | null;
  hazmat_entry_packaging_options?: PackagingOption[];
};
type GoodsLine = {
  key: string; sku: string; description: string; hazardStatus: HazardStatus; hazmatEntry: HazmatEntry | null;
  technicalName: string; netQuantity: string; quantityUom: string; packageCount: string; packagingTypeId: string;
  rememberForProduct: boolean; articleMessage: string;
};

function newLine(): GoodsLine {
  return { key: crypto.randomUUID(), sku: "", description: "", hazardStatus: "UNKNOWN", hazmatEntry: null, technicalName: "", netQuantity: "", quantityUom: "kg", packageCount: "", packagingTypeId: "", rememberForProduct: false, articleMessage: "" };
}

function normalizeDecimal(raw: string) {
  let value = raw.trim().replace(/\s/g, "");
  if (!value) return "";
  const comma = value.lastIndexOf(",");
  const dot = value.lastIndexOf(".");
  if (comma >= 0 && dot >= 0) {
    const decimal = Math.max(comma, dot);
    value = `${value.slice(0, decimal).replace(/[.,]/g, "")}.${value.slice(decimal + 1).replace(/[.,]/g, "")}`;
  } else if (comma >= 0) value = value.replace(/\./g, "").replace(",", ".");
  return /^\d+(\.\d+)?$/.test(value) ? value : "";
}

export default function PartidaForm({ customers, addresses, services, readOnly = false }: {
  customers: CustomerOption[]; addresses: AddressOption[]; services: ServiceOption[]; readOnly?: boolean;
}) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const keepRef = useRef<HTMLButtonElement>(null);
  const exitRef = useRef<HTMLButtonElement>(null);
  const [customerCode, setCustomerCode] = useState("");
  const [reference, setReference] = useState("");
  const [serviceCode, setServiceCode] = useState("");
  const [requestedDate, setRequestedDate] = useState("");
  const [pickupAddressId, setPickupAddressId] = useState("");
  const [deliveryAddressId, setDeliveryAddressId] = useState("");
  const [packages, setPackages] = useState("");
  const [weight, setWeight] = useState("");
  const [volume, setVolume] = useState("");
  const [linearMeters, setLinearMeters] = useState("");
  const [goodsDescription, setGoodsDescription] = useState("");
  const [adrDeclaration, setAdrDeclaration] = useState<AdrDeclaration>("UNANSWERED");
  const [lines, setLines] = useState<GoodsLine[]>(() => [newLine()]);
  const [searchLine, setSearchLine] = useState<string | null>(null);
  const [hazmatQuery, setHazmatQuery] = useState("");
  const [hazmatResults, setHazmatResults] = useState<HazmatEntry[]>([]);
  const [searching, setSearching] = useState(false);
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [lastFingerprint, setLastFingerprint] = useState("");

  const customer = useMemo(() => customers.find(item => item.code === customerCode), [customers, customerCode]);
  const pickup = useMemo(() => addresses.find(item => item.id === pickupAddressId), [addresses, pickupAddressId]);
  const delivery = useMemo(() => addresses.find(item => item.id === deliveryAddressId), [addresses, deliveryAddressId]);
  const pickupOptions = useMemo(() => addresses.filter(item => item.assignments.some(assignment => assignment.customerCode === customerCode && assignment.useForPickup)), [addresses, customerCode]);
  const deliveryOptions = useMemo(() => addresses.filter(item => item.assignments.some(assignment => assignment.customerCode === customerCode && assignment.useForDelivery)), [addresses, customerCode]);
  const adrWarnings = useMemo(() => evaluateAdrWarnings(adrDeclaration, customer?.adrFrequency ?? "NEVER", lines.map(line => ({
    sku: line.sku, description: line.description, hazardStatus: line.hazardStatus, hazmatEntryId: line.hazmatEntry?.id,
    technicalName: line.technicalName, netQuantity: Number(normalizeDecimal(line.netQuantity)) || null,
    quantityUom: line.quantityUom, packageCount: Number(line.packageCount) || null,
    packagingTypeId: line.packagingTypeId, rememberForProduct: line.rememberForProduct,
  }))), [adrDeclaration, customer, lines]);

  useEffect(() => {
    setPickupAddressId("");
    setDeliveryAddressId("");
    setAdrDeclaration(customer ? defaultAdrDeclaration(customer.adrFrequency) : "UNANSWERED");
  }, [customer]);
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.repeat || readOnly) return;
      if (event.key === "F4") { event.preventDefault(); keepRef.current?.click(); }
      if (event.key === "F2") { event.preventDefault(); exitRef.current?.click(); }
    }
    window.addEventListener("keydown", onKeyDown, { capture: true });
    return () => window.removeEventListener("keydown", onKeyDown, { capture: true });
  }, [readOnly]);

  function updateLine(key: string, patch: Partial<GoodsLine>) { setLines(current => current.map(line => line.key === key ? { ...line, ...patch } : line)); }

  async function lookupArticle(line: GoodsLine) {
    if (!customer || !line.sku.trim()) return;
    updateLine(line.key, { articleMessage: "Consultando maestro de artículos…" });
    try {
      const response = await fetch(`/api/products/lookup?customerCode=${encodeURIComponent(customer.code)}&sku=${encodeURIComponent(line.sku)}`, { cache: "no-store" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "No se pudo consultar el artículo.");
      if (!result.item) return updateLine(line.key, { articleMessage: "Artículo nuevo para este cliente. Puedes recordar su clasificación al guardar." });
      updateLine(line.key, { description: line.description || result.item.name, hazardStatus: result.item.hazardStatus, hazmatEntry: result.item.hazmatEntry, articleMessage: result.item.hazmatEntry ? `Clasificación heredada del artículo · ${result.item.assignmentStatus}` : "Artículo conocido sin clasificación ADR enlazada." });
    } catch (error) { updateLine(line.key, { articleMessage: error instanceof Error ? error.message : "No se pudo consultar el artículo." }); }
  }

  async function searchHazmat() {
    if (hazmatQuery.trim().length < 2) return setHazmatResults([]);
    setSearching(true);
    try {
      const response = await fetch(`/api/hazmat/search?q=${encodeURIComponent(hazmatQuery)}`, { cache: "no-store" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "No se pudo consultar el maestro ADR.");
      setHazmatResults(result.items || []);
    } catch (error) { setMessage(error instanceof Error ? error.message : "No se pudo consultar el maestro ADR."); }
    finally { setSearching(false); }
  }

  function chooseHazmat(entry: HazmatEntry) {
    if (!searchLine) return;
    updateLine(searchLine, { hazardStatus: "HAZMAT", hazmatEntry: entry, packagingTypeId: "" });
    setSearchLine(null); setHazmatResults([]); setHazmatQuery("");
  }

  function resetForm() {
    setCustomerCode(""); setReference(""); setServiceCode(""); setRequestedDate(""); setPickupAddressId(""); setDeliveryAddressId("");
    setPackages(""); setWeight(""); setVolume(""); setLinearMeters(""); setGoodsDescription("");
    setAdrDeclaration("UNANSWERED"); setLines([newLine()]); setLastFingerprint("");
    window.setTimeout(() => formRef.current?.querySelector<HTMLInputElement>('input[name="customerCode"]')?.focus(), 0);
  }

  function payload() {
    return {
      customerCode, customerReference: reference, serviceCode, requestedDate,
      pickupAddressId, deliveryAddressId, pickupCode: pickup?.code ?? "", deliveryCode: delivery?.code ?? "",
      pickupAddress: pickup?.address ?? "", pickupCountry: pickup?.countryCode ?? "", pickupPostalCode: pickup?.postalCode ?? "", pickupZone: pickup?.postalCode.slice(0, 2) ?? "", shipper: pickup?.partyCode ?? "",
      deliveryAddress: delivery?.address ?? "", deliveryCountry: delivery?.countryCode ?? "", deliveryPostalCode: delivery?.postalCode ?? "", deliveryZone: delivery?.postalCode.slice(0, 2) ?? "", consignee: delivery?.partyCode ?? "",
      packages, grossWeight: normalizeDecimal(weight), volume: normalizeDecimal(volume), linearMeters: normalizeDecimal(linearMeters), goodsDescription, adrDeclaration,
      lines: lines.map(line => ({ sku: line.sku.trim().toUpperCase() || null, description: line.description.trim() || goodsDescription.trim() || "Mercancía sin descripción", hazardStatus: line.hazardStatus, hazmatEntryId: line.hazmatEntry?.id ?? null, technicalName: line.technicalName.trim() || null, netQuantity: normalizeDecimal(line.netQuantity) || null, quantityUom: line.quantityUom || null, packageCount: line.packageCount ? Number(line.packageCount) : null, packagingTypeId: line.packagingTypeId || null, rememberForProduct: line.rememberForProduct })),
      adrWarnings,
    };
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (readOnly) return setMessage("Modo revisión: solo lectura.");
    const mode = ((((event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null)?.value || "keep") as SaveMode);
    if (!customer) return setMessage("Selecciona un Customer ID válido.");
    if (!serviceCode) return setMessage("Selecciona un servicio.");
    if (!pickup || !delivery) return setMessage("Selecciona puntos de recogida y entrega válidos.");
    if (!packages || Number(packages) < 1 || !normalizeDecimal(weight)) return setMessage("Bultos y peso son obligatorios y deben ser válidos.");
    if (shouldBlockForPolicy(customer.adrPolicy, adrWarnings)) return setMessage(`La política ADR de este cliente bloquea la confirmación: ${adrWarnings[0]?.message}`);
    if (customer.adrPolicy === "ACKNOWLEDGEMENT" && adrWarnings.length && !window.confirm(`Hay ${adrWarnings.length} advertencia(s) ADR. ¿Quieres guardar y dejar constancia?`)) return;
    const body = payload();
    const fingerprint = JSON.stringify(body);
    if (mode === "keep" && fingerprint === lastFingerprint && !window.confirm("No has modificado ningún dato. ¿Crear otra partida idéntica?")) return setMessage("Guardado cancelado.");
    setSaving(true); setMessage("");
    try {
      const response = await fetch("/api/orders", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "No se pudo guardar la partida.");
      const code = result.item?.id ?? "Partida";
      if (mode === "exit") { router.push("/dashboard/partidas"); router.refresh(); return; }
      if (mode === "new") { resetForm(); setMessage(`${code} creada. Formulario preparado para una nueva partida.`); }
      else { setLastFingerprint(fingerprint); setMessage(`${code} creada con ${result.item?.adrWarnings ?? 0} advertencia(s) ADR registradas.`); }
      router.refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : "No se pudo guardar la partida."); }
    finally { setSaving(false); }
  }

  return <form ref={formRef} className={styles.form} onSubmit={submit}>
    <section className={styles.card}><div className={styles.cardHeader}><div><p>CLIENTE Y SERVICIO</p><h2>Datos del pedido</h2></div><span>Persistencia canónica</span></div><div className={styles.grid}>
      <label>Customer ID maestro<input autoFocus name="customerCode" value={customerCode} onChange={event => setCustomerCode(event.target.value.toUpperCase())} list="canonical-customers" required placeholder="CLI-000146" /></label><datalist id="canonical-customers">{customers.map(item => <option key={item.code} value={item.code}>{item.name}</option>)}</datalist>
      <label>Cliente<input value={customer?.name ?? ""} readOnly placeholder="Se completa desde el maestro" /></label><label>Referencia cliente<input value={reference} onChange={event => setReference(event.target.value)} /></label>
      <label>Servicio<select required value={serviceCode} className={!serviceCode ? styles.placeholderControl : ""} onChange={event => setServiceCode(event.target.value)}><option value="" disabled>Seleccionar</option>{services.map(item => <option key={item.code} value={item.code}>{item.name === item.code ? item.name : `${item.name} · ${item.code}`}</option>)}</select></label><label>Fecha prevista<input type="date" value={requestedDate} onChange={event => setRequestedDate(event.target.value)} /></label>
      <div className={styles.field}><label htmlFor="partida-adr-profile">Perfil ADR</label><input id="partida-adr-profile" value={customer ? ({ NEVER: "Nunca", SOMETIMES: "A veces", ALWAYS: "Siempre" }[customer.adrFrequency]) : ""} readOnly placeholder="Selecciona primero el cliente" />{customer ? <Link className={styles.fieldHelp} href={`/dashboard/registros/clientes/${encodeURIComponent(customer.code)}#control-adr`}>{customer.preferredClasses.length ? `Clases habituales: ${customer.preferredClasses.join(", ")} · Configurar` : "Sin clases habituales configuradas · Configurar"}</Link> : <span className={styles.fieldHelpPlaceholder}>Selecciona un cliente para consultar su configuración</span>}</div>
    </div></section>

    <section className={styles.card}><div className={styles.cardHeader}><div><p>RUTA</p><h2>Recogida y entrega</h2></div></div><div className={styles.grid}>
      <label>Punto de recogida<select value={pickupAddressId} required disabled={!customer} className={!pickupAddressId ? styles.placeholderControl : ""} onChange={event => setPickupAddressId(event.target.value)}><option value="" disabled>Seleccionar</option>{pickupOptions.map(item => <option key={item.id} value={item.id}>{item.code} · {item.name} · {item.city}</option>)}</select></label>
      <label>Punto de entrega<select value={deliveryAddressId} required disabled={!customer} className={!deliveryAddressId ? styles.placeholderControl : ""} onChange={event => setDeliveryAddressId(event.target.value)}><option value="" disabled>Seleccionar</option>{deliveryOptions.map(item => <option key={item.id} value={item.id}>{item.code} · {item.name} · {item.city}</option>)}</select></label>
      <label>Dirección recogida<input value={pickup ? `${pickup.address} · ${pickup.postalCode} ${pickup.city} · ${pickup.countryCode}` : ""} readOnly /></label><label>Dirección entrega<input value={delivery ? `${delivery.address} · ${delivery.postalCode} ${delivery.city} · ${delivery.countryCode}` : ""} readOnly /></label>
      {customer && (!pickupOptions.length || !deliveryOptions.length) && <Link className={styles.routeHelp} href={`/dashboard/registros/clientes/${encodeURIComponent(customer.code)}#direcciones`}>Faltan direcciones operativas para este cliente · Ir al maestro de direcciones</Link>}
    </div></section>

    <section className={styles.card}><div className={styles.cardHeader}><div><p>MERCANCÍA</p><h2>Magnitudes generales</h2></div></div><div className={styles.grid}>
      <label>Bultos totales<input type="number" min="1" step="1" value={packages} onChange={event => setPackages(event.target.value.replace(/\D/g, ""))} required /></label><label>Peso total (kg)<input inputMode="decimal" value={weight} onChange={event => setWeight(event.target.value.replace(/[^0-9.,]/g, ""))} required placeholder="0,00" /></label>
      <label>Volumen (m³)<input inputMode="decimal" value={volume} onChange={event => setVolume(event.target.value.replace(/[^0-9.,]/g, ""))} placeholder="0,00" /></label><label>Metros lineales<input inputMode="decimal" value={linearMeters} onChange={event => setLinearMeters(event.target.value.replace(/[^0-9.,]/g, ""))} placeholder="0,00" /></label>
      <label className={styles.wide}>Descripción general<input value={goodsDescription} onChange={event => setGoodsDescription(event.target.value)} placeholder="Resumen operativo de la mercancía" /></label>
    </div></section>

    <section className={styles.card}><div className={styles.cardHeader}><div><p>CLASIFICACIÓN</p><h2>Mercancías peligrosas</h2></div><span>{adrWarnings.length ? `${adrWarnings.length} avisos` : "Sin avisos"}</span></div>
      <div className={styles.adrChoice}><button type="button" className={adrDeclaration === "NO" ? styles.selected : ""} onClick={() => setAdrDeclaration("NO")}>No contiene ADR</button><button type="button" className={adrDeclaration === "YES" ? styles.selected : ""} onClick={() => setAdrDeclaration("YES")}>Sí contiene ADR</button></div>
      {customer?.adrFrequency === "ALWAYS" && <p className={styles.hint}>Este cliente declara envíos ADR habitualmente. Puedes cambiar la decisión si este pedido es una excepción.</p>}
      {customer?.adrFrequency === "SOMETIMES" && adrDeclaration === "UNANSWERED" && <p className={styles.warning}>Este cliente requiere decidir expresamente si el pedido contiene ADR.</p>}
      {adrDeclaration === "YES" && <div className={styles.lines}>{lines.map((line, index) => <article className={styles.lineCard} key={line.key}>
        <div className={styles.lineHeader}><strong>Línea {index + 1}</strong>{lines.length > 1 && <button type="button" onClick={() => setLines(current => current.filter(item => item.key !== line.key))}>Eliminar</button>}</div>
        <div className={styles.grid}><label>SKU del cliente<input value={line.sku} onChange={event => updateLine(line.key, { sku: event.target.value.toUpperCase(), articleMessage: "" })} onBlur={() => lookupArticle(line)} placeholder="Referencia del artículo" /></label><label>Artículo / mercancía<input value={line.description} onChange={event => updateLine(line.key, { description: event.target.value })} placeholder="Descripción concreta" /></label></div>
        {line.articleMessage && <p className={styles.hint}>{line.articleMessage}</p>}
        <div className={styles.lineChoice}><button type="button" className={line.hazardStatus === "NON_HAZARDOUS" ? styles.selected : ""} onClick={() => updateLine(line.key, { hazardStatus: "NON_HAZARDOUS", hazmatEntry: null })}>No peligrosa</button><button type="button" className={line.hazardStatus === "HAZMAT" ? styles.selected : ""} onClick={() => { updateLine(line.key, { hazardStatus: "HAZMAT" }); setSearchLine(line.key); }}>Peligrosa</button></div>
        {line.hazardStatus === "HAZMAT" && <>{line.hazmatEntry ? <div className={styles.adrSummary}><div><small>{line.hazmatEntry.edition?.code ?? "ADR"}</small><strong>UN {line.hazmatEntry.un_number} · {line.hazmatEntry.proper_shipping_name_es}</strong><span>Clase {line.hazmatEntry.class_code}{line.hazmatEntry.packing_group ? ` · GE ${line.hazmatEntry.packing_group}` : ""}{line.hazmatEntry.tunnel_restriction_code ? ` · Túnel ${line.hazmatEntry.tunnel_restriction_code}` : ""}</span></div><button type="button" onClick={() => setSearchLine(line.key)}>Cambiar</button></div> : <button type="button" className={styles.searchButton} onClick={() => setSearchLine(line.key)}>Buscar en maestro ADR verificado</button>}
          {line.hazmatEntry?.technical_name_required && <label className={styles.singleLabel}>Nombre técnico obligatorio<input value={line.technicalName} onChange={event => updateLine(line.key, { technicalName: event.target.value })} placeholder="Composición técnica que justifica la clasificación" /></label>}
          <div className={styles.grid}><label>Cantidad neta<input inputMode="decimal" value={line.netQuantity} onChange={event => updateLine(line.key, { netQuantity: event.target.value.replace(/[^0-9.,]/g, "") })} /></label><label>Unidad<select value={line.quantityUom} onChange={event => updateLine(line.key, { quantityUom: event.target.value })}><option value="kg">kg</option><option value="L">L</option><option value="g">g</option><option value="ml">ml</option></select></label><label>Número de bultos<input type="number" min="0" value={line.packageCount} onChange={event => updateLine(line.key, { packageCount: event.target.value.replace(/\D/g, "") })} /></label><label>Embalaje ADR<select value={line.packagingTypeId} onChange={event => updateLine(line.key, { packagingTypeId: event.target.value })}><option value="">Pendiente de seleccionar</option>{(line.hazmatEntry?.hazmat_entry_packaging_options ?? []).map(option => option.packaging_type && <option key={option.id} value={option.packaging_type.id}>{option.packaging_type.code} · {option.packaging_type.name_es}</option>)}</select></label></div>
          {line.sku && line.hazmatEntry && <label className={styles.remember}><input type="checkbox" checked={line.rememberForProduct} onChange={event => updateLine(line.key, { rememberForProduct: event.target.checked })} /> Recordar esta clasificación para el artículo y cliente</label>}
        </>}
      </article>)}<button type="button" className={styles.addLine} onClick={() => setLines(current => [...current, newLine()])}>+ Añadir línea de mercancía</button></div>}
      {adrWarnings.length > 0 && <div className={styles.warningList}><strong>Revisión ADR</strong>{adrWarnings.map((warning, index) => <p key={`${warning.code}-${index}`}>{warning.message}</p>)}<small>Se guardarán como advertencias auditadas. La política del cliente decide si bloquean.</small></div>}
    </section>

    {searchLine && <div className={styles.modalBackdrop} role="presentation" onMouseDown={() => setSearchLine(null)}><section className={styles.modal} role="dialog" aria-modal="true" aria-label="Buscar clasificación ADR" onMouseDown={event => event.stopPropagation()}><div className={styles.modalHeader}><div><p>MAESTRO OFICIAL</p><h2>Clasificar mercancía</h2></div><button type="button" onClick={() => setSearchLine(null)}>Cerrar</button></div><div className={styles.searchRow}><input autoFocus value={hazmatQuery} onChange={event => setHazmatQuery(event.target.value)} onKeyDown={event => event.key === "Enter" && (event.preventDefault(), searchHazmat())} placeholder="Número ONU o designación oficial" /><button type="button" onClick={searchHazmat} disabled={searching}>{searching ? "Buscando…" : "Buscar"}</button></div>{hazmatResults.length ? <div className={styles.results}>{hazmatResults.map(entry => <button type="button" key={entry.id} onClick={() => chooseHazmat(entry)}><strong>UN {entry.un_number}</strong><span>{entry.proper_shipping_name_es}</span><small>Clase {entry.class_code}{entry.packing_group ? ` · GE ${entry.packing_group}` : ""} · {entry.edition?.code}</small></button>)}</div> : <p className={styles.empty}>Busca sobre ediciones ADR activadas por un administrador. Si no hay resultados, el pedido puede conservarse con advertencia para revisión.</p>}</section></div>}

    {message && <p className={styles.message}>{message}</p>}
    <div className={styles.saveBar}><Link href="/dashboard/partidas">Volver</Link><div className={styles.saveActions}><button type="submit" name="saveMode" value="new" className={styles.secondary} disabled={saving || readOnly}>Guardar y nueva</button><button ref={keepRef} type="submit" name="saveMode" value="keep" disabled={saving || readOnly}>Guardar y mantener <kbd>F4</kbd></button><button ref={exitRef} type="submit" name="saveMode" value="exit" disabled={saving || readOnly}>Guardar y salir <kbd>F2</kbd></button></div></div>
  </form>;
}
