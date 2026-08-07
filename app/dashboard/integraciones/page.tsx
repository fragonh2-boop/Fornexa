"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import EmailWorkspace from "./EmailWorkspace";
import styles from "./integraciones.module.css";

type Connector = {
  id: string;
  name: string;
  partner: string;
  family: "Comunicaciones" | "Integraciones";
  type: string;
  direction: "Entrada" | "Salida" | "Bidireccional";
  format: string;
  schedule: string;
  status: "Activo" | "Pendiente" | "Error";
  lastRun: string;
};

const initialConnectors: Connector[] = [
  { id: "CN-001", name: "Correo comercial", partner: "FORNEXA", family: "Comunicaciones", type: "Email / Resend", direction: "Salida", format: "HTML + PDF", schedule: "Tiempo real", status: "Pendiente", lastRun: "Hoy 14:42" },
  { id: "CN-002", name: "Pedidos cliente EDI", partner: "Cliente demo", family: "Integraciones", type: "EDI", direction: "Entrada", format: "ORDERS", schedule: "Cada 15 min", status: "Activo", lastRun: "Hoy 15:02" },
  { id: "CN-003", name: "Alta expediciones carrier", partner: "Colaborador demo", family: "Integraciones", type: "SOAP", direction: "Bidireccional", format: "XML", schedule: "Tiempo real", status: "Activo", lastRun: "Hoy 14:58" },
  { id: "CN-004", name: "Intercambio nocturno", partner: "Cliente demo", family: "Integraciones", type: "SFTP", direction: "Bidireccional", format: "CSV", schedule: "02:00 diario", status: "Activo", lastRun: "Hoy 02:01" },
  { id: "CN-005", name: "Estados por webhook", partner: "ERP externo", family: "Integraciones", type: "Webhook / REST", direction: "Salida", format: "JSON", schedule: "Por evento", status: "Error", lastRun: "Hoy 14:51" },
];

const queue = [
  ["EV-90821", "EDI · ORDERS", "Pedido 84722", "Procesado", "15:02:14"],
  ["EV-90820", "SOAP · XML", "EX-260071", "Procesado", "14:58:31"],
  ["EV-90819", "Webhook · JSON", "Estado EX-260070", "Reintento", "14:51:08"],
  ["EV-90818", "Email", "OF-260118", "Pendiente dominio", "14:42:55"],
];

const mappings = [
  ["SHIP_TO", "destinatario", "Texto", "Obligatorio"],
  ["PICKUP_DATE", "fecha_recogida", "Fecha", "Obligatorio"],
  ["WEIGHT", "peso_bruto", "Decimal", "Opcional"],
  ["VOLUME", "volumen", "Decimal", "Opcional"],
  ["REFERENCE", "referencia_cliente", "Texto", "Obligatorio"],
];

export default function IntegracionesPage() {
  const [search, setSearch] = useState("");
  const [family, setFamily] = useState("Todas");
  const [connectors] = useState(initialConnectors);

  const visible = useMemo(() => connectors.filter((c) => {
    const q = search.toLowerCase().trim();
    const matchesFamily = family === "Todas" || c.family === family;
    const matchesSearch = !q || [c.name, c.partner, c.type, c.format, c.status].join(" ").toLowerCase().includes(q);
    return matchesFamily && matchesSearch;
  }), [connectors, search, family]);

  const active = connectors.filter(c => c.status === "Activo").length;
  const errors = connectors.filter(c => c.status === "Error").length;
  const pending = connectors.filter(c => c.status === "Pendiente").length;

  return <main className={styles.page}>
    <header className={styles.header}>
      <div>
        <Link href="/dashboard" className={styles.back}>← Control Tower</Link>
        <p className={styles.eyebrow}>CONNECTIVITY HUB</p>
        <h1>Integraciones y comunicaciones</h1>
        <p className={styles.subtitle}>Un único punto para correo, EDI, APIs, web services, ficheros, SFTP, SMTP, webhooks y futuras conexiones eFTI.</p>
      </div>
      <div className={styles.headerActions}>
        <button type="button" className={styles.secondary}>Probar conexión</button>
        <button type="button" className={styles.primary}>+ Nuevo conector</button>
      </div>
    </header>

    <section className={styles.metrics}>
      <article><span>Conectores activos</span><strong>{active}</strong><small>Operativos</small></article>
      <article><span>Pendientes</span><strong>{pending}</strong><small>Requieren configuración</small></article>
      <article><span>Errores</span><strong>{errors}</strong><small>Requieren revisión</small></article>
      <article><span>Eventos hoy</span><strong>1.284</strong><small>Entrada + salida</small></article>
    </section>

    <EmailWorkspace />

    <section className={styles.split}>
      <article className={styles.panel}>
        <div className={styles.panelHeader}>
          <div><p className={styles.eyebrow}>CANALES</p><h2>Conectores</h2></div>
          <div className={styles.filters}>
            <select value={family} onChange={e => setFamily(e.target.value)} aria-label="Familia"><option>Todas</option><option>Comunicaciones</option><option>Integraciones</option></select>
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar conector..." />
          </div>
        </div>
        <div className={styles.tableWrap}>
          <table><thead><tr><th>Conector</th><th>Empresa</th><th>Tipo</th><th>Dirección</th><th>Formato</th><th>Frecuencia</th><th>Estado</th><th>Última ejecución</th></tr></thead>
          <tbody>{visible.map(c => <tr key={c.id}><td><strong>{c.name}</strong><small>{c.id} · {c.family}</small></td><td>{c.partner}</td><td>{c.type}</td><td>{c.direction}</td><td>{c.format}</td><td>{c.schedule}</td><td><span className={`${styles.badge} ${styles[c.status.toLowerCase()]}`}>{c.status}</span></td><td>{c.lastRun}</td></tr>)}</tbody></table>
        </div>
      </article>
    </section>

    <section className={styles.twoColumns}>
      <article className={styles.panel}>
        <div className={styles.panelHeader}><div><p className={styles.eyebrow}>TRAZABILIDAD</p><h2>Cola y últimas ejecuciones</h2></div><button className={styles.textButton}>Ver logs</button></div>
        <div className={styles.queue}>{queue.map(([id,channel,object,status,time]) => <div className={styles.queueRow} key={id}><div><strong>{object}</strong><span>{id} · {channel}</span></div><span>{status}</span><time>{time}</time></div>)}</div>
      </article>

      <article className={styles.panel}>
        <div className={styles.panelHeader}><div><p className={styles.eyebrow}>MODELO CANÓNICO</p><h2>Mapeo de campos</h2></div><button className={styles.textButton}>Editar mapeo</button></div>
        <div className={styles.mapping}>{mappings.map(([external,fornexa,type,rule]) => <div className={styles.mappingRow} key={external}><code>{external}</code><span>→</span><strong>{fornexa}</strong><small>{type} · {rule}</small></div>)}</div>
      </article>
    </section>

    <section className={styles.panel}>
      <div className={styles.panelHeader}><div><p className={styles.eyebrow}>ARQUITECTURA</p><h2>Capacidades del hub</h2></div></div>
      <div className={styles.capabilities}>
        {["Email / SMTP", "EDI", "REST API", "SOAP / Web Services", "SFTP / FTP", "CSV · TXT · XML · JSON", "Excel", "Webhooks", "Programaciones", "Colas y reintentos", "Credenciales", "Auditoría y alertas"].map(x => <span key={x}>{x}</span>)}
      </div>
      <p className={styles.note}>Todas las conexiones convergen en el modelo canónico de FORNEXA antes de crear o actualizar partidas, expediciones, viajes, documentos o eventos operativos.</p>
    </section>
  </main>;
}
