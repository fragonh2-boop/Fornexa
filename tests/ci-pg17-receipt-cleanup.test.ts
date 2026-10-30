import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

const workflow = readFileSync(".github/workflows/ci.yml", "utf8");
for (const [job, receipts] of [
  ["verify-e2-pg17", ["receipt-m8-e2-postgres17.json"]],
  ["rehearse-c3-apply-pg17", ["receipt-c3-workflow-pg17.json", "receipt-orphan-recovery-pg17.json"]],
] as const) {
  test(`${job}: failure after checkout cannot publish an inherited receipt`, () => {
    const body = workflow.split(`  ${job}:\n`)[1]?.split(/\n  [a-z][\w-]+:\n/)[0];
    assert.ok(body);
    const steps = body.split("    steps:\n")[1];
    const match = steps.match(/^      - uses: actions\/checkout@v4\n      - name: Remove inherited[^\n]*\n        run: (rm -f [^\n]+)\n/);
    assert.ok(match, "cleanup must be the first operation after checkout, before any dependency/gate failure");
    const dir = mkdtempSync(join(tmpdir(), "e2-receipt-red-"));
    try {
      mkdirSync(join(dir, "docs/verification"), { recursive: true });
      for (const name of receipts) writeFileSync(join(dir, "docs/verification", name), '{"historical":true}');
      const run = spawnSync("sh", ["-c", `${match[1]}\nfalse`], { cwd: dir });
      assert.equal(run.status, 1, "simulate a failing pre-harness step");
      for (const name of receipts) assert.equal(existsSync(join(dir, "docs/verification", name)), false, name);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
}
