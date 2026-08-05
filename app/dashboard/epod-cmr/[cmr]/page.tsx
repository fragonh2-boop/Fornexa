"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import styles from "./cmr-document.module.css";

const documents: Record<string, {
  expedicion: string; viaje: string; fecha: string; estado: string;
  remitente: string; remitenteDireccion: string; destinatario: string; destinatarioDireccion: string;
  carga: string; entrega: string; transportista: string; tractor: string; remolque: string;
  marcas: string; bultos: string; embalaje: string; mercancia: string; peso: string; volumen: string;
  instrucciones: string; firmas: string; reservas: string;
}> = {
  "CMR-260128": {
    expedicion: "EX-260071", viaje: "VJ-260041", fecha: "05/08/2026", estado: "Pendiente de firma",
    remitente: "Mediterránea Retail, S.L.", remitenteDireccion: "Av. del Puerto, 120 · 46023 Valencia · España",
    destinatario: "Rhône Distribution SAS", destinatarioDireccion: "12 Rue de l'Industrie · 69007 Lyon · Francia",
    carga: "Plataforma Valencia · 05/08/2026 09:00", entrega: "Rhône Distribution · 06/08/2026 14:00",
    transportista: "Velocity Transinternacional, S.L.", tractor: "1234 LBC", remolque: "R-5678-BBN",
    marcas: "MR-260805", bultos: "10", embalaje: "Palets EUR", mercancia: "Componentes de automoción",
    peso: "5.840 kg", volumen: "18,40 m³", instrucciones: "No apilable · Avisar antes de la entrega",
    firmas: "Expedidor y transportista firmados. Destinatario pendiente.", reservas: "Sin reservas",
  },
  "CMR-260127": {
    expedicion: "EX-260069", viaje: "VJ-260039", fecha: "04/08/2026", estado: "Entregado con reservas",
    remitente: "Atlas Components, S.A.", remitenteDireccion: "C/ Hierro, 42 · 28045 Madrid · España",
    destinatario: "Occitanie Parts SARL", destinatarioDireccion: "8 Avenue des États-Unis · 31200 Toulouse · Francia",
    carga: "Atlas Madrid · 04/08/2026 08:30", entrega: "Occitanie Parts · 05/08/2026 11:42",
    transportista: "Transportes Ibéricos, S.L.", tractor: "9012 RST", remolque: "R-1122-CDD",
    marcas: "AT-44891", bultos: "4", embalaje: "Palets EUR", mercancia: "Recambios industriales",
    peso: "2.160 kg", volumen: "8,10 m³", instrucciones: "Entrega con cita previa",
    firmas: "3/3 firmas completadas.", reservas: "1 palet con embalaje exterior golpeado. Fotografías adjuntas.",
  },
  "CMR-260126": {
    expedicion: "EX-260070", viaje: "VJ-260040", fecha: "06/08/2026", estado: "En tránsito",
    remitente: "Nova Distribution, S.L.", remitenteDireccion: "Zona Franca, Sector B · 08040 Barcelona · España",
    destinatario: "Provence Logistique SAS", destinatarioDireccion: "25 Boulevard du Capitaine Gèze · 13014 Marseille · Francia",
    carga: "Barcelona ZAL · 06/08/2026 07:30", entrega: "Provence Logistique · 07/08/2026 10:00",
    transportista: "Velocity Transinternacional, S.L.", tractor: "5678 MNP", remolque: "R-3344-EFG",
    marcas: "ND-260806", bultos: "6", embalaje: "Palets EUR", mercancia: "Bienes de consumo",
    peso: "3.420 kg", volumen: "12,75 m³", instrucciones: "Mantener seco · No transbordar",
    firmas: "Firma de expedidor completada.", reservas: "Sin reservas",
  },
};

export default function CmrDocumentPage() {
  const params = useParams<{ cmr: string }>();
  const cmr = decodeURIComponent(params.cmr);
  const doc = documents[cmr] ?? documents["CMR-260128"];

  function exportPdf() {
    const previousTitle = document.title;
    document.title = `${cmr}-${doc.expedicion}`;
    window.print();
    window.setTimeout(() => { document.title = previousTitle; }, 500);
  }

  return <main className={styles.page}>
    <header className={styles.appHeader}>
      <div>
        <Link href="/dashboard/epod-cmr" className={styles.back}>← ePOD & CMR</Link>
        <h1>{cmr}</h1>
        <p>{doc.expedicion} · {doc.viaje} · {doc.estado}</p>
      </div>
      <div className={styles.actions}>
        <button type="button" className={styles.secondary} onClick={() => window.print()}>Imprimir</button>
        <button type="button" className={styles.primary} onClick={exportPdf}>Exportar PDF</button>
      </div>
    </header>

    <section className={styles.paper}>
      <div className={styles.paperHeader}>
        <div><strong>CARTA DE PORTE INTERNACIONAL</strong><span>Convention relative au contrat de transport international de marchandises par route (CMR)</span></div>
        <div className={styles.documentNumber}><span>N.º CMR</span><strong>{cmr}</strong></div>
      </div>

      <div className={styles.gridTwo}>
        <article><span className={styles.boxNumber}>1</span><h2>Expedidor</h2><strong>{doc.remitente}</strong><p>{doc.remitenteDireccion}</p></article>
        <article><span className={styles.boxNumber}>16</span><h2>Transportista</h2><strong>{doc.transportista}</strong><p>Tractor: {doc.tractor}<br/>Remolque: {doc.remolque}</p></article>
        <article><span className={styles.boxNumber}>2</span><h2>Destinatario</h2><strong>{doc.destinatario}</strong><p>{doc.destinatarioDireccion}</p></article>
        <article><span className={styles.boxNumber}>17</span><h2>Transportistas sucesivos</h2><p>No declarados</p></article>
        <article><span className={styles.boxNumber}>3</span><h2>Lugar previsto para la entrega</h2><p>{doc.entrega}</p></article>
        <article><span className={styles.boxNumber}>18</span><h2>Reservas y observaciones del transportista</h2><p>{doc.reservas}</p></article>
        <article><span className={styles.boxNumber}>4</span><h2>Lugar y fecha de carga</h2><p>{doc.carga}</p></article>
        <article><span className={styles.boxNumber}>19</span><h2>Estipulaciones particulares</h2><p>{doc.instrucciones}</p></article>
      </div>

      <section className={styles.goods}>
        <div className={styles.goodsHead}><span>6 Marcas y números</span><span>7 Nº bultos</span><span>8 Embalaje</span><span>9 Naturaleza de la mercancía</span><span>11 Peso bruto</span><span>12 Volumen</span></div>
        <div className={styles.goodsRow}><span>{doc.marcas}</span><span>{doc.bultos}</span><span>{doc.embalaje}</span><span>{doc.mercancia}</span><span>{doc.peso}</span><span>{doc.volumen}</span></div>
      </section>

      <div className={styles.gridTwoBottom}>
        <article><span className={styles.boxNumber}>13</span><h2>Instrucciones del remitente</h2><p>{doc.instrucciones}</p></article>
        <article><span className={styles.boxNumber}>15</span><h2>Reembolso / Incoterm</h2><p>Sin reembolso · Condición de entrega según expedición</p></article>
      </div>

      <section className={styles.signatures}>
        <article><span>22</span><h2>Firma y sello del expedidor</h2><div className={styles.signatureState}>Firmado electrónicamente</div></article>
        <article><span>23</span><h2>Firma y sello del transportista</h2><div className={styles.signatureState}>Firmado electrónicamente</div></article>
        <article><span>24</span><h2>Firma y sello del destinatario</h2><div className={styles.signatureState}>{doc.firmas}</div></article>
      </section>

      <footer className={styles.paperFooter}>
        <span>Generado por FORNEXA · Documento electrónico con trazabilidad</span>
        <span>{doc.fecha} · {cmr}</span>
      </footer>
    </section>
  </main>;
}
