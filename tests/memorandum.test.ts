import assert from "node:assert/strict";
import test from "node:test";
import {
  memorandumCommitCoverage,
  memorandumPending,
  memorandumReleases,
  memorandumUpdatedAt,
} from "../lib/memorandum.ts";

const monthNumbers: Record<string, number> = {
  ene: 0,
  feb: 1,
  mar: 2,
  abr: 3,
  may: 4,
  jun: 5,
  jul: 6,
  ago: 7,
  sep: 8,
  oct: 9,
  nov: 10,
  dic: 11,
};

function memorandumDateMs(value: string) {
  const match = /^(\d{1,2}) ([a-z]{3}) (\d{4})$/.exec(value);
  if (!match) return Number.NaN;
  const month = monthNumbers[match[2]];
  if (month == null) return Number.NaN;
  return Date.UTC(Number(match[3]), month, Number(match[1]));
}

test("public memorandum covers the complete product history by milestones", () => {
  assert.ok(memorandumCommitCoverage >= 517);
  assert.ok(memorandumReleases.length >= 15);

  const updatedAt = memorandumDateMs(memorandumUpdatedAt);
  const latestRelease = memorandumDateMs(memorandumReleases.at(0)?.date ?? "");
  assert.ok(Number.isFinite(updatedAt));
  assert.ok(Number.isFinite(latestRelease));
  assert.ok(updatedAt >= latestRelease);

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
