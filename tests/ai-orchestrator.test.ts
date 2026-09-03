import assert from "node:assert/strict";
import test from "node:test";
import {
  buildReviewPrompt,
  getReviewProviderReadiness,
  redactSensitiveText,
  runMultiModelReview,
  validateOutboundReviewPacket,
  validateReviewPacket,
} from "../lib/ai-orchestrator.ts";

const packet = {
  taskId: "MMO-1",
  repository: "fragonh2-boop/Fornexa",
  objective: "Validate a provider-neutral review flow",
  changedFiles: ["lib/ai-orchestrator.ts"],
  testResults: ["typecheck pending"],
  dataClassification: "public_code" as const,
};

test("validateReviewPacket accepts a minimal valid packet", () => {
  assert.doesNotThrow(() => validateReviewPacket(packet));
});

test("validateReviewPacket rejects malformed external JSON before prompt construction", () => {
  assert.throws(
    () => validateReviewPacket({ ...packet, changedFiles: [] }),
    /at least one changed file/i,
  );
  assert.throws(
    () => validateReviewPacket({ ...packet, objective: 42 as unknown as string }),
    /requires objective/i,
  );
});

test("buildReviewPrompt preserves objective and evidence hierarchy", () => {
  const prompt = buildReviewPrompt(packet, "architect");
  assert.match(prompt, /independent architecture and security reviewer/i);
  assert.match(prompt, /repository evidence, tests and official specifications/i);
  assert.match(prompt, /Validate a provider-neutral review flow/);
});

test("redactSensitiveText removes bearer tokens and credential assignments", () => {
  const result = redactSensitiveText("Authorization: Bearer abcdefghijklmnop api_key=supersecret123");
  assert.doesNotMatch(result.text, /abcdefghijklmnop|supersecret123/);
  assert.ok(result.detections.length >= 1);
});

test("outbound review fails closed without explicit public_code classification", () => {
  assert.throws(
    () => validateOutboundReviewPacket({ ...packet, dataClassification: "unknown" }),
    /explicit public_code data classification/i,
  );
});

test("outbound review blocks detected sensitive material", () => {
  assert.throws(
    () => validateOutboundReviewPacket({ ...packet, diff: "+ api_key=supersecret123" }),
    /sensitive-material detector/i,
  );
});

test("runMultiModelReview enforces the two-round opinion ceiling", async () => {
  await assert.rejects(() => runMultiModelReview(packet, { opinionRound: 3 }), /round must be 1 or 2/i);
});

test("runMultiModelReview degrades safely when provider credentials are absent", async () => {
  const previous = {
    openai: process.env.OPENAI_API_KEY,
    anthropic: process.env.ANTHROPIC_API_KEY,
    deepseek: process.env.DEEPSEEK_API_KEY,
  };
  delete process.env.OPENAI_API_KEY;
  delete process.env.ANTHROPIC_API_KEY;
  delete process.env.DEEPSEEK_API_KEY;

  try {
    const readiness = getReviewProviderReadiness();
    assert.equal(readiness.length, 3);
    assert.ok(readiness.every((provider) => !provider.configured && provider.missing.includes("api_key")));

    const result = await runMultiModelReview(packet, {
      requestId: "req-test",
      runId: "run-test",
      opinionRound: 1,
    });
    assert.equal(result.reviews.length, 0);
    assert.equal(result.requestId, "req-test");
    assert.equal(result.runId, "run-test");
    assert.equal(result.opinionRound, 1);
    assert.deepEqual(
      result.unavailable.map((item) => item.provider).sort(),
      ["anthropic", "deepseek", "openai"],
    );
  } finally {
    if (previous.openai) process.env.OPENAI_API_KEY = previous.openai;
    if (previous.anthropic) process.env.ANTHROPIC_API_KEY = previous.anthropic;
    if (previous.deepseek) process.env.DEEPSEEK_API_KEY = previous.deepseek;
  }
});
