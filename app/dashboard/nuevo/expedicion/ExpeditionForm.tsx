"use client";

import Link from "next/link";
import { FormEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import styles from "./expedition-form.module.css";

export type AvailableOrder = {
  code: string;
  customer: string;
  customerCode: string;
  route: string;
  service: string;
  goods: string;
  adr: string;
};

export default function ExpeditionForm({ orders, readOnly = false }: { orders: AvailableOrder[]; readOnly?: boolean }) {
  const router = useRouter();
  const [selected, setSelected] = useState(orders[0]?.code ?? "");
  const [plannedDeparture, setPlannedDeparture] = useState("");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const current = useMemo(() => orders.find(order => order.code === selected), [orders, selected]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (readOnly) return setMessage("Modo revisión: solo lectura.");
    if (!selected) return setMessage("Selecciona una partida.");
    setSaving(true);
    setMessage("");
    try {
      const response = await fetch("/api/expeditions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderCode: selected, plannedDeparture }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "No se pudo crear el expediente.");
      setMessage(`Expediente ${result.item?.id ?? ""} creado para ${selected}.`);
      router.push("/dashboard/expediciones");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No se pudo crear el expediente.");
    } finally {
      setSaving(false);
    }
  }

  return <form className={styles.form} onSubmit={submit}>
    <section className={styles.card}>
      <div className={styles.cardHeader}>
        <div><p>PARTIDA DE ORIGEN</p><h2>Selecciona una única partida</h2></div>
        <span>Relación operativa 1:1</span>
      </div>
      {orders.length === 0 ? <div className={styles.empty}>No hay partidas disponibles sin expediente.</div> : <div className={styles.orders}>
        {orders.map(order => <label key={order.code} className={`${styles.order} ${selected === order.code ? styles.selected : ""}`}>
          <input type="radio" name="orderCode" value={order.code} checked={selected === order.code} onChange={() => setSelected(order.code)} />
          <div className={styles.orderMain}>
            <strong>{order.code}</strong>
            <span>{order.customerCode} · {order.customer}</span>
            <small>{order.route}</small>
          </div>
          <div className={styles.orderMeta}>
            <span>{order.service}</span>
            <span>{order.goods}</span>
            <span>{order.adr}</span>
          </div>
        </label>)}
      </div>}
    </section>

    <section className={styles.card}>
      <div className={styles.cardHeader}><div><p>PLANIFICACIÓN</p><h2>Datos del expediente</h2></div></div>
      <div className={styles.grid}>
        <label>Partida<input value={current?.code ?? "—"} readOnly /></label>
        <label>Ruta<input value={current?.route ?? "—"} readOnly /></label>
        <label>Servicio<input value={current?.service ?? "—"} readOnly /></label>
        <label>Fecha de salida<input type="date" value={plannedDeparture} onChange={event => setPlannedDeparture(event.target.value)} /></label>
      </div>
      <p className={styles.note}>Cliente, servicio, origen y destino se heredan de la Partida. No se pueden cambiar aquí para evitar divergencias entre pedido y expediente.</p>
    </section>

    {message && <p className={styles.message}>{message}</p>}
    <div className={styles.actions}>
      <Link href="/dashboard/expediciones">Cancelar</Link>
      <button type="submit" disabled={saving || !selected || readOnly}>{readOnly ? "Solo lectura" : saving ? "Guardando…" : "Crear expediente"}</button>
    </div>
  </form>;
}
