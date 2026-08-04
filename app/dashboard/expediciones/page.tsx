"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import DataGrid from "../../components/DataGrid";
import styles from "./expediciones.module.css";

type Expedicion = { id:string; origen?:string; destino?:string; servicio?:string; estado?:string; partidas?:string[]; fecha?:string; createdAt?:string };

const demo:Expedicion[]=[
 {id:"EX-260071",origen:"Valencia",destino:"Lyon",partidas:["PT-260184","PT-260185","PT-260186"],servicio:"Grupaje",estado:"En tránsito"},
 {id:"EX-260070",origen:"Barcelona",destino:"Marseille",partidas:["PT-260183","PT-260187"],servicio:"LTL",estado:"Planificada"},
 {id:"EX-260069",origen:"Madrid",destino:"Toulouse",partidas:["PT-260182"],servicio:"Directo",estado:"Entregada"},
];

function readExpeditions():Expedicion[]{try{const raw=localStorage.getItem("fornexa-expediciones");if(!raw)return demo;const parsed=JSON.parse(raw) as Expedicion[];return Array.isArray(parsed)&&parsed.length?parsed:demo}catch{return demo}}

export default function ExpedicionesPage(){
 const [items,setItems]=useState<Expedicion[]>([]);
 useEffect(()=>{const refresh=()=>setItems(readExpeditions());refresh();window.addEventListener("focus",refresh);window.addEventListener("storage",refresh);return()=>{window.removeEventListener("focus",refresh);window.removeEventListener("storage",refresh)}},[]);
 const ordered=useMemo(()=>[...items].sort((a,b)=>{const at=a.createdAt?Date.parse(a.createdAt):0,bt=b.createdAt?Date.parse(b.createdAt):0;return at!==bt?bt-at:b.id.localeCompare(a.id,"es",{numeric:true})}),[items]);
 const rows=ordered.map(item=>({id:item.id,ruta:`${item.origen||"—"} → ${item.destino||"—"}`,partidas:`${item.partidas?.length??0} ${(item.partidas?.length??0)===1?"partida":"partidas"}`,servicio:item.servicio||"Varios",estado:item.estado||"Planificada",fecha:item.fecha||"—"}));
 const groupedParts=items.reduce((total,item)=>total+(item.partidas?.length??0),0);
 return <main className={styles.shell}>
  <aside className={styles.sidebar}><Link href="/dashboard" className={styles.brand}>FORNEXA</Link><nav><Link href="/dashboard">Control Tower</Link><Link href="/dashboard/partidas">Partidas</Link><Link className={styles.active} href="/dashboard/expediciones">Expediciones</Link><Link href="/dashboard/viajes">Viajes</Link><Link href="/dashboard/ofertas-tarifas">Ofertas y tarifas</Link><Link href="/dashboard/clientes">Clientes</Link><Link href="/dashboard/colaboradores">Colaboradores</Link></nav></aside>
  <section className={styles.content}>
   <header className={styles.header}><div><p className={styles.eyebrow}>CONSOLIDACIÓN</p><h1>Expediciones</h1><p>Agrupaciones de una o varias partidas compatibles por ruta, servicio y planificación.</p></div><div className={styles.actions}><button className={styles.secondary}>Importar Excel</button><Link href="/dashboard/nuevo/expedicion" className={styles.primary}>+ Nueva expedición</Link><div className={styles.avatar}>FG</div></div></header>
   <section className={styles.metrics}><article><span>Activas</span><strong>{items.filter(x=>x.estado!=="Entregada").length}</strong></article><article><span>Partidas agrupadas</span><strong>{groupedParts}</strong></article><article><span>Última creada</span><strong className={styles.lastId}>{ordered[0]?.id??"—"}</strong></article></section>
   <section className={styles.panel}><DataGrid storageKey="expediciones" columns={[{key:"id",label:"ID"},{key:"ruta",label:"Ruta"},{key:"partidas",label:"Partidas"},{key:"servicio",label:"Servicio"},{key:"estado",label:"Estado"},{key:"fecha",label:"Fecha"}]} rows={rows} rowHrefs={ordered.map(item=>`/dashboard/registros/expediciones/${item.id}`)} searchPlaceholder="Buscar por expedición, ruta, partida, servicio o estado" emptyMessage="No hay expediciones que coincidan con los filtros." /></section>
  </section>
 </main>
}