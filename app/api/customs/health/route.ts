import { NextResponse } from "next/server";
import { customsReadiness } from "@/lib/customs/config";
import { aeatSystems } from "@/lib/customs/aeat/registry";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({ service: "fornexa-customs-spain", status: "ready", readiness: customsReadiness(), systems: aeatSystems });
}
