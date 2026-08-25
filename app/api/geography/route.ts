import { NextResponse } from "next/server";
import { countriesFromSource, fetchWorldGeography, subdivisionsFromSource } from "@/lib/geography-master";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const country = new URL(request.url).searchParams.get("country")?.trim().toUpperCase() ?? "";
  if (country && !/^[A-Z]{2}$/.test(country)) {
    return NextResponse.json({ error: "Código de país no válido." }, { status: 400 });
  }

  try {
    const source = await fetchWorldGeography();
    const payload = country
      ? { country, subdivisions: subdivisionsFromSource(source, country) }
      : { countries: countriesFromSource(source) };
    return NextResponse.json(payload, {
      headers: { "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=604800" },
    });
  } catch (error) {
    console.error("World geography catalog failed", error instanceof Error ? { name: error.name, message: error.message } : { message: "unknown" });
    return NextResponse.json({ error: "No se pudo cargar el catálogo geográfico mundial." }, { status: 503 });
  }
}
