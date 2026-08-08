import Link from "next/link";
import DataGrid from "../../components/DataGrid";
import { customers } from "../../../lib/customer-master";
import styles from "./customers.module.css";

const nav = [["Control Tower","/dashboard"],["Decision Center","/dashboard/decision-center"],["Partidas","/dashboard/partidas"],["Expediciones","/dashboard/expediciones"],["Viajes","/dashboard/viajes"],["Ofertas y tarifas","/dashboard/ofertas-tarifas"],["Clientes","/dashboard/clientes"],["Colaboradores","/dashboard/colaboradores"],["Almacenes","/dashboard/almacenes"],["Tracking","/dashboard/tracking"],["ePOD & CMR","/dashboard/epod-cmr"],["Informes","/dashboard/informes"]] as const;

export default async function CustomersPage({ searchParams }: { searchParams: Promise<{ estado?: string }> }) {
  const { estado } = await searchParams;
  const filtered = estado ? customers.filter(customer => customer.status === estado) : customers;
  const stats = [
    [String(customers.length), "Clientes totales", ""], [String(customers.filter(customer => customer.status === "Activo").length), "Activos", "Activo"],
    [String(customers.filter(customer => customer.adrControl === "S").length), "Control ADR", ""], [String(customers.reduce((total, customer) => total + customer.openOffers, 0)), "Ofertas abiertas", ""],
  ] as const;
  const columns = [{key:"code",label:"Código"},{key:"tradeName",label:"Cliente"},{key:"taxId",label:"NIF/CIF"},{key:"location",label:"Provincia / población"},{key:"segment",label:"Segmento"},{key:"adr",label:"ADR"},{key:"addresses",label:"Direcciones"},{key:"shipments",label:"Expediciones"},{key:"revenue",label:"Facturación"},{key:"manager",label:"Responsable"},{key:"status",label:"Estado"}];
  const rows = filtered.map(customer => ({ code:customer.code, tradeName:customer.tradeName, taxId:customer.taxId, location:`${customer.province} · ${customer.city}`, segment:customer.segment, adr:customer.adrControl, addresses:customer.addresses, shipments:customer.shipments, revenue:customer.annualRevenue, manager:customer.accountManager, status:customer.status }));
  const rowHrefs = filtered.map(customer => `/dashboard/registros/clientes/${customer.code}`);
  return <main className={styles.shell}><aside className={styles.sidebar}><Link href="/dashboard" className={styles.brand}>FORNEXA</Link><nav>{nav.map(([label,href])=><Link key={href} className={href==="/dashboard/clientes"?styles.active:""} href={href}>{label}</Link>)}</nav><div className={styles.footer}>FORNEXA Suite<small>Mantenimiento de clientes</small></div></aside><section className={styles.content}><header><div><p>CRM · MAESTRO</p><h1>Clientes</h1><span>Resumen comercial y operativo. Abre cualquier fila para acceder a su ficha completa.</span></div><div className={styles.actions}><Link href="/dashboard/importar?entidad=clientes">Importar Excel</Link><Link className={styles.primary} href="/dashboard/registros/clientes/nuevo" target="_blank">+ Nuevo cliente</Link></div></header><section className={styles.stats}>{stats.map(([value,label,filter])=><Link key={label} href={filter?`/dashboard/clientes?estado=${encodeURIComponent(filter)}`:"/dashboard/clientes"} target="_blank"><span>{label}</span><strong>{value}</strong><small>Abrir grid ↗</small></Link>)}</section>{estado&&<div className={styles.filterNotice}>Vista filtrada: <strong>{estado}</strong><Link href="/dashboard/clientes">Ver todos</Link></div>}<section className={styles.panel}><DataGrid storageKey={`clientes-${estado??"todos"}`} columns={columns} rows={rows} rowHrefs={rowHrefs} openLinksInNewTab searchPlaceholder="Buscar por código, cliente, NIF, ubicación…" /></section></section></main>;
}
