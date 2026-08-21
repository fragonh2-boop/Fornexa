import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { parseAuthEmailFlow, resetPasswordPath } from "@/lib/auth-flow";

type CookieToSet = { name: string; value: string; options?: CookieOptions };

function noStore<T extends NextResponse>(response: T) {
  response.headers.set("Cache-Control", "private, no-cache, no-store, max-age=0, must-revalidate");
  response.headers.set("Pragma", "no-cache");
  response.headers.set("Expires", "0");
  response.headers.set("Referrer-Policy", "no-referrer");
  return response;
}

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const tokenHash = requestUrl.searchParams.get("token_hash");
  const type = requestUrl.searchParams.get("type");
  const flow = parseAuthEmailFlow(requestUrl.searchParams.get("flow"));

  if (!tokenHash || type !== "recovery") {
    return noStore(NextResponse.redirect(new URL("/login?error=invalid_link", requestUrl.origin)));
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    return noStore(NextResponse.redirect(new URL("/login?error=auth_configuration", requestUrl.origin)));
  }

  const cookieStore = await cookies();
  const response = noStore(NextResponse.redirect(new URL(resetPasswordPath(flow), requestUrl.origin)));
  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet: CookieToSet[]) {
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });

  const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: "recovery" });
  if (error) {
    console.warn("Recovery token verification failed", { status: error.status, name: error.name });
    return noStore(NextResponse.redirect(new URL("/login?error=invalid_link", requestUrl.origin)));
  }

  return response;
}
