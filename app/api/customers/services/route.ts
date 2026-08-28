import { NextResponse } from "next/server";
import { getAuthenticatedContext, getAuthenticatedOrReviewContext } from "@/lib/auth-context";
import { createSupabaseAdmin, numericValue } from "@/lib/supabase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const EDIT_ROLES = new Set(["OWNER", "ADMIN", "OPERATOR"]);
const ECONOMIC_READ_ROLES = new Set(["OWNER", "ADMIN", "PLANNER"]);
const RELATIONSHIPS = new Set(["CONTRACTED", "OFFERED"]);

function text(value: unknown) { return String(value ?? "").trim(); }

async function findParty(supabase: ReturnType<typeof createSupabaseAdmin>, tenantId: string, code: string) {
  const { data, error } = await supabase.from("parties").select("id,code,legal_name,trade_name")
    .eq("tenant_id", tenantId).eq("code", code).maybeSingle();
  if (error) throw error;
  return data;
}

export async function GET(request: Request) {
  const auth = await getAuthenticatedOrReviewContext();
  if (!auth) return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  const code = text(new URL(request.url).searchParams.get("partyCode")).toUpperCase();
  const relationship = text(new URL(request.url).searchParams.get("relationship")).toUpperCase() || "CONTRACTED";
  if (!code || !RELATIONSHIPS.has(relationship)) return NextResponse.json({ error: "Empresa o relación no válida." }, { status: 400 });

  const supabase = createSupabaseAdmin();
  const party = await findParty(supabase, auth.tenantId, code);
  if (!party) return NextResponse.json({ error: "Empresa no encontrada." }, { status: 404 });
  const canReadEconomic = !auth.isReview && ECONOMIC_READ_ROLES.has(auth.role);
  const assignmentColumns = canReadEconomic
    ? "id,service_id,reference,price,currency,valid_from,valid_to,conditions,is_active"
    : "id,service_id,reference,valid_from,valid_to,is_active";
  const [catalogResult, assignmentsResult] = await Promise.all([
    supabase.from("service_catalog").select("id,code,name,description,mode,service_type,unit,is_active,metadata")
      .eq("tenant_id", auth.tenantId).eq("is_active", true).order("code"),
    supabase.from("party_services").select(assignmentColumns)
      .eq("tenant_id", auth.tenantId).eq("party_id", party.id).eq("relationship_type", relationship),
  ]);
  if (catalogResult.error || assignmentsResult.error) return NextResponse.json({ error: "No se pudieron cargar los servicios." }, { status: 500 });
  const assignmentByService = new Map((assignmentsResult.data ?? []).map(item => [item.service_id, item]));
  return NextResponse.json({
    items: (catalogResult.data ?? []).map(service => ({ ...service, assignment: assignmentByService.get(service.id) ?? null })),
    canEdit: !auth.isReview && EDIT_ROLES.has(auth.role),
  }, { headers: { "Cache-Control": "no-store" } });
}

export async function PUT(request: Request) {
  const auth = await getAuthenticatedContext();
  if (!auth) return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  if (!EDIT_ROLES.has(auth.role)) return NextResponse.json({ error: "No tienes permisos para modificar servicios." }, { status: 403 });
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const code = text(body?.partyCode).toUpperCase();
  const relationship = text(body?.relationship).toUpperCase() || "CONTRACTED";
  const assignments = Array.isArray(body?.assignments) ? body.assignments as Record<string, unknown>[] : [];
  if (!code || !RELATIONSHIPS.has(relationship)) return NextResponse.json({ error: "Empresa o relación no válida." }, { status: 400 });

  const supabase = createSupabaseAdmin();
  const party = await findParty(supabase, auth.tenantId, code);
  if (!party) return NextResponse.json({ error: "Empresa no encontrada." }, { status: 404 });
  const serviceCodes = [...new Set(assignments.map(item => text(item.serviceCode).toUpperCase()).filter(Boolean))];
  const servicesResult = serviceCodes.length
    ? await supabase.from("service_catalog").select("id,code").eq("tenant_id", auth.tenantId).in("code", serviceCodes)
    : { data: [], error: null };
  if (servicesResult.error || (servicesResult.data ?? []).length !== serviceCodes.length) return NextResponse.json({ error: "Uno de los servicios no pertenece al catálogo activo." }, { status: 400 });
  const serviceByCode = new Map((servicesResult.data ?? []).map(service => [service.code, service.id]));
  const now = new Date().toISOString();
  const rows = assignments.map(item => {
    const status = text(item.status).toUpperCase() || "ACTIVE";
    return {
      tenant_id: auth.tenantId,
      party_id: party.id,
      service_id: serviceByCode.get(text(item.serviceCode).toUpperCase()),
      relationship_type: relationship,
      reference: text(item.reference) || null,
      price: numericValue(item.price),
      currency: text(item.currency).toUpperCase() || "EUR",
      valid_from: text(item.validFrom) || null,
      valid_to: text(item.validTo) || null,
      conditions: { notes: text(item.notes) || null, status },
      is_active: status !== "INACTIVE",
      updated_at: now,
    };
  });
  if (rows.length) {
    const result = await supabase.from("party_services").upsert(rows, { onConflict: "party_id,service_id,relationship_type" });
    if (result.error) throw result.error;
  }
  const keepServiceIds = rows.map(row => row.service_id);
  let deactivate = supabase.from("party_services").update({ is_active: false, updated_at: now })
    .eq("tenant_id", auth.tenantId).eq("party_id", party.id).eq("relationship_type", relationship);
  if (keepServiceIds.length) deactivate = deactivate.not("service_id", "in", `(${keepServiceIds.join(",")})`);
  const deactivated = await deactivate;
  if (deactivated.error) throw deactivated.error;

  await supabase.from("audit_events").insert({
    tenant_id: auth.tenantId, entity_type: "PARTY_SERVICES", entity_id: party.id,
    action: "REPLACE", actor_user_id: auth.userId, source_channel: "FORNEXA_WEB",
    changed_fields: ["services"], after_data: { relationship, serviceCodes },
  });
  return NextResponse.json({ ok: true, count: rows.length });
}
