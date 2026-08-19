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

export async function isValidReviewToken(value?: string | null) {
  if (!value || value.length < 32) return false;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return false;

  try {
    const response = await fetch(`${url}/rest/v1/rpc/fornexa_validate_review_token`, {
      method: "POST",
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ p_token: value }),
      cache: "no-store",
    });
    if (!response.ok) return false;
    return (await response.json()) === true;
  } catch {
    return false;
  }
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
