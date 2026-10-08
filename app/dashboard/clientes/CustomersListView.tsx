import Link from "next/link";
import AppShell from "../../components/AppShell";
import DataGrid from "../../components/DataGrid";
import { MetricGrid, ScreenHeader, screenButton, screenPanelClass } from "../../components/ScreenChrome";
import styles from "./customers.module.css";

export type CustomerListItem = {
  code: string;
  tradeName: string;
  taxId: string;
  location: string;
  segment: string;
  adrControl: string;
  addresses: number;
  shipments: number;
  openOffers: number;
  accountManager: string;
  status: string;
};

export default function CustomersListView({ customers, estado, basePath = "/dashboard" }: {
  customers: CustomerListItem[];
  estado?: string;
  basePath?: "/dashboard" | "/demo";
}) {
  const demo = basePath === "/demo";
  const filtered = estado ? customers.filter(customer => customer.status === estado) : customers;
  const stats = [
    [String(customers.length), "Clientes totales", ""],
    [String(customers.filter(customer => customer.status === "Activo").length), "Activos", "Activo"],
    [String(customers.filter(customer => customer.adrControl === "S").length), "Control ADR", ""],
    [String(customers.reduce((total, customer) => total + customer.openOffers, 0)), "Ofertas abiertas", ""],
  ] as const;
  const columns = [
    {key:"code",label:"Código"},
    {key:"tradeName",label:"Cliente"},
    {key:"taxId",label:"NIF/CIF"},
    {key:"location",label:"Provincia / población"},
    {key:"segment",label:"Segmento"},
    {key:"adr",label:"ADR"},
    {key:"addresses",label:"Direcciones"},
    {key:"shipments",label:"Pedidos"},
    {key:"manager",label:"Responsable"},
    {key:"status",label:"Estado"},
  ];
  const rows = filtered.map(customer => ({
    code: customer.code,
    tradeName: customer.tradeName,
    taxId: customer.taxId,
    location: customer.location,
    segment: customer.segment,
    adr: customer.adrControl,
    addresses: customer.addresses,
    shipments: customer.shipments,
    manager: customer.accountManager,
    status: customer.status,
  }));
  const rowHrefs = filtered.map(customer => `${basePath}/registros/clientes/${customer.code}`);

  return <AppShell><div className={styles.page}>
    <ScreenHeader eyebrow="CRM · MAESTRO" title="Clientes" description={demo ? "Resumen comercial y operativo con datos ficticios de demostración." : "Resumen comercial y operativo desde el maestro real de Supabase."}>
      <Link href={`${basePath}/importar?entidad=clientes`} className={screenButton.secondary}>Importar Excel</Link>
      <Link href={`${basePath}/registros/clientes/nuevo`} className={screenButton.primary}>+ Nuevo cliente</Link>
    </ScreenHeader>
    <MetricGrid items={stats.map(([value, label, filter]) => ({ label, value, note: "Ver grid ↗", href: filter ? `${basePath}/clientes?estado=${encodeURIComponent(filter)}` : `${basePath}/clientes` }))} />
    {estado && <div className={styles.filterNotice}>Vista filtrada: <strong>{estado}</strong><Link href={`${basePath}/clientes`}>Ver todos</Link></div>}
    <section className={screenPanelClass}><DataGrid storageKey={`${demo ? "demo-" : ""}clientes-${estado??"todos"}`} persistPreferences={!demo} columns={columns} rows={rows} rowHrefs={rowHrefs} searchPlaceholder="Buscar por código, cliente, NIF, ubicación…" /></section>
  </div></AppShell>;
}
