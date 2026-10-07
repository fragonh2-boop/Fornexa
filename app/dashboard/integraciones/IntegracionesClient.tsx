"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import EmailWorkspace from "./EmailWorkspace";
import styles from "./integraciones.module.css";

export type Connector = {
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

export type IntegrationsData = {
  connectors: Connector[];
  queue: string[][];
  mappings: string[][];
  eventsToday: string | null;
};

export default function IntegracionesClient({ data }: { data: IntegrationsData }) {
  const { queue, mappings, eventsToday } = data;
  const [search, setSearch] = useState("");
  const [family, setFamily] = useState("Todas");
  const [connectors] = useState(data.connectors);

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
      <article><span>Eventos hoy</span><strong>{eventsToday ?? "—"}</strong><small>Entrada + salida</small></article>
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
          <tbody>{visible.length === 0 && <tr><td colSpan={8}>No hay conectores configurados todavía.</td></tr>}{visible.map(c => <tr key={c.id}><td><strong>{c.name}</strong><small>{c.id} · {c.family}</small></td><td>{c.partner}</td><td>{c.type}</td><td>{c.direction}</td><td>{c.format}</td><td>{c.schedule}</td><td><span className={`${styles.badge} ${styles[c.status.toLowerCase()]}`}>{c.status}</span></td><td>{c.lastRun}</td></tr>)}</tbody></table>
        </div>
      </article>
    </section>

    <section className={styles.twoColumns}>
      <article className={styles.panel}>
        <div className={styles.panelHeader}><div><p className={styles.eyebrow}>TRAZABILIDAD</p><h2>Cola y últimas ejecuciones</h2></div><button className={styles.textButton}>Ver logs</button></div>
        <div className={styles.queue}>{queue.length === 0 && <p>Sin ejecuciones registradas.</p>}{queue.map(([id,channel,object,status,time]) => <div className={styles.queueRow} key={id}><div><strong>{object}</strong><span>{id} · {channel}</span></div><span>{status}</span><time>{time}</time></div>)}</div>
      </article>

      <article className={styles.panel}>
        <div className={styles.panelHeader}><div><p className={styles.eyebrow}>MODELO OPERATIVO</p><h2>Mapeo de campos</h2></div><button className={styles.textButton}>Editar mapeo</button></div>
        <div className={styles.mapping}>{mappings.length === 0 && <p>Sin mapeos definidos.</p>}{mappings.map(([external,fornexa,type,rule]) => <div className={styles.mappingRow} key={external}><code>{external}</code><span>→</span><strong>{fornexa}</strong><small>{type} · {rule}</small></div>)}</div>
      </article>
    </section>

    <section className={styles.panel}>
      <div className={styles.panelHeader}><div><p className={styles.eyebrow}>ARQUITECTURA</p><h2>Capacidades del hub</h2></div></div>
      <div className={styles.capabilities}>
        {["Email / SMTP", "EDI", "REST API", "SOAP / Web Services", "SFTP / FTP", "CSV · TXT · XML · JSON", "Excel", "Webhooks", "Programaciones", "Colas y reintentos", "Credenciales", "Auditoría y alertas"].map(x => <span key={x}>{x}</span>)}
      </div>
      <p className={styles.note}>Todas las conexiones convergen en el modelo operativo de FORNEXA antes de crear o actualizar partidas, expediciones, viajes, documentos o eventos operativos.</p>
    </section>
  </main>;
}
