import "server-only";

export type AiReviewRole = "implementer" | "architect" | "red_team";
export type AiProvider = "openai" | "anthropic" | "deepseek";
export type ReviewCategory = "objective" | "opinion" | "risk" | "needs_test";
export type ReviewSeverity = "info" | "low" | "medium" | "high" | "critical";
export type ReviewDataClassification = "public_code" | "unknown" | "confidential" | "personal_data" | "customer_data";

export type ReviewPacket = {
  taskId: string;
  repository: string;
  commitSha?: string;
  pullRequest?: number;
  objective: string;
  changedFiles: string[];
  diff?: string;
  testResults?: string[];
  constraints?: string[];
  questions?: string[];
  dataClassification?: ReviewDataClassification;
};

export type ReviewRunOptions = {
  requestId?: string;
  runId?: string;
  opinionRound?: number;
};

export type ModelFinding = {
  id: string;
  provider: AiProvider;
  role: AiReviewRole;
  severity: ReviewSeverity;
  category: ReviewCategory;
  finding: string;
  evidence?: string;
  proposedFix?: string;
  confidence?: number;
};

export type ModelReview = {
  provider: AiProvider;
  role: AiReviewRole;
  model: string;
  requestId: string;
  runId: string;
  opinionRound: number;
  summary: string;
  findings: ModelFinding[];
  rawText: string;
};

export type MultiModelReviewResult = {
  taskId: string;
  requestId: string;
  runId: string;
  opinionRound: number;
  reviews: ModelReview[];
  unavailable: { provider: AiProvider; reason: string }[];
};

export type ReviewProviderReadiness = {
  provider: AiProvider;
  role: AiReviewRole;
  configured: boolean;
  missing: ("api_key" | "model")[];
};

type ProviderConfig = {
  provider: AiProvider;
  role: AiReviewRole;
  apiKey?: string;
  model?: string;
  baseUrl: string;
  timeoutMs: number;
  maxOutputTokens: number;
  maxRetries: number;
};

type NormalizedRun = Required<ReviewRunOptions>;

const ROLE_PROMPTS: Record<AiReviewRole, string> = {
  implementer:
    "Act as the implementation owner. Check correctness, integration impact, missing tests and whether the proposed change satisfies the objective.",
  architect:
    "Act as an independent architecture and security reviewer. Focus on design coherence, security boundaries, regressions, maintainability and operational risk.",
  red_team:
    "Act as a technical red team. Try to break the implementation: find edge cases, unsafe assumptions, race conditions, data integrity risks, privilege problems and performance failure modes.",
};

const TRANSIENT_STATUSES = new Set([408, 429, 500, 502, 503, 504]);
const SECRET_PATTERNS = [
  { label: "private-key", pattern: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----[\s\S]*?-----END (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/gi },
  { label: "bearer-token", pattern: /\bBearer\s+[A-Za-z0-9._~+\/-]{8,}/gi },
  { label: "jwt", pattern: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g },
  { label: "credential-assignment", pattern: /\b(?:api[_-]?key|secret|token|password|passwd|authorization)\s*[:=]\s*["']?[A-Za-z0-9._~+\/=\-]{8,}/gi },
] as const;

function boundedEnvInt(name: string, fallback: number, min: number, max: number) {
  const raw = process.env[name];
  if (!raw) return fallback;
  const value = Number.parseInt(raw, 10);
  if (!Number.isFinite(value)) return fallback;
  return Math.max(min, Math.min(max, value));
}

function assertServerRuntime() {
  if (typeof window !== "undefined") {
    throw new Error("Multi-model provider execution is server-only");
  }
}

function providerConfigs(): ProviderConfig[] {
  assertServerRuntime();
  const timeoutMs = boundedEnvInt("FORNEXA_AI_TIMEOUT_MS", 20_000, 2_000, 45_000);
  const maxOutputTokens = boundedEnvInt("FORNEXA_AI_MAX_OUTPUT_TOKENS", 2_000, 256, 4_000);
  const maxRetries = boundedEnvInt("FORNEXA_AI_MAX_RETRIES", 1, 0, 1);
  return [
    {
      provider: "openai",
      role: "implementer",
      apiKey: process.env.OPENAI_API_KEY,
      model: process.env.FORNEXA_OPENAI_MODEL,
      baseUrl: process.env.OPENAI_BASE_URL ?? "https://api.openai.com/v1",
      timeoutMs,
      maxOutputTokens,
      maxRetries,
    },
    {
      provider: "anthropic",
      role: "architect",
      apiKey: process.env.ANTHROPIC_API_KEY,
      model: process.env.FORNEXA_ANTHROPIC_MODEL,
      baseUrl: process.env.ANTHROPIC_BASE_URL ?? "https://api.anthropic.com/v1",
      timeoutMs,
      maxOutputTokens,
      maxRetries,
    },
    {
      provider: "deepseek",
      role: "red_team",
      apiKey: process.env.DEEPSEEK_API_KEY,
      model: process.env.FORNEXA_DEEPSEEK_MODEL,
      baseUrl: process.env.DEEPSEEK_BASE_URL ?? "https://api.deepseek.com",
      timeoutMs,
      maxOutputTokens,
      maxRetries,
    },
  ];
}

export function getReviewProviderReadiness(): ReviewProviderReadiness[] {
  return providerConfigs().map((config) => {
    const missing: ReviewProviderReadiness["missing"] = [];
    if (!config.apiKey) missing.push("api_key");
    if (!config.model) missing.push("model");
    return {
      provider: config.provider,
      role: config.role,
      configured: missing.length === 0,
      missing,
    };
  });
}

export function validateReviewPacket(packet: ReviewPacket) {
  if (!packet || typeof packet !== "object") throw new Error("Review packet must be an object");
  if (typeof packet.taskId !== "string" || !packet.taskId.trim()) throw new Error("Review packet requires taskId");
  if (typeof packet.repository !== "string" || !packet.repository.trim()) throw new Error("Review packet requires repository");
  if (typeof packet.objective !== "string" || !packet.objective.trim()) throw new Error("Review packet requires objective");
  if (!Array.isArray(packet.changedFiles) || packet.changedFiles.length === 0) {
    throw new Error("Review packet requires at least one changed file");
  }
  if (packet.changedFiles.length > 500 || packet.changedFiles.some((file) => typeof file !== "string" || !file.trim())) {
    throw new Error("Review packet changedFiles are invalid or exceed 500 entries");
  }
  if (packet.diff !== undefined && typeof packet.diff !== "string") {
    throw new Error("Review packet diff must be a string");
  }
  if (packet.diff && packet.diff.length > 120_000) {
    throw new Error("Review packet diff exceeds 120000 characters");
  }
}

export function redactSensitiveText(value: string) {
  const detections = new Set<string>();
  let text = value;
  for (const { label, pattern } of SECRET_PATTERNS) {
    const regex = new RegExp(pattern.source, pattern.flags);
    text = text.replace(regex, () => {
      detections.add(label);
      return `[REDACTED:${label}]`;
    });
  }
  return { text, detections: [...detections] };
}

export function validateOutboundReviewPacket(packet: ReviewPacket) {
  validateReviewPacket(packet);
  if (packet.dataClassification !== "public_code") {
    throw new Error("Outbound AI review requires explicit public_code data classification");
  }
  const serialized = JSON.stringify(packet);
  const { detections } = redactSensitiveText(serialized);
  if (detections.length) {
    throw new Error(`Outbound AI review blocked by sensitive-material detector: ${detections.join(",")}`);
  }
}

function normalizeRunOptions(options: ReviewRunOptions = {}): NormalizedRun {
  const opinionRound = options.opinionRound ?? 1;
  if (!Number.isInteger(opinionRound) || opinionRound < 1 || opinionRound > 2) {
    throw new Error("Opinion review round must be 1 or 2; unresolved opinion after round 2 requires user escalation");
  }
  const makeId = () => globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const requestId = options.requestId?.trim() || makeId();
  const runId = options.runId?.trim() || makeId();
  if (requestId.length > 128 || runId.length > 128) throw new Error("Review correlation identifiers are too long");
  return { requestId, runId, opinionRound };
}

export function buildReviewPrompt(packet: ReviewPacket, role: AiReviewRole) {
  validateReviewPacket(packet);
  const safe = {
    taskId: packet.taskId,
    repository: packet.repository,
    commitSha: packet.commitSha,
    pullRequest: packet.pullRequest,
    objective: packet.objective,
    changedFiles: packet.changedFiles,
    diff: packet.diff,
    testResults: packet.testResults,
    constraints: packet.constraints,
    questions: packet.questions,
    dataClassification: packet.dataClassification,
  };
  const serialized = redactSensitiveText(JSON.stringify(safe)).text;

  return [
    ROLE_PROMPTS[role],
    "Treat repository evidence, tests and official specifications as stronger evidence than model opinion.",
    "Do not invent files, test results or runtime evidence.",
    "Return concise JSON only with shape: {summary:string,findings:[{severity:'info'|'low'|'medium'|'high'|'critical',category:'objective'|'opinion'|'risk'|'needs_test',finding:string,evidence?:string,proposedFix?:string,confidence?:number}]}",
    "Review packet:",
    serialized,
  ].join("\n\n");
}

async function readJsonResponse(response: Response) {
  if (!response.ok) {
    await response.body?.cancel().catch(() => undefined);
    throw new Error(`AI provider request failed with HTTP ${response.status}`);
  }
  const text = await response.text();
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    throw new Error("AI provider returned non-JSON transport payload");
  }
}

function stripJsonFence(text: string) {
  const trimmed = text.trim();
  const match = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return match?.[1]?.trim() ?? trimmed;
}

function parseReviewText(text: string, config: ProviderConfig, run: NormalizedRun): ModelReview {
  let parsed: { summary?: unknown; findings?: unknown } = {};
  try {
    parsed = JSON.parse(stripJsonFence(text));
  } catch {
    parsed = { summary: text, findings: [] };
  }

  const findings = Array.isArray(parsed.findings)
    ? parsed.findings.flatMap((item, index) => {
        if (!item || typeof item !== "object") return [];
        const record = item as Record<string, unknown>;
        const finding = typeof record.finding === "string" ? record.finding.trim() : "";
        if (!finding) return [];
        const severity: ReviewSeverity = ["info", "low", "medium", "high", "critical"].includes(String(record.severity))
          ? (record.severity as ReviewSeverity)
          : "medium";
        const category: ReviewCategory = ["objective", "opinion", "risk", "needs_test"].includes(String(record.category))
          ? (record.category as ReviewCategory)
          : "risk";
        return [
          {
            id: `${config.provider}-${index + 1}`,
            provider: config.provider,
            role: config.role,
            severity,
            category,
            finding,
            evidence: typeof record.evidence === "string" ? record.evidence : undefined,
            proposedFix: typeof record.proposedFix === "string" ? record.proposedFix : undefined,
            confidence: typeof record.confidence === "number" ? Math.max(0, Math.min(1, record.confidence)) : undefined,
          },
        ];
      })
    : [];

  return {
    provider: config.provider,
    role: config.role,
    model: config.model ?? "",
    requestId: run.requestId,
    runId: run.runId,
    opinionRound: run.opinionRound,
    summary: typeof parsed.summary === "string" ? parsed.summary : text,
    findings,
    rawText: text,
  };
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchWithPolicy(url: string, init: RequestInit, config: ProviderConfig) {
  let lastError: unknown;
  for (let attempt = 0; attempt <= config.maxRetries; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), config.timeoutMs);
    try {
      const response = await fetch(url, { ...init, signal: controller.signal, cache: "no-store" });
      if (TRANSIENT_STATUSES.has(response.status) && attempt < config.maxRetries) {
        await response.body?.cancel().catch(() => undefined);
        await sleep(250 * 2 ** attempt);
        continue;
      }
      return response;
    } catch (error) {
      lastError = error;
      if (attempt >= config.maxRetries) break;
      await sleep(250 * 2 ** attempt);
    } finally {
      clearTimeout(timeout);
    }
  }
  const name = lastError instanceof Error ? lastError.name : "network_error";
  throw new Error(`AI provider transport failed (${name})`);
}

async function callOpenAi(config: ProviderConfig, prompt: string) {
  const response = await fetchWithPolicy(`${config.baseUrl.replace(/\/$/, "")}/responses`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ model: config.model, input: prompt, max_output_tokens: config.maxOutputTokens }),
  }, config);
  const payload = await readJsonResponse(response);
  const output = Array.isArray(payload.output) ? payload.output : [];
  const text = output
    .flatMap((item) => {
      if (!item || typeof item !== "object") return [];
      const content = Array.isArray((item as Record<string, unknown>).content)
        ? ((item as Record<string, unknown>).content as unknown[])
        : [];
      return content.flatMap((part) => {
        if (!part || typeof part !== "object") return [];
        const value = (part as Record<string, unknown>).text;
        return typeof value === "string" ? [value] : [];
      });
    })
    .join("\n");
  if (!text) throw new Error("OpenAI response did not contain text output");
  return text;
}

async function callAnthropic(config: ProviderConfig, prompt: string) {
  const response = await fetchWithPolicy(`${config.baseUrl.replace(/\/$/, "")}/messages`, {
    method: "POST",
    headers: {
      "x-api-key": config.apiKey ?? "",
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: config.model,
      max_tokens: config.maxOutputTokens,
      messages: [{ role: "user", content: prompt }],
    }),
  }, config);
  const payload = await readJsonResponse(response);
  const content = Array.isArray(payload.content) ? payload.content : [];
  const text = content
    .flatMap((part) => {
      if (!part || typeof part !== "object") return [];
      const value = (part as Record<string, unknown>).text;
      return typeof value === "string" ? [value] : [];
    })
    .join("\n");
  if (!text) throw new Error("Anthropic response did not contain text output");
  return text;
}

async function callDeepSeek(config: ProviderConfig, prompt: string) {
  const response = await fetchWithPolicy(`${config.baseUrl.replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: config.model,
      messages: [{ role: "user", content: prompt }],
      temperature: 0,
      max_tokens: config.maxOutputTokens,
    }),
  }, config);
  const payload = await readJsonResponse(response);
  const choices = Array.isArray(payload.choices) ? payload.choices : [];
  const first = choices[0];
  const message = first && typeof first === "object" ? (first as Record<string, unknown>).message : undefined;
  const text = message && typeof message === "object" ? (message as Record<string, unknown>).content : undefined;
  if (typeof text !== "string" || !text.trim()) throw new Error("DeepSeek response did not contain text output");
  return text;
}

async function callProvider(config: ProviderConfig, packet: ReviewPacket, run: NormalizedRun) {
  if (!config.apiKey) throw new Error(`${config.provider} API key is not configured`);
  if (!config.model) throw new Error(`${config.provider} model is not configured`);
  const prompt = buildReviewPrompt(packet, config.role);
  const text =
    config.provider === "openai"
      ? await callOpenAi(config, prompt)
      : config.provider === "anthropic"
        ? await callAnthropic(config, prompt)
        : await callDeepSeek(config, prompt);
  return parseReviewText(text, config, run);
}

function safeUnavailableReason(reason: unknown) {
  const raw = reason instanceof Error ? reason.message : String(reason);
  return redactSensitiveText(raw).text.slice(0, 300);
}

export async function runMultiModelReview(packet: ReviewPacket, options: ReviewRunOptions = {}): Promise<MultiModelReviewResult> {
  assertServerRuntime();
  validateOutboundReviewPacket(packet);
  const run = normalizeRunOptions(options);
  const configs = providerConfigs();
  const settled = await Promise.allSettled(configs.map((config) => callProvider(config, packet, run)));
  const reviews: ModelReview[] = [];
  const unavailable: { provider: AiProvider; reason: string }[] = [];

  settled.forEach((result, index) => {
    const config = configs[index];
    if (!config) return;
    if (result.status === "fulfilled") reviews.push(result.value);
    else unavailable.push({ provider: config.provider, reason: safeUnavailableReason(result.reason) });
  });

  return { taskId: packet.taskId, requestId: run.requestId, runId: run.runId, opinionRound: run.opinionRound, reviews, unavailable };
}
