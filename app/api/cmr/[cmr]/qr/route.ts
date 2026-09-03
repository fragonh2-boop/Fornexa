import { cookies } from "next/headers";
import QRCode from "qrcode";
import { getAuthenticatedContext } from "@/lib/auth-context";
import {
  cmrViewSessionCookie,
  documentForAccessKey,
  documentForViewSession,
} from "@/lib/cmr-access";
import { createSupabaseAdmin } from "@/lib/supabase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const noStore = { "Cache-Control": "private, no-cache, no-store, max-age=0, must-revalidate" };
const genericUnauthorized = () => new Response("CMR Key, sesión o acceso interno no válido.", { status: 401, headers: noStore });

export async function GET(request: Request, context: { params: Promise<{ cmr: string }> }) {
  const { cmr } = await context.params;
  const cmrNumber = decodeURIComponent(cmr).toUpperCase();
  const url = new URL(request.url);
  const queryKey = url.searchParams.get("key") ?? "";
  const store = await cookies();
  const sessionToken = store.get(cmrViewSessionCookie(cmrNumber))?.value;
  let data = queryKey
    ? await documentForAccessKey(queryKey)
    : await documentForViewSession(sessionToken, cmrNumber);

  // Preserve the public capability/view-session path as the primary authorization mechanism.
  // A valid capability for another CMR must never fall through to internal tenant auth.
  if (data && data.cmr_number !== cmrNumber) {
    return new Response("La capability no pertenece al CMR.", { status: 403, headers: noStore });
  }

  // Internal dashboard fallback mirrors the CMR detail endpoint: normal authenticated
  // tenant context only. REVIEW context is intentionally excluded.
  if (!data) {
    const authenticated = await getAuthenticatedContext();
    if (!authenticated) return genericUnauthorized();

    const admin = createSupabaseAdmin();
    const { data: tenantDocument, error: tenantDocumentError } = await admin
      .from("cmr_documents")
      .select("cmr_number,tenant_id,access_key")
      .eq("cmr_number", cmrNumber)
      .eq("tenant_id", authenticated.tenantId)
      .maybeSingle();

    if (tenantDocumentError) throw tenantDocumentError;
    if (!tenantDocument?.access_key) return genericUnauthorized();
    data = tenantDocument;
  }

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
