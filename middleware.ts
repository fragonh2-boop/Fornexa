import { NextRequest, NextResponse } from "next/server";

export function middleware(request: NextRequest) {
  const { pathname, searchParams, origin } = request.nextUrl;

  if (pathname === "/" && searchParams.has("code")) {
    const code = searchParams.get("code");
    const callback = new URL("/auth/callback", origin);
    callback.searchParams.set("code", code ?? "");
    callback.searchParams.set("next", "/reset-password?firstAccess=1");
    return NextResponse.redirect(callback);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/"],
};
