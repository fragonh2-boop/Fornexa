import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import test from "node:test";
import ts from "typescript";
import { persistSanitizedArtifact } from "../scripts/audit/run-supabase-audit-readonly.ts";
import { buildMigrationAudit } from "../scripts/generate-supabase-migration-audit.ts";

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

test("all local imports and registered loaders in the capture graph have workflow pins", () => {
  const pins = new Map(Object.entries(constants).filter(([key, file]) => key.endsWith('_FILE') && /\.(?:ts|mjs)$/.test(file)).map(([key, file]) => [file, key.replace(/_FILE$/, '')]));
  function checkGraph(extraImport = '') {
    const visited = new Set<string>();
    function visit(file: string) {
      if (visited.has(file)) return;
      const pin = pins.get(file);
      assert.ok(pin, `Unpinned local module: ${file}`);
      assert.ok(constants[`EXPECTED_${pin}_SHA256`] && constants[`EXPECTED_${pin}_BYTES`], `Incomplete pin for ${file}`);
      visited.add(file);
      const source = readFileSync(file, 'utf8') + (file === constants.GENERATOR_FILE ? extraImport : '');
      const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
      const specifiers: string[] = [];
      function walk(node: ts.Node) {
        if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) specifiers.push(node.moduleSpecifier.text);
        if (ts.isCallExpression(node) && (node.expression.kind === ts.SyntaxKind.ImportKeyword || (ts.isIdentifier(node.expression) && ['require', 'register'].includes(node.expression.text)))) {
          assert.ok(node.arguments[0] && ts.isStringLiteral(node.arguments[0]), `Nonliteral module reference in ${file} requires review`);
          specifiers.push(node.arguments[0].text);
        }
        ts.forEachChild(node, walk);
      }
      walk(ast);
      for (const specifier of specifiers) {
        if (specifier.startsWith('.')) visit(relative(process.cwd(), resolve(dirname(file), specifier)));
      }
    }
    visit(constants.RUNNER_FILE);
    visit(constants.REGISTER_FILE);
    assert.deepEqual([...visited].sort(), [...pins.keys()].sort());
  }
  checkGraph();
  assert.throws(() => checkGraph('\nimport "./new-unpinned-module.ts";'), /Unpinned local module/);
});

test("closed publication schema accepts a fresh generated 42-migration audit", () => {
  const dir = mkdtempSync(join(tmpdir(), 'audit-generated-'));
  const md5 = (value: string) => createHash('md5').update(value).digest('hex');
  try {
    const rows = Array.from({ length: 42 }, (_, index) => {
      const sql = `select ${index + 1};`;
      const payload = Buffer.from(sql).toString('base64');
      return {
        version: String(20261030000000 + index), name: `synthetic_capture_${index}`,
        remote_array_elements: 1, array_text_md5: md5(JSON.stringify([sql])),
        payload_chars_total: sql.length, payload_utf8_bytes_total: Buffer.byteLength(sql),
        base64_wrapped_chars_total: payload.length, base64_unwrapped_chars_total: payload.length,
        base64_lf_total: 0, base64_elements_with_trailing_lf: 0,
        element_md5_sequence_md5: md5(md5(sql)), base64_wrapped_sequence_md5: md5(payload),
        base64_unwrapped_sequence_md5: md5(payload),
        elements: [{ ordinality: 1, payload_base64: payload, payload_md5: md5(sql) }],
      };
    });
    const capturedAt = new Date().toISOString();
    const generated = buildMigrationAudit({ remoteRows: rows,
      gitMigrations: rows.map((row, i) => ({ path: `supabase/migrations/${row.version}_${row.name}.sql`, sql: `select ${i + 1};` })),
      gitMigrationBaselineCommit: '0123456789abcdef0123456789abcdef01234567', capturedAt });
    const path = join(dir, 'generated.json');
    persistSanitizedArtifact(path, JSON.stringify(generated), 'audit');
    const published = JSON.parse(readFileSync(path, 'utf8'));
    assert.equal(published.captured_at, capturedAt);
    assert.equal(published.summary.remote_migrations, 42);
    assert.equal(published.summary.paired_migrations, 42);
    assert.equal(published.summary.all_pairs_equivalent, true);
    assert.equal(published.migrations.length, 42);
    assert.doesNotMatch(readFileSync(path, 'utf8'), /"payload_base64":|select 42;/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
