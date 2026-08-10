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
  return <main className={styles.shell}>
    <aside className={styles.sidebar}>
      <Link href="/dashboard" className={styles.brand}>FORNEXA</Link>
      <nav>{nav.map(([label,href])=>{
        const active=href==="/dashboard"?pathname===href:pathname.startsWith(href);
        return <Link key={href} className={active?styles.active:""} href={href}>{label}</Link>;
      })}</nav>
      <div className={styles.footer}><span>FORNEXA</span><small>Supply Chain Suite</small></div>
    </aside>
    <section className={styles.content}>{children}</section>
  </main>;
}
