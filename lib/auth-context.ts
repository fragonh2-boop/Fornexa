import { createServerSupabaseClient } from "@/lib/supabase/server";

export type AuthenticatedContext = {
  userId: string;
  tenantId: string;
};

export async function getAuthenticatedContext(): Promise<AuthenticatedContext | null> {
  const supabase = await createServerSupabaseClient();
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) return null;

  const { data: membership, error: membershipError } = await supabase
    .from("tenant_members")
    .select("tenant_id")
    .eq("user_id", user.id)
    .eq("status", "ACTIVE")
    .limit(1)
    .maybeSingle();

  if (membershipError || !membership?.tenant_id) return null;

  return { userId: user.id, tenantId: membership.tenant_id as string };
}
