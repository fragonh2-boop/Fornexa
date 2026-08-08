"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import EntityServicesManager from "../../../../components/EntityServicesManager";
import ClientMasterEditor from "./ClientMasterEditor";
import OfferEmailEditor from "./OfferEmailEditor";
import { getCustomer } from "../../../../../lib/customer-master";
import styles from "./record.module.css";

const nav=[["Control Tower","/dashboard"],["Decision Center","/dashboard/decision-center"],["Partidas","/dashboard/partidas"],["Expediciones","/dashboard/expediciones"],["Viajes","/dashboard/viajes"],["Ofertas y tarifas","/dashboard/ofertas-tarifas"],["Clientes","/dashboard/clientes"],["Colaboradores","/dashboard/colaboradores"],["Almacenes","/dashboard/almacenes"],["Tracking","/dashboard/tracking"],["ePOD & CMR","/dashboard/epod-cmr"],["Informes","/dashboard/informes"]] as const;

type Item=Record<string,unknown>;
export default function RecordEditor({module,id}:{module:string;id:string}){
 if(module==="clientes")return <div className={styles.clientStack}><ClientMasterEditor id={id}/><div className={styles.clientServices}><CustomerAdrSettings id={id}/><EntityServicesManager entityType="cliente" entityId={id}/></div></div>;
 if(module==="ofertas-tarifas"&&id!=="nuevo")return <OfferEmailEditor id={id}/>;
 return <GenericRecordEditor module={module} id={id}/>;
}

function CustomerAdrSettings({id}:{id:string}){
 const master=getCustomer(id);
 const [value,setValue]=useState<"S"|"N">(master?.adrControl??"N");
 const [saved,setSaved]=useState(false);
 useEffect(()=>{try{const stored=localStorage.getItem(`fornexa-customer-adr-${id}`);if(stored==="S"||stored==="N")setValue(stored)}catch{}},[id]);
 function save(){try{localStorage.setItem(`fornexa-customer-adr-${id}`,value);if(master?.tradeName)localStorage.setItem(`fornexa-customer-adr-name-${master.tradeName}`,value)}catch{}setSaved(true)}
 return <section className={styles.card}><h2>Control ADR</h2><p>Si ADR = S, cada pedido de este cliente deberá indicar obligatoriamente si la mercancía concreta es ADR S o N.</p><div className={styles.grid}><label>ADR cliente<select value={value} onChange={e=>{setValue(e.target.value as "S"|"N");setSaved(false)}}><option value="N">N · No exigir declaración ADR en cada pedido</option><option value="S">S · Exigir ADR S/N en cada pedido</option></select></label></div><div className={styles.submit}><button type="button" onClick={save}>Guardar configuración ADR</button></div>{saved&&<p className={styles.message}>Configuración ADR guardada para {id}.</p>}</section>;
}

function GenericRecordEditor({module,id}:{module:string;id:string}){
 const [item,setItem]=useState<Item>({id:id==="nuevo"?"":id});
 const [message,setMessage]=useState("");
 useEffect(()=>{const list=JSON.parse(localStorage.getItem(`fornexa-${module}`)||"[]") as Item[];const found=list.find(x=>String(x.id||x.nombre||x.referencia)===id);if(found)setItem(found);},[module,id]);
 function save(e:FormEvent<HTMLFormElement>){e.preventDefault();const fd=new FormData(e.currentTarget);const nextItem:Object={...item,id:String(fd.get("id")||item.id||`${module.slice(0,2).toUpperCase()}-${String(Date.now()).slice(-6)}`),nombre:String(fd.get("nombre")||""),estado:String(fd.get("estado")||"Activo"),clienteId:String(fd.get("clienteId")||""),colaboradorId:String(fd.get("colaboradorId")||""),expedicionId:String(fd.get("expedicionId")||""),viajeId:String(fd.get("viajeId")||""),notas:String(fd.get("notas")||"")};const list=JSON.parse(localStorage.getItem(`fornexa-${module}`)||"[]") as Item[];const key=String((nextItem as Item).id);const filtered=list.filter(x=>String(x.id)!==key);localStorage.setItem(`fornexa-${module}`,JSON.stringify([nextItem,...filtered]));setItem(nextItem as Item);setMessage("Registro guardado. Las referencias se han conservado como relaciones por ID.");}
 return <main className={styles.shell}><aside className={styles.sidebar}><Link href="/dashboard" className={styles.brand}>FORNEXA</Link><nav className={styles.nav}>{nav.map(([l,h])=><Link key={h} href={h}>{l}</Link>)}</nav><div className={styles.footer}>FORNEXA Suite<small>Editor relacional</small></div></aside><section className={styles.content}><header><div><p>{module==="colaboradores"?"PROVEEDOR · RED LOGÍSTICA":"REGISTRO RELACIONAL"}</p><h1>{id==="nuevo"?`Nuevo registro de ${module}`:id}</h1><span>{module==="colaboradores"?"Datos del proveedor, relaciones y servicios ofrecidos en una única ficha.":"Edición y persistencia local del registro y de sus relaciones operativas."}</span></div><div className={styles.actions}><Link href={`/dashboard/importar?entidad=${module}`}>Importar Excel</Link><Link href={`/dashboard/${module}`}>Volver</Link></div></header><form onSubmit={save}><section className={styles.card}><h2>Datos generales</h2><div className={styles.grid}><label>ID<input name="id" defaultValue={String(item.id||"")} placeholder="Se genera automáticamente"/></label><label>Nombre / descripción<input name="nombre" defaultValue={String(item.nombre||"")}/></label><label>Estado<select name="estado" defaultValue={String(item.estado||"Activo")}><option>Activo</option><option>Planificado</option><option>Pendiente</option><option>Cerrado</option></select></label></div></section><section className={styles.card}><h2>Relaciones</h2><p>Introduce el ID existente. Estas claves permiten navegar y consolidar datos entre módulos.</p><div className={styles.grid}><label>Cliente relacionado<input name="clienteId" defaultValue={String(item.clienteId||"")} placeholder="CL-..."/></label><label>Colaborador relacionado<input name="colaboradorId" defaultValue={String(item.colaboradorId||"")} placeholder="CO-..."/></label><label>Expedición relacionada<input name="expedicionId" defaultValue={String(item.expedicionId||"")} placeholder="EX-..."/></label><label>Viaje relacionado<input name="viajeId" defaultValue={String(item.viajeId||"")} placeholder="VJ-..."/></label></div></section>{module==="colaboradores"&&<EntityServicesManager entityType="proveedor" entityId={id}/>}<section className={styles.card}><label>Notas<textarea name="notas" defaultValue={String(item.notas||"")} rows={5}/></label></section>{message&&<p className={styles.message}>{message}</p>}<div className={styles.submit}><Link href={`/dashboard/${module}`}>Cancelar</Link><button type="submit">Guardar registro</button></div></form></section></main>;
}
