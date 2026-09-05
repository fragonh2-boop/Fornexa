import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const helper = readFileSync("lib/regulatory-documents.ts", "utf8");
const telemetry = readFileSync("lib/platform-telemetry.ts", "utf8");
const artifactRoute = readFileSync("app/api/regulatory/cmr/[cmr]/artifact/route.ts", "utf8");
const accessRoute = readFileSync("app/api/regulatory/artifacts/[artifact]/access/route.ts", "utf8");
const publicRoute = readFileSync("app/regulatory/d/[token]/route.ts", "utf8");
const migration = readFileSync("supabase/migrations/20260905054500_deca_regulatory_storage.sql", "utf8");

test("DeCA Storage is private, PDF-only and capped at 5 MB", () => {
  assert.match(migration, /'regulatory-documents'/);
  assert.match(migration, /false,/);
  assert.match(migration, /5242880/);
  assert.match(migration, /application\/pdf/);
});

test("artifact intake uses normal authenticated tenant context and excludes REVIEW fallback", () => {
  assert.match(artifactRoute, /getAuthenticatedContext/);
  assert.doesNotMatch(artifactRoute, /getAuthenticatedOrReviewContext/);
  assert.match(artifactRoute, /new Set\(\["OWNER", "ADMIN"\]\)/);
  assert.match(artifactRoute, /\.eq\("tenant_id", authenticated\.tenantId\)/);
  assert.match(artifactRoute, /upsert: false/);
  assert.match(artifactRoute, /supersedes_artifact_id/);
  assert.match(artifactRoute, /public_access: null/);
});

test("concurrent artifact issuance uses isolated objects and cleans up losing versions", () => {
  assert.match(helper, /generateRegulatoryObjectNonce/);
  assert.match(helper, /v\$\{input\.version\}-\$\{input\.objectNonce\}\.pdf/);
  assert.match(artifactRoute, /generateRegulatoryObjectNonce\(\)/);
  assert.match(artifactRoute, /remove\(\[storagePath\]\)/);
  assert.match(artifactRoute, /artifactError\.code === "23505"/);
  assert.match(artifactRoute, /409/);
});

test("public access requires an explicit future public_until and stores only token hash", () => {
  assert.match(accessRoute, /public_until es obligatorio/);
  assert.match(accessRoute, /public_until debe estar en el futuro/);
  assert.match(accessRoute, /sha256Hex\(rawToken\)/);
  assert.match(accessRoute, /token_hash: tokenHash/);
  assert.doesNotMatch(accessRoute, /token_hash: rawToken/);
  assert.match(accessRoute, /siete días desde la finalización del servicio/);
});

test("public resolver is fail-closed and integrity checks the private PDF", () => {
  assert.match(helper, /if \(row\.deactivated_at \|\| !row\.public_until\) return false/);
  assert.match(helper, /publicUntil <= now/);
  assert.match(publicRoute, /Documento no disponible/);
  assert.match(publicRoute, /bytes\.byteLength !== Number\(artifact\.byte_size\)/);
  assert.match(publicRoute, /sha256Hex\(bytes\)/);
  assert.match(publicRoute, /Content-Disposition.*attachment/);
  assert.match(publicRoute, /Referrer-Policy.*no-referrer/);
  assert.doesNotMatch(publicRoute, /createSignedUrl|getPublicUrl/);
});

test("opaque public tokens are generated server-side and raw token is never looked up", () => {
  assert.match(helper, /randomBytes\(REGULATORY_PUBLIC_TOKEN_BYTES\)\.toString\("base64url"\)/);
  assert.match(helper, /const tokenHash = sha256Hex\(token\)/);
  assert.match(helper, /\.eq\("token_hash", tokenHash\)/);
  assert.doesNotMatch(helper, /\.eq\("token_hash", token\)/);
});

test("TLM-1 never persists regulatory bearer capabilities in path or referrer", () => {
  assert.match(telemetry, /\/regulatory\/d\/\[token\]/);
  assert.match(telemetry, /normalizeTelemetryReferrer/);
  assert.match(telemetry, /referrer: normalizeTelemetryReferrer/);
  assert.doesNotMatch(telemetry, /referrer: request\.headers\.get\("referer"\)\?\.split/);
});
