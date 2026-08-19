import { createHash, randomBytes } from "node:crypto";

import { createSupabaseAdmin } from "@/lib/supabase-admin";

const TOKEN_BYTES = 32;
export const MOBILE_TRIP_ACCESS_TTL_HOURS = 36;

export function createMobileTripToken() {
  return randomBytes(TOKEN_BYTES).toString("base64url");
}

export function hashMobileTripToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export async function issueMobileTripAccess(input: {
  tenantId: string;
  tripId: string;
  driverId?: string | null;
  expiresAt?: Date;
}) {
  const supabase = createSupabaseAdmin();
  const token = createMobileTripToken();
  const expiresAt = input.expiresAt ?? new Date(Date.now() + MOBILE_TRIP_ACCESS_TTL_HOURS * 60 * 60 * 1000);

  const { data, error } = await supabase
    .from("mobile_trip_access")
    .insert({
      tenant_id: input.tenantId,
      trip_id: input.tripId,
      driver_id: input.driverId ?? null,
      token_hash: hashMobileTripToken(token),
      expires_at: expiresAt.toISOString(),
    })
    .select("id, tenant_id, trip_id, driver_id, expires_at")
    .single();

  if (error) throw error;
  return { token, access: data };
}

export async function mobileTripAccessForToken(token: string) {
  if (!token || token.length < 32) return null;

  const supabase = createSupabaseAdmin();
  const now = new Date().toISOString();
  const tokenHash = hashMobileTripToken(token);
  const { data, error } = await supabase
    .from("mobile_trip_access")
    .select("id, tenant_id, trip_id, driver_id, expires_at, revoked_at")
    .eq("token_hash", tokenHash)
    .is("revoked_at", null)
    .gt("expires_at", now)
    .maybeSingle();

  if (error || !data) return null;

  await supabase
    .from("mobile_trip_access")
    .update({ last_used_at: now })
    .eq("id", data.id)
    .eq("tenant_id", data.tenant_id);

  return data;
}
