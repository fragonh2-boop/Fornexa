"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import styles from "./customs.module.css";

type Direction = "Importación" | "Exportación";

type CustomsFile = {
  id: string;
  direction: Direction;
  route: string;
  customer: string;
  customsOffice: string;
  regime: string;
  status: string;
  risk: "Bajo" | "Medio" | "Alto";
  mrn: string;
  deadline: string;
  progress: number;
};

const files: CustomsFile[] = [
  { id: "AD-260041", direction: "Importación", route: "Shenzhen → Valencia", customer: "Atlas Components", customsOffice: "Valencia Marítima", regime: "Libre práctica · H1", status: "Control documental", risk: "Medio", mrn: "26ES004611H1000842", deadline: "Hoy · 16:30", progress: 68 },
  { id: "AD-260040", direction: "Exportación", route: "Valencia → Casablanca", customer: "Mediterránea Retail", customsOffice: "Valencia", regime: "Exportación definitiva · AES", status: "Pendiente de salida", risk: "Bajo", mrn: "26ES004611A0006197", deadline: "Hoy · 19:00", progress: 82 },
  { id: "AD-260039", direction: "Importación", route: "Estambul → Barcelona", customer: "Nova Distribution", customsOffice: "Barcelona Marítima", regime: "Tránsito T1 · NCTS", status: "Falta certificado", risk: "Alto", mrn: "26ES000801T0002714", deadline: "Vencido · 2 h", progress: 45 },
  { id: "AD-260038", direction: "Exportación", route: "Madrid → Londres", customer: "Iberia Medical", customsOffice: "Madrid", regime: "Exportación definitiva · AES", status: "Salida confirmada", risk: "Bajo", mrn: "26ES002801A0011204", deadline: "Cerrado", progress: 100 },
];

const stages = [
  ["Operación creada", "Factura, Incoterm y partes validados", "done"],
  ["Clasificación", "TARIC 8507.60.00 · origen CN", "done"],
  ["Presentación", "H1 aceptada · MRN asignado", "done"],
  ["Control aduanero", "Revisión de valor y prueba de origen", "active"],
  ["Levante", "Pendiente de respuesta AEAT", "pending"],
  ["Cierre", "Conciliación y archivo legal", "pending"],
];

const documents = [
  ["Factura comercial", "INV-2026-1842.pdf", "Validado"],
  ["Packing list", "PKL-2026-1842.pdf", "Validado"],
  ["Conocimiento marítimo", "BL-SZX-VLC-88031.pdf", "Validado"],
  ["Prueba de origen", "Pendiente de aportar", "Falta"],
  ["Declaración H1", "Versión 3 · aceptada", "AEAT"],
];

export default function CustomsPage() {
  const [direction, setDirection] = useState<"Todas" | Direction>("Todas");
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState(files[0].id);
  const [showNew, setShowNew] = useState(false);

  const filtered = useMemo(() => files.filter((file) => {
    const matchesDirection = direction === "Todas" || file.direction === direction;
    const haystack = `${file.id} ${file.mrn} ${file.customer} ${file.route}`.toLowerCase();
    return matchesDirection && haystack.includes(query.trim().toLowerCase());
  }), [direction, query]);

  const selected = filtered.find((file) => file.id === selectedId) ?? filtered[0] ?? files[0];

  return (
    <main className={styles.shell}>
      <aside className={styles.sidebar}>
        <Link href="/dashboard" className={styles.brand}>FORNEXA</Link>
        <nav className={styles.nav}>
          <Link href="/dashboard">Control Tower</Link>
          <Link href="/dashboard/decision-center">Decision Center</Link>
          <Link href="/dashboard/partidas">Partidas</Link>
          <Link href="/dashboard/expediciones">Expediciones</Link>
          <Link href="/dashboard/viajes">Viajes</Link>
          <Link className={styles.active} href="/dashboard/aduanas">Aduanas</Link>
          <Link href="/dashboard/epod-cmr">ePOD & CMR</Link>
          <Link href="/dashboard/integraciones">Integraciones</Link>
          <Link href="/dashboard/informes">Informes</Link>
        </nav>
        <div className={styles.sidebarFooter}><span>España · CAU</span><small>Entorno de demostración</small></div>
      </aside>

      <section className={styles.content}>
        <header className={styles.header}>
          <div><p className={styles.eyebrow}>CUSTOMS CONTROL</p><h1>Cadena documental aduanera</h1><p>Un expediente, todos los actores, documentos y respuestas oficiales.</p></div>
          <div className={styles.headerActions}><button className={styles.secondary}>Importar documentos</button><button onClick={() => setShowNew(true)}>+ Nuevo expediente</button><div className={styles.avatar}>FG</div></div>
        </header>

        <section className={styles.metrics}>
          <article><span>Expedientes abiertos</span><strong>18</strong><small>7 import · 11 export</small></article>
          <article><span>Pendientes de Aduana</span><strong>6</strong><small>2 requieren actuación</small></article>
          <article><span>Riesgo documental</span><strong className={styles.warning}>3</strong><small>1 plazo vencido</small></article>
          <article><span>Levante medio</span><strong>4 h 18 m</strong><small>−12% este mes</small></article>
        </section>

        <section className={styles.workspace}>
          <article className={styles.inbox}>
            <div className={styles.panelHeader}><div><p className={styles.eyebrow}>BANDEJA OPERATIVA</p><h2>Expedientes</h2></div><span>{filtered.length} visibles</span></div>
            <div className={styles.filters}>
              <input aria-label="Buscar expedientes" placeholder="Buscar ID, MRN, cliente o ruta" value={query} onChange={(event) => setQuery(event.target.value)} />
              <div className={styles.segmented}>{(["Todas", "Importación", "Exportación"] as const).map((item) => <button key={item} className={direction === item ? styles.selectedFilter : ""} onClick={() => setDirection(item)}>{item}</button>)}</div>
            </div>
            <div className={styles.fileList}>
              {filtered.map((file) => <button className={`${styles.fileCard} ${selected.id === file.id ? styles.selectedFile : ""}`} key={file.id} onClick={() => setSelectedId(file.id)}>
                <div><span className={styles.fileId}>{file.id}</span><span className={`${styles.risk} ${styles[`risk${file.risk}`]}`}>{file.risk}</span></div>
                <strong>{file.route}</strong><p>{file.customer} · {file.regime}</p>
                <div className={styles.fileMeta}><span>{file.status}</span><time>{file.deadline}</time></div>
                <div className={styles.progress}><i style={{ width: `${file.progress}%` }} /></div>
              </button>)}
              {filtered.length === 0 && <p className={styles.empty}>No hay expedientes que coincidan con los filtros.</p>}
            </div>
          </article>

          <article className={styles.detail}>
            <div className={styles.detailTop}><div><p className={styles.eyebrow}>{selected.direction} · {selected.id}</p><h2>{selected.route}</h2><p>{selected.customer} · {selected.customsOffice}</p></div><div className={styles.detailState}><span>{selected.status}</span><strong>{selected.progress}%</strong></div></div>
            <div className={styles.identityGrid}>
              <div><span>MRN</span><strong>{selected.mrn}</strong></div><div><span>Régimen</span><strong>{selected.regime}</strong></div><div><span>Plazo</span><strong>{selected.deadline}</strong></div>
            </div>

            <div className={styles.alert}><strong>Acción requerida</strong><span>Aportar prueba de origen antes de solicitar el levante. Responsable: Atlas Components.</span><button>Solicitar documento</button></div>

            <div className={styles.detailGrid}>
              <section><div className={styles.subheading}><h3>Cadena de hitos</h3><span>España · Importación H1</span></div><ol className={styles.timeline}>{stages.map(([title, note, state]) => <li className={styles[state]} key={title}><i /><div><strong>{title}</strong><span>{note}</span></div></li>)}</ol></section>
              <section><div className={styles.subheading}><h3>Control documental</h3><span>4 de 5 completos</span></div><div className={styles.documents}>{documents.map(([name, file, state]) => <div key={name}><span><strong>{name}</strong><small>{file}</small></span><b className={state === "Falta" ? styles.missing : ""}>{state}</b></div>)}</div></section>
            </div>

            <div className={styles.bottomGrid}>
              <section><h3>Actores y responsabilidades</h3><p><span>Importador</span><strong>Atlas Components, S.L.</strong></p><p><span>Representante</span><strong>Fornexa Customs Partner</strong></p><p><span>Transportista</span><strong>OceanBridge Lines</strong></p></section>
              <section><h3>Liquidación estimada</h3><p><span>Valor en aduana</span><strong>48.620,00 €</strong></p><p><span>Arancel</span><strong>1.458,60 €</strong></p><p><span>IVA importación</span><strong>10.516,51 €</strong></p></section>
              <section><h3>Trazabilidad</h3><p><span>Último mensaje</span><strong>AEAT · H1 aceptada</strong></p><p><span>Versión</span><strong>Declaración v3</strong></p><p><span>Actualizado</span><strong>Hoy · 12:14</strong></p></section>
            </div>
          </article>
        </section>
      </section>

      {showNew && <div className={styles.modalBackdrop} onMouseDown={() => setShowNew(false)}><section className={styles.modal} onMouseDown={(event) => event.stopPropagation()}><button className={styles.close} onClick={() => setShowNew(false)}>×</button><p className={styles.eyebrow}>NUEVO EXPEDIENTE</p><h2>Iniciar control aduanero</h2><p>Selecciona el flujo. Fornexa creará la lista documental y los hitos aplicables.</p><label>Tipo de operación<select><option>Importación en España</option><option>Exportación desde España</option><option>Tránsito</option></select></label><label>Referencia comercial<input placeholder="Pedido, factura o expediente" /></label><label>País de origen<input placeholder="Ej. China" /></label><button onClick={() => setShowNew(false)}>Crear borrador</button></section></div>}
    </main>
  );
}
