import { notFound, redirect } from "next/navigation";
import TripDetailView from "./TripDetailView";
import { getAuthenticatedOrReviewContext } from "@/lib/auth-context";
import { createSupabaseAdmin } from "@/lib/supabase-admin";

export default async function TripDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const auth = await getAuthenticatedOrReviewContext();
  if (!auth) redirect("/login");

  const { id } = await params;
  const supabase = createSupabaseAdmin();
  const { data: trip, error } = await supabase
    .from("trips")
    .select(`
      id,
      code,
      status,
      planned_start,
      actual_start,
      planned_end,
      actual_end,
      trailer_registration,
      carrier:parties!trips_carrier_id_fkey ( trade_name, legal_name ),
      vehicle:vehicles!trips_vehicle_id_fkey ( registration, vehicle_type, capacity_weight, capacity_volume ),
      driver:drivers!trips_driver_id_fkey ( name, phone, adr_qualified ),
      trip_expeditions (
        sequence,
        expedition:expeditions!trip_expeditions_expedition_id_fkey (
          code,
          status,
          order:orders!expeditions_order_id_fkey ( code, packages, gross_weight, volume, linear_meters )
        )
      ),
      trip_stops (
        id,
        sequence,
        stop_type,
        company_name,
        full_address,
        window_start,
        window_end,
        status,
        operational_reference
      )
    `)
    .eq("tenant_id", auth.tenantId)
    .eq("code", id)
    .maybeSingle();

  if (error) {
    console.error("Viaje detalle: error al leer Supabase", error);
    notFound();
  }
  if (!trip) notFound();

  return <TripDetailView trip={trip as any} readOnly={Boolean(auth.isReview)} />;
}
