import { createHash, randomBytes } from "node:crypto";
import { createSupabaseAdmin, normalizeAccessKey } from "./supabase-admin";

export const CMR_VIEW_SESSION_COOKIE = "fornexa_cmr_session";
export const CMR_VIEW_SESSION_MAX_AGE = 60 * 60 * 36;

export function createCmrKey() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = randomBytes(12);
  const raw = Array.from(bytes, byte => alphabet[byte % alphabet.length]).join("");
  return `${raw.slice(0, 4)}-${raw.slice(4, 8)}-${raw.slice(8, 12)}`;
}

function sessionHash(value: string) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function accessKeyIsActive(document: Record<string, any> | null) {
  if (!document || document.access_key_revoked_at) return false;
  if (document.access_key_expires_at) {
    const expiresAt = Date.parse(document.access_key_expires_at);
    if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) return false;
  }
  return true;
}

export async function documentForAccessKey(value: string) {
  const accessKey = normalizeAccessKey(value);
  if (!/^[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/.test(accessKey)) return null;

  const supabase = createSupabaseAdmin();
  const { data, error } = await supabase
    .from("cmr_documents")
    .select("*")
    .eq("access_key", accessKey)
    .maybeSingle();

  if (error) throw error;
  return accessKeyIsActive(data) ? data : null;
}

export async function createCmrViewSession(cmrId: string) {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + CMR_VIEW_SESSION_MAX_AGE * 1000).toISOString();
  const supabase = createSupabaseAdmin();
  const { error } = await supabase.from("cmr_view_sessions").insert({
    token_hash: sessionHash(token),
    cmr_id: cmrId,
    expires_at: expiresAt,
  });
  if (error) throw error;
  return token;
}

export async function documentForViewSession(token: string | null | undefined, cmrNumber: string) {
  if (!token || token.length < 32) return null;
  const supabase = createSupabaseAdmin();
  const { data: session, error: sessionError } = await supabase
    .from("cmr_view_sessions")
    .select("cmr_id,expires_at,revoked_at")
    .eq("token_hash", sessionHash(token))
    .maybeSingle();
  if (sessionError) throw sessionError;
  if (!session || session.revoked_at || Date.parse(session.expires_at) <= Date.now()) return null;

  const { data: document, error: documentError } = await supabase
    .from("cmr_documents")
    .select("*")
    .eq("id", session.cmr_id)
    .eq("cmr_number", cmrNumber)
    .maybeSingle();
  if (documentError) throw documentError;
  return accessKeyIsActive(document) ? document : null;
}

export function publicDocument(document: Record<string, unknown>) {
  const {
    access_key: _accessKey,
    access_key_expires_at: _accessKeyExpiresAt,
    access_key_revoked_at: _accessKeyRevokedAt,
    tenant_id: _tenantId,
    ...safeDocument
  } = document;
  void _accessKey;
  void _accessKeyExpiresAt;
  void _accessKeyRevokedAt;
  void _tenantId;
  return safeDocument;
}
