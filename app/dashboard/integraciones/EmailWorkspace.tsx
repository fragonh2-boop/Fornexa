"use client";

import { ChangeEvent, FormEvent, useEffect, useState } from "react";
import styles from "./integraciones.module.css";

type Attachment = { filename: string; content: string; contentType: string; size: number };
export type EmailEvent = { id: string; to: string; subject: string; related: string; sentAt: string; status: "Enviado" | "Error" | "Simulado"; detail?: string };

const templates = {
  libre: { label: "Mensaje libre", subject: "", message: "Hola,\n\n\n\nUn saludo,\nEquipo FORNEXA" },
  oferta: { label: "Oferta comercial", subject: "Propuesta comercial FORNEXA", message: "Hola,\n\nTe enviamos nuestra propuesta comercial. Quedamos a tu disposición para cualquier consulta.\n\nUn saludo,\nEquipo FORNEXA" },
  expedicion: { label: "Estado de expedición", subject: "Actualización de expedición", message: "Hola,\n\nTe informamos de una actualización en tu expedición. Encontrarás la documentación disponible adjunta o en el enlace facilitado.\n\nUn saludo,\nEquipo FORNEXA" },
  incidencia: { label: "Comunicación de incidencia", subject: "Información sobre una incidencia logística", message: "Hola,\n\nNos ponemos en contacto para informarte de una incidencia relacionada con la operación indicada. Nuestro equipo está realizando el seguimiento.\n\nUn saludo,\nEquipo FORNEXA" },
  cmr: { label: "Envío de CMR / ePOD", subject: "Documentación CMR / ePOD", message: "Hola,\n\nAdjuntamos la documentación CMR / ePOD correspondiente al transporte indicado.\n\nUn saludo,\nEquipo FORNEXA" },
};

const historyKey = "fornexa-email-history";

function fileToAttachment(file: File): Promise<Attachment> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error(`No se pudo leer ${file.name}.`));
    reader.onload = () => resolve({ filename: file.name, content: String(reader.result).split(",")[1] || "", contentType: file.type || "application/octet-stream", size: file.size });
    reader.readAsDataURL(file);
  });
}

export default function EmailWorkspace({ simulation = false, initialHistory = [] }: { simulation?: boolean; initialHistory?: EmailEvent[] }) {
  const [template, setTemplate] = useState<keyof typeof templates>("libre");
  const [to, setTo] = useState("");
  const [cc, setCc] = useState("");
  const [bcc, setBcc] = useState("");
  const [replyTo, setReplyTo] = useState("");
  const [subject, setSubject] = useState(templates.libre.subject);
  const [message, setMessage] = useState(templates.libre.message);
  const [relatedType, setRelatedType] = useState("Cliente");
  const [relatedId, setRelatedId] = useState("");
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [history, setHistory] = useState<EmailEvent[]>(initialHistory);
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    if (simulation) return;
    try { setHistory(JSON.parse(localStorage.getItem(historyKey) || "[]") as EmailEvent[]); } catch { setHistory([]); }
  }, [simulation]);

  function storeHistory(entry: EmailEvent) {
    setHistory(current => {
      const updated = [entry, ...current].slice(0, 50);
      if (!simulation) localStorage.setItem(historyKey, JSON.stringify(updated));
      return updated;
    });
  }

  function selectTemplate(value: keyof typeof templates) {
    setTemplate(value);
    setSubject(templates[value].subject);
    setMessage(templates[value].message);
  }

  async function addAttachments(event: ChangeEvent<HTMLInputElement>) {
    const files = [...(event.target.files ?? [])];
    const total = attachments.reduce((sum, file) => sum + file.size, 0) + files.reduce((sum, file) => sum + file.size, 0);
    if (total > 8 * 1024 * 1024) { setStatus("error"); setNotice("Los adjuntos no pueden superar 8 MB en total."); return; }
    if (simulation) {
      // Keep only display metadata: no file content is read or sent in the demo.
      setAttachments(current => [...current, ...files.map(file => ({ filename: file.name, content: "", contentType: file.type, size: file.size }))]);
      setNotice("");
      event.target.value = "";
      return;
    }
    try {
      const prepared = await Promise.all(files.map(fileToAttachment));
      setAttachments(current => [...current, ...prepared]);
      setNotice("");
    }
    catch (error) { setStatus("error"); setNotice(error instanceof Error ? error.message : "No se pudo añadir el archivo."); }
    event.target.value = "";
  }

  async function send(event: FormEvent) {
    event.preventDefault();
    if (simulation) {
      storeHistory({ id: `DEMO-EMAIL-${crypto.randomUUID()}`, to, subject, related: `${relatedType} · ${relatedId || "Sin referencia"}`, sentAt: new Date().toISOString(), status: "Simulado" });
      setStatus("sent");
      setNotice("Envío simulado. No se ha enviado ningún correo ni guardado información fuera de esta pantalla.");
      setAttachments([]);
      return;
    }
    setStatus("sending");
    setNotice("Añadiendo el mensaje a la cola de salida…");
    try {
      const response = await fetch("/api/communications/email", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ to, cc, bcc, replyTo, subject, message, relatedType, relatedId, template, attachments: attachments.map(({ filename, content, contentType }) => ({ filename, content, contentType })) }) });
      const result = (await response.json()) as { id?: string; sentAt?: string; error?: string };
      if (!response.ok) throw new Error(result.error || "No se pudo enviar el correo.");
      storeHistory({ id: result.id || crypto.randomUUID(), to, subject, related: `${relatedType} · ${relatedId || "Sin referencia"}`, sentAt: result.sentAt || new Date().toISOString(), status: "Enviado" });
      setStatus("sent");
      setNotice(`Correo enviado correctamente a ${to}.`);
      setAttachments([]);
    } catch (error) {
      const detail = error instanceof Error ? error.message : "No se pudo enviar el correo.";
      storeHistory({ id: crypto.randomUUID(), to, subject, related: `${relatedType} · ${relatedId || "Sin referencia"}`, sentAt: new Date().toISOString(), status: "Error", detail });
      setStatus("error");
      setNotice(detail);
    }
  }

  return <section className={`${styles.panel} ${styles.emailWorkspace}`}>
    <div className={styles.panelHeader}><div><p className={styles.eyebrow}>COMUNICACIONES</p><h2>Correo CRM</h2><p className={styles.workspaceIntro}>Envía mensajes y documentos a cualquier destinatario y conserva la trazabilidad con el registro relacionado.</p></div><span className={styles.channelStatus}>{simulation ? "● Simulación local" : "● Envío vía Resend"}</span></div>
    <div className={styles.emailLayout}>
      <form className={styles.emailComposer} onSubmit={send}>
        <div className={styles.emailGrid}>
          <label>Plantilla<select value={template} onChange={event => selectTemplate(event.target.value as keyof typeof templates)}>{Object.entries(templates).map(([key, value]) => <option key={key} value={key}>{value.label}</option>)}</select></label>
          <label>Responder a<input type="email" value={replyTo} onChange={event => setReplyTo(event.target.value)} placeholder="Por defecto: dirección configurada" /></label>
          <label className={styles.full}>Para <small>varios: coma o punto y coma</small><input required value={to} onChange={event => setTo(event.target.value)} placeholder="destinatario@empresa.com" /></label>
          <label>CC<input value={cc} onChange={event => setCc(event.target.value)} placeholder="Opcional" /></label>
          <label>CCO<input value={bcc} onChange={event => setBcc(event.target.value)} placeholder="Opcional" /></label>
          <label>Registro relacionado<select value={relatedType} onChange={event => setRelatedType(event.target.value)}><option>Cliente</option><option>Oferta / tarifa</option><option>Expedición</option><option>Viaje</option><option>CMR / ePOD</option><option>Incidencia</option><option>Factura</option><option>Sin relación</option></select></label>
          <label>Código / referencia<input value={relatedId} onChange={event => setRelatedId(event.target.value)} placeholder="CLI-000146, OF-260118…" /></label>
          <label className={styles.full}>Asunto<input required value={subject} onChange={event => setSubject(event.target.value)} /></label>
          <label className={styles.full}>Mensaje<textarea required rows={9} value={message} onChange={event => setMessage(event.target.value)} /></label>
        </div>
        <div className={styles.attachmentBar}><label className={styles.fileButton}>+ Adjuntar archivos<input type="file" multiple onChange={addAttachments} /></label><span>{attachments.length ? `${attachments.length} archivo(s) · ${(attachments.reduce((sum, file) => sum + file.size, 0) / 1024 / 1024).toFixed(2)} MB` : "PDF, Excel, imágenes u otros documentos · máximo 8 MB"}</span></div>
        {attachments.length > 0 && <div className={styles.attachmentList}>{attachments.map((file, index) => <button type="button" key={`${file.filename}-${index}`} onClick={() => setAttachments(current => current.filter((_, itemIndex) => itemIndex !== index))}>{file.filename} ×</button>)}</div>}
        <div className={styles.sendBar}><span>{simulation ? "El resultado permanece solo en esta pantalla de demo." : "El envío se registrará en el histórico del Hub."}</span><button type="submit" className={styles.primary} disabled={status === "sending"}>{status === "sending" ? "Enviando…" : simulation ? "Simular envío" : "Enviar correo"}</button></div>
        {notice && <div role="status" className={status === "error" ? styles.emailError : styles.emailNotice}>{notice}</div>}
      </form>
      <aside className={styles.emailHistory}><div><p className={styles.eyebrow}>TRAZABILIDAD</p><h3>Últimos correos</h3></div>{history.length ? history.map(entry => <article key={entry.id}><div><strong>{entry.subject}</strong><span>{entry.to}</span><small>{entry.related}</small></div><div><b className={entry.status !== "Error" ? styles.sent : styles.failed}>{entry.status}</b><time>{new Date(entry.sentAt).toLocaleString("es-ES")}</time></div>{entry.detail && <p>{entry.detail}</p>}</article>) : <p className={styles.emptyHistory}>{simulation ? "Sin envíos simulados en esta pantalla." : "Todavía no hay correos enviados desde este navegador."}</p>}</aside>
    </div>
  </section>;
}
