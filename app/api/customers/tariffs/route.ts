import { NextResponse } from "next/server";
import { getAuthenticatedContext, getAuthenticatedOrReviewContext } from "@/lib/auth-context";
import { createSupabaseAdmin, numericValue } from "@/lib/supabase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const EDIT_ROLES = new Set(["OWNER", "ADMIN"]);
const COST_ROLES = new Set(["OWNER", "ADMIN", "PLANNER"]);
const SELL_ROLES = new Set(["OWNER", "ADMIN", "PLANNER", "OPERATOR", "VIEWER"]);
const UNITS = new Set(["SHIPMENT", "PALLET", "KG", "TON", "LINEAR_M", "KM", "STOP"]);
function text(value: unknown) { return String(value ?? "").trim(); }
function isoDate(value: unknown) { const result = text(value); return /^\d{4}-\d{2}-\d{2}$/.test(result) ? result : ""; }
function dayBefore(value: string) { const date = new Date(`${value}T12:00:00Z`); date.setUTCDate(date.getUTCDate() - 1); return date.toISOString().slice(0, 10); }

async function findCustomer(supabase: ReturnType<typeof createSupabaseAdmin>, tenantId: string, code: string) {
  const { data, error } = await supabase.from("parties").select("id,code").eq("tenant_id", tenantId).eq("code", code).eq("is_customer", true).maybeSingle();
  if (error) throw error;
  return data;
}

export async function GET(request: Request) {
  const auth = await getAuthenticatedOrReviewContext();
  if (!auth) return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  if (auth.isReview || !SELL_ROLES.has(auth.role)) return NextResponse.json({ error: "No autorizado para consultar información tarifaria." }, { status: 403 });
  const customerCode = text(new URL(request.url).searchParams.get("customerCode")).toUpperCase();
  const supabase = createSupabaseAdmin();
  const customer = await findCustomer(supabase, auth.tenantId, customerCode);
  if (!customer) return NextResponse.json({ error: "Cliente no encontrado." }, { status: 404 });
  const { data: assignments, error } = await supabase.from("tariff_assignments").select("tariff_header_id").eq("tenant_id", auth.tenantId).eq("party_id", customer.id);
  if (error) return NextResponse.json({ error: "No se pudieron cargar las tarifas." }, { status: 500 });
  const ids = (assignments ?? []).map(item => item.tariff_header_id);
  let tariffQuery = supabase.from("tariff_headers")
    .select("id,code,name,kind,status,version,valid_from,valid_to,currency,priority,origin_country,destination_country,service:service_catalog(code,name),lines:tariff_lines(id,pricing_unit,from_quantity,to_quantity,unit_price,minimum_amount,adr_surcharge,liftgate_surcharge,waiting_time_rate,customs_fee,fuel_surcharge_formula,discount_percent)")
    .eq("tenant_id", auth.tenantId)
    .in("id", ids)
    .order("valid_from", { ascending: false });
  if (!COST_ROLES.has(auth.role)) tariffQuery = tariffQuery.eq("kind", "SELL");
  const { data: tariffs, error: tariffsError } = ids.length ? await tariffQuery : { data: [], error: null };
  if (tariffsError) return NextResponse.json({ error: "No se pudieron cargar las tarifas." }, { status: 500 });
  return NextResponse.json({ items: tariffs ?? [], canEdit: EDIT_ROLES.has(auth.role) }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  const auth = await getAuthenticatedContext();
  if (!auth) return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  if (!EDIT_ROLES.has(auth.role)) return NextResponse.json({ error: "Solo administración puede crear o activar tarifas." }, { status: 403 });
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const customerCode = text(body?.customerCode).toUpperCase();
  const code = text(body?.code).toUpperCase();
  const name = text(body?.name);
  const validFrom = isoDate(body?.validFrom);
  const validTo = isoDate(body?.validTo) || null;
  const serviceCode = text(body?.serviceCode).toUpperCase();
  const activate = body?.activate === true;
  const pricingUnit = text(body?.pricingUnit).toUpperCase() || "SHIPMENT";
  const unitPrice = numericValue(body?.unitPrice);
  if (!customerCode || !code || name.length < 3 || !validFrom || !UNITS.has(pricingUnit) || unitPrice === null || unitPrice < 0) {
    return NextResponse.json({ error: "Cliente, código, nombre, vigencia, unidad e importe son obligatorios." }, { status: 400 });
  }
  const supabase = createSupabaseAdmin();
  const customer = await findCustomer(supabase, auth.tenantId, customerCode);
  if (!customer) return NextResponse.json({ error: "Cliente no encontrado." }, { status: 404 });
  let serviceId: string | null = null;
  if (serviceCode) {
    const { data: service } = await supabase.from("service_catalog").select("id").eq("tenant_id", auth.tenantId).eq("code", serviceCode).maybeSingle();
    if (!service) return NextResponse.json({ error: "Servicio no válido." }, { status: 400 });
    serviceId = service.id;
  }
  const { data: previousVersions } = await supabase.from("tariff_headers").select("id,version,status,valid_from,valid_to")
    .eq("tenant_id", auth.tenantId).eq("code", code).order("version", { ascending: false }).limit(1);
  const previous = previousVersions?.[0] ?? null;
  const version = (previous?.version ?? 0) + 1;
  if (activate) {
    const { data: assigned } = await supabase.from("tariff_assignments").select("tariff_header_id").eq("tenant_id", auth.tenantId).eq("party_id", customer.id);
    const assignedIds = (assigned ?? []).map(item => item.tariff_header_id);
    if (assignedIds.length) {
      let overlapQuery = supabase.from("tariff_headers").select("id,code,version").eq("tenant_id", auth.tenantId).eq("status", "ACTIVE").in("id", assignedIds).lte("valid_from", validTo ?? "9999-12-31").or(`valid_to.is.null,valid_to.gte.${validFrom}`);
      overlapQuery = serviceId ? overlapQuery.eq("service_id", serviceId) : overlapQuery.is("service_id", null);
      const { data: overlaps, error: overlapError } = await overlapQuery;
      if (overlapError) throw overlapError;
      const conflicting = (overlaps ?? []).filter(item => item.id !== previous?.id);
      if (conflicting.length) return NextResponse.json({ error: `La vigencia se solapa con ${conflicting[0].code} v${conflicting[0].version}.` }, { status: 409 });
    }
  }
  const { data: tariff, error: tariffError } = await supabase.from("tariff_headers").insert({
    tenant_id: auth.tenantId, code, name, status: activate ? "ACTIVE" : "DRAFT", version,
    valid_from: validFrom, valid_to: validTo, currency: text(body?.currency).toUpperCase() || "EUR",
    priority: Number.isInteger(Number(body?.priority)) ? Number(body?.priority) : 100,
    service_id: serviceId, origin_country: text(body?.originCountry).toUpperCase() || null,
    destination_country: text(body?.destinationCountry).toUpperCase() || null,
    created_by: auth.userId, approved_by: activate ? auth.userId : null, approved_at: activate ? new Date().toISOString() : null,
  }).select("*").single();
  if (tariffError) throw tariffError;
  const [lineResult, assignmentResult] = await Promise.all([
    supabase.from("tariff_lines").insert({
      tenant_id: auth.tenantId, tariff_header_id: tariff.id, pricing_unit: pricingUnit,
      from_quantity: numericValue(body?.fromQuantity) ?? 0, to_quantity: numericValue(body?.toQuantity), unit_price: unitPrice,
      minimum_amount: numericValue(body?.minimumAmount), adr_surcharge: numericValue(body?.adrSurcharge),
      liftgate_surcharge: numericValue(body?.liftgateSurcharge), waiting_time_rate: numericValue(body?.waitingTimeRate),
      customs_fee: numericValue(body?.customsFee), fuel_surcharge_formula: text(body?.fuelSurchargeFormula) || null,
      discount_percent: numericValue(body?.discountPercent),
    }),
    supabase.from("tariff_assignments").insert({ tenant_id: auth.tenantId, tariff_header_id: tariff.id, party_id: customer.id, created_by: auth.userId }),
  ]);
  if (lineResult.error || assignmentResult.error) {
    await supabase.from("tariff_headers").delete().eq("id", tariff.id).eq("tenant_id", auth.tenantId);
    throw lineResult.error || assignmentResult.error;
  }
  if (activate && previous?.status === "ACTIVE") {
    await supabase.from("tariff_headers").update({ status: "INACTIVE", valid_to: dayBefore(validFrom), superseded_by_id: tariff.id, updated_at: new Date().toISOString() }).eq("tenant_id", auth.tenantId).eq("id", previous.id);
  }
  await supabase.from("audit_events").insert({ tenant_id: auth.tenantId, entity_type: "TARIFF", entity_id: tariff.id, action: activate ? "CREATE_AND_ACTIVATE" : "CREATE_DRAFT", actor_user_id: auth.userId, source_channel: "FORNEXA_WEB", changed_fields: ["header", "line", "assignment"], after_data: { customerCode, code, version } });
  return NextResponse.json({ item: tariff }, { status: 201 });
}
