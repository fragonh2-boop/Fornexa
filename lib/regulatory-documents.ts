import { createHash, randomBytes } from "node:crypto";
import { createSupabaseAdmin } from "@/lib/supabase-admin";

export const REGULATORY_DOCUMENT_BUCKET = "regulatory-documents";
export const REGULATORY_PDF_MAX_BYTES = 5 * 1024 * 1024;
export const REGULATORY_PUBLIC_TOKEN_BYTES = 32;

const regulatoryTokenPattern = /^[A-Za-z0-9_-]{43}$/;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const objectNoncePattern = /^[a-f0-9]{24}$/;

export type RegulatoryAccessRow = {
  artifact_id: string;
  valid_from: string;
  service_completed_at: string | null;
  public_until: string | null;
  deactivated_at: string | null;
};

export function sha256Hex(value: Uint8Array | string) {
  return createHash("sha256").update(value).digest("hex");
}

export function generateRegulatoryPublicToken() {
  return randomBytes(REGULATORY_PUBLIC_TOKEN_BYTES).toString("base64url");
}

export function generateRegulatoryObjectNonce() {
  return randomBytes(12).toString("hex");
}

export function normalizeRegulatoryPublicToken(value: string) {
  const token = value.trim();
  return regulatoryTokenPattern.test(token) ? token : null;
}

export function regulatoryArtifactStoragePath(input: {
  tenantId: string;
  cmrId: string;
  documentKind: "deca";
  regulatoryScope: "deca_es";
  version: number;
  objectNonce: string;
}) {
  if (!uuidPattern.test(input.tenantId) || !uuidPattern.test(input.cmrId)) {
    throw new Error("Identificador regulatorio no válido.");
  }
  if (!Number.isInteger(input.version) || input.version < 1) {
    throw new Error("Versión regulatoria no válida.");
  }
  if (!objectNoncePattern.test(input.objectNonce)) {
    throw new Error("Identificador de objeto regulatorio no válido.");
  }

  return `${input.tenantId}/${input.cmrId}/${input.documentKind}/${input.regulatoryScope}/v${input.version}-${input.objectNonce}.pdf`;
}

export function regulatoryAccessIsUsable(row: RegulatoryAccessRow, now = Date.now()) {
  if (row.deactivated_at || !row.public_until) return false;

  const validFrom = Date.parse(row.valid_from);
  const publicUntil = Date.parse(row.public_until);
  if (!Number.isFinite(validFrom) || !Number.isFinite(publicUntil)) return false;
  if (validFrom > now || publicUntil <= now) return false;

  if (row.service_completed_at) {
    const completedAt = Date.parse(row.service_completed_at);
    if (!Number.isFinite(completedAt)) return false;
    const sevenDays = 7 * 24 * 60 * 60 * 1000;
    if (publicUntil > completedAt + sevenDays) return false;
  }

  return true;
}

export function regulatoryPublicUrl(origin: string, token: string) {
  const normalized = normalizeRegulatoryPublicToken(token);
  if (!normalized) throw new Error("Token regulatorio no válido.");
  return `${origin.replace(/\/$/, "")}/regulatory/d/${encodeURIComponent(normalized)}`;
}

export async function resolveRegulatoryPublicArtifact(rawToken: string) {
  const token = normalizeRegulatoryPublicToken(rawToken);
  if (!token) return null;

  const admin = createSupabaseAdmin();
  const tokenHash = sha256Hex(token);
  const { data: access, error: accessError } = await admin
    .from("regulatory_document_access_tokens")
    .select("artifact_id,tenant_id,valid_from,service_completed_at,public_until,deactivated_at")
    .eq("token_hash", tokenHash)
    .maybeSingle();

  if (accessError) throw accessError;
  if (!access || !regulatoryAccessIsUsable(access)) return null;

  const { data: artifact, error: artifactError } = await admin
    .from("regulatory_document_artifacts")
    .select("id,tenant_id,cmr_id,document_kind,regulatory_scope,version,mime_type,storage_path,sha256,byte_size")
    .eq("id", access.artifact_id)
    .eq("tenant_id", access.tenant_id)
    .maybeSingle();

  if (artifactError) throw artifactError;
  if (!artifact || artifact.mime_type !== "application/pdf") return null;

  return { admin, access, artifact };
}
