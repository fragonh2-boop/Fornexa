"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import styles from "./DataGrid.module.css";

export type GridColumn = { key: string; label: string };
export type GridRow = Record<string, string | number | boolean | null | undefined>;

type Props = {
  storageKey: string;
  columns: GridColumn[];
  rows: GridRow[];
  rowHrefs?: string[];
  searchPlaceholder?: string;
  emptyMessage?: string;
  openLinksInNewTab?: boolean;
};

type SortState = { key: string; direction: "asc" | "desc" } | null;

function text(value: GridRow[string]) {
  return value == null ? "" : String(value);
}

function compare(a: GridRow[string], b: GridRow[string]) {
  const aText = text(a).replace(/\./g, "").replace(",", ".");
  const bText = text(b).replace(/\./g, "").replace(",", ".");
  const aNum = Number(aText.replace(/[^0-9.-]/g, ""));
  const bNum = Number(bText.replace(/[^0-9.-]/g, ""));
  if (Number.isFinite(aNum) && Number.isFinite(bNum) && /\d/.test(aText) && /\d/.test(bText)) return aNum - bNum;
  return aText.localeCompare(bText, "es", { numeric: true, sensitivity: "base" });
}

export default function DataGrid({ storageKey, columns, rows, rowHrefs, searchPlaceholder = "Buscar...", emptyMessage = "No hay resultados.", openLinksInNewTab = false }: Props) {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortState>(null);
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [filterDraft, setFilterDraft] = useState("");
  const [visible, setVisible] = useState<string[]>(columns.map(column => column.key));
  const [columnsOpen, setColumnsOpen] = useState(false);
  const [filterOpen, setFilterOpen] = useState<string | null>(null);
  const filterMenuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(`fornexa-grid-${storageKey}`);
      if (!saved) return;
      const parsed = JSON.parse(saved) as { visible?: string[] };
      const allowed = (parsed.visible ?? []).filter(key => columns.some(column => column.key === key));
      if (allowed.length) setVisible(allowed);
    } catch {}
  }, [storageKey, columns]);

  useEffect(() => {
    try { localStorage.setItem(`fornexa-grid-${storageKey}`, JSON.stringify({ visible })); } catch {}
  }, [storageKey, visible]);

  useEffect(() => {
    function closeOnOutsideClick(event: MouseEvent) {
      if (filterOpen && filterMenuRef.current && !filterMenuRef.current.contains(event.target as Node)) setFilterOpen(null);
    }
    document.addEventListener("mousedown", closeOnOutsideClick);
    return () => document.removeEventListener("mousedown", closeOnOutsideClick);
  }, [filterOpen]);

  const visibleColumns = columns.filter(column => visible.includes(column.key));
  const activeFilters = Object.entries(filters).filter(([, value]) => value.trim());

  const processed = useMemo(() => {
    const global = query.trim().toLocaleLowerCase("es-ES");
    const result = rows.map((row, index) => ({ row, index })).filter(({ row }) => {
      if (global && !columns.some(column => text(row[column.key]).toLocaleLowerCase("es-ES").includes(global))) return false;
      return Object.entries(filters).every(([key, value]) => !value.trim() || text(row[key]).toLocaleLowerCase("es-ES").includes(value.trim().toLocaleLowerCase("es-ES")));
    });
    if (sort) result.sort((left, right) => compare(left.row[sort.key], right.row[sort.key]) * (sort.direction === "asc" ? 1 : -1));
    return result;
  }, [rows, columns, query, filters, sort]);

  function toggleSort(key: string) {
    setSort(current => current?.key === key ? { key, direction: current.direction === "asc" ? "desc" : "asc" } : { key, direction: "asc" });
  }

  function openFilter(key: string) {
    if (filterOpen === key) {
      setFilterOpen(null);
      return;
    }
    setFilterDraft(filters[key] ?? "");
    setFilterOpen(key);
    setColumnsOpen(false);
  }

  function applyFilter(key: string) {
    setFilters(current => ({ ...current, [key]: filterDraft.trim() }));
    setFilterOpen(null);
  }

  function clearFilter(key: string) {
    setFilters(current => ({ ...current, [key]: "" }));
    setFilterDraft("");
    setFilterOpen(null);
  }

  function toggleColumn(key: string) {
    setVisible(current => current.includes(key) ? (current.length === 1 ? current : current.filter(item => item !== key)) : [...current, key]);
  }

  function exportCsv() {
    const header = visibleColumns.map(column => `"${column.label.replaceAll('"', '""')}"`).join(";");
    const body = processed.map(({ row }) => visibleColumns.map(column => `"${text(row[column.key]).replaceAll('"', '""')}"`).join(";")).join("\n");
    const blob = new Blob(["\ufeff" + header + "\n" + body], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${storageKey}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return <div className={styles.gridRoot}>
    <div className={styles.toolbar}>
      <input value={query} onChange={event => setQuery(event.target.value)} placeholder={searchPlaceholder} />
      <div className={styles.menuWrap}>
        <button type="button" className={styles.secondary} onClick={() => { setColumnsOpen(open => !open); setFilterOpen(null); }}>⚙ Columnas</button>
        {columnsOpen && <div className={styles.columnsMenu}>
          <strong>Personalizar vista</strong>
          {columns.map(column => <label key={column.key}><input type="checkbox" checked={visible.includes(column.key)} onChange={() => toggleColumn(column.key)} />{column.label}</label>)}
          <button type="button" onClick={() => setVisible(columns.map(column => column.key))}>Restablecer</button>
        </div>}
      </div>
      <button type="button" className={styles.secondary} onClick={() => { setQuery(""); setFilters({}); setSort(null); setFilterOpen(null); }}>Limpiar filtros</button>
      <button type="button" className={styles.export} onClick={exportCsv}>Exportar</button>
      <span className={styles.count}>{processed.length} resultado{processed.length === 1 ? "" : "s"}</span>
    </div>

    {activeFilters.length > 0 && <div className={styles.activeFilters} aria-label="Filtros activos">
      <span className={styles.activeFiltersLabel}>Filtros activos</span>
      {activeFilters.map(([key, value]) => {
        const column = columns.find(item => item.key === key);
        return <button type="button" key={key} className={styles.filterChip} onClick={() => clearFilter(key)} title="Quitar filtro">
          <span>{column?.label ?? key}: <strong>{value}</strong></span><b>×</b>
        </button>;
      })}
      <button type="button" className={styles.clearAll} onClick={() => setFilters({})}>Limpiar todos</button>
    </div>}

    <div className={styles.tableWrap}>
      <div className={styles.table} style={{ "--grid-columns": `repeat(${visibleColumns.length}, minmax(150px, 1fr))` } as React.CSSProperties}>
        <div className={`${styles.row} ${styles.head}`}>
          {visibleColumns.map(column => <div className={styles.headerCell} key={column.key}>
            <button type="button" className={styles.sortButton} onClick={() => toggleSort(column.key)}>
              <span className={styles.headerLabel}>{column.label}</span>
              {filters[column.key]?.trim() && <small>{filters[column.key]}</small>}
              <span className={styles.sortIcon}>{sort?.key === column.key ? (sort.direction === "asc" ? "▲" : "▼") : "↕"}</span>
            </button>
            <button type="button" aria-label={`Filtrar ${column.label}`} className={filters[column.key]?.trim() ? styles.filterActive : styles.filterButton} onClick={() => openFilter(column.key)}>⌄</button>
            {filterOpen === column.key && <div ref={filterMenuRef} className={styles.filterMenu}>
              <label>Filtrar {column.label}</label>
              <input
                autoFocus
                value={filterDraft}
                onChange={event => setFilterDraft(event.target.value)}
                onKeyDown={event => {
                  if (event.key === "Enter") { event.preventDefault(); applyFilter(column.key); }
                  if (event.key === "Escape") { event.preventDefault(); setFilterOpen(null); }
                }}
                placeholder={`Escribe y pulsa Enter`}
              />
              <div className={styles.filterActions}>
                <button type="button" onClick={() => clearFilter(column.key)}>Quitar filtro</button>
                <button type="button" className={styles.applyFilter} onClick={() => applyFilter(column.key)}>Aplicar</button>
              </div>
              <small>Enter aplica · Esc cierra</small>
            </div>}
          </div>)}
        </div>
        {processed.map(({ row, index }) => {
          const href = rowHrefs?.[index];
          const cells = visibleColumns.map((column, columnIndex) => <div key={column.key} className={styles.cell}>{columnIndex === 0 ? <strong>{text(row[column.key]) || "—"}</strong> : text(row[column.key]) || "—"}</div>);
          return href ? <Link href={href} target={openLinksInNewTab ? "_blank" : undefined} rel={openLinksInNewTab ? "noopener noreferrer" : undefined} className={styles.row} key={`${index}-${text(row[columns[0]?.key])}`}>{cells}</Link> : <div className={styles.row} key={`${index}-${text(row[columns[0]?.key])}`}>{cells}</div>;
        })}
        {!processed.length && <div className={styles.empty}>{emptyMessage}</div>}
      </div>
    </div>
  </div>;
}
