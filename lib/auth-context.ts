import { cookies } from "next/headers";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export type AuthenticatedContext = {
  userId: string;
  tenantId: string;
  role: string;
  isReview?: boolean;
};

export const REVIEW_COOKIE = "fornexa_review";
export const REVIEW_TENANT_ID = "00000000-0000-4000-8000-000000000001";
const REVIEW_TOKEN_HASH = "cd148e817c92d5ad79fdb958fa624024003189bf37fe51fb4823dff9d0401aca";

async function sha256(value: string) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest)).map(byte => byte.toString(16).padStart(2, "0")).join("");
}

export async function isValidReviewToken(value?: string | null) {
  if (!value || value.length < 32) return false;
  return (await sha256(value)) === REVIEW_TOKEN_HASH;
}

export async function getReviewContext(): Promise<AuthenticatedContext | null> {
  const store = await cookies();
  const token = store.get(REVIEW_COOKIE)?.value;
  if (!(await isValidReviewToken(token))) return null;

  return {
    userId: "00000000-0000-4000-8000-000000000000",
    tenantId: REVIEW_TENANT_ID,
    role: "VIEWER",
    isReview: true,
  };
}

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

export async function getAuthenticatedOrReviewContext(): Promise<AuthenticatedContext | null> {
  return (await getAuthenticatedContext()) ?? (await getReviewContext());
}
