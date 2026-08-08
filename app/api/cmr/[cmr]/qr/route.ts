import QRCode from "qrcode";
import { documentForAccessKey } from "@/lib/cmr-access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ cmr: string }> }) {
  const { cmr } = await context.params;
  const cmrNumber = decodeURIComponent(cmr).toUpperCase();
  const url = new URL(request.url);
  const data = await documentForAccessKey(url.searchParams.get("key") ?? "");
  if (!data) return new Response("CMR Key no válida.", { status: 401 });
  if (data.cmr_number !== cmrNumber) return new Response("La clave no pertenece al CMR.", { status: 403 });

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
      "Cache-Control": "private, max-age=300",
      "Content-Disposition": `inline; filename="${cmrNumber}-qr.svg"`,
    },
  });
}
