"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import DataGrid, { type GridColumn, type GridRow } from "../../components/DataGrid";
import styles from "./cmr.module.css";

const columns: GridColumn[] = [
  { key: "cmr", label: "CMR" },
  { key: "expedicion", label: "Expedición" },
  { key: "viaje", label: "Viaje" },
  { key: "ruta", label: "Ruta" },
  { key: "fecha", label: "Fecha carga" },
  { key: "firmas", label: "Firmas" },
  { key: "reservas", label: "Reservas" },
  { key: "estado", label: "Estado" },
];

const seed: GridRow[] = [
  { cmr: "CMR-260128", expedicion: "EX-260071", viaje: "VJ-260041", ruta: "Valencia → Lyon", fecha: "05/08/2026", firmas: "2/3", reservas: "Sin reservas", estado: "Pendiente de firma" },
  { cmr: "CMR-260127", expedicion: "EX-260069", viaje: "VJ-260039", ruta: "Madrid → Toulouse", fecha: "04/08/2026", firmas: "3/3", reservas: "1 reserva", estado: "Entregado con reservas" },
  { cmr: "CMR-260126", expedicion: "EX-260070", viaje: "VJ-260040", ruta: "Barcelona → Marseille", fecha: "06/08/2026", firmas: "1/3", reservas: "Sin reservas", estado: "En tránsito" },
];

const nav = [
  ["Control Tower", "/dashboard"],
  ["Partidas", "/dashboard/partidas"],
  ["Expediciones", "/dashboard/expediciones"],
  ["Viajes", "/dashboard/viajes"],
  ["Clientes", "/dashboard/clientes"],
  ["Colaboradores", "/dashboard/colaboradores"],
  ["ePOD & CMR", "/dashboard/epod-cmr"],
] as const;

export default function CmrPage() {
  const [rows] = useState(seed);
  const metrics = useMemo(() => ({
    activos: rows.filter(row => !["Cerrado", "Entregado conforme"].includes(String(row.estado))).length,
    pendientes: rows.filter(row => String(row.firmas) !== "3/3").length,
    reservas: rows.filter(row => String(row.reservas) !== "Sin reservas").length,
  }), [rows]);

  return <main className={styles.shell}>
    <aside className={styles.sidebar}>
      <Link href="/dashboard" className={styles.brand}>FORNEXA</Link>
      <nav>{nav.map(([label, href]) => <Link key={href} href={href} className={href === "/dashboard/epod-cmr" ? styles.active : ""}>{label}</Link>)}</nav>
    </aside>

    <section className={styles.content}>
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>DOCUMENTACIÓN DIGITAL</p>
          <h1>ePOD & CMR</h1>
          <p>Generación, firma, reservas, evidencias y cierre documental del transporte.</p>
        </div>
        <div className={styles.actions}>
          <Link href="/dashboard/epod-cmr/nuevo" className={styles.primary}>+ Nuevo CMR</Link>
          <div className={styles.avatar}>FG</div>
        </div>
      </header>

      <section className={styles.metrics}>
        <article><span>Documentos activos</span><strong>{metrics.activos}</strong></article>
        <article><span>Pendientes de firma</span><strong>{metrics.pendientes}</strong></article>
        <article><span>Con reservas</span><strong>{metrics.reservas}</strong></article>
      </section>

      <section className={styles.panel}>
        <div className={styles.panelHeader}>
          <div><span>CMR LIVE</span><h2>Documentos recientes</h2></div>
          <p>Los datos se alimentan desde expediciones y viajes; solo se completan los campos que falten.</p>
        </div>
        <DataGrid
          storageKey="cmr-documents"
          columns={columns}
          rows={rows}
          rowHrefs={rows.map(row => `/dashboard/epod-cmr/${row.cmr}`)}
          searchPlaceholder="Buscar por CMR, expedición, viaje, ruta o estado"
          emptyMessage="No hay documentos CMR que coincidan con los filtros."
        />
      </section>
    </section>
  </main>;
}
