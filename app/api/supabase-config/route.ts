import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    return NextResponse.json(
      {
        error: "Supabase no está configurado en el entorno de producción.",
        missing: {
          url: !url,
          key: !key,
        },
      },
      { status: 500, headers: { "Cache-Control": "no-store" } }
    );
  }

  return NextResponse.json(
    { url, key },
    { headers: { "Cache-Control": "no-store" } }
  );
}
