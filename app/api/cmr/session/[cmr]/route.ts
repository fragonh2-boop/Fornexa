import { NextResponse } from "next/server";
import {
  CMR_VIEW_SESSION_MAX_AGE,
  cmrViewSessionCookie,
  createCmrViewSession,
  documentForAccessKey,
} from "@/lib/cmr-access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const noStore = {
  "Cache-Control": "private, no-cache, no-store, max-age=0, must-revalidate",
  "Pragma": "no-cache",
  "Expires": "0",
  "Referrer-Policy": "no-referrer",
};

export async function GET(request: Request, context: { params: Promise<{ cmr: string }> }) {
  const { cmr } = await context.params;
  const cmrNumber = decodeURIComponent(cmr).toUpperCase();
  const url = new URL(request.url);
  const key = url.searchParams.get("key") ?? "";
  const document = await documentForAccessKey(key);

  if (!document || document.cmr_number !== cmrNumber) {
    return new Response("CMR no disponible", { status: 404, headers: noStore });
  }

  const token = await createCmrViewSession(String(document.id));
  const target = new URL(`/cmr/${encodeURIComponent(cmrNumber)}`, url.origin);
  const response = NextResponse.redirect(target, 303);
  response.cookies.set(cmrViewSessionCookie(cmrNumber), token, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: CMR_VIEW_SESSION_MAX_AGE,
  });
  Object.entries(noStore).forEach(([name, value]) => response.headers.set(name, value));
  return response;
}
