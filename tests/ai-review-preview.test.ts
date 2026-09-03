import assert from "node:assert/strict";
import test from "node:test";
import {
  buildControlledPreviewPacket,
  isPreviewReviewEnabled,
  isSameOriginRequest,
  sanitizeReviewResult,
} from "../lib/ai-review-preview.ts";

test("preview activation requires flag, preview environment and exact branch", () => {
  assert.equal(isPreviewReviewEnabled({
    FORNEXA_AI_REVIEW_ENABLED: "true",
    VERCEL_ENV: "preview",
    VERCEL_GIT_COMMIT_REF: "feat/multi-model-orchestrator",
  }), true);
  assert.equal(isPreviewReviewEnabled({
    FORNEXA_AI_REVIEW_ENABLED: "true",
    VERCEL_ENV: "production",
    VERCEL_GIT_COMMIT_REF: "feat/multi-model-orchestrator",
  }), false);
  assert.equal(isPreviewReviewEnabled({
    FORNEXA_AI_REVIEW_ENABLED: "true",
    VERCEL_ENV: "preview",
    VERCEL_GIT_COMMIT_REF: "main",
  }), false);
  assert.equal(isPreviewReviewEnabled({
    FORNEXA_AI_REVIEW_ENABLED: "false",
    VERCEL_ENV: "preview",
    VERCEL_GIT_COMMIT_REF: "feat/multi-model-orchestrator",
  }), false);
});

test("same-origin guard rejects missing, malformed and foreign origins", () => {
  assert.equal(isSameOriginRequest(new Request("https://preview.example/api", {
    method: "POST",
    headers: { origin: "https://preview.example" },
  })), true);
  assert.equal(isSameOriginRequest(new Request("https://preview.example/api", { method: "POST" })), false);
  assert.equal(isSameOriginRequest(new Request("https://preview.example/api", {
    method: "POST",
    headers: { origin: "https://attacker.example" },
  })), false);
  assert.equal(isSameOriginRequest(new Request("https://preview.example/api", {
    method: "POST",
    headers: { origin: "not-a-url" },
  })), false);
});

test("controlled packet contains only fixed public-code evidence", () => {
  const packet = buildControlledPreviewPacket();
  assert.equal(packet.dataClassification, "public_code");
  assert.equal(packet.pullRequest, 38);
  assert.ok(packet.diff?.includes("same-origin POST"));
});

test("HTTP result omits raw provider text", () => {
  const result = sanitizeReviewResult({
    taskId: "MMO-1",
    requestId: "req-1",
    runId: "run-1",
    opinionRound: 1,
    reviews: [{
      provider: "openai",
      role: "implementer",
      model: "test-model",
      requestId: "req-1",
      runId: "run-1",
      opinionRound: 1,
      summary: "bounded",
      findings: [],
      rawText: "must not leave the server",
    }],
    unavailable: [],
  });
  assert.equal("rawText" in result.reviews[0]!, false);
  assert.equal(result.reviews[0]?.summary, "bounded");
});
