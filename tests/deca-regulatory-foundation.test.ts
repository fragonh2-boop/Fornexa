import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";

const migrationPath = path.join(
  process.cwd(),
  "supabase/migrations/20260903062500_deca_regulatory_document_foundation.sql",
);
const sql = fs.readFileSync(migrationPath, "utf8");

describe("DeCA regulatory document foundation", () => {
  it("adds controlled document kind and regulatory scope without breaking legacy CMR rows", () => {
    assert.ok(sql.includes("add column if not exists document_kind text not null default 'cmr'"));
    assert.ok(sql.includes("'cmr', 'deca', 'ecmr', 'pod'"));
    assert.ok(sql.includes("'deca_es', 'cmr_convention', 'ecmr_protocol', 'efti'"));
    assert.ok(sql.includes("document_kind not in ('deca', 'ecmr')"));
    assert.ok(sql.includes("or regulatory_scope is not null"));
  });

  it("separates immutable regulatory artifacts from temporary public access tokens", () => {
    assert.ok(sql.includes("create table if not exists public.regulatory_document_artifacts"));
    assert.ok(sql.includes("create table if not exists public.regulatory_document_access_tokens"));
    assert.ok(sql.includes("supersedes_artifact_id uuid references public.regulatory_document_artifacts(id) on delete restrict"));
    assert.ok(sql.includes("token_hash text not null unique"));
    assert.equal(sql.includes("raw_token"), false);
  });

  it("enforces native PDF evidence limits and document timestamps", () => {
    assert.ok(sql.includes("check (mime_type = 'application/pdf')"));
    assert.ok(sql.includes("byte_size > 0 and byte_size <= 5242880"));
    assert.ok(sql.includes("document_created_at timestamptz not null"));
    assert.ok(sql.includes("document_modified_at timestamptz not null"));
    assert.ok(sql.includes("check (document_modified_at >= document_created_at)"));
  });

  it("keeps issued artifacts append-versioned and the token registry server-only", () => {
    assert.ok(sql.includes("grant select, insert on table public.regulatory_document_artifacts to service_role"));
    assert.equal(sql.includes("grant select, insert, update on table public.regulatory_document_artifacts to service_role"), false);
    assert.ok(sql.includes("grant select, insert, update on table public.regulatory_document_access_tokens to service_role"));
    assert.ok(sql.includes("grant select on table public.regulatory_document_artifacts to authenticated"));
    assert.equal(sql.includes("grant select on table public.regulatory_document_access_tokens to authenticated"), false);
  });

  it("caps public URL lifetime at seven days after service completion when both dates are known", () => {
    assert.ok(sql.includes("public_until <= service_completed_at + interval '7 days'"));
  });
});
