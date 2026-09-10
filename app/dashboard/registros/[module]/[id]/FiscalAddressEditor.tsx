"use client";

import { FormEvent, useEffect, useState } from "react";
import styles from "./record.module.css";

type FiscalAddress = {
  id?: string;
  name: string;
  addressLine1: string;
  addressLine2: string;
  postalCode: string;
  city: string;
  region: string;
  countryCode: string;
};

const emptyAddress: FiscalAddress = {
  name: "Domicilio fiscal",
  addressLine1: "",
  addressLine2: "",
  postalCode: "",
  city: "",
  region: "",
  countryCode: "ES",
};

export default function FiscalAddressEditor({ id }: { id: string }) {
  const [address, setAddress] = useState<FiscalAddress>(emptyAddress);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [canEdit, setCanEdit] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    fetch(`/api/customers/fiscal-address?customerCode=${encodeURIComponent(id)}`, { cache: "no-store" })
      .then(async response => {
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || "No se pudo cargar el domicilio fiscal.");
        if (!active) return;
        const fiscal = result.item?.fiscalAddress;
        setCanEdit(Boolean(result.canEdit));
        setAddress(fiscal ? {
          id: fiscal.id,
          name: fiscal.name || "Domicilio fiscal",
          addressLine1: fiscal.addressLine1 || "",
          addressLine2: fiscal.addressLine2 || "",
          postalCode: fiscal.postalCode || "",
          city: fiscal.city || "",
          region: fiscal.region || "",
          countryCode: fiscal.countryCode || result.item?.defaultCountryCode || "ES",
        } : { ...emptyAddress, countryCode: result.item?.defaultCountryCode || "ES" });
        setError("");
      })
      .catch(loadError => active && setError(loadError instanceof Error ? loadError.message : "No se pudo cargar el domicilio fiscal."))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [id]);

  function update<K extends keyof FiscalAddress>(key: K, value: FiscalAddress[K]) {
    setAddress(current => ({ ...current, [key]: value }));
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    setError("");
    if (address.addressLine1.trim().length < 5 || !address.city.trim() || !/^[A-Z]{2}$/i.test(address.countryCode.trim())) {
      setError("Completa dirección, población y código ISO de país del domicilio fiscal.");
      return;
    }

    setSaving(true);
    try {
      const response = await fetch("/api/customers/fiscal-address", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ customerCode: id, address }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "No se pudo guardar el domicilio fiscal.");
      setAddress(current => ({ ...current, id: result.item?.id ?? current.id }));
      setMessage("Domicilio FISCAL canónico guardado y disponible para documentación regulatoria.");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "No se pudo guardar el domicilio fiscal.");
    } finally {
      setSaving(false);
    }
  }

  return <section className={styles.card}>
    <h2>Domicilio fiscal / legal</h2>
    <p>Dato canónico separado de centros de carga y descarga. DeCA y otros documentos regulatorios solo pueden usar este domicilio FISCAL; nunca se sustituye automáticamente por una dirección operativa. Su edición queda limitada a OWNER y ADMIN.</p>
    {loading ? <p className={styles.message}>Cargando domicilio fiscal…</p> : <form onSubmit={save}>
      <div className={styles.grid}>
        <label>Nombre del domicilio<input value={address.name} onChange={event => update("name", event.target.value)} disabled={!canEdit}/></label>
        <label>País ISO<input value={address.countryCode} maxLength={2} onChange={event => update("countryCode", event.target.value.toUpperCase())} disabled={!canEdit} placeholder="ES"/></label>
        <label>Dirección<input value={address.addressLine1} onChange={event => update("addressLine1", event.target.value)} disabled={!canEdit} placeholder="Calle, número"/></label>
        <label>Complemento<input value={address.addressLine2} onChange={event => update("addressLine2", event.target.value)} disabled={!canEdit} placeholder="Edificio, planta…"/></label>
        <label>Código postal<input value={address.postalCode} onChange={event => update("postalCode", event.target.value)} disabled={!canEdit}/></label>
        <label>Población<input value={address.city} onChange={event => update("city", event.target.value)} disabled={!canEdit}/></label>
        <label>Provincia / región<input value={address.region} onChange={event => update("region", event.target.value)} disabled={!canEdit}/></label>
      </div>
      {error && <p className={styles.message}>{error}</p>}
      {message && <p className={styles.message}>{message}</p>}
      <div className={styles.submit}><button type="submit" disabled={!canEdit || saving}>{saving ? "Guardando…" : "Guardar domicilio fiscal"}</button></div>
    </form>}
  </section>;
}
