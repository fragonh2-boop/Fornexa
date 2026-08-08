import { NextRequest, NextResponse } from "next/server";
import { getProviderReadiness, probeProvider } from "@/lib/telematics/runtime";
import { telematicsProviders } from "@/lib/telematics/providers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const provider = request.nextUrl.searchParams.get("provider");
  const probe = request.nextUrl.searchParams.get("probe") === "1";
  const readiness = getProviderReadiness();

  if (provider && probe) {
    const result = await probeProvider(provider);
    return NextResponse.json({ service: "fornexa-telematics", provider, ...result }, { status: result.status >= 400 ? result.status : 200 });
  }

  return NextResponse.json({
    service: "fornexa-telematics",
    status: "ready",
    providers: telematicsProviders.map((item) => ({
      id: item.id, slug: item.slug, name: item.name, readiness: item.readiness,
      auth: item.auth, capabilities: item.capabilities, endpoints: item.endpoints,
      documentationUrl: item.documentationUrl,
      configuration: readiness.find((row) => row.slug === item.slug),
    })),
  });
}
