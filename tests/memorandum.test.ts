import assert from "node:assert/strict";
import test from "node:test";
import {
  memorandumCommitCoverage,
  memorandumPending,
  memorandumReleases,
} from "../lib/memorandum.ts";

test("public memorandum covers the complete product history by milestones", () => {
  assert.ok(memorandumCommitCoverage >= 517);
  assert.ok(memorandumReleases.length >= 15);
  assert.equal(memorandumReleases.at(0)?.date, "27 ago 2026");
  assert.equal(memorandumReleases.at(-1)?.date, "27 jul 2026");
  assert.ok(memorandumReleases.some((release) => release.surface.includes("Mobile")));
  assert.ok(memorandumReleases.some((release) => release.status === "Producción"));
});

test("tenant autonomy remains a concise functional pending decision", () => {
  const tenantPending = memorandumPending.find((item) => item.title === "Autonomía de tenants");
  assert.equal(tenantPending?.area, "Funcional");
  assert.equal(tenantPending?.state, "Por definir");
  assert.match(tenantPending?.summary ?? "", /OWNER y ADMIN/);
});

test("public memorandum data excludes implementation identifiers", () => {
  const publicCopy = JSON.stringify({ memorandumPending, memorandumReleases });
  assert.doesNotMatch(publicCopy, /service_role|SUPABASE_|RESEND_|dpl_|prj_|tenant_[a-f0-9-]{20,}/i);
});
