import { cookies } from "next/headers";
import QRCode from "qrcode";
import {
  CMR_VIEW_SESSION_COOKIE,
  documentForAccessKey,
  documentForViewSession,
} from "@/lib/cmr-access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const noStore = { "Cache-Control": "private, no-cache, no-store, max-age=0, must-revalidate" };

export async function GET(request: Request, context: { params: Promise<{ cmr: string }> }) {
  const { cmr } = await context.params;
  const cmrNumber = decodeURIComponent(cmr).toUpperCase();
  const url = new URL(request.url);
  const queryKey = url.searchParams.get("key") ?? "";
  const store = await cookies();
  const sessionToken = store.get(CMR_VIEW_SESSION_COOKIE)?.value;
  const data = queryKey
    ? await documentForAccessKey(queryKey)
    : await documentForViewSession(sessionToken, cmrNumber);

  if (!data) return new Response("CMR Key o sesión no válida.", { status: 401, headers: noStore });
  if (data.cmr_number !== cmrNumber) return new Response("La capability no pertenece al CMR.", { status: 403, headers: noStore });

  const origin = url.origin;
  const payload = `${origin}/api/mobile/cmr/${encodeURIComponent(data.access_key)}`;
  const svg = await QRCode.toString(payload, {
    type: "svg",
    errorCorrectionLevel: "H",
    margin: 2,
    color: { dark: "#101216", light: "#ffffff" },
  });

  return new Response(svg, {
    headers: {
      "Content-Type": "image/svg+xml; charset=utf-8",
      ...noStore,
      "Content-Disposition": `inline; filename="${cmrNumber}-qr.svg"`,
    },
  });
}
