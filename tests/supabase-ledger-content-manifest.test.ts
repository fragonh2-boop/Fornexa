import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";

// MUST-145G-1. This test re-derives the Git side of the A2 content manifest from the working
// tree on every run, so the artifact cannot drift away from the sources it describes. It does
// not trust any flag written by a producer: there are no certification flags to trust.

type Entry = {
  ledger_version: string;
  ledger_name: string;
  ledger_statement_elements: number;
  ledger_content_bytes: number;
  ledger_content_git_blob_sha1: string;
  git_path: string;
  git_bytes: number;
  git_blob_sha1: string;
  git_bytes_minus_ledger_bytes: number;
  classification: string;
  entry_note?: string;
};

const manifestPath = "docs/verification/supabase-ledger-content-manifest-20261127.json";
const manifestText = readFileSync(manifestPath, "utf8");
const manifest = JSON.parse(manifestText) as {
  artifact: string;
  summary: {
    ledger_entries: number;
    git_sql_sources: number;
    git_only_sources: number;
    ledger_entries_paired_by_name: number;
    classification_counts: Record<string, number>;
  };
  limits: string[];
  classification_notes: Record<string, string>;
  entries: Entry[];
  git_only: Array<{ git_path: string; git_blob_sha1: string; git_bytes: number }>;
};

const CLASSIFICATIONS = new Set([
  "byte_identical",
  "differs_single_byte_size_candidate",
  "differs_exterior_transaction_size_candidate",
  "differs_body_absent_in_ledger",
  "differs_multi_element_array",
  "differs_remediated_in_this_commit",
  "differs",
]);

function gitBlobSha1(path: string) {
  const bytes = readFileSync(path);
  return createHash("sha1")
    .update(Buffer.concat([Buffer.from(`blob ${bytes.length}\0`, "utf8"), bytes]))
    .digest("hex");
}

function noteFor(classification: string) {
  assert.ok(
    Object.prototype.hasOwnProperty.call(manifest.classification_notes, classification),
    `${classification}: every classification present in the manifest must carry a note`,
  );
  const note = manifest.classification_notes[classification];
  assert.ok(note.length > 0, `${classification}: the note must not be empty`);
  return note;
}

test("the manifest names itself and declares its own scope", () => {
  assert.equal(manifest.artifact, manifestPath);
  assert.ok(manifest.limits.length >= 4, "the manifest must state its limits");
  assert.doesNotMatch(manifestText, /"certified"\s*:\s*true/, "an A2 manifest must not certify itself");
  assert.doesNotMatch(manifestText, /"verified"\s*:\s*true/, "an A2 manifest must not declare itself verified");
  assert.doesNotMatch(manifestText, /production_migration_chain_replayed"\s*:\s*true/);
});

test("every Git blob digest in the manifest is re-derived from the working tree", () => {
  for (const entry of manifest.entries) {
    const bytes = readFileSync(entry.git_path).length;
    assert.equal(bytes, entry.git_bytes, `${entry.git_path} size`);
    assert.equal(gitBlobSha1(entry.git_path), entry.git_blob_sha1, `${entry.git_path} git blob sha1`);
  }
  for (const source of manifest.git_only) {
    assert.equal(readFileSync(source.git_path).length, source.git_bytes, `${source.git_path} size`);
    assert.equal(gitBlobSha1(source.git_path), source.git_blob_sha1, `${source.git_path} git blob sha1`);
  }
});

test("classifications are a closed set and agree with the recorded digests and sizes", () => {
  for (const entry of manifest.entries) {
    assert.ok(CLASSIFICATIONS.has(entry.classification), `unknown classification ${entry.classification}`);
    const identical = entry.ledger_content_git_blob_sha1 === entry.git_blob_sha1;
    assert.equal(
      identical,
      entry.classification === "byte_identical",
      `${entry.ledger_name}: byte_identical must hold exactly when the two blob digests match`,
    );
    assert.equal(
      entry.git_bytes_minus_ledger_bytes,
      entry.git_bytes - entry.ledger_content_bytes,
      `${entry.ledger_name}: recorded size delta`,
    );
    if (identical) assert.equal(entry.git_bytes_minus_ledger_bytes, 0, `${entry.ledger_name}: identical implies no size delta`);
    if (entry.classification === "differs_single_byte_size_candidate") {
      assert.equal(entry.git_bytes_minus_ledger_bytes, 1, `${entry.ledger_name}: single-byte class implies a delta of one`);
    }
    if (entry.classification === "differs_exterior_transaction_size_candidate") {
      assert.equal(entry.git_bytes_minus_ledger_bytes, 16, `${entry.ledger_name}: exterior transaction wrapper is 16 bytes`);
    }
    if (entry.classification === "differs_multi_element_array") {
      assert.ok(entry.ledger_statement_elements > 1, `${entry.ledger_name}: multi-element class implies more than one element`);
    }
    noteFor(entry.classification);
  }
});

test("every differing classification carries an explicit non-claim", () => {
  const used = new Set(manifest.entries.map((entry) => entry.classification));
  for (const classification of used) {
    if (classification === "byte_identical") continue;
    assert.match(
      noteFor(classification),
      /not (?:prove|proven|expected|established|classif)|impossible/i,
      `${classification}: a differing classification must say what it does not establish`,
    );
  }
  for (const classification of Object.keys(manifest.classification_notes)) {
    assert.ok(used.has(classification), `${classification}: the manifest must not describe an unused classification`);
  }
});

test("counts in the summary match the entries actually present", () => {
  assert.equal(manifest.entries.length, manifest.summary.ledger_entries);
  assert.equal(manifest.entries.length, manifest.summary.ledger_entries_paired_by_name);
  assert.equal(manifest.git_only.length, manifest.summary.git_only_sources);
  assert.equal(
    manifest.summary.ledger_entries + manifest.summary.git_only_sources,
    manifest.summary.git_sql_sources,
    "every Git source is either paired with a ledger entry or listed as Git-only",
  );
  const tally = new Map<string, number>();
  for (const entry of manifest.entries) {
    tally.set(entry.classification, (tally.get(entry.classification) ?? 0) + 1);
  }
  assert.deepEqual(Object.fromEntries(tally), manifest.summary.classification_counts);
  const paths = new Set(manifest.entries.map((entry) => entry.git_path));
  assert.equal(paths.size, manifest.entries.length, "no Git source may be paired twice");
  for (const source of manifest.git_only) {
    assert.ok(!paths.has(source.git_path), `${source.git_path} cannot be both paired and Git-only`);
  }
});
