import type { MultiModelReviewResult, ReviewPacket } from "@/lib/ai-orchestrator";

type PreviewEnvironment = Readonly<Record<string, string | undefined>>;

const EXPECTED_BRANCH = "feat/multi-model-orchestrator";

export function isPreviewReviewEnabled(env: PreviewEnvironment = process.env) {
  return env.FORNEXA_AI_REVIEW_ENABLED === "true"
    && env.VERCEL_ENV === "preview"
    && env.VERCEL_GIT_COMMIT_REF === EXPECTED_BRANCH;
}

export function isSameOriginRequest(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return false;

  try {
    return new URL(origin).origin === new URL(request.url).origin;
  } catch {
    return false;
  }
}

export function buildControlledPreviewPacket(): ReviewPacket {
  return {
    taskId: "MMO-1-CONTROLLED-PREVIEW",
    repository: "fragonh2-boop/Fornexa",
    pullRequest: 38,
    objective: "Review the temporary, preview-only activation boundary for the Fornexa multi-model orchestrator.",
    changedFiles: [
      "app/api/internal/ai-review/route.ts",
      "lib/ai-review-preview.ts",
    ],
    diff: [
      "+ require VERCEL_ENV=preview and the exact PR branch",
      "+ require an explicit temporary activation flag",
      "+ validate the authenticated Supabase user and OWNER membership",
      "+ require a same-origin POST and accept no caller-supplied review packet",
      "+ remove provider raw text from the HTTP response",
      "+ disable the activation flag immediately after the controlled run",
    ].join("\n"),
    testResults: [
      "preview activation guard unit tests: pending",
      "same-origin guard unit tests: pending",
      "sanitized response unit tests: pending",
    ],
    constraints: [
      "Do not infer access controls not present in the packet.",
      "The route must remain unreachable in production.",
      "The caller cannot supply prompts, diffs, model names or provider credentials.",
    ],
    questions: [
      "Are the temporary activation boundaries coherent and fail-closed?",
      "Which additional test would most reduce residual risk before the one controlled run?",
    ],
    dataClassification: "public_code",
  };
}

export function sanitizeReviewResult(result: MultiModelReviewResult) {
  return {
    taskId: result.taskId,
    requestId: result.requestId,
    runId: result.runId,
    opinionRound: result.opinionRound,
    reviews: result.reviews.map((review) => ({
      provider: review.provider,
      role: review.role,
      model: review.model,
      requestId: review.requestId,
      runId: review.runId,
      opinionRound: review.opinionRound,
      summary: review.summary,
      findings: review.findings,
    })),
    unavailable: result.unavailable,
  };
}
