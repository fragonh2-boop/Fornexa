import { NextResponse } from "next/server";
import { getAuthenticatedContext, getAuthenticatedOrReviewContext } from "@/lib/auth-context";
import { createSupabaseAdmin } from "@/lib/supabase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const EDIT_ROLES = new Set(["OWNER", "ADMIN", "OPERATOR"]);
function text(value: unknown) { return String(value ?? "").trim(); }

async function findCustomer(supabase: ReturnType<typeof createSupabaseAdmin>, tenantId: string, code: string) {
  const { data, error } = await supabase.from("parties").select("id,code").eq("tenant_id", tenantId).eq("code", code).eq("is_customer", true).maybeSingle();
  if (error) throw error;
  return data;
}

export async function GET(request: Request) {
  const auth = await getAuthenticatedOrReviewContext();
  if (!auth) return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  const code = text(new URL(request.url).searchParams.get("customerCode")).toUpperCase();
  const supabase = createSupabaseAdmin();
  const customer = await findCustomer(supabase, auth.tenantId, code);
  if (!customer) return NextResponse.json({ error: "Cliente no encontrado." }, { status: 404 });
  const { data, error } = await supabase.from("party_contacts").select("*").eq("tenant_id", auth.tenantId).eq("party_id", customer.id).eq("is_active", true).order("is_primary", { ascending: false }).order("name");
  if (error) return NextResponse.json({ error: "No se pudieron cargar los contactos." }, { status: 500 });
  return NextResponse.json({ items: data ?? [], canEdit: !auth.isReview && EDIT_ROLES.has(auth.role) }, { headers: { "Cache-Control": "no-store" } });
}

export async function PUT(request: Request) {
  const auth = await getAuthenticatedContext();
  if (!auth) return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  if (!EDIT_ROLES.has(auth.role)) return NextResponse.json({ error: "No tienes permisos para modificar contactos." }, { status: 403 });
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const code = text(body?.customerCode).toUpperCase();
  const contacts = Array.isArray(body?.contacts) ? body.contacts as Record<string, unknown>[] : [];
  if (contacts.some(contact => text(contact.name).length < 2)) return NextResponse.json({ error: "Cada contacto necesita un nombre válido." }, { status: 400 });
  const supabase = createSupabaseAdmin();
  const customer = await findCustomer(supabase, auth.tenantId, code);
  if (!customer) return NextResponse.json({ error: "Cliente no encontrado." }, { status: 404 });
  const now = new Date().toISOString();
  const existingIds = contacts.map(contact => text(contact.id)).filter(Boolean);
  let deactivate = supabase.from("party_contacts").update({ is_active: false, updated_at: now }).eq("tenant_id", auth.tenantId).eq("party_id", customer.id);
  if (existingIds.length) deactivate = deactivate.not("id", "in", `(${existingIds.join(",")})`);
  const deactivateResult = await deactivate;
  if (deactivateResult.error) throw deactivateResult.error;
  const primaryIndex = contacts.findIndex(contact => Boolean(contact.isPrimary));
  const saved = [];
  for (let index = 0; index < contacts.length; index += 1) {
    const contact = contacts[index];
    const values = {
      tenant_id: auth.tenantId, party_id: customer.id, name: text(contact.name), role: text(contact.role) || null,
      department: text(contact.department) || null, language: text(contact.language) || null,
      phone: text(contact.phone) || null, email: text(contact.email) || null,
      notification_channels: Array.isArray(contact.notificationChannels) ? contact.notificationChannels.map(text).filter(Boolean) : [],
      valid_from: text(contact.validFrom) || null, valid_to: text(contact.validTo) || null,
      is_primary: primaryIndex === -1 ? index === 0 : index === primaryIndex, is_active: true, updated_at: now,
    };
    const id = text(contact.id);
    const result = id
      ? await supabase.from("party_contacts").update(values).eq("tenant_id", auth.tenantId).eq("party_id", customer.id).eq("id", id).select("*").single()
      : await supabase.from("party_contacts").insert(values).select("*").single();
    if (result.error) throw result.error;
    saved.push(result.data);
  }
  await supabase.from("audit_events").insert({ tenant_id: auth.tenantId, entity_type: "PARTY_CONTACTS", entity_id: customer.id, action: "REPLACE", actor_user_id: auth.userId, source_channel: "FORNEXA_WEB", changed_fields: ["contacts"], after_data: { count: saved.length } });
  return NextResponse.json({ items: saved });
}
