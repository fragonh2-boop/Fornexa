import { NextResponse } from "next/server";
import { getAuthenticatedContext } from "@/lib/auth-context";
import { createSupabaseAdmin } from "@/lib/supabase-admin";
import type { AdrFrequency, AdrPolicy } from "@/lib/adr";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const FREQUENCIES = new Set<AdrFrequency>(["NEVER", "SOMETIMES", "ALWAYS"]);
const POLICIES = new Set<AdrPolicy>(["INFO", "WARNING", "ACKNOWLEDGEMENT", "BLOCKING"]);
const ADMIN_ROLES = new Set(["OWNER", "ADMIN"]);

function normalizeClasses(value: unknown) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map(item => String(item).trim()).filter(Boolean))].slice(0, 20);
}

export async function GET(request: Request) {
  const auth = await getAuthenticatedContext();
  if (!auth) return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  const code = new URL(request.url).searchParams.get("customerCode")?.trim().toUpperCase();
  if (!code) return NextResponse.json({ error: "Falta Customer ID." }, { status: 400 });

  const supabase = createSupabaseAdmin();
  const { data: customer } = await supabase.from("parties").select("id,code,legal_name,trade_name")
    .eq("tenant_id", auth.tenantId).eq("code", code).eq("is_customer", true).maybeSingle();
  if (!customer) return NextResponse.json({ error: "Cliente no encontrado." }, { status: 404 });

  const { data: profile, error } = await supabase.from("party_adr_profiles")
    .select("frequency,validation_policy,preferred_classes,updated_at")
    .eq("tenant_id", auth.tenantId).eq("party_id", customer.id).maybeSingle();
  if (error) return NextResponse.json({ error: "No se pudo cargar la configuración ADR." }, { status: 500 });
  return NextResponse.json({ item: {
    customerCode: customer.code,
    customerName: customer.trade_name ?? customer.legal_name,
    frequency: profile?.frequency ?? "NEVER",
    validationPolicy: profile?.validation_policy ?? "WARNING",
    preferredClasses: profile?.preferred_classes ?? [],
    updatedAt: profile?.updated_at ?? null,
  } }, { headers: { "Cache-Control": "no-store" } });
}

export async function PUT(request: Request) {
  const auth = await getAuthenticatedContext();
  if (!auth) return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  if (!ADMIN_ROLES.has(auth.role)) return NextResponse.json({ error: "Solo un administrador puede cambiar la configuración ADR." }, { status: 403 });

  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const customerCode = String(body?.customerCode ?? "").trim().toUpperCase();
  const frequency = String(body?.frequency ?? "") as AdrFrequency;
  const validationPolicy = String(body?.validationPolicy ?? "WARNING") as AdrPolicy;
  if (!customerCode || !FREQUENCIES.has(frequency) || !POLICIES.has(validationPolicy)) {
    return NextResponse.json({ error: "Configuración ADR no válida." }, { status: 400 });
  }

  const supabase = createSupabaseAdmin();
  const { data: customer } = await supabase.from("parties").select("id,code")
    .eq("tenant_id", auth.tenantId).eq("code", customerCode).eq("is_customer", true).maybeSingle();
  if (!customer) return NextResponse.json({ error: "Cliente no encontrado." }, { status: 404 });

  const preferredClasses = normalizeClasses(body?.preferredClasses);
  const { data, error } = await supabase.from("party_adr_profiles").upsert({
    party_id: customer.id,
    tenant_id: auth.tenantId,
    frequency,
    validation_policy: validationPolicy,
    preferred_classes: preferredClasses,
    updated_by: auth.userId,
    updated_at: new Date().toISOString(),
  }, { onConflict: "party_id" }).select("frequency,validation_policy,preferred_classes,updated_at").single();
  if (error) return NextResponse.json({ error: "No se pudo guardar la configuración ADR." }, { status: 500 });

  await supabase.from("audit_events").insert({
    tenant_id: auth.tenantId,
    entity_type: "PARTY_ADR_PROFILE",
    entity_id: customer.id,
    action: "UPSERT",
    actor_user_id: auth.userId,
    source_channel: "FORNEXA_WEB",
    changed_fields: ["frequency", "validation_policy", "preferred_classes"],
    after_data: data,
  });
  return NextResponse.json({ item: data }, { headers: { "Cache-Control": "no-store" } });
}

