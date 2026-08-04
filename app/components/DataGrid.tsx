"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
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

export default function DataGrid({ storageKey, columns, rows, rowHrefs, searchPlaceholder = "Buscar...", emptyMessage = "No hay resultados." }: Props) {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortState>(null);
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [visible, setVisible] = useState<string[]>(columns.map(column => column.key));
  const [columnsOpen, setColumnsOpen] = useState(false);
  const [filterOpen, setFilterOpen] = useState<string | null>(null);

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

  const visibleColumns = columns.filter(column => visible.includes(column.key));
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
        <button type="button" className={styles.secondary} onClick={() => setColumnsOpen(open => !open)}>⚙ Columnas</button>
        {columnsOpen && <div className={styles.columnsMenu}>
          <strong>Personalizar vista</strong>
          {columns.map(column => <label key={column.key}><input type="checkbox" checked={visible.includes(column.key)} onChange={() => toggleColumn(column.key)} />{column.label}</label>)}
          <button type="button" onClick={() => setVisible(columns.map(column => column.key))}>Restablecer</button>
        </div>}
      </div>
      <button type="button" className={styles.secondary} onClick={() => { setQuery(""); setFilters({}); setSort(null); }}>Limpiar filtros</button>
      <button type="button" className={styles.export} onClick={exportCsv}>Exportar</button>
      <span className={styles.count}>{processed.length} resultado{processed.length === 1 ? "" : "s"}</span>
    </div>

    <div className={styles.tableWrap}>
      <div className={styles.table} style={{ "--grid-columns": `repeat(${visibleColumns.length}, minmax(150px, 1fr))` } as React.CSSProperties}>
        <div className={`${styles.row} ${styles.head}`}>
          {visibleColumns.map(column => <div className={styles.headerCell} key={column.key}>
            <button type="button" onClick={() => toggleSort(column.key)}>{column.label}<span>{sort?.key === column.key ? (sort.direction === "asc" ? "▲" : "▼") : "↕"}</span></button>
            <button type="button" className={filters[column.key] ? styles.filterActive : styles.filterButton} onClick={() => setFilterOpen(filterOpen === column.key ? null : column.key)}>⌄</button>
            {filterOpen === column.key && <div className={styles.filterMenu}><input autoFocus value={filters[column.key] ?? ""} onChange={event => setFilters(current => ({ ...current, [column.key]: event.target.value }))} placeholder={`Filtrar ${column.label}`} /><button type="button" onClick={() => setFilters(current => ({ ...current, [column.key]: "" }))}>Quitar filtro</button></div>}
          </div>)}
        </div>
        {processed.map(({ row, index }) => {
          const href = rowHrefs?.[index];
          const cells = visibleColumns.map((column, columnIndex) => <div key={column.key} className={styles.cell}>{columnIndex === 0 ? <strong>{text(row[column.key]) || "—"}</strong> : text(row[column.key]) || "—"}</div>);
          return href ? <Link href={href} className={styles.row} key={`${index}-${text(row[columns[0]?.key])}`}>{cells}</Link> : <div className={styles.row} key={`${index}-${text(row[columns[0]?.key])}`}>{cells}</div>;
        })}
        {!processed.length && <div className={styles.empty}>{emptyMessage}</div>}
      </div>
    </div>
  </div>;
}
