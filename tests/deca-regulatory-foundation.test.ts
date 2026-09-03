import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath = path.join(
  process.cwd(),
  "supabase/migrations/20260903062500_deca_regulatory_document_foundation.sql",
);
const sql = fs.readFileSync(migrationPath, "utf8");

describe("DeCA regulatory document foundation", () => {
  it("adds controlled document kind and regulatory scope without breaking legacy CMR rows", () => {
    expect(sql).toContain("add column if not exists document_kind text not null default 'cmr'");
    expect(sql).toContain("'cmr', 'deca', 'ecmr', 'pod'");
    expect(sql).toContain("'deca_es', 'cmr_convention', 'ecmr_protocol', 'efti'");
    expect(sql).toContain("document_kind not in ('deca', 'ecmr')");
    expect(sql).toContain("or regulatory_scope is not null");
  });

  it("separates immutable regulatory artifacts from temporary public access tokens", () => {
    expect(sql).toContain("create table if not exists public.regulatory_document_artifacts");
    expect(sql).toContain("create table if not exists public.regulatory_document_access_tokens");
    expect(sql).toContain("supersedes_artifact_id uuid references public.regulatory_document_artifacts(id) on delete restrict");
    expect(sql).toContain("token_hash text not null unique");
    expect(sql).not.toContain("raw_token");
  });

  it("enforces native PDF evidence limits and document timestamps", () => {
    expect(sql).toContain("check (mime_type = 'application/pdf')");
    expect(sql).toContain("byte_size > 0 and byte_size <= 5242880");
    expect(sql).toContain("document_created_at timestamptz not null");
    expect(sql).toContain("document_modified_at timestamptz not null");
    expect(sql).toContain("check (document_modified_at >= document_created_at)");
  });

  it("keeps issued artifacts append-versioned and the token registry server-only", () => {
    expect(sql).toContain("grant select, insert on table public.regulatory_document_artifacts to service_role");
    expect(sql).not.toContain("grant select, insert, update on table public.regulatory_document_artifacts to service_role");
    expect(sql).toContain("grant select, insert, update on table public.regulatory_document_access_tokens to service_role");
    expect(sql).toContain("grant select on table public.regulatory_document_artifacts to authenticated");
    expect(sql).not.toContain("grant select on table public.regulatory_document_access_tokens to authenticated");
  });

  it("caps public URL lifetime at seven days after service completion when both dates are known", () => {
    expect(sql).toContain("public_until <= service_completed_at + interval '7 days'");
  });
});
