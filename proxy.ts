import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextRequest, NextResponse } from "next/server";
import { isValidReviewToken, REVIEW_COOKIE } from "@/lib/auth-context";

type CookieToSet = {
  name: string;
  value: string;
  options?: CookieOptions;
};

type ActiveMembership = { tenant_id: string; role: string };

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

// Shared CMR routes deliberately use capability authentication (access_key) rather
// than Supabase user authentication because carriers/drivers/recipients may not have
// a FORNEXA account. They still pass through Proxy for common no-cache/review-mode
// controls, but every dynamic route MUST continue validating its own CMR↔access_key
// relationship server-side. Matching the namespace here is defense in depth, not a
// replacement for endpoint-level capability validation.
function isSharedCmrApi(pathname: string) {
  return pathname.startsWith("/api/cmr/");
}

function noStore<T extends NextResponse>(response: T) {
  response.headers.set("Cache-Control", "private, no-cache, no-store, max-age=0, must-revalidate");
  response.headers.set("Pragma", "no-cache");
  response.headers.set("Expires", "0");
  return response;
}

function loginRedirect(request: NextRequest, origin: string) {
  const login = new URL("/login", origin);
  login.searchParams.set("next", `${request.nextUrl.pathname}${request.nextUrl.search}`);
  return login;
}

export async function proxy(request: NextRequest) {
  const { pathname, searchParams, origin } = request.nextUrl;

  // Private review shortcut. The plaintext token is never stored in the repository;
  // only its SHA-256 hash is used for validation. The token is removed from the URL
  // immediately and persisted in an HttpOnly cookie for eight hours.
  if (pathname === "/review") {
    const token = searchParams.get("token");
    if (!(await isValidReviewToken(token))) {
      return noStore(new NextResponse("Not found", { status: 404 }));
    }

    const target = NextResponse.redirect(new URL("/dashboard", origin));
    target.cookies.set(REVIEW_COOKIE, token!, {
      httpOnly: true,
      secure: true,
      sameSite: "strict",
      path: "/",
      maxAge: 60 * 60 * 8,
    });
    target.headers.set("Referrer-Policy", "no-referrer");
    return noStore(target);
  }

  const reviewAccess = await isValidReviewToken(request.cookies.get(REVIEW_COOKIE)?.value);
  if (reviewAccess && pathname.startsWith("/dashboard")) {
    return noStore(NextResponse.next({ request }));
  }
  if (reviewAccess && (isProtectedApi(pathname) || isSharedCmrApi(pathname))) {
    if (request.method !== "GET" && request.method !== "HEAD") {
      return noStore(NextResponse.json({ error: "Modo revisión: solo lectura." }, { status: 403 }));
    }
    return noStore(NextResponse.next({ request }));
  }
  if (reviewAccess && pathname === "/login") {
    return noStore(NextResponse.redirect(new URL("/dashboard", origin)));
  }

  // Shared CMR capability endpoints are intentionally public-by-key. Do not require
  // a Supabase session here; endpoint handlers validate access_key against the exact
  // CMR. We only enforce common response hygiene at the perimeter.
  if (isSharedCmrApi(pathname)) {
    return noStore(NextResponse.next({ request }));
  }

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
    return noStore(redirectResponse);
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    if (isProtectedApi(pathname)) return noStore(NextResponse.json({ error: "No autorizado." }, { status: 401 }));
    if (pathname.startsWith("/dashboard") || pathname === "/onboarding" || pathname === "/reset-password") {
      return noStore(NextResponse.redirect(loginRedirect(request, origin)));
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
    return noStore(unauthorized);
  }

  if ((pathname.startsWith("/dashboard") || pathname === "/onboarding" || pathname === "/reset-password") && !user) {
    const redirectResponse = NextResponse.redirect(loginRedirect(request, origin));
    response.cookies.getAll().forEach(cookie => redirectResponse.cookies.set(cookie));
    return noStore(redirectResponse);
  }

  const membershipRequired = pathname.startsWith("/dashboard") || pathname === "/onboarding" || pathname === "/login" || pathname === "/api/storage/migrate-local";
  let membership: ActiveMembership | null = null;
  if (user && membershipRequired) {
    const { data: memberships, error } = await supabase
      .from("tenant_members")
      .select("tenant_id,role")
      .eq("user_id", user.id)
      .eq("status", "ACTIVE")
      .limit(2);
    if (!error && memberships?.length === 1 && memberships[0]?.tenant_id && memberships[0]?.role) {
      membership = memberships[0] as ActiveMembership;
    }
  }

  if (user && (pathname.startsWith("/dashboard") || pathname === "/onboarding") && !membership) {
    const denied = NextResponse.redirect(new URL("/access-denied", origin));
    response.cookies.getAll().forEach(cookie => denied.cookies.set(cookie));
    return noStore(denied);
  }

  if (pathname === "/api/storage/migrate-local" && user) {
    if (membership?.role !== "OWNER" && membership?.role !== "ADMIN") {
      const forbidden = NextResponse.json({ error: "Permisos insuficientes." }, { status: 403 });
      response.cookies.getAll().forEach(cookie => forbidden.cookies.set(cookie));
      return noStore(forbidden);
    }
  }

  if (pathname === "/login" && user) {
    if (!membership) {
      const denied = NextResponse.redirect(new URL("/access-denied", origin));
      response.cookies.getAll().forEach(cookie => denied.cookies.set(cookie));
      return noStore(denied);
    }
    const requestedNext = searchParams.get("next");
    const safeNext = requestedNext?.startsWith("/") && !requestedNext.startsWith("//") ? requestedNext : "/dashboard";
    const redirectResponse = NextResponse.redirect(new URL(safeNext, origin));
    response.cookies.getAll().forEach(cookie => redirectResponse.cookies.set(cookie));
    return noStore(redirectResponse);
  }

  const authSensitive = Boolean(user) || isProtectedApi(pathname) || pathname === "/login" || pathname === "/onboarding" || pathname === "/reset-password" || pathname.startsWith("/dashboard");
  return authSensitive ? noStore(response) : response;
}

export const config = {
  matcher: [
    "/",
    "/review",
    "/login",
    "/onboarding",
    "/reset-password",
    "/dashboard/:path*",
    "/api/cmr",
    "/api/cmr/:path*",
    "/api/expeditions",
    "/api/storage/health",
    "/api/storage/migrate-local",
    "/api/communications/email",
    "/api/offers/send",
    "/api/customs/messages",
    "/api/telematics/live",
  ],
};
