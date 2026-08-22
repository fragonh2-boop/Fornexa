import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextRequest, NextResponse } from "next/server";
import { isValidReviewToken, REVIEW_COOKIE } from "@/lib/auth-context";
import { safeInternalPath } from "@/lib/auth-flow";
import { shouldClearDeadSession, supabaseAuthCookieNames } from "@/lib/auth-session";

type CookieToSet = {
  name: string;
  value: string;
  options?: CookieOptions;
};

type ActiveMembership = { tenant_id: string; role: string };

const protectedApiPaths = [
  "/api/cmr",
  "/api/orders",
  "/api/expeditions",
  "/api/trips",
  "/api/storage/health",
  "/api/storage/migrate-local",
  "/api/communications/email",
  "/api/offers/send",
  "/api/customs/messages",
  "/api/telematics/live",
];

const protectedApiPrefixes = ["/api/trips/"];

function isProtectedApi(pathname: string) {
  return protectedApiPaths.some(path => pathname === path)
    || protectedApiPrefixes.some(prefix => pathname.startsWith(prefix));
}

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

  if (isSharedCmrApi(pathname)) {
    return noStore(NextResponse.next({ request }));
  }

  // Compatibility fallback for providers that return a PKCE auth code to the site
  // root. Preserve every parameter required to complete that exact PKCE flow. In
  // particular, Supabase may include sb_flow_id and exchangeCodeForSession must see
  // the same flow id instead of silently falling back to another pending verifier.
  if (pathname === "/" && searchParams.has("code")) {
    const code = searchParams.get("code");
    const flowId = searchParams.get("sb_flow_id");
    const flow = request.cookies.get("fornexa_auth_flow")?.value;
    const callback = new URL("/auth/callback", origin);
    callback.searchParams.set("code", code ?? "");
    if (flowId) callback.searchParams.set("sb_flow_id", flowId);
    callback.searchParams.set("next", flow === "first-access" ? "/reset-password?firstAccess=1" : "/reset-password");

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

  const { data: { user }, error: userError } = await supabase.auth.getUser();
  const userId = !userError && user?.id ? user.id : null;
  const authCookieNames = supabaseAuthCookieNames(request.cookies.getAll(), url);

  if (shouldClearDeadSession(authCookieNames.length > 0, userId, userError)) {
    const { error: signOutError } = await supabase.auth.signOut({ scope: "local" });

    // The SDK normally removes both the base cookie and all of its chunks. If
    // Auth is unreachable, expire only the exact cookies received for this
    // Supabase project so a dead session cannot survive the recovery redirect.
    if (signOutError) {
      authCookieNames.forEach(name => {
        request.cookies.set(name, "");
        response.cookies.set(name, "", {
          path: "/",
          maxAge: 0,
          sameSite: "lax",
          secure: true,
        });
      });
    }
  }

  if (isProtectedApi(pathname) && !userId) {
    const unauthorized = NextResponse.json({ error: "No autorizado." }, { status: 401 });
    response.cookies.getAll().forEach(cookie => unauthorized.cookies.set(cookie));
    return noStore(unauthorized);
  }

  if ((pathname.startsWith("/dashboard") || pathname === "/onboarding" || pathname === "/reset-password") && !userId) {
    const redirectResponse = NextResponse.redirect(loginRedirect(request, origin));
    response.cookies.getAll().forEach(cookie => redirectResponse.cookies.set(cookie));
    return noStore(redirectResponse);
  }

  const membershipRequired = pathname.startsWith("/dashboard") || pathname === "/onboarding" || pathname === "/login" || pathname === "/api/storage/migrate-local";
  let membership: ActiveMembership | null = null;
  if (userId && membershipRequired) {
    const { data: memberships, error } = await supabase
      .from("tenant_members")
      .select("tenant_id,role")
      .eq("user_id", userId)
      .eq("status", "ACTIVE")
      .limit(2);
    if (!error && memberships?.length === 1 && memberships[0]?.tenant_id && memberships[0]?.role) {
      membership = memberships[0] as ActiveMembership;
    }
  }

  if (userId && (pathname.startsWith("/dashboard") || pathname === "/onboarding") && !membership) {
    const denied = NextResponse.redirect(new URL("/access-denied", origin));
    response.cookies.getAll().forEach(cookie => denied.cookies.set(cookie));
    return noStore(denied);
  }

  if (pathname === "/api/storage/migrate-local" && userId) {
    if (membership?.role !== "OWNER" && membership?.role !== "ADMIN") {
      const forbidden = NextResponse.json({ error: "Permisos insuficientes." }, { status: 403 });
      response.cookies.getAll().forEach(cookie => forbidden.cookies.set(cookie));
      return noStore(forbidden);
    }
  }

  if (pathname === "/login" && userId) {
    if (!membership) {
      const denied = NextResponse.redirect(new URL("/access-denied", origin));
      response.cookies.getAll().forEach(cookie => denied.cookies.set(cookie));
      return noStore(denied);
    }
    const safeNext = safeInternalPath(searchParams.get("next"), "/dashboard");
    const redirectResponse = NextResponse.redirect(new URL(safeNext, origin));
    response.cookies.getAll().forEach(cookie => redirectResponse.cookies.set(cookie));
    return noStore(redirectResponse);
  }

  const authSensitive = Boolean(userId) || isProtectedApi(pathname) || pathname === "/login" || pathname === "/onboarding" || pathname === "/reset-password" || pathname.startsWith("/dashboard");
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
    "/api/orders",
    "/api/expeditions",
    "/api/trips",
    "/api/trips/:path*",
    "/api/storage/health",
    "/api/storage/migrate-local",
    "/api/communications/email",
    "/api/offers/send",
    "/api/customs/messages",
    "/api/telematics/live",
  ],
};
