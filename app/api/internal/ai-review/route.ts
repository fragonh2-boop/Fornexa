import { NextResponse } from "next/server";
import { getAuthenticatedContext } from "@/lib/auth-context";
import { runMultiModelReview } from "@/lib/ai-orchestrator";
import {
  buildControlledPreviewPacket,
  isPreviewReviewEnabled,
  isSameOriginRequest,
  sanitizeReviewResult,
} from "@/lib/ai-review-preview";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 45;

function unavailable() {
  return NextResponse.json({ error: "Not found." }, { status: 404 });
}

export async function POST(request: Request) {
  if (!isPreviewReviewEnabled()) return unavailable();
  if (!isSameOriginRequest(request)) {
    return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  }

  const auth = await getAuthenticatedContext();
  if (!auth) return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  if (auth.role !== "OWNER") return unavailable();

  const result = await runMultiModelReview(buildControlledPreviewPacket(), {
    opinionRound: 1,
  });

  return NextResponse.json(sanitizeReviewResult(result), {
    headers: { "Cache-Control": "no-store" },
  });
}
