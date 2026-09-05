import QRCode from "qrcode";
import { getAuthenticatedContext } from "@/lib/auth-context";
import {
  generateRegulatoryPublicToken,
  regulatoryPublicUrl,
  sha256Hex,
} from "@/lib/regulatory-documents";
import { createSupabaseAdmin } from "@/lib/supabase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const noStore = { "Cache-Control": "private, no-cache, no-store, max-age=0, must-revalidate" };
const issuerRoles = new Set(["OWNER", "ADMIN"]);

function errorResponse(message: string, status: number) {
  return Response.json({ error: message }, { status, headers: noStore });
}

function parseIso(value: unknown) {
  if (typeof value !== "string" || !value.trim()) return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
}

export async function POST(request: Request, context: { params: Promise<{ artifact: string }> }) {
  const authenticated = await getAuthenticatedContext();
  if (!authenticated) return errorResponse("Acceso interno no válido.", 401);
  if (!issuerRoles.has(authenticated.role.toUpperCase())) return errorResponse("Permisos insuficientes.", 403);

  const { artifact: artifactId } = await context.params;
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return errorResponse("JSON no válido.", 400);
  }

  const body = (payload ?? {}) as Record<string, unknown>;
  const publicUntil = parseIso(body.public_until);
  const serviceCompletedAt = body.service_completed_at == null ? null : parseIso(body.service_completed_at);
  if (!publicUntil) return errorResponse("public_until es obligatorio y debe ser una fecha ISO válida.", 400);
  if (body.service_completed_at != null && !serviceCompletedAt) {
    return errorResponse("service_completed_at no es válido.", 400);
  }

  const now = Date.now();
  if (Date.parse(publicUntil) <= now) return errorResponse("public_until debe estar en el futuro.", 400);
  if (serviceCompletedAt) {
    const completion = Date.parse(serviceCompletedAt);
    const sevenDays = 7 * 24 * 60 * 60 * 1000;
    if (Date.parse(publicUntil) > completion + sevenDays) {
      return errorResponse("public_until no puede superar siete días desde la finalización del servicio.", 400);
    }
  }

  const admin = createSupabaseAdmin();
  const { data: artifact, error: artifactError } = await admin
    .from("regulatory_document_artifacts")
    .select("id,tenant_id,document_kind,regulatory_scope,version")
    .eq("id", artifactId)
    .eq("tenant_id", authenticated.tenantId)
    .eq("document_kind", "deca")
    .eq("regulatory_scope", "deca_es")
    .maybeSingle();

  if (artifactError) throw artifactError;
  if (!artifact) return errorResponse("Artefacto no disponible.", 404);

  const rawToken = generateRegulatoryPublicToken();
  const tokenHash = sha256Hex(rawToken);
  const validFrom = new Date().toISOString();

  const { data: access, error: accessError } = await admin
    .from("regulatory_document_access_tokens")
    .insert({
      tenant_id: authenticated.tenantId,
      artifact_id: artifact.id,
      token_hash: tokenHash,
      valid_from: validFrom,
      service_completed_at: serviceCompletedAt,
      public_until: publicUntil,
    })
    .select("id,artifact_id,valid_from,service_completed_at,public_until")
    .single();

  if (accessError) throw accessError;

  const origin = new URL(request.url).origin;
  const url = regulatoryPublicUrl(origin, rawToken);
  const qrSvg = await QRCode.toString(url, {
    type: "svg",
    errorCorrectionLevel: "H",
    margin: 2,
    color: { dark: "#101216", light: "#ffffff" },
  });

  return Response.json(
    {
      access,
      public_url: url,
      qr_svg: qrSvg,
      token: rawToken,
      token_notice: "El token se muestra una sola vez; FORNEXA solo persiste su SHA-256.",
    },
    { status: 201, headers: noStore },
  );
}
