"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import AppShell from "../../components/AppShell";
import DataGrid from "../../components/DataGrid";
import styles from "./expediciones.module.css";

type Expedicion = { id:string; origen?:string; destino?:string; servicio?:string; estado?:string; partidas?:string[]; albaran?:string; pedido?:string; viajes?:string[]; viajeActual?:string; fecha?:string; createdAt?:string };
const demo:Expedicion[]=[
 {id:"EX-260071",pedido:"PED-260051",albaran:"ALB-260071",origen:"Valencia",destino:"Lyon",partidas:["PT-260184","PT-260185","PT-260186"],viajes:["VJ-260041","VJ-260052"],viajeActual:"VJ-260052",servicio:"Grupaje",estado:"En tránsito"},
 {id:"EX-260070",pedido:"PED-260050",albaran:"ALB-260070",origen:"Barcelona",destino:"Marseille",partidas:["PT-260183","PT-260187"],viajes:["VJ-260040"],viajeActual:"VJ-260040",servicio:"LTL",estado:"Planificada"},
 {id:"EX-260069",pedido:"PED-260049",albaran:"ALB-260069",origen:"Madrid",destino:"Toulouse",partidas:["PT-260182"],viajes:["VJ-260039"],viajeActual:"VJ-260039",servicio:"Directo",estado:"Entregada"}
];
function readExpeditions():Expedicion[]{try{const raw=localStorage.getItem("fornexa-expediciones");if(!raw)return demo;const parsed=JSON.parse(raw) as Expedicion[];return Array.isArray(parsed)&&parsed.length?parsed:demo}catch{return demo}}

export default function ExpedicionesPage(){
 const [items,setItems]=useState<Expedicion[]>([]);
 useEffect(()=>{const refresh=()=>setItems(readExpeditions());refresh();window.addEventListener("focus",refresh);window.addEventListener("storage",refresh);return()=>{window.removeEventListener("focus",refresh);window.removeEventListener("storage",refresh)}},[]);
 const ordered=useMemo(()=>[...items].sort((a,b)=>{const at=a.createdAt?Date.parse(a.createdAt):0,bt=b.createdAt?Date.parse(b.createdAt):0;return at!==bt?bt-at:b.id.localeCompare(a.id,"es",{numeric:true})}),[items]);
 const rows=ordered.map(item=>{const trips=item.viajes??[];return {id:item.id,pedido:item.pedido||"—",albaran:item.albaran||"—",ruta:`${item.origen||"—"} → ${item.destino||"—"}`,partidas:`${item.partidas?.length??0} ${(item.partidas?.length??0)===1?"partida":"partidas"}`,viajes:trips.length?`${trips.length} ${trips.length===1?"viaje":"viajes"}${item.viajeActual?` · actual ${item.viajeActual}`:""}`:"Sin asignar",servicio:item.servicio||"Varios",estado:item.estado||"Planificada"}});
 const groupedParts=items.reduce((total,item)=>total+(item.partidas?.length??0),0),multiTrip=items.filter(item=>(item.viajes?.length??0)>1).length;
 return <AppShell><div className={styles.page}>
   <header className={styles.header}><div><p className={styles.eyebrow}>EXPEDIENTE LOGÍSTICO</p><h1>Expedientes</h1><p>Unidad operativa persistente: nace de un albarán y puede recorrer uno o varios viajes.</p></div><div className={styles.actions}><button className={styles.secondary}>Importar Excel</button><Link href="/dashboard/nuevo/expedicion" className={styles.primary}>+ Nuevo expediente</Link><div className={styles.avatar}>FG</div></div></header>
   <section className={styles.metrics}><article><span>Activos</span><strong>{items.filter(x=>x.estado!=="Entregada").length}</strong></article><article><span>Partidas</span><strong>{groupedParts}</strong></article><article><span>Multiviaje</span><strong>{multiTrip}</strong></article><article><span>Último expediente</span><strong className={styles.lastId}>{ordered[0]?.id??"—"}</strong></article></section>
   <section className={styles.panel}><DataGrid storageKey="expediciones" columns={[{key:"id",label:"Expediente"},{key:"pedido",label:"Pedido"},{key:"albaran",label:"Albarán"},{key:"ruta",label:"Ruta"},{key:"partidas",label:"Mercancía"},{key:"viajes",label:"Viajes / tramo actual"},{key:"servicio",label:"Servicio"},{key:"estado",label:"Estado"}]} rows={rows} rowHrefs={ordered.map(item=>`/dashboard/registros/expediciones/${item.id}`)} searchPlaceholder="Buscar por expediente, pedido, albarán, viaje, ruta, servicio o estado" emptyMessage="No hay expedientes que coincidan con los filtros." /></section>
  </div></AppShell>;
}