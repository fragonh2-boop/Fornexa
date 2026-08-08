"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import styles from "./nuevo-cmr.module.css";

type FormState = {
  source: string; expedicion: string; viaje: string; expedidor: string; destinatario: string; carga: string; entrega: string;
  transportista: string; matricula: string; remolque: string; mercancia: string; bultos: string; embalaje: string; peso: string; volumen: string; instrucciones: string;
  adr: string; adrRegime: string; unNumber: string; adrClass: string; packingGroup: string; tunnelCode: string; adrDescription: string;
};

type StoredPartida={id:string;cliente?:string;remitente?:string;destinatario?:string;origen?:string;destino?:string;bultos?:string;peso?:string;volumen?:string;adr?:string;adrRegime?:string;unNumber?:string;adrClass?:string;packingGroup?:string;tunnelCode?:string;adrDescription?:string};
type StoredExpedicion={id:string;partidas?:string[];viajeId?:string};

const initial: FormState = {
  source: "expedicion", expedicion: "EX-260071", viaje: "VJ-260041", expedidor: "Mediterránea Retail · Valencia", destinatario: "Rhône Distribution · Lyon",
  carga: "REC-001 · Av. Puerto de Alicante 13, Riba-roja de Túria", entrega: "ENT-014 · 18 Rue de l'Industrie, 69007 Lyon", transportista: "Velocity Transinternacional, S.L.",
  matricula: "1234 LBC", remolque: "R-9876 BCD", mercancia: "Componentes de automoción", bultos: "10", embalaje: "Palet EUR", peso: "5840", volumen: "18,40",
  instrucciones: "No apilable · Avisar antes de entregar", adr: "N", adrRegime: "", unNumber: "", adrClass: "", packingGroup: "", tunnelCode: "", adrDescription: "",
};

export default function NuevoCmrPage() {
  const [form, setForm] = useState(initial);
  const [saved, setSaved] = useState(false);
  const [inheritance, setInheritance] = useState("");
  const missing = useMemo(() => [!form.expedidor && "Expedidor",!form.destinatario && "Destinatario",!form.carga && "Lugar de carga",!form.entrega && "Lugar de entrega",!form.transportista && "Transportista",!form.mercancia && "Mercancía",!form.peso && "Peso bruto",form.adr==="S"&&!form.adrRegime&&"Régimen ADR"].filter(Boolean) as string[], [form]);
  const completeness = Math.round(((8 - missing.length) / 8) * 100);

  function set<K extends keyof FormState>(key: K, value: FormState[K]) { setForm(current => ({ ...current, [key]: value })); setSaved(false); }

  function inheritFromExpedition(expeditionId:string){
    try{
      const expediciones=JSON.parse(localStorage.getItem("fornexa-expediciones")||"[]") as StoredExpedicion[];
      const partidas=JSON.parse(localStorage.getItem("fornexa-partidas")||"[]") as StoredPartida[];
      const expedition=expediciones.find(x=>x.id===expeditionId);if(!expedition?.partidas?.length){setInheritance("");return}
      const lines=partidas.filter(x=>expedition.partidas!.includes(x.id));if(!lines.length){setInheritance("");return}
      const adrLines=lines.filter(x=>x.adr==="S");const first=adrLines[0];const declared=lines.filter(x=>x.adr==="S"||x.adr==="N");
      setForm(current=>({...current,
        viaje:expedition.viajeId||current.viaje,
        expedidor:lines[0].cliente||lines[0].remitente||current.expedidor,
        carga:lines[0].origen||current.carga,entrega:lines[0].destino||current.entrega,
        bultos:String(lines.reduce((sum,x)=>sum+Number(x.bultos||0),0)||current.bultos),
        peso:String(lines.reduce((sum,x)=>sum+Number(x.peso||0),0)||current.peso),
        volumen:String(lines.reduce((sum,x)=>sum+Number(x.volumen||0),0)||current.volumen),
        adr:adrLines.length?"S":declared.length===lines.length?"N":"",
        adrRegime:first?.adrRegime||"",unNumber:first?.unNumber||"",adrClass:first?.adrClass||"",packingGroup:first?.packingGroup||"",tunnelCode:first?.tunnelCode||"",adrDescription:first?.adrDescription||"",
      }));
      setInheritance(adrLines.length?`ADR heredado de ${first.id}. La expedición contiene ${adrLines.length} partida${adrLines.length===1?"":"s"} ADR.`:"La expedición no contiene partidas ADR declaradas.");
    }catch{setInheritance("")}
  }

  useEffect(()=>{inheritFromExpedition(form.expedicion)},[]);

  function save() {
    if (missing.length) return;
    try { const raw = localStorage.getItem("fornexa-cmr-documents"); const current = raw ? JSON.parse(raw) : []; const document = { id: `CMR-${Date.now().toString().slice(-6)}`, ...form, status: "Borrador", createdAt: new Date().toISOString() }; localStorage.setItem("fornexa-cmr-documents", JSON.stringify([document, ...(Array.isArray(current) ? current : [])])); setSaved(true); } catch { setSaved(true); }
  }

  return <main className={styles.page}>
    <header className={styles.topbar}><div><Link href="/dashboard/epod-cmr">← ePOD & CMR</Link><span>Nuevo documento</span></div><div className={styles.actions}><button className={styles.secondary}>Vista previa</button><button onClick={save} disabled={missing.length > 0}>Guardar borrador</button></div></header>
    <section className={styles.hero}><div><p>CMR LIVE</p><h1>Crear CMR</h1><span>Selecciona la expedición o el viaje y completa únicamente los datos pendientes.</span></div><aside><strong>{completeness}%</strong><span>completado</span>{missing.length ? <small>Falta: {missing.join(", ")}</small> : <small>Listo para emitir</small>}</aside></section>
    {saved && <div className={styles.notice}>CMR guardado como borrador. Ya puede continuar con firmas, evidencias y emisión.</div>}
    {inheritance&&<div className={styles.notice}>{inheritance}</div>}

    <section className={styles.card}><div className={styles.sectionTitle}><span>1</span><div><h2>Documento de origen</h2><p>El CMR hereda los datos de la estructura operativa, incluido ADR.</p></div></div><div className={styles.grid3}><label>Crear desde<select value={form.source} onChange={e => set("source", e.target.value)}><option value="expedicion">Expedición</option><option value="viaje">Viaje</option></select></label><label>Expedición<input value={form.expedicion} onChange={e=>{const value=e.target.value;set("expedicion",value);inheritFromExpedition(value)}} /></label><label>Viaje<input value={form.viaje} onChange={e => set("viaje", e.target.value)} /></label></div></section>
    <section className={styles.card}><div className={styles.sectionTitle}><span>2</span><div><h2>Partes y lugares</h2><p>Expedidor y destinatario pueden diferir de los puntos físicos de carga y entrega.</p></div></div><div className={styles.grid2}><label>Expedidor<input value={form.expedidor} onChange={e => set("expedidor", e.target.value)} /></label><label>Destinatario<input value={form.destinatario} onChange={e => set("destinatario", e.target.value)} /></label><label>Lugar de carga<input value={form.carga} onChange={e => set("carga", e.target.value)} /></label><label>Lugar de entrega<input value={form.entrega} onChange={e => set("entrega", e.target.value)} /></label></div></section>
    <section className={styles.card}><div className={styles.sectionTitle}><span>3</span><div><h2>Transporte</h2><p>Datos procedentes del viaje y editables mientras el CMR siga en borrador.</p></div></div><div className={styles.grid3}><label>Transportista<input value={form.transportista} onChange={e => set("transportista", e.target.value)} /></label><label>Matrícula tractor<input value={form.matricula} onChange={e => set("matricula", e.target.value)} /></label><label>Matrícula remolque<input value={form.remolque} onChange={e => set("remolque", e.target.value)} /></label></div></section>
    <section className={styles.card}><div className={styles.sectionTitle}><span>4</span><div><h2>Mercancía</h2><p>Los datos ADR proceden de la partida/pedido y se traspasan automáticamente al documento.</p></div></div><div className={styles.grid3}><label>Descripción<input value={form.mercancia} onChange={e => set("mercancia", e.target.value)} /></label><label>Número de bultos<input value={form.bultos} onChange={e => set("bultos", e.target.value)} /></label><label>Embalaje<input value={form.embalaje} onChange={e => set("embalaje", e.target.value)} /></label><label>Peso bruto (kg)<input value={form.peso} onChange={e => set("peso", e.target.value)} /></label><label>Volumen (m³)<input value={form.volumen} onChange={e => set("volumen", e.target.value)} /></label><label>Instrucciones<input value={form.instrucciones} onChange={e => set("instrucciones", e.target.value)} /></label></div></section>
    <section className={styles.card}><div className={styles.sectionTitle}><span>5</span><div><h2>ADR</h2><p>Información heredada de las partidas. Se mantiene en el borrador para formar parte de la carta de porte/CMR.</p></div></div><div className={styles.grid3}><label>ADR<input value={form.adr||"Sin declarar"} readOnly /></label><label>Régimen<input value={form.adrRegime||"—"} readOnly /></label><label>Número ONU<input value={form.unNumber||"—"} readOnly /></label><label>Clase<input value={form.adrClass||"—"} readOnly /></label><label>Grupo embalaje<input value={form.packingGroup||"—"} readOnly /></label><label>Código túnel<input value={form.tunnelCode||"—"} readOnly /></label><label>Designación ADR<input value={form.adrDescription||"—"} readOnly /></label></div></section>
  </main>;
}
