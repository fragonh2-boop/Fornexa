import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { persistSanitizedArtifact } from "../scripts/audit/run-supabase-audit-readonly.ts";

const workflow = readFileSync(".github/workflows/capture-supabase-migration-audit.yml", "utf8");
const constants = Object.fromEntries([...workflow.matchAll(/^      ([A-Z][A-Z0-9_]+): ['"]?([^'"\n]+)['"]?$/gm)].map(m => [m[1], m[2]]));
const integrity = workflow.match(/      - name: Verificar integridad[^\n]+\n        run: \|\n([\s\S]*?)(?=\n      - name:)/)![1]
  .split("\n").map(line => line.replace(/^          /, "")).join("\n");

for (const changed of [null, "REGISTER_FILE", "RESOLVER_FILE", "PROVENANCE_FILE"]) {
  test(`capture bootstrap pins: ${changed ?? "intact graph"}`, () => {
    const dir = mkdtempSync(join(tmpdir(), "audit-pins-"));
    try {
      for (const key of ["AUDIT_SQL_FILE", "RUNNER_FILE", "GENERATOR_FILE", "REGISTER_FILE", "RESOLVER_FILE", "PROVENANCE_FILE"]) {
        const file = constants[key];
        mkdirSync(dirname(join(dir,file)), { recursive: true });
        writeFileSync(join(dir,file), readFileSync(file));
      }
      const baseline = "docs/verification/supabase-migration-content-audit-20260912.json";
      mkdirSync(dirname(join(dir,baseline)), { recursive: true });
      writeFileSync(join(dir,baseline),readFileSync(baseline));
      if (changed) writeFileSync(join(dir,constants[changed]), readFileSync(join(dir,constants[changed]), "utf8") + "\n// unreviewed mutation\n");
      const run = spawnSync("bash", ["-e", "-c", integrity + "\nnode --import ./scripts/test-register.mjs -e \"require('fs').writeFileSync('capture-started','yes')\""], {
        cwd: dir, env: { ...process.env, ...constants }, encoding: "utf8",
      });
      assert.equal(run.status, changed ? 1 : 0, run.stderr);
      assert.equal(existsSync(join(dir,"capture-started")), changed === null, "unreviewed module must abort before Node bootstrap");
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
}

test("renamed SQL payloads and SQL in identifier fields are rejected before any output is written", () => {
  const dir = mkdtempSync(join(tmpdir(), "audit-schema-"));
  try {
    const baseline = JSON.parse(readFileSync("docs/verification/supabase-migration-content-audit-20260912.json", "utf8"));
    for (const location of ["root", "summary", "entry", "identifier"]) {
      const doc = structuredClone(baseline);
      if (location === "root") doc.renamed_export = "CREATE TABLE sensitive_data (secret text)";
      if (location === "summary") doc.summary.renamed_export = "CREATE TABLE sensitive_data (secret text)";
      if (location === "entry") doc.migrations[0].renamed_export = "CREATE TABLE sensitive_data (secret text)";
      if (location === "identifier") doc.migrations[0].git_name = "CREATE TABLE sensitive_data (secret text)";
      const path = join(dir, `${location}.json`);
      assert.throws(() => persistSanitizedArtifact(path, JSON.stringify(doc), "audit"));
      assert.equal(existsSync(path), false, "failed validation cannot leave even a transient output file");
    }
    persistSanitizedArtifact(join(dir,"valid.json"), JSON.stringify(baseline), "audit");
    assert.equal(existsSync(join(dir,"valid.json")), true);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("preflight artifact upload requires successful validation", () => {
  assert.match(workflow, /name: Subir evidencia preflight como artefacto\n        if: success\(\)/);
  assert.doesNotMatch(workflow, /name: Subir evidencia preflight como artefacto\n        if: always\(\)/);
});
