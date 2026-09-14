import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { digestSqlStatements, splitSqlStatements } from "../scripts/sql-provenance.ts";

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

test("every remote statement digest matches the current Git token stream", () => {
  assert.equal(audit.migrations.length, 32);

  for (const entry of audit.migrations) {
    const gitSql = readFileSync(entry.git_path, "utf8");
    const digests = digestSqlStatements(splitSqlStatements(gitSql));

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
      assert.equal(entry.git_statements, expectedCount, entry.remote_name);
      assert.equal(entry.remote_statements, expectedCount, entry.remote_name);
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
