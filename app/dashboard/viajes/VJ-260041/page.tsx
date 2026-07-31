"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import styles from "./trip.module.css";

type Assignment = {
  id: string;
  route: string;
  client: string;
  pallets: number;
  weight: number;
  volume: number;
  ldm: number;
  adr: boolean;
};

const initialAssignments: Assignment[] = [
  { id: "EX-260071", route: "Valencia → Lyon", client: "Mediterránea Retail", pallets: 3, weight: 840, volume: 5.2, ldm: 1.2, adr: false },
  { id: "EX-260074", route: "Castellón → Saint-Priest", client: "Atlas Components", pallets: 5, weight: 1260, volume: 8.4, ldm: 2.0, adr: true },
  { id: "EX-260078", route: "Alicante → Grenoble", client: "Nova Distribution", pallets: 2, weight: 510, volume: 3.1, ldm: 0.8, adr: false },
];

const alternatives = [
  { id: "VJ-260044", route: "Valencia → Lyon", departure: "Hoy 18:30", occupancy: 76, impact: "+0 km", score: 96 },
  { id: "VJ-260046", route: "Barcelona → Lyon", departure: "Mañana 08:00", occupancy: 69, impact: "+18 km", score: 88 },
];

export default function TripDetailPage() {
  const [assignments, setAssignments] = useState(initialAssignments);
  const [selected, setSelected] = useState<Assignment | null>(null);
  const [notice, setNotice] = useState<string>("");

  const totals = useMemo(() => assignments.reduce((acc, item) => ({
    pallets: acc.pallets + item.pallets,
    weight: acc.weight + item.weight,
    volume: acc.volume + item.volume,
    ldm: acc.ldm + item.ldm,
  }), { pallets: 0, weight: 0, volume: 0, ldm: 0 }), [assignments]);

  function replan(destination?: string) {
    if (!selected) return;
    setAssignments(current => current.filter(item => item.id !== selected.id));
    setNotice(destination
      ? `${selected.id} se ha movido a ${destination}. La capacidad y el margen del viaje se han recalculado.`
      : `${selected.id} se ha devuelto a expediciones pendientes. La asignación anterior queda registrada en el historial.`);
    setSelected(null);
  }

  return <main className={styles.shell}>
    <aside className={styles.sidebar}>
      <Link href="/dashboard" className={styles.brand}>FORNEXA</Link>
      <nav>
        <Link href="/dashboard">Control Tower</Link>
        <Link href="/dashboard/decision-center">Decision Center</Link>
        <Link href="/dashboard/partidas">Partidas</Link>
        <Link href="/dashboard/expediciones">Expediciones</Link>
        <Link className={styles.active} href="/dashboard/viajes">Viajes</Link>
      </nav>
    </aside>

    <section className={styles.content}>
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>VIAJE · PLANIFICACIÓN DINÁMICA</p>
          <h1>VJ-260041</h1>
          <p>Valencia → Lyon · Salida prevista hoy, 18:30</p>
        </div>
        <div className={styles.headerActions}>
          <button className={styles.secondary}>Editar viaje</button>
          <button>Cerrar planificación</button>
        </div>
      </header>

      {notice && <div className={styles.notice}><strong>Replanificación completada</strong><span>{notice}</span><button onClick={() => setNotice("")}>×</button></div>}

      <section className={styles.metrics}>
        <article><span>Expediciones</span><strong>{assignments.length}</strong></article>
        <article><span>Palés</span><strong>{totals.pallets}</strong></article>
        <article><span>Peso</span><strong>{totals.weight.toLocaleString("es-ES")} kg</strong></article>
        <article><span>Volumen</span><strong>{totals.volume.toFixed(1)} m³</strong></article>
        <article><span>Metros lineales</span><strong>{totals.ldm.toFixed(1)} ml</strong></article>
        <article><span>Ocupación estimada</span><strong>{Math.round((totals.ldm / 13.6) * 100)}%</strong></article>
      </section>

      <section className={styles.layout}>
        <article className={styles.panel}>
          <div className={styles.panelTitle}>
            <div><p className={styles.eyebrow}>CARGA ASIGNADA</p><h2>Expediciones del viaje</h2></div>
            <button className={styles.secondary}>+ Asignar expedición</button>
          </div>

          <div className={styles.table}>
            <div className={`${styles.row} ${styles.head}`}>
              <span>Expedición</span><span>Ruta / cliente</span><span>Carga</span><span>ADR</span><span></span>
            </div>
            {assignments.map(item => <div className={styles.row} key={item.id}>
              <strong>{item.id}</strong>
              <span><b>{item.route}</b><small>{item.client}</small></span>
              <span><b>{item.pallets} palés · {item.weight} kg</b><small>{item.volume} m³ · {item.ldm} ml</small></span>
              <span>{item.adr ? <em className={styles.adr}>ADR</em> : "No"}</span>
              <button className={styles.linkButton} onClick={() => setSelected(item)}>Replanificar</button>
            </div>)}
            {assignments.length === 0 && <div className={styles.empty}>Este viaje no tiene expediciones asignadas.</div>}
          </div>
        </article>

        <aside className={styles.insight}>
          <p className={styles.eyebrow}>FORNEXA INTELLIGENCE</p>
          <h2>Impacto operativo</h2>
          <div className={styles.score}><strong>{Math.round((totals.ldm / 13.6) * 100)}%</strong><span>ocupación actual</span></div>
          <ul>
            <li><span>Capacidad restante</span><b>{Math.max(0, 13.6 - totals.ldm).toFixed(1)} ml</b></li>
            <li><span>Peso restante estimado</span><b>{Math.max(0, 24000 - totals.weight).toLocaleString("es-ES")} kg</b></li>
            <li><span>Riesgo operativo</span><b>Bajo</b></li>
          </ul>
          <p className={styles.hint}>Al mover una expedición, FORNEXA recalcula automáticamente capacidad, ocupación y compatibilidad.</p>
        </aside>
      </section>
    </section>

    {selected && <div className={styles.overlay} role="dialog" aria-modal="true">
      <section className={styles.modal}>
        <div className={styles.modalHeader}>
          <div><p className={styles.eyebrow}>REPLANIFICAR EXPEDICIÓN</p><h2>{selected.id}</h2><p>{selected.route} · {selected.client}</p></div>
          <button className={styles.close} onClick={() => setSelected(null)}>×</button>
        </div>

        <div className={styles.warning}>
          <strong>No se eliminará la expedición.</strong>
          <span>Solo se cerrará su asignación al viaje VJ-260041. El cambio quedará trazado con usuario, fecha y motivo.</span>
        </div>

        <h3>Viajes compatibles</h3>
        <div className={styles.alternatives}>
          {alternatives.map(option => <button key={option.id} onClick={() => replan(option.id)}>
            <span><strong>{option.id}</strong><small>{option.route} · {option.departure}</small></span>
            <span><b>{option.score}% compatible</b><small>{option.occupancy}% ocupado · {option.impact}</small></span>
          </button>)}
        </div>

        <div className={styles.modalFooter}>
          <button className={styles.secondary} onClick={() => setSelected(null)}>Cancelar</button>
          <button className={styles.secondary} onClick={() => replan()}>Devolver a pendientes</button>
          <button onClick={() => replan(alternatives[0].id)}>Mover al recomendado</button>
        </div>
      </section>
    </div>}
  </main>;
}
