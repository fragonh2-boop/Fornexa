import { NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const requiredTables = [
  "tenants",
  "parties",
  "orders",
  "delivery_notes",
  "expeditions",
  "trips",
  "trip_stops",
  "cmr_documents",
] as const;

export async function GET() {
  try {
    const supabase = createSupabaseAdmin();
    const checks = await Promise.all(requiredTables.map(async table => {
      const { error } = await supabase.from(table).select("*", { count: "exact", head: true });
      return { table, ready: !error };
    }));
    const missing = checks.filter(check => !check.ready).map(check => check.table);

    return NextResponse.json({
      service: "fornexa-operational-storage",
      status: missing.length ? "SCHEMA_REQUIRED" : "READY",
      database: "supabase-postgresql",
      schemaReady: missing.length === 0,
      tables: checks.filter(check => check.ready).map(check => check.table),
      missing,
    }, { status: missing.length ? 503 : 200, headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({
      service: "fornexa-operational-storage",
      status: "DATABASE_UNREACHABLE",
      database: "supabase-postgresql",
      schemaReady: false,
    }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
