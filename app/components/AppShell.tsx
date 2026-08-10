"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import styles from "./app-shell.module.css";

const nav = [
  ["Control Tower","/dashboard"],
  ["Decision Center","/dashboard/decision-center"],
  ["Partidas","/dashboard/partidas"],
  ["Expediciones","/dashboard/expediciones"],
  ["Viajes","/dashboard/viajes"],
  ["Aduanas","/dashboard/aduanas"],
  ["Ofertas y tarifas","/dashboard/ofertas-tarifas"],
  ["Clientes","/dashboard/clientes"],
  ["Colaboradores","/dashboard/colaboradores"],
  ["Almacenes","/dashboard/almacenes"],
  ["Tracking","/dashboard/tracking"],
  ["ePOD & CMR","/dashboard/epod-cmr"],
  ["Integraciones","/dashboard/integraciones"],
  ["Informes","/dashboard/informes"],
] as const;

export default function AppShell({children}:{children:React.ReactNode}){
  const pathname=usePathname();
  return <main className={styles.shell} style={{display:"grid",gridTemplateColumns:"250px minmax(0,1fr)",minHeight:"100vh",background:"#07111f",color:"#f7f9fc"}}>
    <aside className={styles.sidebar} style={{position:"sticky",top:0,display:"flex",flexDirection:"column",height:"100vh",padding:"30px 22px",borderRight:"1px solid rgba(255,255,255,.08)",background:"#081321",overflowY:"auto"}}>
      <Link href="/dashboard" className={styles.brand} style={{fontWeight:900,letterSpacing:".24em",fontSize:18,color:"#f7f9fc",textDecoration:"none"}}>FORNEXA</Link>
      <nav style={{display:"grid",gap:5,marginTop:42}}>{nav.map(([label,href])=>{
        const active=href==="/dashboard"?pathname===href:pathname.startsWith(href);
        return <Link key={href} className={active?styles.active:""} href={href} style={{padding:"11px 14px",borderRadius:10,color:active?"#f7f9fc":"#91a4ba",fontSize:14,textDecoration:"none",background:active?"rgba(105,230,180,.09)":"transparent",boxShadow:active?"inset 2px 0 #69e6b4":"none"}}>{label}</Link>;
      })}</nav>
      <div className={styles.footer} style={{display:"grid",gap:4,marginTop:"auto",paddingTop:24,color:"#69e6b4",fontSize:12}}><span>FORNEXA</span><small style={{color:"#71869d"}}>Supply Chain Suite</small></div>
    </aside>
    <section className={styles.content} style={{minWidth:0,padding:"34px 38px 50px",overflowX:"auto",background:"#07111f"}}>{children}</section>
  </main>;
}
