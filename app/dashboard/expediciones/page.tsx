"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import styles from "./expediciones.module.css";

type Expedicion = {
  id: string;
  origen?: string;
  destino?: string;
  servicio?: string;
  estado?: string;
  partidas?: string[];
  fecha?: string;
  createdAt?: string;
};

const demo: Expedicion[] = [
  { id: "EX-260071", origen: "Valencia", destino: "Lyon", partidas: ["PT-260184", "PT-260185", "PT-260186"], servicio: "Grupaje", estado: "En tránsito" },
  { id: "EX-260070", origen: "Barcelona", destino: "Marseille", partidas: ["PT-260183", "PT-260187"], servicio: "LTL", estado: "Planificada" },
  { id: "EX-260069", origen: "Madrid", destino: "Toulouse", partidas: ["PT-260182"], servicio: "Directo", estado: "Entregada" },
];

function readExpeditions(): Expedicion[] {
  try {
    const raw = localStorage.getItem("fornexa-expediciones");
    if (!raw) return demo;
    const parsed = JSON.parse(raw) as Expedicion[];
    return Array.isArray(parsed) && parsed.length ? parsed : demo;
  } catch {
    return demo;
  }
}

function normalize(value: string) {
  return value.trim().toLocaleLowerCase("es-ES");
}

export default function ExpedicionesPage() {
  const [items, setItems] = useState<Expedicion[]>([]);
  const [query, setQuery] = useState("");

  useEffect(() => {
    const refresh = () => setItems(readExpeditions());
    refresh();
    window.addEventListener("focus", refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener("focus", refresh);
      window.removeEventListener("storage", refresh);
    };
  }, []);

  const ordered = useMemo(() => [...items].sort((a, b) => {
    const aTime = a.createdAt ? Date.parse(a.createdAt) : 0;
    const bTime = b.createdAt ? Date.parse(b.createdAt) : 0;
    if (aTime !== bTime) return bTime - aTime;
    return b.id.localeCompare(a.id, "es", { numeric: true });
  }), [items]);

  const filtered = useMemo(() => {
    const q = normalize(query);
    if (!q) return ordered;
    return ordered.filter((item) => normalize([
      item.id,
      item.origen,
      item.destino,
      item.servicio,
      item.estado,
      ...(item.partidas ?? []),
    ].filter(Boolean).join(" ")).includes(q));
  }, [ordered, query]);

  const groupedParts = items.reduce((total, item) => total + (item.partidas?.length ?? 0), 0);

  return <main className={styles.shell}>
    <aside className={styles.sidebar}>
      <Link href="/dashboard" className={styles.brand}>FORNEXA</Link>
      <nav>
        <Link href="/dashboard">Control Tower</Link>
        <Link href="/dashboard/partidas">Partidas</Link>
        <Link className={styles.active} href="/dashboard/expediciones">Expediciones</Link>
        <Link href="/dashboard/viajes">Viajes</Link>
        <Link href="/dashboard/ofertas-tarifas">Ofertas y tarifas</Link>
        <Link href="/dashboard/clientes">Clientes</Link>
        <Link href="/dashboard/colaboradores">Colaboradores</Link>
      </nav>
    </aside>

    <section className={styles.content}>
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>CONSOLIDACIÓN</p>
          <h1>Expediciones</h1>
          <p>Agrupaciones de una o varias partidas compatibles por ruta, servicio y planificación.</p>
        </div>
        <div className={styles.actions}>
          <button className={styles.secondary}>Importar Excel</button>
          <Link href="/dashboard/nuevo/expedicion" className={styles.primary}>+ Nueva expedición</Link>
          <div className={styles.avatar}>FG</div>
        </div>
      </header>

      <section className={styles.metrics}>
        <article><span>Activas</span><strong>{items.filter(x => x.estado !== "Entregada").length}</strong></article>
        <article><span>Partidas agrupadas</span><strong>{groupedParts}</strong></article>
        <article><span>Última creada</span><strong className={styles.lastId}>{ordered[0]?.id ?? "—"}</strong></article>
      </section>

      <section className={styles.panel}>
        <div className={styles.toolbar}>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar por expedición, ruta, partida, servicio o estado"
            aria-label="Buscar expediciones"
          />
          <button className={styles.secondary} onClick={() => setItems(readExpeditions())}>Actualizar</button>
          <span>{filtered.length} resultado{filtered.length === 1 ? "" : "s"}</span>
        </div>

        <div className={styles.table}>
          <div className={`${styles.row} ${styles.head}`}>
            <span>ID</span><span>Ruta</span><span>Partidas</span><span>Servicio</span><span>Estado</span>
          </div>
          {filtered.map((item) => <Link href={`/dashboard/registros/expediciones/${item.id}`} className={styles.row} key={item.id}>
            <strong>{item.id}</strong>
            <span>{item.origen || "—"} → {item.destino || "—"}</span>
            <span>{item.partidas?.length ?? 0} {(item.partidas?.length ?? 0) === 1 ? "partida" : "partidas"}</span>
            <span>{item.servicio || "Varios"}</span>
            <span>{item.estado || "Planificada"}</span>
          </Link>)}
          {!filtered.length && <div className={styles.empty}>No hay expediciones que coincidan con “{query}”. Pulsa Actualizar si acabas de crearla en otra pestaña.</div>}
        </div>
      </section>
    </section>
  </main>;
}
