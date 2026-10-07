import { createSupabaseAdmin } from "@/lib/supabase-admin";
import CustomersListView from "./CustomersListView";

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
  return <CustomersListView customers={customers} estado={estado} />;
}
