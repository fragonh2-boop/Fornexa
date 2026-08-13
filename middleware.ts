import { NextRequest, NextResponse } from "next/server";

export function middleware(request: NextRequest) {
  const { pathname, searchParams, origin } = request.nextUrl;

  if (pathname === "/" && searchParams.has("code")) {
    const code = searchParams.get("code");
    const flow = request.cookies.get("fornexa_auth_flow")?.value;
    const callback = new URL("/auth/callback", origin);

    callback.searchParams.set("code", code ?? "");
    callback.searchParams.set(
      "next",
      flow === "recover" ? "/reset-password" : "/reset-password?firstAccess=1"
    );

    const response = NextResponse.redirect(callback);
    response.cookies.set("fornexa_auth_flow", "", {
      path: "/",
      maxAge: 0,
      sameSite: "lax",
      secure: true,
    });
    return response;
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/"],
};
