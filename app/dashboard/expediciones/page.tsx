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

type ColumnKey = "id" | "route" | "parts" | "service" | "status" | "date";
type SortDirection = "asc" | "desc";

type ColumnDefinition = {
  key: ColumnKey;
  label: string;
  defaultVisible: boolean;
};

const columns: ColumnDefinition[] = [
  { key: "id", label: "ID", defaultVisible: true },
  { key: "route", label: "Ruta", defaultVisible: true },
  { key: "parts", label: "Partidas", defaultVisible: true },
  { key: "service", label: "Servicio", defaultVisible: true },
  { key: "status", label: "Estado", defaultVisible: true },
  { key: "date", label: "Fecha", defaultVisible: false },
];

const demo: Expedicion[] = [
  { id: "EX-260071", origen: "Valencia", destino: "Lyon", partidas: ["PT-260184", "PT-260185", "PT-260186"], servicio: "Grupaje", estado: "En tránsito", fecha: "2026-08-04" },
  { id: "EX-260070", origen: "Barcelona", destino: "Marseille", partidas: ["PT-260183", "PT-260187"], servicio: "LTL", estado: "Planificada", fecha: "2026-08-03" },
  { id: "EX-260069", origen: "Madrid", destino: "Toulouse", partidas: ["PT-260182"], servicio: "Directo", estado: "Entregada", fecha: "2026-08-02" },
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

function valueFor(item: Expedicion, key: ColumnKey): string | number {
  switch (key) {
    case "id": return item.id;
    case "route": return `${item.origen ?? ""} ${item.destino ?? ""}`;
    case "parts": return item.partidas?.length ?? 0;
    case "service": return item.servicio ?? "Varios";
    case "status": return item.estado ?? "Planificada";
    case "date": return item.fecha ?? item.createdAt ?? "";
  }
}

const defaultVisibleColumns = columns.filter(column => column.defaultVisible).map(column => column.key);

export default function ExpedicionesPage() {
  const [items, setItems] = useState<Expedicion[]>([]);
  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState<ColumnKey>("id");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const [columnFilters, setColumnFilters] = useState<Partial<Record<ColumnKey, string>>>({});
  const [visibleColumns, setVisibleColumns] = useState<ColumnKey[]>(defaultVisibleColumns);
  const [openFilter, setOpenFilter] = useState<ColumnKey | null>(null);
  const [showColumns, setShowColumns] = useState(false);

  useEffect(() => {
    const refresh = () => setItems(readExpeditions());
    refresh();
    try {
      const stored = localStorage.getItem("fornexa-expeditions-visible-columns");
      if (stored) {
        const parsed = JSON.parse(stored) as ColumnKey[];
        if (Array.isArray(parsed) && parsed.length) setVisibleColumns(parsed);
      }
    } catch {}
    window.addEventListener("focus", refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener("focus", refresh);
      window.removeEventListener("storage", refresh);
    };
  }, []);

  useEffect(() => {
    localStorage.setItem("fornexa-expeditions-visible-columns", JSON.stringify(visibleColumns));
  }, [visibleColumns]);

  const filtered = useMemo(() => {
    const q = normalize(query);
    const result = items.filter(item => {
      const globalMatch = !q || normalize([
        item.id,
        item.origen,
        item.destino,
        item.servicio,
        item.estado,
        item.fecha,
        ...(item.partidas ?? []),
      ].filter(Boolean).join(" ")).includes(q);

      if (!globalMatch) return false;

      return Object.entries(columnFilters).every(([rawKey, rawFilter]) => {
        const filter = normalize(rawFilter ?? "");
        if (!filter) return true;
        return normalize(String(valueFor(item, rawKey as ColumnKey))).includes(filter);
      });
    });

    return result.sort((a, b) => {
      const left = valueFor(a, sortKey);
      const right = valueFor(b, sortKey);
      const comparison = typeof left === "number" && typeof right === "number"
        ? left - right
        : String(left).localeCompare(String(right), "es", { numeric: true, sensitivity: "base" });
      return sortDirection === "asc" ? comparison : -comparison;
    });
  }, [items, query, columnFilters, sortKey, sortDirection]);

  const groupedParts = items.reduce((total, item) => total + (item.partidas?.length ?? 0), 0);
  const orderedByCreation = useMemo(() => [...items].sort((a, b) => {
    const aTime = a.createdAt ? Date.parse(a.createdAt) : 0;
    const bTime = b.createdAt ? Date.parse(b.createdAt) : 0;
    if (aTime !== bTime) return bTime - aTime;
    return b.id.localeCompare(a.id, "es", { numeric: true });
  }), [items]);

  function sortBy(key: ColumnKey) {
    if (sortKey === key) setSortDirection(current => current === "asc" ? "desc" : "asc");
    else {
      setSortKey(key);
      setSortDirection("asc");
    }
    setOpenFilter(null);
  }

  function toggleColumn(key: ColumnKey) {
    setVisibleColumns(current => {
      if (current.includes(key)) {
        if (current.length === 1) return current;
        return current.filter(column => column !== key);
      }
      return columns.filter(column => [...current, key].includes(column.key)).map(column => column.key);
    });
  }

  function resetView() {
    setVisibleColumns(defaultVisibleColumns);
    setColumnFilters({});
    setSortKey("id");
    setSortDirection("desc");
    setQuery("");
    setOpenFilter(null);
  }

  const activeColumns = columns.filter(column => visibleColumns.includes(column.key));
  const gridTemplate = activeColumns.map(column => column.key === "route" ? "1.55fr" : "1fr").join(" ");

  function renderCell(item: Expedicion, key: ColumnKey) {
    switch (key) {
      case "id": return <strong>{item.id}</strong>;
      case "route": return <span>{item.origen || "—"} → {item.destino || "—"}</span>;
      case "parts": {
        const count = item.partidas?.length ?? 0;
        return <span>{count} {count === 1 ? "partida" : "partidas"}</span>;
      }
      case "service": return <span>{item.servicio || "Varios"}</span>;
      case "status": return <span>{item.estado || "Planificada"}</span>;
      case "date": return <span>{item.fecha || "—"}</span>;
    }
  }

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
        <article><span>Última creada</span><strong className={styles.lastId}>{orderedByCreation[0]?.id ?? "—"}</strong></article>
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
          <div className={styles.viewMenuWrap}>
            <button className={styles.secondary} onClick={() => setShowColumns(current => !current)}>⚙ Columnas</button>
            {showColumns && <div className={styles.viewMenu}>
              <div className={styles.viewMenuTitle}><strong>Personalizar columnas</strong><span>La vista se guarda para este usuario</span></div>
              {columns.map(column => <label key={column.key}>
                <input type="checkbox" checked={visibleColumns.includes(column.key)} onChange={() => toggleColumn(column.key)} />
                <span>{column.label}</span>
              </label>)}
              <button onClick={resetView}>Restablecer vista</button>
            </div>}
          </div>
          <span>{filtered.length} resultado{filtered.length === 1 ? "" : "s"}</span>
        </div>

        <div className={styles.table}>
          <div className={`${styles.row} ${styles.head}`} style={{ gridTemplateColumns: gridTemplate }}>
            {activeColumns.map(column => <div className={styles.headerCell} key={column.key}>
              <button className={styles.headerButton} onClick={() => sortBy(column.key)}>
                <span>{column.label}</span>
                <span className={styles.sortIcon}>{sortKey === column.key ? (sortDirection === "asc" ? "↑" : "↓") : "↕"}</span>
              </button>
              <button className={`${styles.filterButton} ${columnFilters[column.key] ? styles.filterActive : ""}`} onClick={() => setOpenFilter(current => current === column.key ? null : column.key)} aria-label={`Filtrar ${column.label}`}>⌄</button>
              {openFilter === column.key && <div className={styles.filterMenu}>
                <strong>Filtrar {column.label}</strong>
                <input autoFocus value={columnFilters[column.key] ?? ""} onChange={event => setColumnFilters(current => ({ ...current, [column.key]: event.target.value }))} placeholder="Contiene..." />
                <div>
                  <button onClick={() => setColumnFilters(current => ({ ...current, [column.key]: "" }))}>Limpiar</button>
                  <button onClick={() => setOpenFilter(null)}>Aplicar</button>
                </div>
              </div>}
            </div>)}
          </div>
          {filtered.map(item => <Link href={`/dashboard/registros/expediciones/${item.id}`} className={styles.row} style={{ gridTemplateColumns: gridTemplate }} key={item.id}>
            {activeColumns.map(column => <div key={column.key}>{renderCell(item, column.key)}</div>)}
          </Link>)}
          {!filtered.length && <div className={styles.empty}>No hay expediciones que coincidan con los filtros aplicados.</div>}
        </div>
      </section>
    </section>
  </main>;
}
