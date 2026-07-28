"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import type { CreationType } from "./page";
import styles from "./creation.module.css";

type Partida = { id:string; cliente:string; origen:string; destino:string; bultos:string; peso:string; servicio:string; estado:string; expedicionId?:string };
type Expedicion = { id:string; origen:string; destino:string; servicio:string; fecha:string; partidas:string[]; estado:string; viajeId?:string };
type Viaje = { id:string; fecha:string; vehiculo:string; conductor:string; expediciones:string[]; estado:string };

const demoPartidas: Partida[] = [
  { id:"PT-260184", cliente:"Mediterránea Retail", origen:"Valencia", destino:"Lyon", bultos:"2 palets", peso:"840", servicio:"Grupaje", estado:"Preparada" },
  { id:"PT-260183", cliente:"Nova Distribution", origen:"Barcelona", destino:"Marseille", bultos:"4 palets", peso:"1240", servicio:"LTL", estado:"Preparada" },
  { id:"PT-260182", cliente:"Atlas Components", origen:"Madrid", destino:"Toulouse", bultos:"1 palet", peso:"320", servicio:"Directo", estado:"Preparada" },
];
const demoExpediciones: Expedicion[] = [
  { id:"EX-260071", origen:"Valencia", destino:"Lyon", servicio:"Grupaje", fecha:"2026-07-30", partidas:["PT-260184"], estado:"Planificada" },
  { id:"EX-260070", origen:"Barcelona", destino:"Marseille", servicio:"LTL", fecha:"2026-07-30", partidas:["PT-260183"], estado:"Planificada" },
];

const nav = [["Control Tower","/dashboard"],["Partidas","/dashboard/partidas"],["Expediciones","/dashboard/expediciones"],["Viajes","/dashboard/viajes"],["Ofertas y tarifas","/dashboard/ofertas-tarifas"],["Clientes","/dashboard/clientes"],["Colaboradores","/dashboard/colaboradores"],["Tracking","/dashboard/tracking"],["ePOD & CMR","/dashboard/epod-cmr"],["Informes","/dashboard/informes"]] as const;

function readStore<T>(key:string, fallback:T):T { try { const value=localStorage.getItem(key); return value ? JSON.parse(value) : fallback; } catch { return fallback; } }
function nextId(prefix:string, current:number){ return `${prefix}-${String(current).slice(-6)}`; }

export default function CreationForm({ type }:{ type:CreationType }) {
  const [partidas,setPartidas]=useState<Partida[]>([]);
  const [expediciones,setExpediciones]=useState<Expedicion[]>([]);
  const [viajes,setViajes]=useState<Viaje[]>([]);
  const [selected,setSelected]=useState<string[]>([]);
  const [message,setMessage]=useState("");

  useEffect(()=>{
    setPartidas(readStore("fornexa-partidas",demoPartidas));
    setExpediciones(readStore("fornexa-expediciones",demoExpediciones));
    setViajes(readStore("fornexa-viajes",[]));
  },[]);

  const availablePartidas=useMemo(()=>partidas.filter(p=>!p.expedicionId),[partidas]);
  const availableExpediciones=useMemo(()=>expediciones.filter(e=>!e.viajeId),[expediciones]);
  const config = type === "partida"
    ? { eyebrow:"PEDIDO DE CLIENTE", title:"Nueva partida", help:"La partida es la unidad inicial. Después podrá incorporarse a una expedición.", back:"/dashboard/partidas" }
    : type === "expedicion"
    ? { eyebrow:"CONSOLIDACIÓN", title:"Nueva expedición", help:"Selecciona una o varias partidas. Una partida solo puede pertenecer a una expedición.", back:"/dashboard/expediciones" }
    : { eyebrow:"PLANIFICACIÓN DE TRANSPORTE", title:"Nuevo viaje", help:"Selecciona una o varias expediciones. Un viaje nunca admite partidas sueltas.", back:"/dashboard/viajes" };

  function toggle(id:string){ setSelected(v=>v.includes(id)?v.filter(x=>x!==id):[...v,id]); }

  function submit(e:FormEvent<HTMLFormElement>){
    e.preventDefault(); const fd=new FormData(e.currentTarget);
    if(type==="partida"){
      const item:Partida={ id:nextId("PT",Date.now()), cliente:String(fd.get("cliente")||""), origen:String(fd.get("origen")||""), destino:String(fd.get("destino")||""), bultos:String(fd.get("bultos")||""), peso:String(fd.get("peso")||""), servicio:String(fd.get("servicio")||"Grupaje"), estado:"Preparada" };
      const next=[item,...partidas]; setPartidas(next); localStorage.setItem("fornexa-partidas",JSON.stringify(next)); setMessage(`Partida ${item.id} creada. Ya puede incorporarse a una expedición.`); e.currentTarget.reset(); return;
    }
    if(type==="expedicion"){
      if(!selected.length){ setMessage("Selecciona al menos una partida disponible."); return; }
      const chosen=partidas.filter(p=>selected.includes(p.id));
      const item:Expedicion={ id:nextId("EX",Date.now()), origen:String(fd.get("origen")||chosen[0]?.origen||""), destino:String(fd.get("destino")||chosen[0]?.destino||""), servicio:String(fd.get("servicio")||"Grupaje"), fecha:String(fd.get("fecha")||""), partidas:selected, estado:"Planificada" };
      const nextExp=[item,...expediciones]; const nextParts=partidas.map(p=>selected.includes(p.id)?{...p,expedicionId:item.id,estado:"Asignada"}:p);
      setExpediciones(nextExp); setPartidas(nextParts); localStorage.setItem("fornexa-expediciones",JSON.stringify(nextExp)); localStorage.setItem("fornexa-partidas",JSON.stringify(nextParts)); setSelected([]); setMessage(`Expedición ${item.id} creada con ${item.partidas.length} partida(s). Ya puede asignarse a un viaje.`); return;
    }
    if(!selected.length){ setMessage("Selecciona al menos una expedición disponible."); return; }
    const item:Viaje={ id:nextId("VJ",Date.now()), fecha:String(fd.get("fecha")||""), vehiculo:String(fd.get("vehiculo")||""), conductor:String(fd.get("conductor")||""), expediciones:selected, estado:"Planificado" };
    const nextTrips=[item,...viajes]; const nextExp=expediciones.map(x=>selected.includes(x.id)?{...x,viajeId:item.id,estado:"Asignada a viaje"}:x);
    setViajes(nextTrips); setExpediciones(nextExp); localStorage.setItem("fornexa-viajes",JSON.stringify(nextTrips)); localStorage.setItem("fornexa-expediciones",JSON.stringify(nextExp)); setSelected([]); setMessage(`Viaje ${item.id} creado con ${item.expediciones.length} expedición(es).`);
  }

  const selector = type === "expedicion" ? availablePartidas : availableExpediciones;
  return <main className={styles.shell}>
    <aside className={styles.sidebar}><Link href="/dashboard" className={styles.brand}>FORNEXA</Link><nav>{nav.map(([l,h])=><Link key={h} href={h}>{l}</Link>)}</nav><div className={styles.footer}>FORNEXA Suite<small>Entorno de demostración</small></div></aside>
    <section className={styles.content}>
      <header className={styles.header}><div><p>{config.eyebrow}</p><h1>{config.title}</h1><span>{config.help}</span></div><Link href={config.back} className={styles.cancel}>Cancelar</Link></header>
      <form className={styles.form} onSubmit={submit}>
        {type==="partida" ? <>
          <section className={styles.card}><h2>Cliente y servicio</h2><div className={styles.grid}><label>Cliente<input name="cliente" required placeholder="Nombre del cliente" /></label><label>Referencia cliente<input name="referencia" placeholder="Pedido / referencia" /></label><label>Servicio<select name="servicio"><option>Grupaje</option><option>LTL</option><option>Carga completa</option><option>Paquetería</option><option>Directo</option></select></label><label>Fecha prevista<input name="fecha" type="date" /></label></div></section>
          <section className={styles.card}><h2>Ruta</h2><div className={styles.grid}><label>Origen<input name="origen" required placeholder="Ciudad de recogida" /></label><label>Destino<input name="destino" required placeholder="Ciudad de entrega" /></label><label>Remitente<input name="remitente" placeholder="Empresa remitente" /></label><label>Destinatario<input name="destinatario" placeholder="Empresa destinataria" /></label></div></section>
          <section className={styles.card}><h2>Mercancía</h2><div className={styles.grid}><label>Bultos / embalaje<input name="bultos" required placeholder="Ej. 3 palets EUR" /></label><label>Peso total (kg)<input name="peso" type="number" min="0" required /></label><label>Volumen (m³)<input name="volumen" type="number" min="0" step="0.01" /></label><label>Metros lineales<input name="metros" type="number" min="0" step="0.01" /></label></div><label className={styles.check}><input type="checkbox" name="adr" /> Mercancía ADR</label></section>
        </> : <>
          <section className={styles.card}><h2>{type==="expedicion"?"Planificación de la expedición":"Datos del viaje"}</h2><div className={styles.grid}>{type==="expedicion"?<><label>Origen<input name="origen" placeholder="Se puede heredar de las partidas" /></label><label>Destino<input name="destino" placeholder="Se puede heredar de las partidas" /></label><label>Servicio<select name="servicio"><option>Grupaje</option><option>LTL</option><option>Carga completa</option><option>Directo</option></select></label><label>Fecha de salida<input name="fecha" type="date" required /></label></>:<><label>Fecha de salida<input name="fecha" type="date" required /></label><label>Vehículo / matrícula<input name="vehiculo" required placeholder="1234 ABC" /></label><label>Conductor<input name="conductor" required placeholder="Nombre del conductor" /></label><label>Tipo de vehículo<select name="tipoVehiculo"><option>Tráiler</option><option>Rígido</option><option>Furgón</option><option>Camión con plataforma</option></select></label></>}</div></section>
          <section className={styles.card}><div className={styles.cardTitle}><div><h2>{type==="expedicion"?"Partidas disponibles":"Expediciones disponibles"}</h2><p>{type==="expedicion"?"Solo aparecen partidas que todavía no pertenecen a ninguna expedición.":"Solo aparecen expediciones que todavía no están asignadas a un viaje."}</p></div><strong>{selected.length} seleccionada(s)</strong></div><div className={styles.selector}>{selector.length?selector.map((x:any)=><label key={x.id} className={selected.includes(x.id)?styles.selected:""}><input type="checkbox" checked={selected.includes(x.id)} onChange={()=>toggle(x.id)} /><div><b>{x.id}</b><span>{type==="expedicion"?`${x.cliente} · ${x.origen} → ${x.destino}`:`${x.origen} → ${x.destino} · ${x.partidas.length} partida(s)`}</span></div><em>{x.servicio}</em></label>):<p className={styles.empty}>No hay elementos disponibles. Crea primero {type==="expedicion"?"una partida":"una expedición"}.</p>}</div></section>
        </>}
        {message&&<p className={styles.message}>{message}</p>}<div className={styles.submitBar}><Link href={config.back}>Volver al listado</Link><button type="submit">Guardar {type}</button></div>
      </form>
    </section>
  </main>;
}
