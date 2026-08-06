import { NextResponse } from "next/server";

export async function GET(_request: Request, { params }: { params: Promise<{ country: string; postalCode: string }> }) {
  const { country, postalCode } = await params;
  if (!/^[A-Z]{2}$/.test(country) || !/^[A-Z0-9-]{3,10}$/i.test(postalCode)) return NextResponse.json({ error: "Formato postal no válido." }, { status: 400 });
  const response = await fetch(`https://api.zippopotam.us/${country}/${encodeURIComponent(postalCode)}`, { next: { revalidate: 86400 } });
  if (!response.ok) return NextResponse.json({ error: "Código postal no encontrado." }, { status: 404 });
  const data = await response.json() as { places?: Array<{ "place name"?: string; state?: string; "state abbreviation"?: string }> };
  const places = [...new Set((data.places ?? []).map(place => place["place name"]).filter(Boolean))];
  return NextResponse.json({ places, region: data.places?.[0]?.state ?? "", regionCode: data.places?.[0]?.["state abbreviation"] ?? "" });
}
