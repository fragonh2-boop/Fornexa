import { createServerSupabaseClient } from "@/lib/supabase/server";

export type AuthenticatedContext = {
  userId: string;
  tenantId: string;
  role: string;
};

export async function getAuthenticatedContext(): Promise<AuthenticatedContext | null> {
  const supabase = await createServerSupabaseClient();
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) return null;

  const { data: memberships, error: membershipError } = await supabase
    .from("tenant_members")
    .select("tenant_id,role")
    .eq("user_id", user.id)
    .eq("status", "ACTIVE")
    .limit(2);

  if (membershipError || !memberships || memberships.length !== 1) return null;

  const membership = memberships[0];
  if (!membership?.tenant_id || !membership?.role) return null;

  return {
    userId: user.id,
    tenantId: membership.tenant_id as string,
    role: membership.role as string,
  };
}
