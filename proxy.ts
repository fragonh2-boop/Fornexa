import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextRequest, NextResponse } from "next/server";

type CookieToSet = {
  name: string;
  value: string;
  options?: CookieOptions;
};

export async function proxy(request: NextRequest) {
  const { pathname, searchParams, origin } = request.nextUrl;

  // Preserve the legacy first-access/recovery redirect used by emailed links.
  if (pathname === "/" && searchParams.has("code")) {
    const code = searchParams.get("code");
    const flow = request.cookies.get("fornexa_auth_flow")?.value;
    const callback = new URL("/auth/callback", origin);
    callback.searchParams.set("code", code ?? "");
    callback.searchParams.set("next", flow === "recover" ? "/reset-password" : "/reset-password?firstAccess=1");

    const redirectResponse = NextResponse.redirect(callback);
    redirectResponse.cookies.set("fornexa_auth_flow", "", {
      path: "/",
      maxAge: 0,
      sameSite: "lax",
      secure: true,
    });
    return redirectResponse;
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    if (pathname.startsWith("/dashboard")) return NextResponse.redirect(new URL("/login", origin));
    return NextResponse.next();
  }

  let response = NextResponse.next({ request });
  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet: CookieToSet[]) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });

  // getUser() validates the access token with Supabase Auth and refreshes the
  // session cookies when necessary through the cookie adapter above.
  const { data: { user } } = await supabase.auth.getUser();

  if (pathname.startsWith("/dashboard") && !user) {
    const login = new URL("/login", origin);
    login.searchParams.set("next", `${pathname}${request.nextUrl.search}`);
    const redirectResponse = NextResponse.redirect(login);
    response.cookies.getAll().forEach(cookie => redirectResponse.cookies.set(cookie));
    return redirectResponse;
  }

  if (pathname === "/login" && user) {
    const requestedNext = searchParams.get("next");
    const safeNext = requestedNext?.startsWith("/") && !requestedNext.startsWith("//") ? requestedNext : "/dashboard";
    const redirectResponse = NextResponse.redirect(new URL(safeNext, origin));
    response.cookies.getAll().forEach(cookie => redirectResponse.cookies.set(cookie));
    return redirectResponse;
  }

  return response;
}

export const config = {
  matcher: ["/", "/login", "/onboarding", "/reset-password", "/dashboard/:path*"],
};
