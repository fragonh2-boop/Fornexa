import { NextResponse } from "next/server";
import { getAuthenticatedContext } from "@/lib/auth-context";
import { createSupabaseAdmin } from "@/lib/supabase-admin";

const ADMIN_ROLES = new Set(["OWNER", "ADMIN"]);
const TYPES = new Set(["OPERATIONAL", "BILLING", "RISK", "DOCUMENTARY"]);
function text(value: unknown) { return String(value ?? "").trim(); }

export async function POST(request: Request) {
  const auth = await getAuthenticatedContext();
  if (!auth) return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  if (!ADMIN_ROLES.has(auth.role)) return NextResponse.json({ error: "Solo administración puede gestionar advertencias y bloqueos." }, { status: 403 });
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const customerCode = text(body?.customerCode).toUpperCase();
  const blockType = text(body?.blockType).toUpperCase();
  const behavior = text(body?.behavior).toUpperCase() === "HARD" ? "HARD" : "WARNING";
  const reason = text(body?.reason);
  if (!customerCode || !TYPES.has(blockType) || reason.length < 3) return NextResponse.json({ error: "Tipo y motivo son obligatorios." }, { status: 400 });
  const supabase = createSupabaseAdmin();
  const { data: party } = await supabase.from("parties").select("id").eq("tenant_id", auth.tenantId).eq("code", customerCode).eq("is_customer", true).maybeSingle();
  if (!party) return NextResponse.json({ error: "Cliente no encontrado." }, { status: 404 });
  const { data, error } = await supabase.from("customer_blocks").insert({ tenant_id: auth.tenantId, party_id: party.id, block_type: blockType, behavior, reason, blocked_by: auth.userId }).select("*").single();
  if (error) return NextResponse.json({ error: "No se pudo registrar la advertencia." }, { status: 500 });
  return NextResponse.json({ item: data }, { status: 201 });
}

export async function DELETE(request: Request) {
  const auth = await getAuthenticatedContext();
  if (!auth) return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  if (!ADMIN_ROLES.has(auth.role)) return NextResponse.json({ error: "Solo administración puede liberar bloqueos." }, { status: 403 });
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const id = text(body?.id);
  const reason = text(body?.reason);
  const supabase = createSupabaseAdmin();
  const { data, error } = await supabase.from("customer_blocks").update({ released_at: new Date().toISOString(), released_by: auth.userId, release_reason: reason || null }).eq("tenant_id", auth.tenantId).eq("id", id).is("released_at", null).select("*").maybeSingle();
  if (error || !data) return NextResponse.json({ error: "No se pudo liberar el bloqueo." }, { status: 404 });
  return NextResponse.json({ item: data });
}
