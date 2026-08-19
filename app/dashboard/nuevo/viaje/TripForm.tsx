"use client";

import Link from "next/link";
import { FormEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import styles from "./trip-form.module.css";

export type ExpeditionOption = { code: string; orderCode: string; route: string; service: string; status: string };
export type VehicleOption = { registration: string; vehicleType: string };
export type DriverOption = { code: string; name: string; adrQualified: boolean };

export default function TripForm({
  expeditions,
  vehicles,
  drivers,
  readOnly = false,
}: {
  expeditions: ExpeditionOption[];
  vehicles: VehicleOption[];
  drivers: DriverOption[];
  readOnly?: boolean;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<string[]>([]);
  const [plannedStart, setPlannedStart] = useState("");
  const [vehicleRegistration, setVehicleRegistration] = useState("");
  const [vehicleType, setVehicleType] = useState("");
  const [trailerRegistration, setTrailerRegistration] = useState("");
  const [driverCode, setDriverCode] = useState("");
  const [driverName, setDriverName] = useState("");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

  const selectedItems = useMemo(() => expeditions.filter(item => selected.includes(item.code)), [expeditions, selected]);

  function toggle(code: string) {
    setSelected(current => current.includes(code) ? current.filter(item => item !== code) : [...current, code]);
  }

  function resolveVehicle(raw: string) {
    const value = raw.toUpperCase().replace(/\s+/g, "");
    setVehicleRegistration(value);
    const existing = vehicles.find(item => item.registration === value);
    if (existing) setVehicleType(existing.vehicleType);
  }

  function resolveDriver(raw: string) {
    const value = raw.toUpperCase().replace(/[^A-Z0-9_-]/g, "");
    setDriverCode(value);
    const existing = drivers.find(item => item.code === value);
    if (existing) setDriverName(existing.name);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (readOnly) return setMessage("Modo revisión: solo lectura.");
    if (!selected.length) return setMessage("Selecciona al menos un expediente.");
    if (!vehicleRegistration || !driverCode || !driverName) return setMessage("Vehículo y conductor son obligatorios.");

    setSaving(true);
    setMessage("");
    try {
      const response = await fetch("/api/trips", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ expeditionCodes: selected, plannedStart, vehicleRegistration, vehicleType, trailerRegistration, driverCode, driverName }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "No se pudo crear el viaje.");
      setMessage(`Viaje ${result.item?.id ?? ""} creado con ${selected.length} expediente${selected.length === 1 ? "" : "s"}.`);
      router.push("/dashboard/viajes");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No se pudo crear el viaje.");
    } finally {
      setSaving(false);
    }
  }

  return <form className={styles.form} onSubmit={submit}>
    <section className={styles.card}>
      <div className={styles.cardHeader}><div><p>EXPEDIENTES</p><h2>Selecciona la carga del viaje</h2></div><span>{selected.length} seleccionados</span></div>
      {expeditions.length === 0 ? <div className={styles.empty}>No hay expedientes activos disponibles.</div> : <div className={styles.expeditions}>
        {expeditions.map(item => <label key={item.code} className={`${styles.expedition} ${selected.includes(item.code) ? styles.selected : ""}`}>
          <input type="checkbox" checked={selected.includes(item.code)} onChange={() => toggle(item.code)} />
          <div><strong>{item.code}</strong><span>Partida {item.orderCode}</span><small>{item.route}</small></div>
          <div className={styles.meta}><span>{item.service}</span><span>{item.status}</span></div>
        </label>)}
      </div>}
    </section>

    <section className={styles.card}>
      <div className={styles.cardHeader}><div><p>RECURSOS</p><h2>Vehículo y conductor</h2></div></div>
      <div className={styles.grid}>
        <label>Salida prevista<input type="datetime-local" value={plannedStart} onChange={event => setPlannedStart(event.target.value)} /></label>
        <label>Matrícula vehículo<input value={vehicleRegistration} onChange={event => resolveVehicle(event.target.value)} list="trip-vehicles" required placeholder="1234ABC" /></label>
        <datalist id="trip-vehicles">{vehicles.map(item => <option key={item.registration} value={item.registration}>{item.vehicleType}</option>)}</datalist>
        <label>Tipo de vehículo<input value={vehicleType} onChange={event => setVehicleType(event.target.value)} placeholder="Tráiler / Rígido / Furgón…" /></label>
        <label>Matrícula remolque<input value={trailerRegistration} onChange={event => setTrailerRegistration(event.target.value.toUpperCase().replace(/\s+/g, ""))} /></label>
        <label>Código conductor<input value={driverCode} onChange={event => resolveDriver(event.target.value)} list="trip-drivers" required placeholder="DRV-001" /></label>
        <datalist id="trip-drivers">{drivers.map(item => <option key={item.code} value={item.code}>{item.name}{item.adrQualified ? " · ADR" : ""}</option>)}</datalist>
        <label>Conductor<input value={driverName} onChange={event => setDriverName(event.target.value)} required placeholder="Nombre y apellidos" /></label>
      </div>
      <p className={styles.note}>Si la matrícula o el código de conductor no existen todavía, FORNEXA los da de alta como maestros del tenant al crear el viaje.</p>
    </section>

    {selectedItems.length > 0 && <section className={styles.summary}><strong>Secuencia inicial:</strong> {selectedItems.map(item => item.code).join(" → ")}</section>}
    {message && <p className={styles.message}>{message}</p>}
    <div className={styles.actions}><Link href="/dashboard/viajes">Cancelar</Link><button type="submit" disabled={saving || readOnly || !selected.length}>{readOnly ? "Solo lectura" : saving ? "Guardando…" : "Crear viaje"}</button></div>
  </form>;
}
