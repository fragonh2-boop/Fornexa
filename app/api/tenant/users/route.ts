import { NextResponse } from "next/server";
import { getAuthenticatedContext } from "@/lib/auth-context";
import { createSupabaseAdmin } from "@/lib/supabase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await getAuthenticatedContext();
  if (!auth) return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  const supabase = createSupabaseAdmin();
  const { data: members, error } = await supabase.from("tenant_members").select("user_id,role").eq("tenant_id", auth.tenantId).eq("status", "ACTIVE");
  if (error) return NextResponse.json({ error: "No se pudieron cargar los usuarios." }, { status: 500 });
  const ids = new Set((members ?? []).map(member => member.user_id));
  const { data: users, error: usersError } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (usersError) return NextResponse.json({ error: "No se pudieron cargar los usuarios." }, { status: 500 });
  const roleById = new Map((members ?? []).map(member => [member.user_id, member.role]));
  return NextResponse.json({ items: users.users.filter(user => ids.has(user.id)).map(user => ({ id: user.id, email: user.email, name: user.user_metadata?.display_name ?? user.user_metadata?.full_name ?? user.email, role: roleById.get(user.id) })) }, { headers: { "Cache-Control": "no-store" } });
}
