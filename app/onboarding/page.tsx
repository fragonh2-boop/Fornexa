import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  onboardingPreferencesFromMetadata,
  onboardingRoleDetails,
} from "@/lib/onboarding";
import OnboardingWizard from "./OnboardingWizard";

export const dynamic = "force-dynamic";

export default async function OnboardingPage() {
  const supabase = await createServerSupabaseClient();
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) redirect("/login?next=%2Fonboarding");

  const { data: memberships, error: membershipError } = await supabase
    .from("tenant_members")
    .select("tenant_id,role")
    .eq("user_id", user.id)
    .eq("status", "ACTIVE")
    .limit(2);

  if (membershipError || memberships?.length !== 1) redirect("/access-denied");

  const membership = memberships[0];
  const { data: tenant, error: tenantError } = await supabase
    .from("tenants")
    .select("name,code,status")
    .eq("id", membership.tenant_id)
    .single();

  if (tenantError || !tenant) redirect("/access-denied");

  const metadata = user.user_metadata && typeof user.user_metadata === "object"
    ? user.user_metadata as Record<string, unknown>
    : {};
  const email = user.email ?? "";

  return (
    <OnboardingWizard
      email={email}
      organization={{ name: tenant.name, code: tenant.code, status: tenant.status }}
      role={onboardingRoleDetails(membership.role)}
      initialPreferences={onboardingPreferencesFromMetadata(metadata, email)}
      previouslyCompleted={typeof metadata.onboarding_completed_at === "string"}
    />
  );
}
