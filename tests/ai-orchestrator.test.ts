import assert from "node:assert/strict";
import { readFile, rm, writeFile } from "node:fs/promises";
import test from "node:test";

// `server-only` is intentionally a framework poison marker. Node's standalone
// test runner does not provide Next.js' marker alias, so execute an exact
// temporary copy with only that marker removed. A separate assertion below
// proves that the production module retains the poison import.
const sourceUrl = new URL("../lib/ai-orchestrator.ts", import.meta.url);
const runtimeUrl = new URL("./.ai-orchestrator.runtime-test.ts", import.meta.url);
const source = await readFile(sourceUrl, "utf8");
assert.match(source, /^import "server-only";/);
await writeFile(runtimeUrl, source.replace(/^import "server-only";\s*/, ""), "utf8");
const orchestrator = await import(`${runtimeUrl.href}?head=${Date.now()}`);
await rm(runtimeUrl, { force: true });

const {
  buildReviewPrompt,
  getReviewProviderReadiness,
  redactSensitiveText,
  runMultiModelReview,
  validateOutboundReviewPacket,
  validateReviewPacket,
} = orchestrator;

const packet = {
  taskId: "MMO-1",
  repository: "fragonh2-boop/Fornexa",
  objective: "Validate a provider-neutral review flow",
  changedFiles: ["lib/ai-orchestrator.ts"],
  testResults: ["typecheck pending"],
  dataClassification: "public_code" as const,
};

function restoreEnv(name: string, value: string | undefined) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

test("production orchestrator retains the server-only poison marker", () => {
  assert.match(source, /^import "server-only";/);
  assert.match(source, /function assertServerRuntime\(\)/);
});

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

test("redactSensitiveText detects JWT and private-key material", () => {
  const jwt = "eyJaaaaaaaaaaa.bbbbbbbbbbb.ccccccccccc";
  const key = "-----BEGIN PRIVATE KEY-----\nAAAAAAAAAAAAAAAA\n-----END PRIVATE KEY-----";
  const result = redactSensitiveText(`${jwt}\n${key}`);
  assert.doesNotMatch(result.text, /eyJaaaaaaaaaaa|AAAAAAAAAAAAAAAA/);
  assert.ok(result.detections.includes("jwt"));
  assert.ok(result.detections.includes("private-key"));
});

test("outbound review fails closed without explicit public_code classification", () => {
  assert.throws(
    () => validateOutboundReviewPacket({ ...packet, dataClassification: "unknown" }),
    /explicit public_code data classification/i,
  );
});

test("outbound review blocks detected sensitive material anywhere in the packet", () => {
  assert.throws(
    () => validateOutboundReviewPacket({ ...packet, diff: "+ api_key=supersecret123" }),
    /sensitive-material detector/i,
  );
  assert.throws(
    () => validateOutboundReviewPacket({ ...packet, objective: "Authorization: Bearer abcdefghijklmnop" }),
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
    assert.ok(readiness.every((provider: { configured: boolean; missing: string[] }) => !provider.configured && provider.missing.includes("api_key")));

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
      result.unavailable.map((item: { provider: string }) => item.provider).sort(),
      ["anthropic", "deepseek", "openai"],
    );
  } finally {
    restoreEnv("OPENAI_API_KEY", previous.openai);
    restoreEnv("ANTHROPIC_API_KEY", previous.anthropic);
    restoreEnv("DEEPSEEK_API_KEY", previous.deepseek);
  }
});

test("provider adapters use bounded expected endpoints and normalize all three responses", async () => {
  const envNames = [
    "OPENAI_API_KEY",
    "ANTHROPIC_API_KEY",
    "DEEPSEEK_API_KEY",
    "FORNEXA_OPENAI_MODEL",
    "FORNEXA_ANTHROPIC_MODEL",
    "FORNEXA_DEEPSEEK_MODEL",
    "OPENAI_BASE_URL",
    "ANTHROPIC_BASE_URL",
    "DEEPSEEK_BASE_URL",
    "FORNEXA_AI_MAX_RETRIES",
  ] as const;
  const previous = Object.fromEntries(envNames.map((name) => [name, process.env[name]])) as Record<string, string | undefined>;
  const originalFetch = globalThis.fetch;
  const calls: { url: string; init?: RequestInit }[] = [];

  process.env.OPENAI_API_KEY = "openai-test-key";
  process.env.ANTHROPIC_API_KEY = "anthropic-test-key";
  process.env.DEEPSEEK_API_KEY = "deepseek-test-key";
  process.env.FORNEXA_OPENAI_MODEL = "openai-test-model";
  process.env.FORNEXA_ANTHROPIC_MODEL = "anthropic-test-model";
  process.env.FORNEXA_DEEPSEEK_MODEL = "deepseek-test-model";
  process.env.OPENAI_BASE_URL = "https://openai.invalid/v1";
  process.env.ANTHROPIC_BASE_URL = "https://anthropic.invalid/v1";
  process.env.DEEPSEEK_BASE_URL = "https://deepseek.invalid";
  process.env.FORNEXA_AI_MAX_RETRIES = "0";

  globalThis.fetch = async (input, init) => {
    const url = String(input);
    calls.push({ url, init });
    if (url === "https://openai.invalid/v1/responses") {
      return new Response(JSON.stringify({
        output: [{ content: [{ text: JSON.stringify({ summary: "openai ok", findings: [] }) }] }],
      }), { status: 200 });
    }
    if (url === "https://anthropic.invalid/v1/messages") {
      return new Response(JSON.stringify({
        content: [{ text: JSON.stringify({ summary: "anthropic ok", findings: [] }) }],
      }), { status: 200 });
    }
    if (url === "https://deepseek.invalid/chat/completions") {
      return new Response(JSON.stringify({
        choices: [{ message: { content: JSON.stringify({ summary: "deepseek ok", findings: [] }) } }],
      }), { status: 200 });
    }
    throw new Error(`Unexpected provider URL: ${url}`);
  };

  try {
    const result = await runMultiModelReview(packet, {
      requestId: "req-adapters",
      runId: "run-adapters",
      opinionRound: 1,
    });
    assert.equal(result.unavailable.length, 0);
    assert.deepEqual(
      result.reviews.map((review: { provider: string }) => review.provider).sort(),
      ["anthropic", "deepseek", "openai"],
    );
    assert.deepEqual(
      result.reviews.map((review: { summary: string }) => review.summary).sort(),
      ["anthropic ok", "deepseek ok", "openai ok"],
    );
    assert.deepEqual(
      calls.map((call) => call.url).sort(),
      [
        "https://anthropic.invalid/v1/messages",
        "https://deepseek.invalid/chat/completions",
        "https://openai.invalid/v1/responses",
      ],
    );
    for (const call of calls) {
      assert.equal(call.init?.method, "POST");
      const body = String(call.init?.body ?? "");
      assert.doesNotMatch(body, /openai-test-key|anthropic-test-key|deepseek-test-key/);
      assert.match(body, /Validate a provider-neutral review flow/);
    }
  } finally {
    globalThis.fetch = originalFetch;
    for (const name of envNames) restoreEnv(name, previous[name]);
  }
});
