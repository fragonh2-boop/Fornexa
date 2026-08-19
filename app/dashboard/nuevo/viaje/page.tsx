import AppShell from "../../../components/AppShell";
import TripForm from "./TripForm";
import { getAuthenticatedOrReviewContext } from "@/lib/auth-context";
import { createSupabaseAdmin } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";

export default async function NewTripPage() {
  const auth = await getAuthenticatedOrReviewContext();
  if (!auth) return null;

  const supabase = createSupabaseAdmin();
  const [expeditionsResult, vehiclesResult, driversResult] = await Promise.all([
    supabase.from("expeditions").select(`code,status,order:orders!expeditions_order_id_fkey(code),origin:party_addresses!expeditions_origin_address_id_fkey(city,country_code),destination:party_addresses!expeditions_destination_address_id_fkey(city,country_code),service:service_catalog!expeditions_service_id_fkey(name)`).eq("tenant_id", auth.tenantId).not("status", "in", '(CLOSED,CANCELLED)').order("created_at", { ascending: false }),
    supabase.from("vehicles").select("registration,vehicle_type").eq("tenant_id", auth.tenantId).neq("status", "INACTIVE").order("registration"),
    supabase.from("drivers").select("code,name,adr_qualified").eq("tenant_id", auth.tenantId).eq("status", "ACTIVE").order("name"),
  ]);

  const expeditions = (expeditionsResult.data ?? []).map((item: any) => ({
    code: item.code,
    orderCode: item.order?.code ?? "—",
    route: `${item.origin?.city ?? "—"}${item.origin?.country_code ? ` (${item.origin.country_code})` : ""} → ${item.destination?.city ?? "—"}${item.destination?.country_code ? ` (${item.destination.country_code})` : ""}`,
    service: item.service?.name ?? "Sin servicio",
    status: item.status,
  }));
  const vehicles = (vehiclesResult.data ?? []).map((item: any) => ({ registration: item.registration, vehicleType: item.vehicle_type ?? "" }));
  const drivers = (driversResult.data ?? []).map((item: any) => ({ code: item.code, name: item.name, adrQualified: Boolean(item.adr_qualified) }));

  return <AppShell><div style={{maxWidth:1100,margin:"0 auto"}}><header style={{marginBottom:24}}><p style={{margin:0,color:"#0067ad",fontSize:11,fontWeight:800,letterSpacing:".12em"}}>TRANSPORTE</p><h1 style={{margin:"7px 0 8px",fontSize:42,lineHeight:1.05}}>Nuevo viaje</h1><p style={{margin:0,color:"#66768a"}}>Agrupa expedientes reales en un movimiento físico y asigna vehículo, conductor y secuencia.</p></header><TripForm expeditions={expeditions} vehicles={vehicles} drivers={drivers} readOnly={auth.mode === "review"} /></div></AppShell>;
}
