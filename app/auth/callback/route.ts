import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

type CookieToSet = {
  name: string;
  value: string;
  options?: CookieOptions;
};

function noStore<T extends NextResponse>(response: T) {
  response.headers.set("Cache-Control", "private, no-cache, no-store, max-age=0, must-revalidate");
  response.headers.set("Pragma", "no-cache");
  response.headers.set("Expires", "0");
  response.headers.set("Referrer-Policy", "no-referrer");
  return response;
}

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const flowId = requestUrl.searchParams.get("sb_flow_id");
  const requestedNext = requestUrl.searchParams.get("next") || "/reset-password";
  const next = requestedNext.startsWith("/") && !requestedNext.startsWith("//") ? requestedNext : "/reset-password";

  if (!code) {
    return noStore(NextResponse.redirect(new URL("/login?error=missing_code", requestUrl.origin)));
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    console.error("Supabase callback configuration is missing.");
    return noStore(NextResponse.redirect(new URL("/login?error=auth_configuration", requestUrl.origin)));
  }

  const cookieStore = await cookies();
  const response = noStore(NextResponse.redirect(new URL(next, requestUrl.origin)));

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet: CookieToSet[]) {
        cookiesToSet.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, options);
        });
      },
    },
  });

  const { error } = await supabase.auth.exchangeCodeForSession(
    code,
    flowId ? { flowId } : undefined,
  );

  if (error) {
    console.error("Supabase PKCE callback exchange failed", {
      code: error.code ?? null,
      name: error.name,
      status: error.status ?? null,
      hasFlowId: Boolean(flowId),
    });
    return noStore(NextResponse.redirect(new URL("/login?error=invalid_link", requestUrl.origin)));
  }

  return response;
}
