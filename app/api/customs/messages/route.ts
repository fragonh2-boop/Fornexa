import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedContext } from "@/lib/auth-context";
import { processCustomsMessage } from "@/lib/customs/service";
import type { CustomsMessage } from "@/lib/customs/types";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const auth = await getAuthenticatedContext();
  if (!auth) return NextResponse.json({ accepted: false, errors: ["No autorizado."] }, { status: 401 });

  try {
    const message = await request.json() as CustomsMessage;
    const result = await processCustomsMessage(message);
    return NextResponse.json(result, { status: result.httpStatus });
  } catch (error) {
    return NextResponse.json({ accepted: false, errors: [error instanceof Error ? error.message : "Error interno"] }, { status: 500 });
  }
}
