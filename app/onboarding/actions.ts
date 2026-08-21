"use server";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { validateOnboardingPreferences } from "@/lib/onboarding";

export type CompleteOnboardingResult =
  | { ok: true }
  | { ok: false; error: string };

export async function completeOnboarding(input: unknown): Promise<CompleteOnboardingResult> {
  const validated = validateOnboardingPreferences(input);
  if (!validated.ok) return validated;

  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return { ok: false, error: "Tu sesión ha caducado. Vuelve a iniciar sesión para continuar." };
    }

    const { data: memberships, error: membershipError } = await supabase
      .from("tenant_members")
      .select("tenant_id")
      .eq("user_id", user.id)
      .eq("status", "ACTIVE")
      .limit(2);

    if (membershipError || memberships?.length !== 1) {
      return { ok: false, error: "No se ha podido confirmar tu organización activa." };
    }

    const existingMetadata = user.user_metadata && typeof user.user_metadata === "object"
      ? user.user_metadata
      : {};
    const preferences = validated.data;
    const { error: updateError } = await supabase.auth.updateUser({
      data: {
        ...existingMetadata,
        display_name: preferences.displayName,
        full_name: preferences.displayName,
        locale: preferences.language,
        timezone: preferences.timezone,
        operational_email_notifications: preferences.operationalEmailNotifications,
        onboarding_completed_at: new Date().toISOString(),
        onboarding_version: 1,
      },
    });

    if (updateError) {
      console.warn("Onboarding profile update failed", { status: updateError.status, name: updateError.name });
      return { ok: false, error: "No se han podido guardar tus preferencias. Inténtalo de nuevo." };
    }

    return { ok: true };
  } catch (error) {
    console.error("Onboarding completion failed", error instanceof Error ? { name: error.name } : { name: "unknown" });
    return { ok: false, error: "No se ha podido completar la configuración. Inténtalo de nuevo." };
  }
}
