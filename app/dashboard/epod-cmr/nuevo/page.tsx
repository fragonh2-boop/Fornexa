"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import styles from "./nuevo-cmr.module.css";

type FormState = {
  source:string;expediciones:string[];viaje:string;customerIds:string[];expedidor:string;destinatario:string;carga:string;entrega:string;
  transportista:string;matricula:string;remolque:string;mercancia:string;bultos:string;embalaje:string;peso:string;volumen:string;instrucciones:string;
  adr:string;adrRegime:string;unNumber:string;adrClass:string;packingGroup:string;tunnelCode:string;adrDescription:string;
};
type StopOrderDraft={id:string;customerId?:string;description?:string;packages?:string;weight?:string};
type StopDetailDraft={sequence:1|2;contactName:string;contactPhone:string;reference:string;fullAddress:string;windowStart:string;windowEnd:string;orders:StopOrderDraft[]};
type StoredPartida={id:string;customerId?:string;codigoCliente?:string;cliente?:string;remitente?:string;destinatario?:string;origen?:string;destino?:string;bultos?:string;peso?:string;volumen?:string;mercancia?:string;descripcion?:string;contacto?:string;telefono?:string;contactoRecogida?:string;telefonoRecogida?:string;contactoEntrega?:string;telefonoEntrega?:string;referenciaCarga?:string;referenciaDescarga?:string;direccionRecogida?:string;direccionEntrega?:string;ventanaCargaInicio?:string;ventanaCargaFin?:string;ventanaEntregaInicio?:string;ventanaEntregaFin?:string;adr?:string;adrRegime?:string;unNumber?:string;adrClass?:string;packingGroup?:string;tunnelCode?:string;adrDescription?:string};
type StoredExpedicion={id:string;customerIds?:string[];partidas?:string[];viajeId?:string};
type IssuedCmr={id:string;cmrNumber:string;cmrKey:string;status:string;issuedAt:string;detailUrl:string;qrUrl:string;qrPayload:string;expeditionIds?:string[]};
type AuditEvent={id:string;event_type:string;occurred_at:string;payload?:Record<string,unknown>};

const initial:FormState={source:"expedicion",expediciones:["EX-260071"],viaje:"VJ-260041",customerIds:["CLI-000146"],expedidor:"Mediterránea Retail · Valencia",destinatario:"Rhône Distribution · Lyon",carga:"REC-001 · Valencia",entrega:"ENT-014 · Lyon",transportista:"Velocity Transinternacional, S.L.",matricula:"1234 LBC",remolque:"R-9876 BCD",mercancia:"Componentes de automoción",bultos:"10",embalaje:"Palet EUR",peso:"5840",volumen:"18,40",instrucciones:"No apilable · Avisar antes de entregar",adr:"S",adrRegime:"1.1.3.6",unNumber:"UN 1263",adrClass:"3",packingGroup:"II",tunnelCode:"D/E",adrDescription:"PINTURA, 3, II"};
const initialStopDetails:StopDetailDraft[]=[
 {sequence:1,contactName:"",contactPhone:"",reference:"",fullAddress:initial.carga,windowStart:"",windowEnd:"",orders:[]},
 {sequence:2,contactName:"",contactPhone:"",reference:"",fullAddress:initial.entrega,windowStart:"",windowEnd:"",orders:[]},
];

function detailsFromPartidas(lines:StoredPartida[]):StopDetailDraft[]{
 const first=lines[0];
 const orders=lines.map(line=>({id:line.id,customerId:line.customerId||line.codigoCliente,description:line.mercancia||line.descripcion,packages:line.bultos,weight:line.peso}));
 return [
  {sequence:1,contactName:first?.contactoRecogida||first?.contacto||"",contactPhone:first?.telefonoRecogida||first?.telefono||"",reference:first?.referenciaCarga||"",fullAddress:first?.direccionRecogida||first?.origen||"",windowStart:first?.ventanaCargaInicio||"",windowEnd:first?.ventanaCargaFin||"",orders},
  {sequence:2,contactName:first?.contactoEntrega||first?.contacto||"",contactPhone:first?.telefonoEntrega||first?.telefono||"",reference:first?.referenciaDescarga||"",fullAddress:first?.direccionEntrega||first?.destino||"",windowStart:first?.ventanaEntregaInicio||"",windowEnd:first?.ventanaEntregaFin||"",orders},
 ];
}

function parseExpeditionRefs(value:string){return [...new Set(value.split(/[;,\s]+/).map(item=>item.trim()).filter(Boolean))].slice(0,100)}
function numeric(value?:string){const raw=String(value??"").trim().replace(/\s/g,"");if(!raw)return 0;const comma=raw.lastIndexOf(","),dot=raw.lastIndexOf(".");let normalized=raw;if(comma>=0&&dot>=0)normalized=comma>dot?raw.replace(/\./g,"").replace(/,/g,"."):raw.replace(/,/g,"");else if(comma>=0)normalized=raw.replace(/\./g,"").replace(",",".");const parsed=Number(normalized);return Number.isFinite(parsed)?parsed:0}
function goodsLinesFromPartidas(lines:StoredPartida[],fallback:FormState){return lines.map(line=>({marks:line.id,packages:line.bultos,packaging:fallback.embalaje,description:line.mercancia||line.descripcion||fallback.mercancia,weight:line.peso,volume:line.volumen,unNumber:line.adr==="S"?line.unNumber:"",adrClass:line.adr==="S"?line.adrClass:"",packingGroup:line.adr==="S"?line.packingGroup:"",tunnelCode:line.adr==="S"?line.tunnelCode:"",adrDescription:line.adr==="S"?line.adrDescription:""}))}

export default function NuevoCmrPage(){
 const [form,setForm]=useState(initial),[notice,setNotice]=useState(""),[inheritance,setInheritance]=useState(""),[issuing,setIssuing]=useState(false);
 const [stopDetails,setStopDetails]=useState<StopDetailDraft[]>(initialStopDetails),[sourceLines,setSourceLines]=useState<StoredPartida[]>([]);
 const [issued,setIssued]=useState<IssuedCmr|null>(null),[showQr,setShowQr]=useState(false),[audit,setAudit]=useState<AuditEvent[]|null>(null);
 const missing=useMemo(()=>[form.source==="expedicion"&&!form.expediciones.length&&"Expedición",!form.customerIds.length&&"Customer ID",!form.expedidor&&"Expedidor",!form.destinatario&&"Destinatario",!form.carga&&"Lugar de carga",!form.entrega&&"Lugar de entrega",!form.transportista&&"Transportista",!form.mercancia&&"Mercancía",!form.peso&&"Peso bruto",form.adr==="S"&&!form.adrRegime&&"Régimen ADR"].filter(Boolean) as string[],[form]);
 const completeness=Math.round(((10-missing.length)/10)*100),locked=Boolean(issued);
 function set<K extends keyof FormState>(key:K,value:FormState[K]){if(locked)return;setForm(current=>({...current,[key]:value}));setNotice("")}
 function inheritFromExpeditions(expeditionIds:string[]){if(locked)return;try{
  const storedExpeditions=JSON.parse(localStorage.getItem("fornexa-expediciones")||"[]") as StoredExpedicion[];
  const partidas=JSON.parse(localStorage.getItem("fornexa-partidas")||"[]") as StoredPartida[];
  const selected=storedExpeditions.filter(item=>expeditionIds.includes(item.id));
  const partidaIds=[...new Set(selected.flatMap(item=>item.partidas??[]))];
  const lines=partidas.filter(item=>partidaIds.includes(item.id));
  setSourceLines(lines);
  setForm(current=>({...current,expediciones:expeditionIds}));
  if(!selected.length||!lines.length){setInheritance(expeditionIds.length?"No se encontraron partidas locales para las expediciones indicadas. Puedes completar el CMR manualmente.":"");return}
  const customerIds=[...new Set([...selected.flatMap(item=>item.customerIds??[]),...lines.map(item=>item.customerId||item.codigoCliente||"")].filter(Boolean))];
  const tripIds=[...new Set(selected.map(item=>item.viajeId).filter(Boolean))] as string[];
  const adrLines=lines.filter(item=>item.adr==="S"),firstAdr=adrLines[0],declared=lines.filter(item=>item.adr==="S"||item.adr==="N");
  const totalPackages=lines.reduce((sum,item)=>sum+numeric(item.bultos),0),totalWeight=lines.reduce((sum,item)=>sum+numeric(item.peso),0),totalVolume=lines.reduce((sum,item)=>sum+numeric(item.volumen),0);
  setForm(current=>({...current,expediciones:expeditionIds,customerIds,viaje:tripIds.length===1?tripIds[0]:current.viaje,expedidor:lines[0].cliente||lines[0].remitente||current.expedidor,destinatario:lines[0].destinatario||current.destinatario,carga:lines[0].direccionRecogida||lines[0].origen||current.carga,entrega:lines[0].direccionEntrega||lines[0].destino||current.entrega,mercancia:lines.length===1?(lines[0].mercancia||lines[0].descripcion||current.mercancia):`${lines.length} partidas de ${expeditionIds.length} expedición${expeditionIds.length===1?"":"es"}`,bultos:totalPackages?String(totalPackages):current.bultos,peso:totalWeight?String(totalWeight):current.peso,volumen:totalVolume?String(totalVolume):current.volumen,adr:adrLines.length?"S":declared.length===lines.length?"N":"",adrRegime:firstAdr?.adrRegime||"",unNumber:firstAdr?.unNumber||"",adrClass:firstAdr?.adrClass||"",packingGroup:firstAdr?.packingGroup||"",tunnelCode:firstAdr?.tunnelCode||"",adrDescription:firstAdr?.adrDescription||""}));
  setStopDetails(detailsFromPartidas(lines));
  const tripNotice=tripIds.length>1?` Las expediciones pertenecen a ${tripIds.length} viajes; revisa el viaje documental.`:"";
  setInheritance(`${expeditionIds.length} expedición${expeditionIds.length===1?"":"es"} · ${lines.length} partida${lines.length===1?"":"s"} · Customer ID: ${customerIds.join(", ")}.${adrLines.length?` ADR conservado por línea; resumen desde ${firstAdr.id}.`:" Sin partidas ADR declaradas."}${tripNotice}`);
 }catch{setSourceLines([]);setInheritance("")}}
 useEffect(()=>{inheritFromExpeditions(form.expediciones)},[]);

 function saveDraft(){try{const current=JSON.parse(localStorage.getItem("fornexa-cmr-documents")||"[]");const document={id:`BORRADOR-${Date.now()}`,...form,stopDetails,status:"Borrador",createdAt:new Date().toISOString()};localStorage.setItem("fornexa-cmr-documents",JSON.stringify([document,...(Array.isArray(current)?current:[])]));setNotice("CMR guardado como borrador local.")}catch{setNotice("No se pudo guardar el borrador en este navegador.")}}
 async function emit(){
  if(missing.length||issuing||issued)return;
  if(!window.confirm("Se validará el documento, se asignará el número definitivo y los campos principales quedarán bloqueados. ¿Emitir CMR?"))return;
  setIssuing(true);setNotice("");
  try{
   const communicatedStops=stopDetails.map(detail=>({...detail,fullAddress:detail.sequence===1?form.carga:form.entrega}));
   const payload={...form,expedicion:form.expediciones[0]||undefined,expediciones:form.expediciones,goodsLines:sourceLines.length?goodsLinesFromPartidas(sourceLines,form):undefined,stopDetails:communicatedStops};
   const response=await fetch("/api/cmr",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(payload)});
   const result=await response.json();if(!response.ok)throw new Error(result.error||"No se pudo emitir el CMR.");
   setIssued(result);setNotice(`${result.cmrNumber} emitido · ${form.expediciones.length||result.expeditionIds?.length||0} expedición${form.expediciones.length===1?"":"es"} vinculada${form.expediciones.length===1?"":"s"}. La CMR Key y el QR ya están disponibles.`);
   const current=JSON.parse(localStorage.getItem("fornexa-cmr-documents")||"[]");
   localStorage.setItem("fornexa-cmr-documents",JSON.stringify([{id:result.cmrNumber,...form,stopDetails:communicatedStops,status:"Emitido",cmrKey:result.cmrKey,createdAt:result.issuedAt},...(Array.isArray(current)?current:[])]));
  }catch(error){setNotice(error instanceof Error?error.message:"No se pudo emitir el CMR.")}finally{setIssuing(false)}
 }
 async function shareQr(){if(!issued)return;setShowQr(true);try{if(navigator.share)await navigator.share({title:issued.cmrNumber,text:`CMR Key: ${issued.cmrKey}`,url:issued.qrPayload});else{await navigator.clipboard.writeText(`${issued.cmrNumber} · ${issued.cmrKey} · ${issued.qrPayload}`);setNotice("Enlace y CMR Key copiados al portapapeles.")}}catch{/* El usuario puede cerrar el diálogo nativo. */}}
 async function sendEmail(){if(!issued)return;const to=window.prompt("Dirección de email destinataria");if(!to)return;setNotice("Enviando CMR…");try{const response=await fetch(`/api/cmr/${encodeURIComponent(issued.cmrNumber)}/email`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({to,key:issued.cmrKey})});const result=await response.json();if(!response.ok)throw new Error(result.error||"No se pudo enviar.");setNotice(`CMR enviado a ${to}.`)}catch(error){setNotice(error instanceof Error?error.message:"No se pudo enviar el CMR.")}}
 async function openAudit(){if(!issued)return;try{const response=await fetch(`/api/cmr/${encodeURIComponent(issued.cmrNumber)}`,{headers:{"x-fornexa-key":issued.cmrKey}});const result=await response.json();if(!response.ok)throw new Error(result.error);setAudit(result.events||[])}catch{setNotice("No se pudo cargar la auditoría.")}}

 return <main className={styles.page}>
  <header className={styles.topbar}><div><Link href="/dashboard/epod-cmr">← ePOD & CMR</Link><span>{issued?`${issued.cmrNumber} · Emitido`:"Nuevo documento"}</span></div><div className={styles.actions}>
   {!issued?<><button className={styles.secondary} onClick={()=>window.print()}>Vista previa</button><button className={styles.secondary} onClick={saveDraft}>Guardar borrador</button><button className={styles.primary} onClick={emit} disabled={missing.length>0||issuing}>{issuing?"Emitiendo…":"Emitir CMR"}</button></>:<><button onClick={()=>window.open(`${issued.detailUrl}?print=1`,"_blank","noopener")}>Descargar PDF</button><button className={styles.secondary} onClick={shareQr}>Compartir QR</button><button className={styles.secondary} onClick={sendEmail}>Enviar email</button><button className={styles.secondary} onClick={openAudit}>Ver auditoría</button></>}
  </div></header>
  <section className={styles.hero}><div><p>CMR LIVE</p><h1>{issued?issued.cmrNumber:"Crear CMR"}</h1><span>{issued?"Documento definitivo emitido y sincronizado con FORNEXA Driver.":"El CMR puede proyectar una o varias expediciones; Customer ID, partidas y ADR se conservan desde el origen."}</span></div><aside><strong>{completeness}%</strong><span>{issued?"emitido":"completado"}</span>{issued?<small>CMR Key: <b>{issued.cmrKey}</b><br/>Campos principales bloqueados</small>:missing.length?<small>Falta: {missing.join(", ")}</small>:<small>Listo para emitir</small>}</aside></section>
  {notice&&<div className={styles.notice}>{notice}</div>}{inheritance&&<div className={styles.notice}>{inheritance}</div>}
  <fieldset className={styles.lockable} disabled={locked}>
   <section className={styles.card}><div className={styles.sectionTitle}><span>1</span><div><h2>Documento de origen</h2><p>El CMR es una proyección documental: puede vincular una o varias expediciones sin fusionar su identidad operativa.</p></div></div><div className={styles.grid3}><label>Crear desde<select value={form.source} onChange={e=>set("source",e.target.value)}><option value="expedicion">Expedición</option><option value="viaje">Viaje</option></select></label><label>Expediciones <small>(separadas por coma)</small><input value={form.expediciones.join(", ")} onChange={e=>inheritFromExpeditions(parseExpeditionRefs(e.target.value))} placeholder="EX-260071, EX-260072"/></label><label>Viaje / tramo documental<input value={form.viaje} onChange={e=>set("viaje",e.target.value)}/></label><label>Customer ID maestro<input value={form.customerIds.join(", ")} readOnly/></label></div></section>
   <section className={styles.card}><div className={styles.sectionTitle}><span>2</span><div><h2>Partes y lugares</h2><p>Los terceros físicos permanecen separados del identificador maestro del cliente.</p></div></div><div className={styles.grid2}><label>Expedidor<input value={form.expedidor} onChange={e=>set("expedidor",e.target.value)}/></label><label>Destinatario<input value={form.destinatario} onChange={e=>set("destinatario",e.target.value)}/></label><label>Lugar de carga<input value={form.carga} onChange={e=>set("carga",e.target.value)}/></label><label>Lugar de entrega<input value={form.entrega} onChange={e=>set("entrega",e.target.value)}/></label></div></section>
   <section className={styles.card}><div className={styles.sectionTitle}><span>3</span><div><h2>Transporte</h2><p>Datos del viaje o tramo al que corresponde este documento.</p></div></div><div className={styles.grid3}><label>Transportista<input value={form.transportista} onChange={e=>set("transportista",e.target.value)}/></label><label>Matrícula tractor<input value={form.matricula} onChange={e=>set("matricula",e.target.value)}/></label><label>Matrícula remolque<input value={form.remolque} onChange={e=>set("remolque",e.target.value)}/></label></div></section>
   <section className={styles.card}><div className={styles.sectionTitle}><span>4</span><div><h2>Mercancía</h2><p>Los totales se agregan para el documento y cada partida se conserva como línea canónica al emitir.</p></div></div><div className={styles.grid3}><label>Descripción<input value={form.mercancia} onChange={e=>set("mercancia",e.target.value)}/></label><label>Número de bultos<input value={form.bultos} onChange={e=>set("bultos",e.target.value)}/></label><label>Embalaje<input value={form.embalaje} onChange={e=>set("embalaje",e.target.value)}/></label><label>Peso bruto (kg)<input value={form.peso} onChange={e=>set("peso",e.target.value)}/></label><label>Volumen (m³)<input value={form.volumen} onChange={e=>set("volumen",e.target.value)}/></label><label>Instrucciones<input value={form.instrucciones} onChange={e=>set("instrucciones",e.target.value)}/></label></div></section>
   <section className={styles.card}><div className={styles.sectionTitle}><span>5</span><div><h2>ADR</h2><p>El resumen se muestra aquí; al emitir, la información ADR se mantiene por línea de mercancía.</p></div></div><div className={styles.grid3}><label>ADR<input value={form.adr||"Sin declarar"} readOnly/></label><label>Régimen<input value={form.adrRegime||"—"} readOnly/></label><label>Número ONU<input value={form.unNumber||"—"} readOnly/></label><label>Clase<input value={form.adrClass||"—"} readOnly/></label><label>Grupo embalaje<input value={form.packingGroup||"—"} readOnly/></label><label>Código túnel<input value={form.tunnelCode||"—"} readOnly/></label><label>Designación ADR<input value={form.adrDescription||"—"} readOnly/></label></div></section>
  </fieldset>
  {showQr&&issued&&<div className={styles.modalBackdrop} role="presentation" onClick={()=>setShowQr(false)}><section className={styles.modal} role="dialog" aria-modal="true" onClick={event=>event.stopPropagation()}><button className={styles.close} onClick={()=>setShowQr(false)}>×</button><p>FORNEXA DRIVER</p><h2>{issued.cmrNumber}</h2><img src={issued.qrUrl} alt={`QR de ${issued.cmrNumber}`}/><strong>{issued.cmrKey}</strong><small>Escanea el QR o introduce la CMR Key en la aplicación Android.</small></section></div>}
  {audit&&<div className={styles.modalBackdrop} role="presentation" onClick={()=>setAudit(null)}><section className={`${styles.modal} ${styles.audit}`} role="dialog" aria-modal="true" onClick={event=>event.stopPropagation()}><button className={styles.close} onClick={()=>setAudit(null)}>×</button><p>TRAZABILIDAD</p><h2>Histórico del CMR</h2>{audit.length?audit.map(event=><article key={event.id}><strong>{event.event_type.replaceAll("_"," ")}</strong><span>{new Date(event.occurred_at).toLocaleString("es-ES")}</span></article>):<small>Sin eventos registrados.</small>}</section></div>}
 </main>
}
