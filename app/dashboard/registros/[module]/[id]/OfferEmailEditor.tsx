"use client";

import Link from "next/link";
import { FormEvent, useMemo, useState } from "react";
import styles from "./offer-email.module.css";

const examples: Record<string, { customer: string; route: string; amount: string; status: string }> = {
  "OF-260118": { customer: "Mediterránea Retail", route: "Valencia → Lyon", amount: "1.280,00 €", status: "Enviada" },
  "OF-260117": { customer: "Nova Distribution", route: "Barcelona → Nice", amount: "945,00 €", status: "Borrador" },
  "TF-ES-FR-04": { customer: "Tarifa general", route: "España → Francia", amount: "Según tramo", status: "Activa" },
};

type HistoryEntry = { id: string; to: string; sentAt: string };

export default function OfferEmailEditor({ id }: { id: string }) {
  const offer = examples[id] ?? { customer: "Nuevo cliente", route: "Origen → Destino", amount: "0,00 €", status: "Borrador" };
  const [to, setTo] = useState("fragonh2@gmail.com");
  const [cc, setCc] = useState("");
  const [subject, setSubject] = useState(`${id} · Propuesta comercial FORNEXA`);
  const [message, setMessage] = useState(`Hola,\n\nTe enviamos nuestra propuesta para ${offer.route}. Quedamos a tu disposición para cualquier consulta.\n\nUn saludo,\nEquipo FORNEXA`);
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [notice, setNotice] = useState("");
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const validUntil = useMemo(() => new Intl.DateTimeFormat("es-ES").format(new Date(Date.now() + 30 * 86400000)), []);

  async function send(event: FormEvent) {
    event.preventDefault();
    setStatus("sending");
    setNotice("Enviando propuesta…");
    try {
      const response = await fetch("/api/offers/send", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ to, cc, subject, message, reference: id, customer: offer.customer, route: offer.route, amount: offer.amount, validUntil }) });
      const result = (await response.json()) as { id?: string; sentAt?: string; error?: string };
      if (!response.ok) throw new Error(result.error || "No se pudo enviar la propuesta.");
      const sentAt = result.sentAt || new Date().toISOString();
      setHistory(current => [{ id: result.id || crypto.randomUUID(), to, sentAt }, ...current]);
      setStatus("sent");
      setNotice(`Propuesta enviada correctamente a ${to}.`);
    } catch (error) {
      setStatus("error");
      setNotice(error instanceof Error ? error.message : "No se pudo enviar la propuesta.");
    }
  }

  return <main className={styles.page}>
    <header className={styles.header}>
      <div><Link href="/dashboard/ofertas-tarifas">← Ofertas y tarifas</Link><p>PROPUESTA COMERCIAL</p><h1>{id}</h1><span>{offer.customer} · {offer.route}</span></div>
      <div className={styles.actions}><button type="button" onClick={() => window.print()}>Descargar PDF</button><span>{offer.status}</span></div>
    </header>
    <div className={styles.layout}>
      <section className={styles.document}>
        <div className={styles.documentHead}><strong>FORNEXA</strong><span>Supply Chain Suite</span></div>
        <h2>{id.startsWith("TF-") ? "Tarifa logística" : "Oferta de transporte"}</h2>
        <dl><div><dt>Cliente</dt><dd>{offer.customer}</dd></div><div><dt>Ruta</dt><dd>{offer.route}</dd></div><div><dt>Importe</dt><dd>{offer.amount}</dd></div><div><dt>Validez</dt><dd>{validUntil}</dd></div></dl>
        <p>Servicio sujeto a disponibilidad, condiciones operativas y confirmación definitiva de fechas, pesos y volúmenes.</p>
      </section>
      <form className={styles.composer} onSubmit={send}>
        <p>ENVÍO POR EMAIL</p><h2>Compartir propuesta</h2>
        <label>Para<input type="email" required value={to} onChange={event => setTo(event.target.value)} /></label>
        <label>CC opcional<input type="email" value={cc} onChange={event => setCc(event.target.value)} /></label>
        <label>Asunto<input required value={subject} onChange={event => setSubject(event.target.value)} /></label>
        <label>Mensaje<textarea rows={8} required value={message} onChange={event => setMessage(event.target.value)} /></label>
        <button disabled={status === "sending"}>{status === "sending" ? "Enviando…" : "Enviar por email"}</button>
        {notice && <div className={status === "error" ? styles.error : styles.notice}>{notice}</div>}
        <small>El correo de prueba se enviará a la dirección indicada. El remitente definitivo será ofertas@fornexa.eu.</small>
      </form>
    </div>
    <section className={styles.history}><h2>Historial de envíos</h2>{history.length ? history.map(entry => <div key={entry.id}><strong>{entry.to}</strong><span>{new Date(entry.sentAt).toLocaleString("es-ES")}</span><em>Enviado</em></div>) : <p>Todavía no hay envíos registrados en esta sesión.</p>}</section>
  </main>;
}
