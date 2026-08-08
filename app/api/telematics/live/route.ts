import { NextRequest, NextResponse } from "next/server";
import { normalizeSamsaraLive } from "@/lib/telematics/runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const provider = request.nextUrl.searchParams.get("provider") || "samsara";
  if (provider !== "samsara") {
    return NextResponse.json({ error: "Live normalizer not executable for this provider until its tenant-specific API contract is authorized.", provider }, { status: 501 });
  }

  const token = process.env.SAMSARA_API_TOKEN;
  if (!token) {
    return NextResponse.json({ error: "SAMSARA_API_TOKEN not configured", provider, readyForCredentials: true }, { status: 428 });
  }

  const params = new URLSearchParams();
  for (const key of ["driverIds", "vehicleIds", "startTime", "after", "limit"]) {
    const value = request.nextUrl.searchParams.get(key);
    if (value) params.set(key, value);
  }

  const response = await fetch(`https://api.eu.samsara.com/fleet/tachograph-live-data/latest?${params.toString()}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" }, cache: "no-store",
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) return NextResponse.json({ provider, upstreamStatus: response.status, error: payload }, { status: response.status });

  return NextResponse.json({ provider, normalized: normalizeSamsaraLive(payload), source: "tachograph-live-data/latest" });
}
