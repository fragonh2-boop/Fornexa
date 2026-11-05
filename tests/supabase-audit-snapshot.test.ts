import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import test from "node:test";
import { digestSqlStatements, sha256, splitSqlStatements } from "../scripts/sql-provenance.ts";
import { memorandumReleases } from "../lib/memorandum.ts";

test("24-Oct imported snapshot is pinned and checked against its historical Git tree, not certified as live capture", () => {
  const manifest = JSON.parse(readFileSync("docs/verification/audit-20261024-provenance.json", "utf8"));
  assert.equal(manifest.classification, "UNVERIFIED_HISTORICAL_IMPORT");
  assert.equal(manifest.certifies_live_database, false);
  assert.equal(manifest.capture_workflow_run_id, null);
  assert.equal(manifest.capture_artifact_id, null);
  const publicRelease = memorandumReleases.find(release => release.version === "2026.10.23-4");
  assert.ok(publicRelease);
  assert.match(publicRelease.outcome, /snapshot histórico importado/);
  assert.match(publicRelease.outcome, /sin run identificado.*sin certificar/);
  assert.doesNotMatch(publicRelease.outcome, /evidencia técnica auditada|captura real ejecutada|18:46 UTC/);
  for (const file of manifest.files) {
    const bytes = readFileSync(file.path);
    assert.equal(bytes.length, file.bytes);
    assert.equal(sha256(bytes.toString("utf8")), file.sha256);
  }
  const snapshot = JSON.parse(readFileSync(manifest.files[0].path, "utf8"));
  const preflight = JSON.parse(readFileSync(manifest.files[1].path, "utf8"));
  assert.equal(snapshot.captured_at, manifest.reported_capture_time);
  assert.equal(preflight.captured_at, snapshot.captured_at);
  assert.equal(snapshot.git_migration_baseline_commit, manifest.git_comparison_baseline);
  assert.equal(preflight.transaction_mode, "READ ONLY");
  assert.deepEqual(preflight.mismatched_rows, { customs_messages: 0, customs_events: 0 });
  assert.equal(snapshot.migrations.length, snapshot.summary.paired_migrations);
  assert.equal(snapshot.summary.remote_migrations, 42);
  assert.equal(snapshot.summary.all_pairs_equivalent, false, "historical snapshot already records divergence");
  let remoteElements = 0;
  const observation = JSON.parse(readFileSync(manifest.ledger_content_corroboration.source, "utf8"));
  assert.equal(observation.transaction_read_only, "on");
  assert.equal(observation.migration_count, 42);
  assert.equal(observation.migrations.length, 42);
  assert.equal(manifest.ledger_content_corroboration.certifies_original_capture_time, false);
  const remote = new Map(observation.migrations.map((entry: { version: string }) => [entry.version, entry]));
  for (const entry of snapshot.migrations) {
    const text = execFileSync("git", ["show", `${manifest.git_comparison_baseline}:${entry.git_path}`], { encoding: "utf8" });
    const digests = digestSqlStatements(splitSqlStatements(text));
    assert.deepEqual(digests.statementDigests, entry.git_statement_token_sha256, entry.git_path);
    assert.equal(entry.git_statement_digest_sequence_sha256, sha256(JSON.stringify(entry.git_statement_token_sha256)));
    assert.equal(entry.remote_statement_digest_sequence_sha256, sha256(JSON.stringify(entry.remote_statement_token_sha256)));
    assert.equal(entry.remote_array_elements, entry.remote_array_element_md5_postgres.length);
    remoteElements += entry.remote_array_elements;
    const primary = remote.get(entry.remote_version) as { name: string; elements: number; array_text_md5: string; payload_sha256: string };
    assert.ok(primary, entry.remote_version);
    assert.equal(primary.name, entry.remote_name);
    assert.equal(primary.elements, entry.remote_array_elements);
    assert.equal(primary.array_text_md5, entry.remote_array_text_md5_postgres);
    assert.equal(primary.payload_sha256, entry.remote_payload_base64_unwrapped_sequence_sha256, "server-computed SHA256 corroborates remote bytes without exporting SQL");
  }
  const unpairedElements = snapshot.summary.remote_only.reduce((sum: number, entry: { version: string }) =>
    sum + Number((remote.get(entry.version) as { elements: number }).elements), 0);
  assert.equal(remoteElements + unpairedElements, snapshot.summary.remote_array_elements);
});
