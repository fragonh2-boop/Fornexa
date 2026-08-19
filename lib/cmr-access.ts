import { randomBytes } from "node:crypto";
import { createSupabaseAdmin, normalizeAccessKey } from "./supabase-admin";

export function createCmrKey() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = randomBytes(12);
  const raw = Array.from(bytes, byte => alphabet[byte % alphabet.length]).join("");
  return `${raw.slice(0, 4)}-${raw.slice(4, 8)}-${raw.slice(8, 12)}`;
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
  if (!data || data.access_key_revoked_at) return null;

  if (data.access_key_expires_at) {
    const expiresAt = Date.parse(data.access_key_expires_at);
    if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) return null;
  }

  return data;
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
