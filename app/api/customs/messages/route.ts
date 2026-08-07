import { NextRequest, NextResponse } from "next/server";
import { processCustomsMessage } from "@/lib/customs/service";
import type { CustomsMessage } from "@/lib/customs/types";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const message = await request.json() as CustomsMessage;
    const result = await processCustomsMessage(message);
    return NextResponse.json(result, { status: result.httpStatus });
  } catch (error) {
    return NextResponse.json({ accepted: false, errors: [error instanceof Error ? error.message : "Error interno"] }, { status: 500 });
  }
}
