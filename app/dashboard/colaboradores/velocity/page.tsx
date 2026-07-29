"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import styles from "./velocity.module.css";

const nav = [["Control Tower","/dashboard"],["Partidas","/dashboard/partidas"],["Expediciones","/dashboard/expediciones"],["Viajes","/dashboard/viajes"],["Ofertas y tarifas","/dashboard/ofertas-tarifas"],["Clientes","/dashboard/clientes"],["Colaboradores","/dashboard/colaboradores"],["Almacenes","/dashboard/almacenes"],["Tracking","/dashboard/tracking"],["ePOD & CMR","/dashboard/epod-cmr"],["Informes","/dashboard/informes"]] as const;

const vehicles = [
  {name:"Furgón",kg:900,m3:17,pallets:6,r70:70,r100:90,national:0.48,international:0.56,hour:30,mahon:1420,palma:1050,features:"Cierres de seguridad · Precintable · GPS"},
  {name:"Carrozado",kg:750,m3:20,pallets:8,r70:90,r100:110,national:0.56,international:0.65,hour:30,mahon:1840,palma:1240,features:"Caja cerrada o lona · Plataforma · Transpaleta · GPS"},
  {name:"Rígido ligero",kg:3300,m3:40,pallets:14,r70:150,r100:175,national:0.98,international:1.4,hour:35,mahon:2080,palma:1680,features:"Caja cerrada o lona · Plataforma · Transpaleta · GPS"},
  {name:"Rígido pesado 5/9 t",kg:9000,m3:60,pallets:15,r70:175,r100:200,national:1,international:1.5,hour:40,mahon:2260,palma:1770,features:"Caja cerrada o lona · Plataforma · Transpaleta · GPS"},
  {name:"Rígido pesado 14 t",kg:14000,m3:60,pallets:21,r70:190,r100:220,national:1.1,international:1.5,hour:45,mahon:2770,palma:1950,features:"Caja cerrada o lona · Plataforma · Transpaleta · GPS"},
  {name:"Tráiler",kg:24000,m3:100,pallets:33,r70:200,r100:250,national:1.2,international:1.6,hour:45,mahon:3150,palma:2700,features:"Tautliner · Mega · Frigo · Precintable · GPS"},
];

const supplements = [
  ["Ida + vuelta","20 %","Sobre precio base"],
  ["ADR","25 %","Servicios ADR"],
  ["Nocturno","25 %","L-V de 22:00 a 06:00"],
  ["Fin de semana / festivo","25 %","Sábado 06:00 a lunes 06:00"],
  ["Documentación","20,00 €","Por expedición"],
  ["Residuos","180,00 €","Servicio mínimo"],
];

export default function VelocityPage(){
  const [vehicle,setVehicle]=useState("Tráiler");
  const [scope,setScope]=useState("international");
  const [distance,setDistance]=useState(450);
  const [adr,setAdr]=useState(true);
  const [night,setNight]=useState(false);
  const [weekend,setWeekend]=useState(false);
  const [roundTrip,setRoundTrip]=useState(false);
  const [documents,setDocuments]=useState(true);

  const selected=vehicles.find(v=>v.name===vehicle) ?? vehicles[5];
  const result=useMemo(()=>{
    const rate=scope==="national"?selected.national:selected.international;
    const base=distance*rate;
    const lines=[{label:`${distance} km × ${rate.toLocaleString("es-ES",{minimumFractionDigits:2})} €/km`,value:base}];
    if(roundTrip) lines.push({label:"Ida + vuelta · 20 %",value:base*.20});
    if(adr) lines.push({label:"ADR · 25 %",value:base*.25});
    if(night) lines.push({label:"Nocturno · 25 %",value:base*.25});
    if(weekend) lines.push({label:"Fin de semana / festivo · 25 %",value:base*.25});
    if(documents) lines.push({label:"Documentación por expedición",value:20});
    return {lines,total:lines.reduce((sum,l)=>sum+l.value,0)};
  },[selected,scope,distance,adr,night,weekend,roundTrip,documents]);

  return <main className={styles.shell}>
    <aside className={styles.sidebar}><Link href="/dashboard" className={styles.brand}>FORNEXA</Link><nav>{nav.map(([label,href])=><Link key={href} className={label==="Colaboradores"?styles.active:""} href={href}>{label}</Link>)}</nav><div className={styles.footer}><span>FORNEXA Suite</span><small>Entorno de demostración</small></div></aside>
    <section className={styles.content}>
      <header className={styles.header}><div><p>COLABORADOR · TARIFA 2026</p><h1>Velocity Transinternacional</h1><span>Configuración integral de colaborador, flota, cobertura, tarifas, suplementos, certificaciones y condiciones.</span></div><div className={styles.actions}><Link href="/dashboard/colaboradores" className={styles.secondary}>Volver</Link><button>Editar colaborador</button><div className={styles.avatar}>FG</div></div></header>

      <section className={styles.summary}>
        <article><span>Razón social</span><strong>Velocity Transinternacional, S.L.</strong><small>B98992001</small></article>
        <article><span>Base tarifaria</span><strong>Riba-roja de Túria</strong><small>24 h · 365 días</small></article>
        <article><span>Referencia</span><strong>OT-12409661-1</strong><small>Vigencia 2026</small></article>
        <article><span>Certificaciones</span><strong>RGSEAA + RDO-LER</strong><small>Alimentación y residuos</small></article>
      </section>

      <div className={styles.tabs}><button className={styles.tabActive}>Tarifas</button><button>Vehículos</button><button>Cobertura</button><button>Servicios</button><button>Suplementos</button><button>Condiciones</button><button>Certificaciones</button><button>Documentos</button></div>

      <section className={styles.panel}><div className={styles.panelTitle}><div><p>FLOTA Y PRECIOS</p><h2>Tarifa base por tipo de vehículo</h2></div><button className={styles.linkButton}>+ Añadir línea</button></div><div className={styles.table}><div className={`${styles.row} ${styles.head}`}><span>Vehículo</span><span>Kg máx.</span><span>Capacidad</span><span>Palets</span><span>Radio 70</span><span>Radio 100</span><span>Nacional</span><span>Internacional</span><span>Hora/parada</span></div>{vehicles.map(v=><div className={styles.row} key={v.name}><strong>{v.name}</strong><span>{v.kg.toLocaleString("es-ES")}</span><span>{v.m3} m³</span><span>{v.pallets}</span><span>{v.r70.toLocaleString("es-ES",{style:"currency",currency:"EUR"})}</span><span>{v.r100.toLocaleString("es-ES",{style:"currency",currency:"EUR"})}</span><span>{v.national.toLocaleString("es-ES",{minimumFractionDigits:2})} €/km</span><span>{v.international.toLocaleString("es-ES",{minimumFractionDigits:2})} €/km</span><span>{v.hour.toLocaleString("es-ES",{style:"currency",currency:"EUR"})}</span></div>)}</div></section>

      <section className={styles.twoCols}>
        <article className={styles.panel}><div className={styles.panelTitle}><div><p>REGLAS</p><h2>Suplementos configurados</h2></div></div><div className={styles.ruleList}>{supplements.map(([name,value,condition])=><div key={name}><strong>{name}</strong><span>{condition}</span><b>{value}</b></div>)}</div></article>
        <article className={styles.panel}><div className={styles.panelTitle}><div><p>CAPACIDADES</p><h2>Equipamiento y habilitaciones</h2></div></div><div className={styles.featureList}>{vehicles.map(v=><div key={v.name}><strong>{v.name}</strong><span>{v.features}</span></div>)}</div></article>
      </section>

      <section className={styles.panel}><div className={styles.panelTitle}><div><p>SIMULADOR</p><h2>Calcular coste del colaborador</h2></div><span className={styles.live}>Cálculo en tiempo real</span></div><div className={styles.simulator}>
        <div className={styles.formGrid}><label>Vehículo<select value={vehicle} onChange={e=>setVehicle(e.target.value)}>{vehicles.map(v=><option key={v.name}>{v.name}</option>)}</select></label><label>Ámbito<select value={scope} onChange={e=>setScope(e.target.value)}><option value="national">Nacional</option><option value="international">Internacional</option></select></label><label>Distancia (km)<input type="number" min="0" value={distance} onChange={e=>setDistance(Number(e.target.value)||0)}/></label><div className={styles.checks}><label><input type="checkbox" checked={adr} onChange={e=>setAdr(e.target.checked)}/> ADR</label><label><input type="checkbox" checked={night} onChange={e=>setNight(e.target.checked)}/> Nocturno</label><label><input type="checkbox" checked={weekend} onChange={e=>setWeekend(e.target.checked)}/> Festivo</label><label><input type="checkbox" checked={roundTrip} onChange={e=>setRoundTrip(e.target.checked)}/> Ida + vuelta</label><label><input type="checkbox" checked={documents} onChange={e=>setDocuments(e.target.checked)}/> Documentación</label></div></div>
        <div className={styles.quote}><div className={styles.vehicleSummary}><span>{selected.name}</span><strong>{selected.kg.toLocaleString("es-ES")} kg · {selected.m3} m³ · {selected.pallets} palets</strong></div>{result.lines.map(line=><div className={styles.quoteLine} key={line.label}><span>{line.label}</span><strong>{line.value.toLocaleString("es-ES",{style:"currency",currency:"EUR"})}</strong></div>)}<div className={styles.total}><span>Total estimado</span><strong>{result.total.toLocaleString("es-ES",{style:"currency",currency:"EUR"})}</strong></div><small>Peajes, aduanas, ferris, ferrocarril y túneles no incluidos, salvo las excepciones configuradas.</small></div>
      </div></section>
    </section>
  </main>
}
