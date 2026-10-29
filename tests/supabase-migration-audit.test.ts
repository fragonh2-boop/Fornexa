import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";
import {
  digestSqlStatements,
  serializeSqlTokens,
  sha256,
  splitSqlStatements,
  tokenizeSql,
} from "../scripts/sql-provenance.ts";
import {
  buildMigrationAudit,
  EXPECTED_CUSTOMS_MESSAGES_TENANT_ID_DIGEST,
  EXPECTED_CUSTOMS_EVENTS_TENANT_ID_DIGEST,
} from "../scripts/generate-supabase-migration-audit.ts";

type AuditEntry = {
  git_path: string;
  git_name: string;
  remote_version: string;
  remote_name: string;
  match_resolution: "exact_name" | "manual_alias";
  remote_array_elements: number;
  remote_array_element_statement_counts: number[];
  remote_array_elementwise_equivalent: boolean | null;
  remote_payload_chars_total: number;
  remote_payload_utf8_bytes_total: number;
  remote_payload_base64_wrapped_chars_total: number;
  remote_payload_base64_unwrapped_chars_total: number;
  remote_payload_base64_lf_total: number;
  remote_payload_base64_elements_with_trailing_lf: number;
  remote_payload_base64_trailing_lf_ordinals: number[];
  git_statements: number;
  remote_statements: number;
  matched_statements: number;
  equivalent: boolean;
  git_statement_token_sha256: string[];
  remote_statement_token_sha256: string[];
  git_statement_digest_sequence_sha256: string;
  remote_statement_digest_sequence_sha256: string;
  remote_array_element_md5_postgres: string[];
  remote_array_element_md5_sequence_md5_postgres: string;
  remote_array_text_md5_postgres: string;
  remote_payload_base64_wrapped_sequence_md5_postgres: string;
  remote_payload_base64_unwrapped_sequence_md5_postgres: string;
  remote_payload_base64_unwrapped_sequence_sha256: string;
};

type Audit = {
  git_migration_baseline_commit: string;
  method: {
    base64_variant: string;
    base64_wrapping: string;
    postgres_element_md5_sequence_formula: string;
    postgres_base64_wrapped_sequence_formula: string;
    postgres_base64_unwrapped_sequence_formula: string;
    reproducible_from_artifact: Record<string, boolean>;
  };
  summary: {
    git_active_migrations: number;
    remote_migrations: number;
    remote_array_elements: number;
    remote_payload_chars_total: number;
    remote_payload_utf8_bytes_total: number;
    remote_payload_base64_wrapped_chars_total: number;
    remote_payload_base64_unwrapped_chars_total: number;
    remote_payload_base64_lf_total: number;
    remote_payload_base64_elements_with_trailing_lf: number;
    paired_migrations: number;
    exact_name_pairs: number;
    manual_alias_pairs: number;
    git_only: string[];
    remote_only: Array<{ version: string; name: string }>;
    all_pairs_equivalent: boolean;
  };
  migrations: AuditEntry[];
};

const auditPath = "docs/verification/supabase-migration-content-audit-20260912.json";
const auditText = readFileSync(auditPath, "utf8");
const audit = JSON.parse(auditText) as Audit;
const sha256Pattern = /^[0-9a-f]{64}$/;
const md5Pattern = /^[0-9a-f]{32}$/;

const statementCountAnchors = new Map<string, number>([
  ["customs_core", 8],
  ["mobile_cmr", 20],
  ["fornexa_operational_core", 83],
  ["review_access_token_registry", 7],
  ["harden_review_token_rpc", 7],
  ["mobile_trip_access", 6],
  ["shared_party_addresses", 11],
  ["shared_party_address_indexes", 1],
  ["tariff_engine_foundation", 72],
  ["platform_telemetry", 35],
  ["adr_classification_foundation", 57],
  ["deca_native_atomic_issuance", 7],
  ["add_cmr_access_key_lifecycle", 4],
]);

const multiElementAnchors = new Map([
  [
    "customs_core",
    {
      remote_array_elements: 8,
      remote_payload_chars_total: 1_800,
      remote_payload_utf8_bytes_total: 1_800,
      remote_payload_base64_wrapped_chars_total: 2_439,
      remote_payload_base64_unwrapped_chars_total: 2_412,
      remote_payload_base64_lf_total: 27,
      remote_payload_base64_elements_with_trailing_lf: 0,
      remote_payload_base64_trailing_lf_ordinals: [],
      remote_array_element_md5_sequence_md5_postgres:
        "d5cf692c851cb33ee2838cbce783339f",
      remote_payload_base64_wrapped_sequence_md5_postgres:
        "79bf19ffc73b2f1e2c2fd473511abbef",
      remote_payload_base64_unwrapped_sequence_md5_postgres:
        "41d6a4f8cd058a15441ad7fda51b311d",
    },
  ],
  [
    "mobile_cmr",
    {
      remote_array_elements: 20,
      remote_payload_chars_total: 4_476,
      remote_payload_utf8_bytes_total: 4_479,
      remote_payload_base64_wrapped_chars_total: 6_066,
      remote_payload_base64_unwrapped_chars_total: 5_996,
      remote_payload_base64_lf_total: 70,
      remote_payload_base64_elements_with_trailing_lf: 1,
      remote_payload_base64_trailing_lf_ordinals: [20],
      remote_array_element_md5_sequence_md5_postgres:
        "4c4c58dbf345e539d60ee67230058b63",
      remote_payload_base64_wrapped_sequence_md5_postgres:
        "75e5e7ac50c244f602f1762af1baa0bd",
      remote_payload_base64_unwrapped_sequence_md5_postgres:
        "86f33ac5145c08a05f5877740af5ab4a",
    },
  ],
  [
    "fornexa_operational_core",
    {
      remote_array_elements: 83,
      remote_payload_chars_total: 31_500,
      remote_payload_utf8_bytes_total: 31_506,
      remote_payload_base64_wrapped_chars_total: 42_647,
      remote_payload_base64_unwrapped_chars_total: 42_132,
      remote_payload_base64_lf_total: 515,
      remote_payload_base64_elements_with_trailing_lf: 2,
      remote_payload_base64_trailing_lf_ordinals: [53, 70],
      remote_array_element_md5_sequence_md5_postgres:
        "22cd966b388046dfba6e8039c2d78e2d",
      remote_payload_base64_wrapped_sequence_md5_postgres:
        "d0076aaf74436609c882bd3ff2fdce80",
      remote_payload_base64_unwrapped_sequence_md5_postgres:
        "46c746ec4e3ce2705473ee60430e55fd",
    },
  ],
]);

test("the versioned audit closes exactly 31 name pairs plus one explicit alias", () => {
  // Last migration-changing commit at capture, not current application HEAD.
  // Migration changes require reviewing/regenerating this historical artifact;
  // a fixture failure alone is not evidence of live production drift.
  assert.equal(
    audit.git_migration_baseline_commit,
    "2dbe44facc303cfe4703d72a0cf665c36c98d552",
  );
  assert.deepEqual(audit.summary, {
    git_active_migrations: 34,
    remote_migrations: 33,
    remote_array_elements: 141,
    remote_payload_chars_total: 141_552,
    remote_payload_utf8_bytes_total: 141_582,
    remote_payload_base64_wrapped_chars_total: 191_387,
    remote_payload_base64_unwrapped_chars_total: 188_968,
    remote_payload_base64_lf_total: 2_419,
    remote_payload_base64_elements_with_trailing_lf: 3,
    paired_migrations: 32,
    exact_name_pairs: 31,
    manual_alias_pairs: 1,
    git_only: [
      "supabase/migrations/20260812_local_storage_import.sql",
      "supabase/migrations/20260818_cmr_number_sequence_resync.sql",
    ],
    remote_only: [
      {
        version: "20260817212235",
        name: "cmr_canonical_model_rls_and_hardening",
      },
    ],
    all_pairs_equivalent: true,
  });
  assert.equal(audit.method.base64_variant, "unwrapped_lf_0x0a_removed_client_side");
  assert.equal(
    audit.method.base64_wrapping,
    "PostgreSQL inserts LF after each 57 payload bytes; trailing LF is preserved before client-side unwrapping",
  );
  assert.equal(
    audit.method.postgres_base64_unwrapped_sequence_formula,
    "md5(string_agg(replace(encode(convert_to(element,'UTF8'),'base64'), chr(10), ''), ',' order by ordinality))",
  );
  assert.deepEqual(audit.method.reproducible_from_artifact, {
    statement_token_digests_with_repository: true,
    remote_array_element_md5_sequence: true,
    remote_array_text_md5: false,
    remote_payload_base64_sequence: false,
  });

  const alias = audit.migrations.filter((entry) => entry.match_resolution === "manual_alias");
  assert.deepEqual(
    alias.map(({ git_path, remote_name }) => ({ git_path, remote_name })),
    [
      {
        git_path: "supabase/migrations/20260819_cmr_access_key_lifecycle.sql",
        remote_name: "add_cmr_access_key_lifecycle",
      },
    ],
  );
});

// SHOULD-1: Puente temporal de resolución de ruta canónica para migraciones históricas
// cuyos nombres locales fueron alineados con el ledger remoto oficial de Supabase
// (20260819122543_add_cmr_access_key_lifecycle, 20260817142306_expedition_order_link,
// 20260817142337_cmr_expeditions_bridge, 20260817143337_expeditions_order_id_unique,
// 20260819122954_review_access_token_registry y 20260819123105_harden_review_token_rpc),
// preservando intacto el baseline inmutable de auditoría 20260912 (144.040 B).
function resolveCanonicalPath(entry: AuditEntry): string {
  if (existsSync(entry.git_path)) return entry.git_path;
  const canonical = `supabase/migrations/${entry.remote_version}_${entry.remote_name}.sql`;
  if (existsSync(canonical)) return canonical;
  return entry.git_path;
}

test("every remote statement digest matches the current Git token stream", () => {
  assert.equal(audit.migrations.length, 32);

  for (const entry of audit.migrations) {
    const resolvedPath = resolveCanonicalPath(entry);
    const gitSql = readFileSync(resolvedPath, "utf8");
    const statements = splitSqlStatements(gitSql);
    const digests = digestSqlStatements(statements);

    if (entry.remote_name === "fornexa_operational_core") {
      // Historical fixture recorded equivalent: true at 2026-09-12 baseline (commit 2dbe44fa):
      assert.equal(entry.equivalent, true, "historical fixture recorded equivalent: true at baseline");

      // Current Git has an authorized 2-statement delta (85 Git statements vs 83 remote capture).
      // Honest provenance: current Git 85 statements is NOT elementwise equivalent to 0912 remote 83 statements.
      const currentGitEquivalentToRemote =
        digests.statementDigests.length === entry.remote_statements &&
        digests.statementDigests.every((d, i) => d === entry.remote_statement_token_sha256[i]);
      assert.equal(
        currentGitEquivalentToRemote,
        false,
        "current Git 85 statements is NOT equivalent to 0912 remote 83 statements"
      );

      // Verify statement counts
      assert.equal(entry.remote_statements, 83, "historical remote statements anchor is 83");
      assert.equal(digests.statementDigests.length, 85, "current Git has exactly 85 statements (83 + 2)");
      assert.equal(entry.git_statements, 83, "historical audit entry recorded 83 git statements");

      // Prefix: Git statements 0..43 match remote capture 0..43 exactly
      assert.deepEqual(
        digests.statementDigests.slice(0, 44),
        entry.remote_statement_token_sha256.slice(0, 44),
        "prefix statements 0..43 match remote capture exactly"
      );

      // Delta: Statements 44 and 45 are strictly bounded to the authorized ALTER statements (MUST-2a)
      assert.equal(
        digests.statementDigests[44],
        EXPECTED_CUSTOMS_MESSAGES_TENANT_ID_DIGEST,
        "statement 44 is authorized ALTER customs_messages ADD tenant_id"
      );
      assert.deepEqual(
        tokenizeSql(statements[44]),
        tokenizeSql(
          "alter table public.customs_messages add column if not exists tenant_id uuid not null default '00000000-0000-4000-8000-000000000001' references public.tenants(id) on delete restrict"
        ),
        "statement 44 tokens match authorized customs_messages schema addition"
      );

      assert.equal(
        digests.statementDigests[45],
        EXPECTED_CUSTOMS_EVENTS_TENANT_ID_DIGEST,
        "statement 45 is authorized ALTER customs_events ADD tenant_id"
      );
      assert.deepEqual(
        tokenizeSql(statements[45]),
        tokenizeSql(
          "alter table public.customs_events add column if not exists tenant_id uuid not null default '00000000-0000-4000-8000-000000000001' references public.tenants(id) on delete restrict"
        ),
        "statement 45 tokens match authorized customs_events schema addition"
      );

      // Suffix: Git statements 46..84 match remote capture 44..82 exactly
      assert.deepEqual(
        digests.statementDigests.slice(46),
        entry.remote_statement_token_sha256.slice(44),
        "suffix statements 46..84 match remote capture 44..82 exactly"
      );

      // Verify aggregate digest of the 83 remote statements and historical 0912 fixture symmetry (SHOULD-1):
      assert.equal(
        entry.remote_statement_digest_sequence_sha256,
        sha256(JSON.stringify(entry.remote_statement_token_sha256)),
        "remote_statement_digest_sequence_sha256 matches remote statement digests"
      );
      assert.equal(entry.matched_statements, 83, "historical matched statements is 83");
      assert.deepEqual(
        entry.git_statement_token_sha256,
        entry.remote_statement_token_sha256,
        "historical fixture recorded git matching remote at baseline"
      );
      assert.equal(
        entry.git_statement_digest_sequence_sha256,
        sha256(JSON.stringify(entry.git_statement_token_sha256)),
        "git_statement_digest_sequence_sha256 matches git statement digests in fixture"
      );
    } else {
      assert.equal(entry.equivalent, true, entry.remote_name);
      assert.equal(entry.git_statements, entry.remote_statements, entry.remote_name);
      assert.equal(entry.matched_statements, entry.git_statements, entry.remote_name);
      assert.deepEqual(entry.git_statement_token_sha256, digests.statementDigests, entry.remote_name);
      assert.deepEqual(
        entry.remote_statement_token_sha256,
        digests.statementDigests,
        entry.remote_name,
      );
      assert.equal(
        entry.git_statement_digest_sequence_sha256,
        digests.aggregateDigest,
        entry.remote_name,
      );
      assert.equal(
        entry.remote_statement_digest_sequence_sha256,
        digests.aggregateDigest,
        entry.remote_name,
      );
    }

    // Integrity assertions executed for ALL migrations including fornexa_operational_core (MUST-2b):
    assert.match(
      entry.remote_payload_base64_unwrapped_sequence_sha256,
      sha256Pattern,
      entry.remote_name,
    );
    assert.match(entry.remote_array_text_md5_postgres, md5Pattern, entry.remote_name);
    assert.match(
      entry.remote_array_element_md5_sequence_md5_postgres,
      md5Pattern,
      entry.remote_name,
    );
    assert.match(
      entry.remote_payload_base64_wrapped_sequence_md5_postgres,
      md5Pattern,
      entry.remote_name,
    );
    assert.match(
      entry.remote_payload_base64_unwrapped_sequence_md5_postgres,
      md5Pattern,
      entry.remote_name,
    );
    assert.ok(entry.remote_payload_utf8_bytes_total >= entry.remote_payload_chars_total);
    assert.ok(
      entry.remote_payload_base64_wrapped_chars_total ===
        entry.remote_payload_base64_unwrapped_chars_total +
          entry.remote_payload_base64_lf_total,
    );
    assert.equal(
      entry.remote_payload_base64_trailing_lf_ordinals.length,
      entry.remote_payload_base64_elements_with_trailing_lf,
      entry.remote_name,
    );
    assert.equal(
      entry.remote_array_element_md5_postgres.length,
      entry.remote_array_elements,
      entry.remote_name,
    );
    assert.equal(
      entry.remote_array_element_statement_counts.length,
      entry.remote_array_elements,
      entry.remote_name,
    );
    assert.equal(
      entry.remote_array_element_statement_counts.reduce((sum, count) => sum + count, 0),
      entry.remote_statements,
      entry.remote_name,
    );
    entry.remote_array_element_md5_postgres.forEach((digest) =>
      assert.match(digest, md5Pattern, entry.remote_name),
    );

    const expectedCount = statementCountAnchors.get(entry.remote_name);
    if (expectedCount !== undefined) {
      assert.equal(entry.remote_statements, expectedCount, entry.remote_name);
      if (entry.remote_name === "fornexa_operational_core") {
        assert.equal(digests.statementDigests.length, expectedCount + 2, entry.remote_name);
      } else {
        assert.equal(entry.git_statements, expectedCount, entry.remote_name);
        assert.equal(digests.statementDigests.length, expectedCount, entry.remote_name);
      }
    }
  }
});

test("the three historical arrays are independently elementwise equivalent", () => {
  const multiElement = audit.migrations
    .filter((entry) => entry.remote_array_elements > 1)
    .map((entry) => {
      const expected = multiElementAnchors.get(entry.remote_name);
      assert.ok(expected, entry.remote_name);
      assert.deepEqual(
        {
          remote_array_elements: entry.remote_array_elements,
          remote_payload_chars_total: entry.remote_payload_chars_total,
          remote_payload_utf8_bytes_total: entry.remote_payload_utf8_bytes_total,
          remote_payload_base64_wrapped_chars_total:
            entry.remote_payload_base64_wrapped_chars_total,
          remote_payload_base64_unwrapped_chars_total:
            entry.remote_payload_base64_unwrapped_chars_total,
          remote_payload_base64_lf_total: entry.remote_payload_base64_lf_total,
          remote_payload_base64_elements_with_trailing_lf:
            entry.remote_payload_base64_elements_with_trailing_lf,
          remote_payload_base64_trailing_lf_ordinals:
            entry.remote_payload_base64_trailing_lf_ordinals,
          remote_array_element_md5_sequence_md5_postgres:
            entry.remote_array_element_md5_sequence_md5_postgres,
          remote_payload_base64_wrapped_sequence_md5_postgres:
            entry.remote_payload_base64_wrapped_sequence_md5_postgres,
          remote_payload_base64_unwrapped_sequence_md5_postgres:
            entry.remote_payload_base64_unwrapped_sequence_md5_postgres,
        },
        expected,
        entry.remote_name,
      );
      return {
        remote_name: entry.remote_name,
        remote_array_elements: entry.remote_array_elements,
        remote_array_elementwise_equivalent: entry.remote_array_elementwise_equivalent,
      };
    });

  assert.deepEqual(multiElement, [
    {
      remote_name: "customs_core",
      remote_array_elements: 8,
      remote_array_elementwise_equivalent: true,
    },
    {
      remote_name: "mobile_cmr",
      remote_array_elements: 20,
      remote_array_elementwise_equivalent: true,
    },
    {
      remote_name: "fornexa_operational_core",
      remote_array_elements: 83,
      remote_array_elementwise_equivalent: true,
    },
  ]);
});

test("the permanent artifact contains integrity evidence but no remote SQL payload", () => {
  assert.doesNotMatch(auditText, /"payload_base64"\s*:/);
  assert.doesNotMatch(auditText, /"remote_sql"\s*:/);
});


test("dynamic generator accepts authorized baseline repair and fails closed on arbitrary mutations (MUST-PLAN-1 / SHOULD-2)", () => {
  const fornexaMigration = audit.migrations.find(
    (m) => m.remote_name === "fornexa_operational_core",
  );
  assert.ok(fornexaMigration, "fornexa_operational_core migration entry must exist");

  const validGitSql = readFileSync(fornexaMigration.git_path, "utf8");
  const validStatements = splitSqlStatements(validGitSql);
  assert.equal(validStatements.length, 85, "authorized git has 85 statements");

  // Synthetic remote row with 83 statements simulating remote capture
  const remoteStatements = [
    ...validStatements.slice(0, 44),
    ...validStatements.slice(46),
  ];
  assert.equal(remoteStatements.length, 83, "remote statements must be 83");

  function md5(val: Buffer | string): string {
    return createHash("md5").update(val).digest("hex");
  }

  function encodePostgresBase64(buf: Buffer): string {
    if (buf.length === 0) return "";
    const chunks: string[] = [];
    for (let i = 0; i < buf.length; i += 57) {
      const chunk = buf.subarray(i, i + 57);
      const b64 = chunk.toString("base64");
      if (chunk.length === 57) {
        chunks.push(b64 + "\n");
      } else {
        chunks.push(b64);
      }
    }
    return chunks.join("");
  }

  const elements = remoteStatements.map((stmt, idx) => {
    const buf = Buffer.from(stmt.trim(), "utf8");
    return {
      ordinality: idx + 1,
      payload_base64: encodePostgresBase64(buf),
      payload_md5: md5(buf),
    };
  });

  const remotePayloads = elements.map((el) => {
    const buf = Buffer.from(el.payload_base64.split("\n").join(""), "base64");
    const s = buf.toString("utf8");
    return {
      chars: Array.from(s).length,
      utf8Bytes: buf.length,
      base64Wrapped: el.payload_base64,
      base64Unwrapped: el.payload_base64.split("\n").join(""),
      base64LfCount: el.payload_base64.split("\n").length - 1,
      base64HasTrailingLf: el.payload_base64.endsWith("\n"),
      ordinality: el.ordinality,
    };
  });
  const normalizedPayloads = remotePayloads.map((p) => p.base64Unwrapped);

  const syntheticRow = {
    version: "20260812",
    name: "fornexa_operational_core",
    remote_array_elements: elements.length,
    array_text_md5: "c9abca6d513fdf3dc587cbfc6f187fc8",
    payload_chars_total: remotePayloads.reduce((sum, p) => sum + p.chars, 0),
    payload_utf8_bytes_total: remotePayloads.reduce((sum, p) => sum + p.utf8Bytes, 0),
    base64_wrapped_chars_total: remotePayloads.reduce((sum, p) => sum + p.base64Wrapped.length, 0),
    base64_unwrapped_chars_total: normalizedPayloads.reduce((sum, p) => sum + p.length, 0),
    base64_lf_total: remotePayloads.reduce((sum, p) => sum + p.base64LfCount, 0),
    base64_elements_with_trailing_lf: remotePayloads.filter((p) => p.base64HasTrailingLf).length,
    element_md5_sequence_md5: md5(elements.map((e) => e.payload_md5).join(",")),
    base64_wrapped_sequence_md5: md5(remotePayloads.map((p) => p.base64Wrapped).join(",")),
    base64_unwrapped_sequence_md5: md5(normalizedPayloads.join(",")),
    elements,
  };

  // 1. Positive test: buildMigrationAudit succeeds on authorized baseline repair with 85 git vs 83 remote
  const auditResult = buildMigrationAudit({
    capturedAt: "2026-10-24T12:00:00Z",
    gitMigrationBaselineCommit: "d149789c4c73bb68eb259da3230a53c8c6366b27",
    gitMigrations: [{ path: fornexaMigration.git_path, sql: validGitSql }],
    remoteRows: [syntheticRow],
  }) as { summary: { all_pairs_equivalent: boolean }; migrations: Array<{ equivalent: boolean; matched_statements: number }> };

  assert.equal(auditResult.summary.all_pairs_equivalent, false, "overall ledger reflects delta");
  assert.equal(auditResult.migrations[0]?.equivalent, false, "pair reflects 85 vs 83 statements");
  assert.equal(auditResult.migrations[0]?.matched_statements, 44, "matched statements prefix until delta index");

  // 2. Negative test: arbitrary statement mutation at index 44 must be rejected fail-closed by buildMigrationAudit
  const tamperedGitStatements = [...validStatements];
  tamperedGitStatements[44] = "alter table public.customs_messages add column unauthorized_column text";
  const tamperedGitSql = tamperedGitStatements.join(";\n");

  assert.throws(
    () => {
      buildMigrationAudit({
        capturedAt: "2026-10-24T12:00:00Z",
        gitMigrationBaselineCommit: "d149789c4c73bb68eb259da3230a53c8c6366b27",
        gitMigrations: [{ path: fornexaMigration.git_path, sql: tamperedGitSql }],
        remoteRows: [syntheticRow],
      });
    },
    { message: /literal-safe comparison failed/ },
    "arbitrary SQL mutation at index 44 is rejected fail-closed by buildMigrationAudit"
  );
});
