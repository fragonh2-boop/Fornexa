import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, readSync, readdirSync, writeFileSync } from "node:fs";
import { basename, resolve } from "node:path";
import { TextDecoder } from "node:util";
import {
  compareSqlSources,
  digestSqlStatements,
  sha256,
  splitSqlStatements,
} from "./sql-provenance.ts";

export type RemoteMigrationElement = {
  ordinality: number;
  payload_base64: string;
  payload_md5: string;
};

export type RemoteMigrationRow = {
  version: string;
  name: string;
  remote_array_elements: number;
  array_text_md5: string;
  payload_chars_total: number;
  payload_utf8_bytes_total: number;
  base64_wrapped_chars_total: number;
  base64_unwrapped_chars_total: number;
  base64_lf_total: number;
  base64_elements_with_trailing_lf: number;
  element_md5_sequence_md5: string;
  base64_wrapped_sequence_md5: string;
  base64_unwrapped_sequence_md5: string;
  elements: RemoteMigrationElement[];
};

export type GitMigration = {
  path: string;
  sql: string;
};

const MANUAL_ALIASES = new Map([
  ["add_cmr_access_key_lifecycle", "cmr_access_key_lifecycle"],
]);

const STATEMENT_COUNT_ANCHORS = new Map<string, number>([
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

const LEDGER_ANCHORS = {
  remoteRows: 33,
  arrayElements: 141,
  payloadChars: 141_552,
  payloadUtf8Bytes: 141_582,
  base64WrappedChars: 191_387,
  base64UnwrappedChars: 188_968,
  base64LfTotal: 2_419,
  base64ElementsWithTrailingLf: 3,
};

const MULTI_ELEMENT_ANCHORS = new Map([
  [
    "customs_core",
    {
      payloadChars: 1_800,
      payloadUtf8Bytes: 1_800,
      base64WrappedChars: 2_439,
      base64UnwrappedChars: 2_412,
      base64LfTotal: 27,
      base64ElementsWithTrailingLf: 0,
      base64TrailingLfOrdinals: [],
      elementMd5Sequence: "d5cf692c851cb33ee2838cbce783339f",
      base64WrappedSequence: "79bf19ffc73b2f1e2c2fd473511abbef",
      base64UnwrappedSequence: "41d6a4f8cd058a15441ad7fda51b311d",
    },
  ],
  [
    "mobile_cmr",
    {
      payloadChars: 4_476,
      payloadUtf8Bytes: 4_479,
      base64WrappedChars: 6_066,
      base64UnwrappedChars: 5_996,
      base64LfTotal: 70,
      base64ElementsWithTrailingLf: 1,
      base64TrailingLfOrdinals: [20],
      elementMd5Sequence: "4c4c58dbf345e539d60ee67230058b63",
      base64WrappedSequence: "75e5e7ac50c244f602f1762af1baa0bd",
      base64UnwrappedSequence: "86f33ac5145c08a05f5877740af5ab4a",
    },
  ],
  [
    "fornexa_operational_core",
    {
      payloadChars: 31_500,
      payloadUtf8Bytes: 31_506,
      base64WrappedChars: 42_647,
      base64UnwrappedChars: 42_132,
      base64LfTotal: 515,
      base64ElementsWithTrailingLf: 2,
      base64TrailingLfOrdinals: [53, 70],
      elementMd5Sequence: "22cd966b388046dfba6e8039c2d78e2d",
      base64WrappedSequence: "d0076aaf74436609c882bd3ff2fdce80",
      base64UnwrappedSequence: "46c746ec4e3ce2705473ee60430e55fd",
    },
  ],
]);

function migrationName(path: string): string {
  return basename(path, ".sql").replace(/^[0-9]+_/, "");
}

function isIntegerAtLeast(value: unknown, minimum: number): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= minimum;
}

function unwrappedBase64(value: string, migrationName: string, ordinality: number): string {
  const unwrapped = value.split("\n").join("");
  if (/\s/u.test(unwrapped)) {
    throw new Error(`${migrationName}: unexpected non-LF whitespace at element ${ordinality}`);
  }
  return unwrapped;
}

function decodeBase64Utf8(value: string, migrationName: string, ordinality: number): Buffer {
  const unwrapped = unwrappedBase64(value, migrationName, ordinality);
  if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(unwrapped)) {
    throw new Error(`${migrationName}: invalid base64 at element ${ordinality}`);
  }
  const payload = Buffer.from(unwrapped, "base64");
  new TextDecoder("utf-8", { fatal: true }).decode(payload);
  return payload;
}

function md5(value: Buffer | string): string {
  return createHash("md5").update(value).digest("hex");
}

function assertRemoteRows(value: unknown): asserts value is RemoteMigrationRow[] {
  if (!Array.isArray(value)) throw new TypeError("Remote audit input must be an array");

  for (const [rowIndex, row] of value.entries()) {
    if (!row || typeof row !== "object") throw new TypeError(`Remote row ${rowIndex} is invalid`);
    const candidate = row as Record<string, unknown>;
    if (typeof candidate.version !== "string" || typeof candidate.name !== "string") {
      throw new TypeError(`Remote row ${rowIndex} is missing version/name`);
    }
    if (!/^[0-9]+$/.test(candidate.version) || !/^[a-z0-9_]+$/.test(candidate.name)) {
      throw new TypeError(`Remote row ${rowIndex} has an invalid version/name`);
    }
    if (
      !isIntegerAtLeast(candidate.remote_array_elements, 1) ||
      typeof candidate.array_text_md5 !== "string" ||
      !/^[0-9a-f]{32}$/.test(candidate.array_text_md5) ||
      !isIntegerAtLeast(candidate.payload_chars_total, 0) ||
      !isIntegerAtLeast(candidate.payload_utf8_bytes_total, 0) ||
      !isIntegerAtLeast(candidate.base64_wrapped_chars_total, 0) ||
      !isIntegerAtLeast(candidate.base64_unwrapped_chars_total, 0) ||
      !isIntegerAtLeast(candidate.base64_lf_total, 0) ||
      !isIntegerAtLeast(candidate.base64_elements_with_trailing_lf, 0) ||
      typeof candidate.element_md5_sequence_md5 !== "string" ||
      !/^[0-9a-f]{32}$/.test(candidate.element_md5_sequence_md5) ||
      typeof candidate.base64_wrapped_sequence_md5 !== "string" ||
      !/^[0-9a-f]{32}$/.test(candidate.base64_wrapped_sequence_md5) ||
      typeof candidate.base64_unwrapped_sequence_md5 !== "string" ||
      !/^[0-9a-f]{32}$/.test(candidate.base64_unwrapped_sequence_md5) ||
      !Array.isArray(candidate.elements)
    ) {
      throw new TypeError(`Remote row ${candidate.name} has invalid integrity metadata`);
    }
    for (const element of candidate.elements) {
      if (!element || typeof element !== "object") {
        throw new TypeError(`Remote row ${candidate.name} has an invalid array element`);
      }
      const item = element as Record<string, unknown>;
      if (
        !isIntegerAtLeast(item.ordinality, 1) ||
        typeof item.payload_base64 !== "string" ||
        typeof item.payload_md5 !== "string" ||
        !/^[0-9a-f]{32}$/.test(item.payload_md5)
      ) {
        throw new TypeError(`Remote row ${candidate.name} has incomplete element metadata`);
      }
    }
  }
}

export function buildMigrationAudit(input: {
  capturedAt: string;
  gitMigrationBaselineCommit: string;
  gitMigrations: GitMigration[];
  remoteRows: RemoteMigrationRow[];
}): Record<string, unknown> {
  const gitByName = new Map<string, GitMigration>();
  for (const migration of input.gitMigrations) {
    const name = migrationName(migration.path);
    if (gitByName.has(name)) throw new Error(`Duplicate Git migration name: ${name}`);
    gitByName.set(name, migration);
  }

  const pairedGitPaths = new Set<string>();
  const remoteOnly: Array<{ version: string; name: string }> = [];
  const entries: Array<Record<string, unknown>> = [];
  const ledgerTotals = {
    arrayElements: 0,
    payloadChars: 0,
    payloadUtf8Bytes: 0,
    base64WrappedChars: 0,
    base64UnwrappedChars: 0,
    base64LfTotal: 0,
    base64ElementsWithTrailingLf: 0,
  };

  for (const remote of input.remoteRows) {
    if (remote.remote_array_elements !== remote.elements.length) {
      throw new Error(
        `${remote.name}: remote_array_elements=${remote.remote_array_elements} but received ${remote.elements.length}`,
      );
    }

    const orderedElements = [...remote.elements].sort((left, right) => left.ordinality - right.ordinality);
    orderedElements.forEach((element, index) => {
      if (element.ordinality !== index + 1) {
        throw new Error(`${remote.name}: array ordinality is not contiguous`);
      }
    });

    const remotePayloads = orderedElements.map((element) => {
      const payload = decodeBase64Utf8(element.payload_base64, remote.name, element.ordinality);
      if (md5(payload) !== element.payload_md5) {
        throw new Error(`${remote.name}: PostgreSQL/client MD5 mismatch at element ${element.ordinality}`);
      }
      const sql = payload.toString("utf8");
      return {
        sql,
        chars: Array.from(sql).length,
        utf8Bytes: payload.length,
        base64Wrapped: element.payload_base64,
        base64Unwrapped: unwrappedBase64(
          element.payload_base64,
          remote.name,
          element.ordinality,
        ),
        base64LfCount: element.payload_base64.split("\n").length - 1,
        base64HasTrailingLf: element.payload_base64.endsWith("\n"),
        ordinality: element.ordinality,
      };
    });
    const normalizedPayloads = remotePayloads.map((payload) => payload.base64Unwrapped);
    const computed = {
      payloadChars: remotePayloads.reduce((sum, payload) => sum + payload.chars, 0),
      payloadUtf8Bytes: remotePayloads.reduce((sum, payload) => sum + payload.utf8Bytes, 0),
      base64WrappedChars: remotePayloads.reduce(
        (sum, payload) => sum + payload.base64Wrapped.length,
        0,
      ),
      base64UnwrappedChars: normalizedPayloads.reduce((sum, payload) => sum + payload.length, 0),
      base64LfTotal: remotePayloads.reduce((sum, payload) => sum + payload.base64LfCount, 0),
      base64ElementsWithTrailingLf: remotePayloads.filter(
        (payload) => payload.base64HasTrailingLf,
      ).length,
      base64TrailingLfOrdinals: remotePayloads
        .filter((payload) => payload.base64HasTrailingLf)
        .map((payload) => payload.ordinality),
      elementMd5Sequence: md5(orderedElements.map((element) => element.payload_md5).join(",")),
      base64WrappedSequence: md5(
        remotePayloads.map((payload) => payload.base64Wrapped).join(","),
      ),
      base64UnwrappedSequence: md5(normalizedPayloads.join(",")),
    };
    const expected = {
      payloadChars: remote.payload_chars_total,
      payloadUtf8Bytes: remote.payload_utf8_bytes_total,
      base64WrappedChars: remote.base64_wrapped_chars_total,
      base64UnwrappedChars: remote.base64_unwrapped_chars_total,
      base64LfTotal: remote.base64_lf_total,
      base64ElementsWithTrailingLf: remote.base64_elements_with_trailing_lf,
      base64TrailingLfOrdinals: remotePayloads
        .filter((payload) => payload.base64HasTrailingLf)
        .map((payload) => payload.ordinality),
      elementMd5Sequence: remote.element_md5_sequence_md5,
      base64WrappedSequence: remote.base64_wrapped_sequence_md5,
      base64UnwrappedSequence: remote.base64_unwrapped_sequence_md5,
    };
    if (JSON.stringify(computed) !== JSON.stringify(expected)) {
      throw new Error(
        `${remote.name}: client/server payload metrics differ: ${JSON.stringify({ computed, expected })}`,
      );
    }
    const derivedLfTotal = remotePayloads.reduce(
      (sum, payload) => sum + Math.floor(payload.utf8Bytes / 57),
      0,
    );
    const derivedElementsWithTrailingLf = remotePayloads.filter(
      (payload) => payload.utf8Bytes > 0 && payload.utf8Bytes % 57 === 0,
    ).length;
    if (
      computed.base64WrappedChars !==
        computed.base64UnwrappedChars + computed.base64LfTotal ||
      computed.base64LfTotal !== derivedLfTotal ||
      computed.base64ElementsWithTrailingLf !== derivedElementsWithTrailingLf
    ) {
      throw new Error(`${remote.name}: PostgreSQL base64 LF invariants differ`);
    }

    ledgerTotals.arrayElements += remote.remote_array_elements;
    ledgerTotals.payloadChars += computed.payloadChars;
    ledgerTotals.payloadUtf8Bytes += computed.payloadUtf8Bytes;
    ledgerTotals.base64WrappedChars += computed.base64WrappedChars;
    ledgerTotals.base64UnwrappedChars += computed.base64UnwrappedChars;
    ledgerTotals.base64LfTotal += computed.base64LfTotal;
    ledgerTotals.base64ElementsWithTrailingLf += computed.base64ElementsWithTrailingLf;

    const exact = gitByName.get(remote.name);
    const aliasName = MANUAL_ALIASES.get(remote.name);
    const git = exact ?? (aliasName ? gitByName.get(aliasName) : undefined);
    if (!git) {
      remoteOnly.push({ version: remote.version, name: remote.name });
      continue;
    }

    const remoteGroups = remotePayloads.map((payload) => payload.sql);
    const comparison = compareSqlSources(git.sql, remoteGroups);
    if (!comparison.equivalent) {
      throw new Error(`${remote.name}: literal-safe comparison failed: ${JSON.stringify(comparison)}`);
    }

    const gitStatements = splitSqlStatements(git.sql);
    const remoteStatements = remoteGroups.flatMap(splitSqlStatements);
    const gitDigests = digestSqlStatements(gitStatements);
    const remoteDigests = digestSqlStatements(remoteStatements);
    const anchor = STATEMENT_COUNT_ANCHORS.get(remote.name);
    if (
      anchor !== undefined &&
      (gitStatements.length !== anchor || remoteStatements.length !== anchor)
    ) {
      throw new Error(
        `${remote.name}: expected ${anchor}/${anchor} statements, got ${gitStatements.length}/${remoteStatements.length}`,
      );
    }

    let remoteArrayElementwiseEquivalent: boolean | null = null;
    if (remote.remote_array_elements > 1) {
      remoteArrayElementwiseEquivalent =
        gitStatements.length === remoteGroups.length &&
        remoteGroups.every(
          (group, index) => compareSqlSources(gitStatements[index] ?? "", [group]).equivalent,
        );
      if (!remoteArrayElementwiseEquivalent) {
        throw new Error(`${remote.name}: multi-element array is not elementwise equivalent`);
      }
    }

    const multiElementAnchor = MULTI_ELEMENT_ANCHORS.get(remote.name);
    if (multiElementAnchor && JSON.stringify(computed) !== JSON.stringify(multiElementAnchor)) {
      throw new Error(`${remote.name}: pre-registered multi-element anchors differ`);
    }
    pairedGitPaths.add(git.path);
    entries.push({
      git_path: git.path,
      git_name: migrationName(git.path),
      remote_version: remote.version,
      remote_name: remote.name,
      match_resolution: exact ? "exact_name" : "manual_alias",
      remote_array_elements: remote.remote_array_elements,
      remote_array_element_statement_counts: remoteGroups.map(
        (group) => splitSqlStatements(group).length,
      ),
      remote_array_elementwise_equivalent: remoteArrayElementwiseEquivalent,
      remote_payload_chars_total: computed.payloadChars,
      remote_payload_utf8_bytes_total: computed.payloadUtf8Bytes,
      remote_payload_base64_wrapped_chars_total: computed.base64WrappedChars,
      remote_payload_base64_unwrapped_chars_total: computed.base64UnwrappedChars,
      remote_payload_base64_lf_total: computed.base64LfTotal,
      remote_payload_base64_elements_with_trailing_lf:
        computed.base64ElementsWithTrailingLf,
      remote_payload_base64_trailing_lf_ordinals: computed.base64TrailingLfOrdinals,
      git_statements: comparison.gitStatementCount,
      remote_statements: comparison.remoteStatementCount,
      matched_statements: comparison.matchedStatementCount,
      equivalent: comparison.equivalent,
      git_statement_token_sha256: gitDigests.statementDigests,
      remote_statement_token_sha256: remoteDigests.statementDigests,
      git_statement_digest_sequence_sha256: gitDigests.aggregateDigest,
      remote_statement_digest_sequence_sha256: remoteDigests.aggregateDigest,
      remote_array_element_md5_postgres: orderedElements.map((element) => element.payload_md5),
      remote_array_element_md5_sequence_md5_postgres: remote.element_md5_sequence_md5,
      remote_array_text_md5_postgres: remote.array_text_md5,
      remote_payload_base64_wrapped_sequence_md5_postgres:
        remote.base64_wrapped_sequence_md5,
      remote_payload_base64_unwrapped_sequence_md5_postgres:
        remote.base64_unwrapped_sequence_md5,
      remote_payload_base64_unwrapped_sequence_sha256: sha256(
        JSON.stringify(normalizedPayloads),
      ),
    });
  }

  entries.sort((left, right) =>
    String(left.git_path).localeCompare(String(right.git_path), "en"),
  );
  remoteOnly.sort((left, right) => left.version.localeCompare(right.version, "en"));
  const gitOnly = input.gitMigrations
    .filter((migration) => !pairedGitPaths.has(migration.path))
    .map((migration) => migration.path)
    .sort((left, right) => left.localeCompare(right, "en"));
  const exactName = entries.filter((entry) => entry.match_resolution === "exact_name").length;
  const manualAlias = entries.filter((entry) => entry.match_resolution === "manual_alias").length;

  const expectedLedgerTotals = {
    arrayElements: LEDGER_ANCHORS.arrayElements,
    payloadChars: LEDGER_ANCHORS.payloadChars,
    payloadUtf8Bytes: LEDGER_ANCHORS.payloadUtf8Bytes,
    base64WrappedChars: LEDGER_ANCHORS.base64WrappedChars,
    base64UnwrappedChars: LEDGER_ANCHORS.base64UnwrappedChars,
    base64LfTotal: LEDGER_ANCHORS.base64LfTotal,
    base64ElementsWithTrailingLf: LEDGER_ANCHORS.base64ElementsWithTrailingLf,
  };
  if (
    input.remoteRows.length !== LEDGER_ANCHORS.remoteRows ||
    JSON.stringify(ledgerTotals) !== JSON.stringify(expectedLedgerTotals) ||
    ledgerTotals.base64WrappedChars !==
      ledgerTotals.base64UnwrappedChars + ledgerTotals.base64LfTotal
  ) {
    throw new Error(
      `Remote ledger anchors differ: ${JSON.stringify({ rows: input.remoteRows.length, ledgerTotals })}`,
    );
  }

  if (
    entries.length !== 32 ||
    exactName !== 31 ||
    manualAlias !== 1 ||
    gitOnly.length !== 2 ||
    remoteOnly.length !== 1
  ) {
    throw new Error(
      `Expected 32 pairs (31 exact + 1 alias), 2 Git-only and 1 remote-only; got ${entries.length} (${exactName} + ${manualAlias}), ${gitOnly.length}, ${remoteOnly.length}`,
    );
  }

  return {
    schema_version: 1,
    captured_at: input.capturedAt,
    git_migration_baseline_commit: input.gitMigrationBaselineCommit,
    remote_source: "supabase_migrations.schema_migrations",
    method: {
      transport: "base64_utf8_per_remote_array_element_with_ordinality",
      base64_variant: "unwrapped_lf_0x0a_removed_client_side",
      base64_wrapping:
        "PostgreSQL inserts LF after each 57 payload bytes; trailing LF is preserved before client-side unwrapping",
      statement_split: "semicolon_outside_comments_and_quoted_values",
      statement_digest: "sha256_json_array_of_typed_ordered_tokens",
      migration_digest: "sha256_json_array_of_statement_digests",
      remote_payload_digest: "sha256_json_array_of_unwrapped_ordered_base64_payloads",
      postgres_element_md5_sequence_formula:
        "md5(string_agg(md5(element), ',' order by ordinality))",
      postgres_base64_wrapped_sequence_formula:
        "md5(string_agg(encode(convert_to(element,'UTF8'),'base64'), ',' order by ordinality))",
      postgres_base64_unwrapped_sequence_formula:
        "md5(string_agg(replace(encode(convert_to(element,'UTF8'),'base64'), chr(10), ''), ',' order by ordinality))",
      postgres_md5_scope:
        "server-side integrity controls over each original text[] element and statements::text; the latter is not client-recomputed",
      reproducible_from_artifact: {
        statement_token_digests_with_repository: true,
        remote_array_element_md5_sequence: true,
        remote_array_text_md5: false,
        remote_payload_base64_sequence: false,
      },
    },
    summary: {
      git_active_migrations: input.gitMigrations.length,
      remote_migrations: input.remoteRows.length,
      remote_array_elements: ledgerTotals.arrayElements,
      remote_payload_chars_total: ledgerTotals.payloadChars,
      remote_payload_utf8_bytes_total: ledgerTotals.payloadUtf8Bytes,
      remote_payload_base64_wrapped_chars_total: ledgerTotals.base64WrappedChars,
      remote_payload_base64_unwrapped_chars_total: ledgerTotals.base64UnwrappedChars,
      remote_payload_base64_lf_total: ledgerTotals.base64LfTotal,
      remote_payload_base64_elements_with_trailing_lf:
        ledgerTotals.base64ElementsWithTrailingLf,
      paired_migrations: entries.length,
      exact_name_pairs: exactName,
      manual_alias_pairs: manualAlias,
      git_only: gitOnly,
      remote_only: remoteOnly,
      all_pairs_equivalent: entries.every((entry) => entry.equivalent === true),
    },
    migrations: entries,
  };
}

function readArgument(name: string): string {
  const index = process.argv.indexOf(name);
  const value = index >= 0 ? process.argv[index + 1] : undefined;
  if (!value) throw new Error(`Missing required argument ${name}`);
  return value;
}

function readJsonLineFromStdin(): string {
  const chunks: Buffer[] = [];
  const buffer = Buffer.alloc(64 * 1024);

  while (true) {
    const bytesRead = readSync(0, buffer, 0, buffer.length, null);
    if (bytesRead === 0) break;
    const chunk = Buffer.from(buffer.subarray(0, bytesRead));
    const lineFeed = chunk.indexOf(0x0a);
    chunks.push(lineFeed >= 0 ? chunk.subarray(0, lineFeed) : chunk);
    if (lineFeed >= 0) break;
  }

  const input = Buffer.concat(chunks).toString("utf8");
  if (!input) throw new Error("Remote audit input on stdin is empty");
  return input;
}

function runCli(): void {
  const remoteInput = readArgument("--remote-input");
  const output = resolve(readArgument("--output"));
  const capturedAt = readArgument("--captured-at");
  const remoteRows: unknown = JSON.parse(
    remoteInput === "-" ? readJsonLineFromStdin() : readFileSync(resolve(remoteInput), "utf8"),
  );
  assertRemoteRows(remoteRows);

  const migrationDirectory = resolve("supabase/migrations");
  const gitMigrations = readdirSync(migrationDirectory)
    .filter((file) => /^[0-9]+_.+\.sql$/.test(file))
    .sort((left, right) => left.localeCompare(right, "en"))
    .map((file) => ({
      path: `supabase/migrations/${file}`,
      sql: readFileSync(resolve(migrationDirectory, file), "utf8"),
    }));
  const gitMigrationBaselineCommit = execFileSync(
    "git",
    ["log", "-1", "--format=%H", "--", "supabase/migrations"],
    { encoding: "utf8" },
  ).trim();
  const audit = buildMigrationAudit({
    capturedAt,
    gitMigrationBaselineCommit,
    gitMigrations,
    remoteRows,
  });
  writeFileSync(output, `${JSON.stringify(audit, null, 2)}\n`, "utf8");
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename)) runCli();
