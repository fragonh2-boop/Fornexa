import { NextResponse } from "next/server";

import { getAuthenticatedContext } from "@/lib/auth-context";
import { issueMobileTripAccess } from "@/lib/mobile-trip-access";
import { createSupabaseAdmin } from "@/lib/supabase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function noStore(body: unknown, init?: ResponseInit) {
  return NextResponse.json(body, {
    ...init,
    headers: {
      ...(init?.headers ?? {}),
      "Cache-Control": "private, no-cache, no-store, max-age=0, must-revalidate",
      Pragma: "no-cache",
      Expires: "0",
    },
  });
}

async function tripForTenant(code: string, tenantId: string) {
  const supabase = createSupabaseAdmin();
  const { data, error } = await supabase
    .from("trips")
    .select("id,code,driver_id,status")
    .eq("tenant_id", tenantId)
    .eq("code", code)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function GET(_request: Request, context: { params: Promise<{ code: string }> }) {
  const auth = await getAuthenticatedContext();
  if (!auth) return noStore({ error: "No autorizado." }, { status: 401 });
  const { code } = await context.params;
  const trip = await tripForTenant(decodeURIComponent(code), auth.tenantId);
  if (!trip) return noStore({ error: "Viaje no encontrado." }, { status: 404 });

  const supabase = createSupabaseAdmin();
  const { data, error } = await supabase
    .from("mobile_trip_access")
    .select("id,driver_id,created_at,expires_at,revoked_at,last_used_at")
    .eq("tenant_id", auth.tenantId)
    .eq("trip_id", trip.id)
    .order("created_at", { ascending: false });
  if (error) return noStore({ error: "No se pudo consultar el acceso Mobile." }, { status: 500 });

  return noStore({
    trip: trip.code,
    accesses: data ?? [],
  });
}

export async function POST(_request: Request, context: { params: Promise<{ code: string }> }) {
  const auth = await getAuthenticatedContext();
  if (!auth) return noStore({ error: "No autorizado." }, { status: 401 });
  const { code } = await context.params;
  const trip = await tripForTenant(decodeURIComponent(code), auth.tenantId);
  if (!trip) return noStore({ error: "Viaje no encontrado." }, { status: 404 });
  if (["COMPLETED", "CANCELLED"].includes(trip.status)) {
    return noStore({ error: "No se puede emitir acceso Mobile para un viaje finalizado/cancelado." }, { status: 409 });
  }

  const supabase = createSupabaseAdmin();
  const now = new Date().toISOString();
  let revokeQuery = supabase
    .from("mobile_trip_access")
    .update({ revoked_at: now })
    .eq("tenant_id", auth.tenantId)
    .eq("trip_id", trip.id)
    .is("revoked_at", null);
  if (trip.driver_id) revokeQuery = revokeQuery.eq("driver_id", trip.driver_id);
  else revokeQuery = revokeQuery.is("driver_id", null);
  const { error: revokeError } = await revokeQuery;
  if (revokeError) return noStore({ error: "No se pudo rotar el acceso Mobile anterior." }, { status: 500 });

  try {
    const issued = await issueMobileTripAccess({
      tenantId: auth.tenantId,
      tripId: trip.id,
      driverId: trip.driver_id,
    });
    return noStore({
      trip: trip.code,
      token: issued.token,
      expiresAt: issued.access.expires_at,
    }, { status: 201 });
  } catch (error) {
    console.error("Issue mobile trip access", error);
    return noStore({ error: "No se pudo emitir el acceso Mobile." }, { status: 500 });
  }
}

export async function DELETE(_request: Request, context: { params: Promise<{ code: string }> }) {
  const auth = await getAuthenticatedContext();
  if (!auth) return noStore({ error: "No autorizado." }, { status: 401 });
  const { code } = await context.params;
  const trip = await tripForTenant(decodeURIComponent(code), auth.tenantId);
  if (!trip) return noStore({ error: "Viaje no encontrado." }, { status: 404 });

  const supabase = createSupabaseAdmin();
  const { error } = await supabase
    .from("mobile_trip_access")
    .update({ revoked_at: new Date().toISOString() })
    .eq("tenant_id", auth.tenantId)
    .eq("trip_id", trip.id)
    .is("revoked_at", null);
  if (error) return noStore({ error: "No se pudo revocar el acceso Mobile." }, { status: 500 });
  return noStore({ ok: true, trip: trip.code });
}
