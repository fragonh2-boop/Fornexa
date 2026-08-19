import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextRequest, NextResponse } from "next/server";

type CookieToSet = {
  name: string;
  value: string;
  options?: CookieOptions;
};

const protectedApiPaths = [
  "/api/cmr",
  "/api/expeditions",
  "/api/storage/health",
  "/api/storage/migrate-local",
  "/api/communications/email",
  "/api/offers/send",
  "/api/customs/messages",
  "/api/telematics/live",
];

function isProtectedApi(pathname: string) {
  return protectedApiPaths.some(path => pathname === path);
}

function loginRedirect(request: NextRequest, origin: string) {
  const login = new URL("/login", origin);
  login.searchParams.set("next", `${request.nextUrl.pathname}${request.nextUrl.search}`);
  return login;
}

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
    if (isProtectedApi(pathname)) return NextResponse.json({ error: "No autorizado." }, { status: 401 });
    if (pathname.startsWith("/dashboard") || pathname === "/onboarding" || pathname === "/reset-password") {
      return NextResponse.redirect(loginRedirect(request, origin));
    }
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

  const { data: { user } } = await supabase.auth.getUser();

  if (isProtectedApi(pathname) && !user) {
    const unauthorized = NextResponse.json({ error: "No autorizado." }, { status: 401 });
    response.cookies.getAll().forEach(cookie => unauthorized.cookies.set(cookie));
    return unauthorized;
  }

  if (pathname === "/api/storage/migrate-local" && user) {
    const { data: memberships, error } = await supabase
      .from("tenant_members")
      .select("role")
      .eq("user_id", user.id)
      .eq("status", "ACTIVE")
      .limit(2);
    const role = !error && memberships?.length === 1 ? memberships[0]?.role : null;
    if (role !== "OWNER" && role !== "ADMIN") {
      const forbidden = NextResponse.json({ error: "Permisos insuficientes." }, { status: 403 });
      response.cookies.getAll().forEach(cookie => forbidden.cookies.set(cookie));
      return forbidden;
    }
  }

  if ((pathname.startsWith("/dashboard") || pathname === "/onboarding" || pathname === "/reset-password") && !user) {
    const redirectResponse = NextResponse.redirect(loginRedirect(request, origin));
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
  matcher: [
    "/",
    "/login",
    "/onboarding",
    "/reset-password",
    "/dashboard/:path*",
    "/api/cmr",
    "/api/expeditions",
    "/api/storage/health",
    "/api/storage/migrate-local",
    "/api/communications/email",
    "/api/offers/send",
    "/api/customs/messages",
    "/api/telematics/live",
  ],
};
