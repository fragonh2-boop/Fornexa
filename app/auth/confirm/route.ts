import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import {
  isSafeTokenHash,
  parseAuthEmailFlow,
  RECOVERY_TOKEN_COOKIE,
  recoveryVerificationPath,
  resetPasswordPath,
} from "@/lib/auth-flow";

type CookieToSet = { name: string; value: string; options?: CookieOptions };

function noStore<T extends NextResponse>(response: T) {
  response.headers.set("Cache-Control", "private, no-cache, no-store, max-age=0, must-revalidate");
  response.headers.set("Pragma", "no-cache");
  response.headers.set("Expires", "0");
  response.headers.set("Referrer-Policy", "no-referrer");
  return response;
}

function clearRecoveryToken(response: NextResponse, secure: boolean) {
  response.cookies.set(RECOVERY_TOKEN_COOKIE, "", {
    httpOnly: true,
    secure,
    sameSite: "strict",
    path: "/auth",
    maxAge: 0,
  });
  return response;
}

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const tokenHash = requestUrl.searchParams.get("token_hash");
  const type = requestUrl.searchParams.get("type");
  const flow = parseAuthEmailFlow(requestUrl.searchParams.get("flow"));

  if (!isSafeTokenHash(tokenHash) || type !== "recovery") {
    return noStore(NextResponse.redirect(new URL("/login?error=invalid_link", requestUrl.origin)));
  }

  // Do not consume the one-time token on GET. Corporate email scanners commonly
  // follow links automatically; verification happens only after the user submits
  // the explicit confirmation form on /auth/verify.
  const response = noStore(NextResponse.redirect(new URL(recoveryVerificationPath(flow), requestUrl.origin)));
  response.cookies.set(RECOVERY_TOKEN_COOKIE, tokenHash, {
    httpOnly: true,
    secure: requestUrl.protocol === "https:",
    sameSite: "strict",
    path: "/auth",
    maxAge: 10 * 60,
  });
  return response;
}

export async function POST(request: Request) {
  const requestUrl = new URL(request.url);
  const secureCookie = requestUrl.protocol === "https:";
  let flow = parseAuthEmailFlow(null);
  try {
    const formData = await request.formData();
    flow = parseAuthEmailFlow(formData.get("flow"));
  } catch {
    return noStore(clearRecoveryToken(NextResponse.redirect(new URL("/login?error=invalid_link", requestUrl.origin), 303), secureCookie));
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    return noStore(clearRecoveryToken(NextResponse.redirect(new URL("/login?error=auth_configuration", requestUrl.origin), 303), secureCookie));
  }

  const cookieStore = await cookies();
  const tokenHash = cookieStore.get(RECOVERY_TOKEN_COOKIE)?.value;
  if (!tokenHash) {
    return noStore(clearRecoveryToken(NextResponse.redirect(new URL("/login?error=invalid_link", requestUrl.origin), 303), secureCookie));
  }

  const response = noStore(NextResponse.redirect(new URL(resetPasswordPath(flow), requestUrl.origin), 303));
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
    return noStore(clearRecoveryToken(NextResponse.redirect(new URL("/login?error=invalid_link", requestUrl.origin), 303), secureCookie));
  }

  return clearRecoveryToken(response, secureCookie);
}
