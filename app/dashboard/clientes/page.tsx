import Link from "next/link";
import AppShell from "../../components/AppShell";
import DataGrid from "../../components/DataGrid";
import { createSupabaseAdmin } from "@/lib/supabase-admin";
import styles from "./customers.module.css";

const STATUS_LABELS: Record<string, string> = {
  ACTIVE: "Activo",
  INACTIVE: "Inactivo",
  BLOCKED: "Bloqueado",
};

async function getCustomers() {
  const supabase = createSupabaseAdmin();
  const { data, error } = await supabase
    .from("parties")
    .select(`
      id,
      code,
      legal_name,
      trade_name,
      tax_id,
      country_code,
      adr_control,
      status,
      metadata,
      party_addresses ( city, region, country_code ),
      orders ( id ),
      offers ( id, status )
    `)
    .eq("is_customer", true)
    .order("code", { ascending: true });

  if (error) {
    console.error("Clientes: error al leer Supabase", error);
    return [];
  }

  return (data ?? []).map((customer: any) => {
    const addresses = customer.party_addresses ?? [];
    const primaryAddress = addresses[0];
    const openOffers = (customer.offers ?? []).filter((offer: any) => ["DRAFT", "SENT"].includes(offer.status)).length;
    const legacy = customer.metadata?.legacy ?? {};
    return {
      code: customer.code as string,
      tradeName: (customer.trade_name || customer.legal_name) as string,
      taxId: (customer.tax_id || "—") as string,
      location: primaryAddress ? `${primaryAddress.region || primaryAddress.city || "—"} · ${primaryAddress.city || primaryAddress.country_code || customer.country_code}` : customer.country_code,
      segment: legacy.segment || "—",
      adrControl: customer.adr_control ? "S" : "N",
      addresses: addresses.length,
      shipments: customer.orders?.length ?? 0,
      openOffers,
      accountManager: legacy.accountManager || "—",
      status: STATUS_LABELS[customer.status] ?? customer.status,
    };
  });
}

export default async function CustomersPage({ searchParams }: { searchParams: Promise<{ estado?: string }> }) {
  const { estado } = await searchParams;
  const customers = await getCustomers();
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
  const rowHrefs = filtered.map(customer => `/dashboard/registros/clientes/${customer.code}`);

  return <AppShell><div className={styles.page}><header><div><p>CRM · MAESTRO</p><h1>Clientes</h1><span>Resumen comercial y operativo desde el maestro real de Supabase.</span></div><div className={styles.actions}><Link href="/dashboard/importar?entidad=clientes">Importar Excel</Link><Link className={styles.primary} href="/dashboard/registros/clientes/nuevo">+ Nuevo cliente</Link></div></header><section className={styles.stats}>{stats.map(([value,label,filter])=><Link key={label} href={filter?`/dashboard/clientes?estado=${encodeURIComponent(filter)}`:"/dashboard/clientes"}><span>{label}</span><strong>{value}</strong><small>Abrir grid ↗</small></Link>)}</section>{estado&&<div className={styles.filterNotice}>Vista filtrada: <strong>{estado}</strong><Link href="/dashboard/clientes">Ver todos</Link></div>}<section className={styles.panel}><DataGrid storageKey={`clientes-${estado??"todos"}`} columns={columns} rows={rows} rowHrefs={rowHrefs} searchPlaceholder="Buscar por código, cliente, NIF, ubicación…" /></section></div></AppShell>;
}
