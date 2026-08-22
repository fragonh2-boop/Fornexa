import Link from "next/link";
import { redirect } from "next/navigation";
import { getAuthenticatedOrReviewContext } from "@/lib/auth-context";
import { createSupabaseAdmin } from "@/lib/supabase-admin";
import PartidaForm, { type AddressOption, type CustomerOption, type ServiceOption } from "./PartidaForm";
import styles from "./partida-form.module.css";

export const dynamic = "force-dynamic";

export default async function NewPartidaPage() {
  const auth = await getAuthenticatedOrReviewContext();
  if (!auth) redirect("/login");

  const supabase = createSupabaseAdmin();
  const [customersResult, addressesResult, servicesResult, adrProfilesResult] = await Promise.all([
    supabase
      .from("parties")
      .select("id,code,trade_name,legal_name,adr_control")
      .eq("tenant_id", auth.tenantId)
      .eq("is_customer", true)
      .eq("status", "ACTIVE")
      .order("code"),
    supabase
      .from("party_addresses")
      .select("code,name,address_line1,postal_code,city,country_code,party:parties!party_addresses_party_id_fkey(code)")
      .eq("tenant_id", auth.tenantId)
      .eq("is_active", true)
      .not("code", "is", null)
      .order("code"),
    supabase
      .from("service_catalog")
      .select("code,name")
      .eq("tenant_id", auth.tenantId)
      .eq("is_active", true)
      .order("name"),
    supabase
      .from("party_adr_profiles")
      .select("party_id,frequency,validation_policy,preferred_classes")
      .eq("tenant_id", auth.tenantId),
  ]);

  if (customersResult.error) console.error("Nueva partida: clientes", customersResult.error);
  if (addressesResult.error) console.error("Nueva partida: direcciones", addressesResult.error);
  if (servicesResult.error) console.error("Nueva partida: servicios", servicesResult.error);
  if (adrProfilesResult.error) console.error("Nueva partida: perfiles ADR", adrProfilesResult.error);

  const adrProfiles = new Map((adrProfilesResult.data ?? []).map((item: any) => [item.party_id, item]));

  const customers: CustomerOption[] = (customersResult.data ?? []).map((item: any) => ({
    code: item.code,
    name: item.trade_name ?? item.legal_name ?? item.code,
    adrControl: Boolean(item.adr_control),
    adrFrequency: adrProfiles.get(item.id)?.frequency ?? (item.adr_control ? "SOMETIMES" : "NEVER"),
    adrPolicy: adrProfiles.get(item.id)?.validation_policy ?? "WARNING",
    preferredClasses: adrProfiles.get(item.id)?.preferred_classes ?? [],
  }));
  const addresses: AddressOption[] = (addressesResult.data ?? []).map((item: any) => ({
    code: item.code,
    name: item.name ?? item.code,
    address: item.address_line1 ?? "",
    postalCode: item.postal_code ?? "",
    city: item.city ?? "",
    countryCode: String(item.country_code ?? "").trim(),
    partyCode: item.party?.code ?? "",
  }));
  const services: ServiceOption[] = (servicesResult.data ?? []).map((item: any) => ({ code: item.code, name: item.name }));

  return <main className={styles.page}>
    <header className={styles.header}>
      <div>
        <p>PEDIDO DE CLIENTE</p>
        <h1>Nueva partida</h1>
        <span>Alta persistente sobre el modelo canónico. El Customer ID, la ruta, ADR y magnitudes se conservarán hasta Expediente, Viaje y CMR.</span>
      </div>
      <Link href="/dashboard/partidas">Volver a Partidas</Link>
    </header>
    <PartidaForm customers={customers} addresses={addresses} services={services} readOnly={Boolean(auth.isReview)} />
  </main>;
}
