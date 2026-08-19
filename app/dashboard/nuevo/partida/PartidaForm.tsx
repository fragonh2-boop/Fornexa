"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import styles from "./partida-form.module.css";

export type CustomerOption = { code: string; name: string; adrControl: boolean };
export type AddressOption = { code: string; name: string; address: string; postalCode: string; city: string; countryCode: string; partyCode: string };
export type ServiceOption = { code: string; name: string };

type SaveMode = "new" | "keep" | "exit";
type AdrFlag = "" | "S" | "N";

function normalizeDecimal(raw: string) {
  let value = raw.trim().replace(/\s/g, "");
  if (!value) return "";
  const comma = value.lastIndexOf(",");
  const dot = value.lastIndexOf(".");
  if (comma >= 0 && dot >= 0) {
    const decimal = Math.max(comma, dot);
    value = `${value.slice(0, decimal).replace(/[.,]/g, "")}.${value.slice(decimal + 1).replace(/[.,]/g, "")}`;
  } else if (comma >= 0) {
    value = value.replace(/\./g, "").replace(",", ".");
  } else if (dot >= 0) {
    const parts = value.split(".");
    if (parts.length > 2) value = `${parts.slice(0, -1).join("")}.${parts.at(-1)}`;
  }
  return /^\d+(\.\d+)?$/.test(value) ? value : "";
}

export default function PartidaForm({
  customers,
  addresses,
  services,
  readOnly = false,
}: {
  customers: CustomerOption[];
  addresses: AddressOption[];
  services: ServiceOption[];
  readOnly?: boolean;
}) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const keepRef = useRef<HTMLButtonElement>(null);
  const exitRef = useRef<HTMLButtonElement>(null);
  const [customerCode, setCustomerCode] = useState("");
  const [reference, setReference] = useState("");
  const [serviceCode, setServiceCode] = useState(services.find(item => item.code === "GROUPAGE")?.code ?? services[0]?.code ?? "");
  const [requestedDate, setRequestedDate] = useState("");
  const [pickupCode, setPickupCode] = useState("");
  const [deliveryCode, setDeliveryCode] = useState("");
  const [packages, setPackages] = useState("");
  const [weight, setWeight] = useState("");
  const [volume, setVolume] = useState("");
  const [linearMeters, setLinearMeters] = useState("");
  const [goodsDescription, setGoodsDescription] = useState("");
  const [adr, setAdr] = useState<AdrFlag>("");
  const [adrRegime, setAdrRegime] = useState("");
  const [unNumber, setUnNumber] = useState("");
  const [adrClass, setAdrClass] = useState("");
  const [packingGroup, setPackingGroup] = useState("");
  const [tunnelCode, setTunnelCode] = useState("");
  const [adrDescription, setAdrDescription] = useState("");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [lastFingerprint, setLastFingerprint] = useState("");

  const customer = useMemo(() => customers.find(item => item.code === customerCode), [customers, customerCode]);
  const pickup = useMemo(() => addresses.find(item => item.code === pickupCode), [addresses, pickupCode]);
  const delivery = useMemo(() => addresses.find(item => item.code === deliveryCode), [addresses, deliveryCode]);
  const pickupOptions = useMemo(() => addresses.filter(item => item.code.startsWith("REC-")), [addresses]);
  const deliveryOptions = useMemo(() => addresses.filter(item => item.code.startsWith("ENT-")), [addresses]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.repeat || readOnly) return;
      if (event.key === "F4") {
        event.preventDefault();
        keepRef.current?.click();
      }
      if (event.key === "F2") {
        event.preventDefault();
        exitRef.current?.click();
      }
    }
    window.addEventListener("keydown", onKeyDown, { capture: true });
    return () => window.removeEventListener("keydown", onKeyDown, { capture: true });
  }, [readOnly]);

  function resetForm() {
    setCustomerCode("");
    setReference("");
    setServiceCode(services.find(item => item.code === "GROUPAGE")?.code ?? services[0]?.code ?? "");
    setRequestedDate("");
    setPickupCode("");
    setDeliveryCode("");
    setPackages("");
    setWeight("");
    setVolume("");
    setLinearMeters("");
    setGoodsDescription("");
    setAdr("");
    setAdrRegime("");
    setUnNumber("");
    setAdrClass("");
    setPackingGroup("");
    setTunnelCode("");
    setAdrDescription("");
    setLastFingerprint("");
    window.setTimeout(() => formRef.current?.querySelector<HTMLInputElement>('input[name="customerCode"]')?.focus(), 0);
  }

  function payload() {
    return {
      customerCode,
      customerReference: reference,
      serviceCode,
      requestedDate,
      pickupCode,
      deliveryCode,
      pickupAddress: pickup?.address ?? "",
      pickupCountry: pickup?.countryCode ?? "",
      pickupPostalCode: pickup?.postalCode ?? "",
      pickupZone: pickup?.postalCode.slice(0, 2) ?? "",
      shipper: pickup?.partyCode ?? "",
      deliveryAddress: delivery?.address ?? "",
      deliveryCountry: delivery?.countryCode ?? "",
      deliveryPostalCode: delivery?.postalCode ?? "",
      deliveryZone: delivery?.postalCode.slice(0, 2) ?? "",
      consignee: delivery?.partyCode ?? "",
      packages,
      grossWeight: normalizeDecimal(weight),
      volume: normalizeDecimal(volume),
      linearMeters: normalizeDecimal(linearMeters),
      goodsDescription,
      adr,
      adrRegime: adr === "S" ? adrRegime : "",
      unNumber: adr === "S" ? unNumber : "",
      adrClass: adr === "S" ? adrClass : "",
      packingGroup: adr === "S" ? packingGroup : "",
      tunnelCode: adr === "S" ? tunnelCode : "",
      adrDescription: adr === "S" ? adrDescription : "",
    };
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (readOnly) return setMessage("Modo revisión: solo lectura.");
    const submitter = (event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
    const mode = (submitter?.value || "keep") as SaveMode;
    if (!customer) return setMessage("Selecciona un Customer ID válido.");
    if (!pickup || !delivery) return setMessage("Selecciona un punto de recogida y un punto de entrega válidos.");
    if (!packages || Number(packages) < 1 || !normalizeDecimal(weight)) return setMessage("Bultos y peso son obligatorios y deben ser válidos.");
    if (customer.adrControl && !adr) return setMessage("Este cliente exige declarar expresamente ADR S/N.");
    if (adr === "S" && !adrRegime) return setMessage("Selecciona el régimen ADR aplicable.");

    const body = payload();
    const fingerprint = JSON.stringify(body);
    if (mode === "keep" && fingerprint === lastFingerprint && !window.confirm("No has modificado ningún dato. ¿Crear otra partida idéntica?")) {
      return setMessage("Guardado cancelado.");
    }

    setSaving(true);
    setMessage("");
    try {
      const response = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "No se pudo guardar la partida.");
      const code = result.item?.id ?? "Partida";

      if (mode === "exit") {
        router.push("/dashboard/partidas");
        router.refresh();
        return;
      }
      if (mode === "new") {
        resetForm();
        setMessage(`${code} creada. Formulario preparado para una nueva partida.`);
      } else {
        setLastFingerprint(fingerprint);
        setMessage(`${code} creada y persistida en FORNEXA.`);
      }
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No se pudo guardar la partida.");
    } finally {
      setSaving(false);
    }
  }

  return <form ref={formRef} className={styles.form} onSubmit={submit}>
    <section className={styles.card}>
      <div className={styles.cardHeader}><div><p>CLIENTE Y SERVICIO</p><h2>Datos del pedido</h2></div><span>Persistencia canónica</span></div>
      <div className={styles.grid}>
        <label>Customer ID maestro<input autoFocus name="customerCode" value={customerCode} onChange={event => setCustomerCode(event.target.value.toUpperCase())} list="canonical-customers" required placeholder="CLI-000146" /></label>
        <datalist id="canonical-customers">{customers.map(item => <option key={item.code} value={item.code}>{item.name}</option>)}</datalist>
        <label>Cliente<input value={customer?.name ?? ""} readOnly placeholder="Se completa desde el maestro" /></label>
        <label>Referencia cliente<input value={reference} onChange={event => setReference(event.target.value)} /></label>
        <label>Servicio<select value={serviceCode} onChange={event => setServiceCode(event.target.value)}>{services.map(item => <option key={item.code} value={item.code}>{item.name} · {item.code}</option>)}</select></label>
        <label>Fecha prevista<input type="date" value={requestedDate} onChange={event => setRequestedDate(event.target.value)} /></label>
        <label>Control ADR cliente<input value={customer ? (customer.adrControl ? "S" : "N") : "—"} readOnly /><small>{customer?.adrControl ? "ADR S/N obligatorio para este cliente." : "Declaración ADR opcional."}</small></label>
      </div>
    </section>

    <section className={styles.card}>
      <div className={styles.cardHeader}><div><p>RUTA</p><h2>Recogida y entrega</h2></div></div>
      <div className={styles.grid}>
        <label>Código punto de recogida<input value={pickupCode} onChange={event => setPickupCode(event.target.value.toUpperCase())} list="canonical-pickups" required placeholder="REC-001" /></label>
        <datalist id="canonical-pickups">{pickupOptions.map(item => <option key={item.code} value={item.code}>{item.name} · {item.city}</option>)}</datalist>
        <label>Código punto de entrega<input value={deliveryCode} onChange={event => setDeliveryCode(event.target.value.toUpperCase())} list="canonical-deliveries" required placeholder="ENT-001" /></label>
        <datalist id="canonical-deliveries">{deliveryOptions.map(item => <option key={item.code} value={item.code}>{item.name} · {item.city}</option>)}</datalist>
        <label>Dirección recogida<input value={pickup ? `${pickup.address} · ${pickup.postalCode} ${pickup.city} · ${pickup.countryCode}` : ""} readOnly /></label>
        <label>Dirección entrega<input value={delivery ? `${delivery.address} · ${delivery.postalCode} ${delivery.city} · ${delivery.countryCode}` : ""} readOnly /></label>
        <label>Remitente<input value={pickup?.partyCode ?? ""} readOnly /></label>
        <label>Destinatario<input value={delivery?.partyCode ?? ""} readOnly /></label>
      </div>
    </section>

    <section className={styles.card}>
      <div className={styles.cardHeader}><div><p>MERCANCÍA</p><h2>Magnitudes y ADR</h2></div></div>
      <div className={styles.grid}>
        <label>Bultos / embalaje<input type="number" min="1" step="1" value={packages} onChange={event => setPackages(event.target.value.replace(/\D/g, ""))} required /></label>
        <label>Peso total (kg)<input inputMode="decimal" value={weight} onChange={event => setWeight(event.target.value.replace(/[^0-9.,]/g, ""))} required placeholder="0,00" /></label>
        <label>Volumen (m³)<input inputMode="decimal" value={volume} onChange={event => setVolume(event.target.value.replace(/[^0-9.,]/g, ""))} placeholder="0,00" /></label>
        <label>Metros lineales<input inputMode="decimal" value={linearMeters} onChange={event => setLinearMeters(event.target.value.replace(/[^0-9.,]/g, ""))} placeholder="0,00" /></label>
        <label className={styles.wide}>Descripción mercancía<input value={goodsDescription} onChange={event => setGoodsDescription(event.target.value)} placeholder="Descripción operativa de la mercancía" /></label>
        <label>¿Mercancía ADR?<select value={adr} onChange={event => { const next = event.target.value as AdrFlag; setAdr(next); if (next !== "S") setAdrRegime(""); }} required={Boolean(customer?.adrControl)}><option value="">Sin declarar</option><option value="N">N · No ADR</option><option value="S">S · ADR</option></select></label>
        {adr === "S" && <>
          <label>Régimen ADR<select value={adrRegime} onChange={event => setAdrRegime(event.target.value)} required><option value="">Seleccionar…</option><option value="COMPLETO">ADR completo</option><option value="1.1.3.6">1.1.3.6 · Exención parcial</option><option value="LQ">LQ · Cantidades limitadas</option><option value="EQ">EQ · Cantidades exceptuadas</option><option value="1.1.3">1.1.3 · Exención</option></select></label>
          <label>Número ONU<input value={unNumber} onChange={event => setUnNumber(event.target.value.toUpperCase())} placeholder="UN 1263" /></label>
          <label>Clase ADR<input value={adrClass} onChange={event => setAdrClass(event.target.value)} placeholder="3" /></label>
          <label>Grupo de embalaje<input value={packingGroup} onChange={event => setPackingGroup(event.target.value.toUpperCase())} placeholder="II" /></label>
          <label>Código túnel<input value={tunnelCode} onChange={event => setTunnelCode(event.target.value.toUpperCase())} placeholder="D/E" /></label>
          <label className={styles.wide}>Designación / descripción ADR<input value={adrDescription} onChange={event => setAdrDescription(event.target.value)} placeholder="PINTURA, 3, II…" /></label>
        </>}
      </div>
    </section>

    {message && <p className={styles.message}>{message}</p>}
    <div className={styles.saveBar}>
      <Link href="/dashboard/partidas">Volver</Link>
      <div className={styles.saveActions}>
        <button type="submit" name="saveMode" value="new" className={styles.secondary} disabled={saving || readOnly}>Guardar y nueva</button>
        <button ref={keepRef} type="submit" name="saveMode" value="keep" disabled={saving || readOnly}>Guardar y mantener <kbd>F4</kbd></button>
        <button ref={exitRef} type="submit" name="saveMode" value="exit" disabled={saving || readOnly}>Guardar y salir <kbd>F2</kbd></button>
      </div>
    </div>
  </form>;
}
