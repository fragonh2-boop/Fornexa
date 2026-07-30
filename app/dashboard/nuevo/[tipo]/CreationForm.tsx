"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import type { CreationType } from "./page";
import { deliveryPoints, fullAddress, pickupPoints } from "./testPoints";
import styles from "./creation.module.css";

type Partida = { id:string; codigoCliente?:string; cliente:string; origen:string; destino:string; codigoOrigen?:string; codigoDestino?:string; direccionOrigen?:string; direccionDestino?:string; remitente?:string; destinatario?:string; bultos:string; peso:string; volumen?:string; metros?:string; servicio:string; estado:string; expedicionId?:string };
type Expedicion = { id:string; origen:string; destino:string; servicio:string; fecha:string; partidas:string[]; estado:string; viajeId?:string };
type Viaje = { id:string; fecha:string; vehiculo:string; conductor:string; expediciones:string[]; estado:string };
type Cliente = { codigo:string; nombre:string };

const clientes:Cliente[] = pickupPoints.map(p => ({ codigo:p.customerCode ?? p.code, nombre:p.name.replace(" · Sede / planta principal", "") }));
const demoPartidas:Partida[] = [
  { id:"PT-260184", codigoCliente:"10001", cliente:"Bosch España", origen:"Valencia", destino:"Lyon", bultos:"2", peso:"840", servicio:"Grupaje", estado:"Preparada" },
  { id:"PT-260183", codigoCliente:"10005", cliente:"Porcelanosa Grupo", origen:"Barcelona", destino:"Marseille", bultos:"4", peso:"1240", servicio:"LTL", estado:"Preparada" },
];
const demoExpediciones:Expedicion[] = [{ id:"EX-260071", origen:"Valencia", destino:"Lyon", servicio:"Grupaje", fecha:"2026-07-30", partidas:["PT-260184"], estado:"Planificada" }];
const nav = [["Control Tower","/dashboard"],["Partidas","/dashboard/partidas"],["Expediciones","/dashboard/expediciones"],["Viajes","/dashboard/viajes"],["Ofertas y tarifas","/dashboard/ofertas-tarifas"],["Clientes","/dashboard/clientes"],["Colaboradores","/dashboard/colaboradores"],["Almacenes","/dashboard/almacenes"],["Tracking","/dashboard/tracking"],["ePOD & CMR","/dashboard/epod-cmr"],["Informes","/dashboard/informes"]] as const;

function readStore<T>(key:string,fallback:T):T { try { const value=localStorage.getItem(key); return value?JSON.parse(value):fallback; } catch { return fallback; } }
function nextId(prefix:string,value:number){ return `${prefix}-${String(value).slice(-6)}`; }
function iso(date:Date){ return date.toISOString().slice(0,10); }
function validDateParts(day:number,month:number,year:number){ const date=new Date(year,month-1,day); return date.getFullYear()===year&&date.getMonth()===month-1&&date.getDate()===day; }
function toIsoDate(day:number,month:number,year:number){ return validDateParts(day,month,year)?`${String(year).padStart(4,"0")}-${String(month).padStart(2,"0")}-${String(day).padStart(2,"0")}`:""; }
function parseSmartDate(raw:string){
  const value=raw.trim().toLowerCase(); if(!value)return ""; const date=new Date(); date.setHours(12,0,0,0);
  if(value==="h"||value==="hoy")return iso(date);
  const relative=value.match(/^([+-])(\d+)$/); if(relative){ date.setDate(date.getDate()+(relative[1]==="+"?1:-1)*Number(relative[2])); return iso(date); }
  const isoMatch=value.match(/^(\d{4})-(\d{2})-(\d{2})$/); if(isoMatch)return toIsoDate(Number(isoMatch[3]),Number(isoMatch[2]),Number(isoMatch[1]));
  const compact6=value.match(/^(\d{2})(\d{2})(\d{2})$/); if(compact6)return toIsoDate(Number(compact6[1]),Number(compact6[2]),2000+Number(compact6[3]));
  const compact8=value.match(/^(\d{2})(\d{2})(\d{4})$/); if(compact8)return toIsoDate(Number(compact8[1]),Number(compact8[2]),Number(compact8[3]));
  const slash=value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/); if(slash)return toIsoDate(Number(slash[1]),Number(slash[2]),slash[3].length===2?2000+Number(slash[3]):Number(slash[3]));
  return "";
}
function SmartDate({name,label,required=false}:{name:string;label:string;required?:boolean}){
  const [value,setValue]=useState(""); const [error,setError]=useState("");
  function normalize(){ if(!value.trim()){setError("");return;} const parsed=parseSmartDate(value); if(parsed){setValue(parsed);setError("");} else setError("Fecha no válida"); }
  return <label>{label}<input name={name} required={required} value={value} placeholder="010226, 01/02/2026, h, +n o -n" onChange={e=>{setValue(e.target.value);setError("");}} onBlur={normalize} aria-invalid={Boolean(error)}/>{error&&<small role="alert">{error}</small>}</label>;
}
function normalizeDecimal(raw:string){
  let value=raw.trim().replace(/\s/g,""); if(!value)return "";
  const lastComma=value.lastIndexOf(","), lastDot=value.lastIndexOf(".");
  if(lastComma>=0&&lastDot>=0){ const decimalPos=Math.max(lastComma,lastDot); const integer=value.slice(0,decimalPos).replace(/[.,]/g,""); const decimal=value.slice(decimalPos+1).replace(/[.,]/g,""); value=`${integer}.${decimal}`; }
  else if(lastComma>=0) value=value.replace(/\./g,"").replace(",",".");
  else if(lastDot>=0){ const parts=value.split("."); if(parts.length>2) value=`${parts.slice(0,-1).join("")}.${parts.at(-1)}`; }
  return /^-?\d+(\.\d+)?$/.test(value)?value:"";
}
function formatDecimal(raw:string,decimals?:number){ const parsed=normalizeDecimal(raw); if(!parsed)return ""; const number=Number(parsed); return new Intl.NumberFormat("es-ES",{minimumFractionDigits:decimals??0,maximumFractionDigits:decimals??6}).format(number); }
function DecimalInput({name,label,required=false,min=0,decimals}:{name:string;label:string;required?:boolean;min?:number;decimals?:number}){
  const [value,setValue]=useState(""); const [error,setError]=useState("");
  function change(raw:string){ const cleaned=raw.replace(/[^0-9.,-]/g,""); setValue(cleaned.replace(/\./g,",")); setError(""); }
  function blur(){ if(!value.trim()){setError("");return;} const normalized=normalizeDecimal(value); if(!normalized||Number(normalized)<min){setError("Número no válido");return;} setValue(formatDecimal(normalized,decimals)); }
  return <label>{label}<input name={name} type="text" inputMode="decimal" required={required} value={value} onChange={e=>change(e.target.value)} onBlur={blur} aria-invalid={Boolean(error)} placeholder="0,00"/>{error&&<small role="alert">{error}</small>}</label>;
}
function Combo({name,label,options,shortcut}:{name:string;label:string;options:string[];shortcut:string}){
  const ref=useRef<HTMLSelectElement>(null);
  useEffect(()=>{const listener=(event:KeyboardEvent)=>{if(event.altKey&&event.key.toLowerCase()===shortcut.toLowerCase()){event.preventDefault();ref.current?.focus();}};window.addEventListener("keydown",listener);return()=>window.removeEventListener("keydown",listener);},[shortcut]);
  return <label>{label} <small>(Alt+{shortcut.toUpperCase()})</small><select ref={ref} name={name} accessKey={shortcut}>{options.map(option=><option key={option}>{option}</option>)}</select></label>;
}

export default function CreationForm({type}:{type:CreationType}){
  const [partidas,setPartidas]=useState<Partida[]>([]),[expediciones,setExpediciones]=useState<Expedicion[]>([]),[viajes,setViajes]=useState<Viaje[]>([]),[selected,setSelected]=useState<string[]>([]),[message,setMessage]=useState("");
  const [codigo,setCodigo]=useState(""),[cliente,setCliente]=useState(""),[remitente,setRemitente]=useState(""),[destinatario,setDestinatario]=useState("");
  const [codigoOrigen,setCodigoOrigen]=useState(""),[direccionOrigen,setDireccionOrigen]=useState(""),[codigoDestino,setCodigoDestino]=useState(""),[direccionDestino,setDireccionDestino]=useState("");
  const pickupSelected=pickupPoints.find(p=>p.code===codigoOrigen), deliverySelected=deliveryPoints.find(p=>p.code===codigoDestino);
  useEffect(()=>{setPartidas(readStore("fornexa-partidas",demoPartidas));setExpediciones(readStore("fornexa-expediciones",demoExpediciones));setViajes(readStore("fornexa-viajes",[]));localStorage.setItem("fornexa-clientes",JSON.stringify(clientes));localStorage.setItem("fornexa-puntos-recogida",JSON.stringify(pickupPoints));localStorage.setItem("fornexa-puntos-entrega",JSON.stringify(deliveryPoints));},[]);
  useEffect(()=>{const matches=clientes.filter(item=>item.codigo.startsWith(codigo));if(matches.length===1){setCodigo(matches[0].codigo);setCliente(matches[0].nombre);if(!pickupSelected)setRemitente(matches[0].codigo);}},[codigo,pickupSelected]);
  function selectPickup(raw:string){const value=raw.toUpperCase();setCodigoOrigen(value);const point=pickupPoints.find(item=>item.code===value);if(point){setDireccionOrigen(fullAddress(point));setRemitente(point.customerCode??point.code);setMessage(`El remitente queda vinculado al punto de recogida ${point.code}.`);}else setRemitente(codigo);}
  function selectDelivery(raw:string){const value=raw.toUpperCase();setCodigoDestino(value);const point=deliveryPoints.find(item=>item.code===value);if(point){setDireccionDestino(fullAddress(point));setDestinatario(point.customerCode??point.code);setMessage(`El destinatario queda vinculado al punto de entrega ${point.code}.`);}else setDestinatario("");}
  function warnLocked(kind:"remitente"|"destinatario"){const code=kind==="remitente"?pickupSelected?.code:deliverySelected?.code;if(code)setMessage(`No se puede modificar el ${kind}: existe el código de punto ${code}. Cambia el código de punto.`);}
  const availablePartidas=useMemo(()=>partidas.filter(item=>!item.expedicionId),[partidas]), availableExpediciones=useMemo(()=>expediciones.filter(item=>!item.viajeId),[expediciones]);
  const config=type==="partida"?{eyebrow:"PEDIDO DE CLIENTE",title:"Nueva partida",help:"Alta rápida orientada a teclado. Tab avanza por campos.",back:"/dashboard/partidas"}:type==="expedicion"?{eyebrow:"CONSOLIDACIÓN",title:"Nueva expedición",help:"Selecciona partidas disponibles.",back:"/dashboard/expediciones"}:{eyebrow:"PLANIFICACIÓN",title:"Nuevo viaje",help:"Selecciona expediciones; nunca partidas sueltas.",back:"/dashboard/viajes"};
  function toggle(id:string){setSelected(current=>current.includes(id)?current.filter(item=>item!==id):[...current,id]);}
  function submit(event:FormEvent<HTMLFormElement>){
    event.preventDefault(); const data=new FormData(event.currentTarget);
    if(type==="partida"){
      if(!direccionOrigen.trim()||!direccionDestino.trim())return setMessage("Las direcciones de recogida y entrega son obligatorias.");
      const pickup=pickupPoints.find(p=>p.code===codigoOrigen),delivery=deliveryPoints.find(p=>p.code===codigoDestino);
      const peso=normalizeDecimal(String(data.get("peso")||"")), volumen=normalizeDecimal(String(data.get("volumen")||"")), metros=normalizeDecimal(String(data.get("metros")||"")), bultos=normalizeDecimal(String(data.get("bultos")||""));
      if(!peso||!bultos)return setMessage("Revisa los campos numéricos obligatorios.");
      const item:Partida={id:nextId("PT",Date.now()),codigoCliente:String(data.get("codigoCliente")||""),cliente:String(data.get("cliente")||""),codigoOrigen,codigoDestino,direccionOrigen,direccionDestino,remitente,destinatario,origen:pickup?`${pickup.code} · ${pickup.city}`:direccionOrigen,destino:delivery?`${delivery.code} · ${delivery.city}`:direccionDestino,bultos,peso,volumen,metros,servicio:String(data.get("servicio")||"Varios"),estado:"Preparada"};
      const updated=[item,...partidas];setPartidas(updated);localStorage.setItem("fornexa-partidas",JSON.stringify(updated));setMessage(`Partida ${item.id} creada.`);return;
    }
    if(type==="expedicion"){
      if(!selected.length)return setMessage("Selecciona al menos una partida.");const chosen=partidas.filter(item=>selected.includes(item.id));
      const item:Expedicion={id:nextId("EX",Date.now()),origen:String(data.get("origen")||chosen[0]?.origen||""),destino:String(data.get("destino")||chosen[0]?.destino||""),servicio:String(data.get("servicio")||"Varios"),fecha:parseSmartDate(String(data.get("fecha")||"")),partidas:selected,estado:"Planificada"};
      const updatedExpediciones=[item,...expediciones],updatedPartidas=partidas.map(p=>selected.includes(p.id)?{...p,expedicionId:item.id,estado:"Asignada"}:p);setExpediciones(updatedExpediciones);setPartidas(updatedPartidas);localStorage.setItem("fornexa-expediciones",JSON.stringify(updatedExpediciones));localStorage.setItem("fornexa-partidas",JSON.stringify(updatedPartidas));setMessage(`Expedición ${item.id} creada.`);return;
    }
    if(!selected.length)return setMessage("Selecciona al menos una expedición.");
    const item:Viaje={id:nextId("VJ",Date.now()),fecha:parseSmartDate(String(data.get("fecha")||"")),vehiculo:String(data.get("vehiculo")||""),conductor:String(data.get("conductor")||""),expediciones:selected,estado:"Planificado"};
    const updatedViajes=[item,...viajes],updatedExpediciones=expediciones.map(e=>selected.includes(e.id)?{...e,viajeId:item.id,estado:"Asignada a viaje"}:e);setViajes(updatedViajes);setExpediciones(updatedExpediciones);localStorage.setItem("fornexa-viajes",JSON.stringify(updatedViajes));localStorage.setItem("fornexa-expediciones",JSON.stringify(updatedExpediciones));setMessage(`Viaje ${item.id} creado.`);
  }
  const selector=type==="expedicion"?availablePartidas:availableExpediciones;
  return <main className={styles.shell}><aside className={styles.sidebar}><Link href="/dashboard" className={styles.brand}>FORNEXA</Link><nav className={styles.nav}>{nav.map(([label,href])=><Link key={href} href={href}>{label}</Link>)}</nav></aside><section className={styles.content}><header className={styles.header}><div><p>{config.eyebrow}</p><h1>{config.title}</h1><span>{config.help}</span></div><Link href={config.back}>Cancelar</Link></header><form className={styles.form} onSubmit={submit}>{type==="partida"?<><section className={styles.card}><h2>Cliente y servicio</h2><div className={styles.grid}><label>Código cliente<input autoFocus name="codigoCliente" value={codigo} onChange={e=>setCodigo(e.target.value.replace(/\D/g,""))} list="clientes-codigo" required/></label><label>Cliente<input name="cliente" value={cliente} onChange={e=>setCliente(e.target.value)} list="clientes-nombre" required/></label><datalist id="clientes-codigo">{clientes.map(item=><option key={item.codigo} value={item.codigo}>{item.nombre}</option>)}</datalist><datalist id="clientes-nombre">{clientes.map(item=><option key={item.codigo} value={item.nombre}>{item.codigo}</option>)}</datalist><label>Referencia cliente<input name="referencia"/></label><Combo name="servicio" label="Servicio" shortcut="s" options={["Grupaje","LTL","Carga completa","Paquetería","Directo","Varios"]}/><SmartDate name="fecha" label="Fecha prevista"/></div></section><section className={styles.card}><h2>Ruta</h2><div className={styles.grid}><label>Código punto de recogida<input name="codigoOrigen" value={codigoOrigen} onChange={e=>selectPickup(e.target.value)} list="puntos-recogida"/></label><label>Código punto de entrega<input name="codigoDestino" value={codigoDestino} onChange={e=>selectDelivery(e.target.value)} list="puntos-entrega"/></label><datalist id="puntos-recogida">{pickupPoints.map(point=><option key={point.code} value={point.code}>{point.name} · {point.city}</option>)}</datalist><datalist id="puntos-entrega">{deliveryPoints.map(point=><option key={point.code} value={point.code}>{point.name} · {point.city}</option>)}</datalist><label>Dirección de recogida<input name="direccionOrigen" value={direccionOrigen} onChange={e=>setDireccionOrigen(e.target.value)} readOnly={Boolean(pickupSelected)} required/></label><label>Dirección de entrega<input name="direccionDestino" value={direccionDestino} onChange={e=>setDireccionDestino(e.target.value)} readOnly={Boolean(deliverySelected)} required/></label><label>Remitente<input name="remitente" value={remitente} readOnly={Boolean(pickupSelected)} onClick={()=>warnLocked("remitente")} onChange={e=>setRemitente(e.target.value)}/></label><label>Destinatario<input name="destinatario" value={destinatario} readOnly={Boolean(deliverySelected)} onClick={()=>warnLocked("destinatario")} onChange={e=>setDestinatario(e.target.value)}/></label></div></section><section className={styles.card}><h2>Mercancía</h2><div className={styles.grid}><DecimalInput name="bultos" label="Bultos" required decimals={2}/><DecimalInput name="peso" label="Peso total (kg)" required decimals={2}/><DecimalInput name="volumen" label="Volumen (m³)" decimals={3}/><DecimalInput name="metros" label="Metros lineales" decimals={3}/></div></section></>:<><section className={styles.card}><h2>{type==="expedicion"?"Planificación de la expedición":"Datos del viaje"}</h2><div className={styles.grid}>{type==="expedicion"?<><label>Origen<input name="origen"/></label><label>Destino<input name="destino"/></label><Combo name="servicio" label="Servicio" shortcut="s" options={["Grupaje","LTL","Carga completa","Directo","Varios"]}/><SmartDate name="fecha" label="Fecha de salida" required/></>:<><SmartDate name="fecha" label="Fecha de salida" required/><label>Vehículo / matrícula<input name="vehiculo" required/></label><label>Conductor<input name="conductor" required/></label><Combo name="tipoVehiculo" label="Tipo de vehículo" shortcut="v" options={["Tráiler","Rígido","Furgón","Camión con plataforma","Varios"]}/></>}</div></section><section className={styles.card}><h2>{type==="expedicion"?"Partidas disponibles":"Expediciones disponibles"}</h2><div className={styles.selector}>{selector.map((item:any)=><label key={item.id}><input type="checkbox" checked={selected.includes(item.id)} onChange={()=>toggle(item.id)}/><div><b>{item.id}</b><span>{type==="expedicion"?`${item.cliente} · ${item.origen} → ${item.destino}`:`${item.origen} → ${item.destino}`}</span></div></label>)}</div></section></>}{message&&<p className={styles.message}>{message}</p>}<div className={styles.submitBar}><Link href={config.back}>Volver</Link><button type="submit">Guardar {type}</button></div></form></section></main>;
}
