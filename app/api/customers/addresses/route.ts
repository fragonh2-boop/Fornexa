import { NextResponse } from "next/server";
import { getAuthenticatedContext, getAuthenticatedOrReviewContext } from "@/lib/auth-context";
import { createSupabaseAdmin } from "@/lib/supabase-admin";
import { hasOperationalUse, normalizeCustomerAssignments } from "@/lib/address-master";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const EDIT_ROLES = new Set(["OWNER", "ADMIN", "OPERATOR"]);
const COUNTRY_PATTERN = /^[A-Z]{2}$/;

function text(value: unknown) {
  return String(value ?? "").trim();
}

async function findCustomer(supabase: ReturnType<typeof createSupabaseAdmin>, tenantId: string, customerCode: string) {
  const { data, error } = await supabase.from("parties")
    .select("id,code,trade_name,legal_name")
    .eq("tenant_id", tenantId)
    .eq("code", customerCode)
    .eq("is_customer", true)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function GET(request: Request) {
  const auth = await getAuthenticatedOrReviewContext();
  if (!auth) return NextResponse.json({ error: "No autorizado." }, { status: 401 });

  const customerCode = text(new URL(request.url).searchParams.get("customerCode")).toUpperCase();
  if (!customerCode) return NextResponse.json({ error: "Customer ID obligatorio." }, { status: 400 });

  const supabase = createSupabaseAdmin();
  const customer = await findCustomer(supabase, auth.tenantId, customerCode);
  if (!customer) return NextResponse.json({ error: "Cliente no encontrado." }, { status: 404 });

  const [customersResult, assignmentsResult] = await Promise.all([
    supabase.from("parties")
      .select("id,code,trade_name,legal_name")
      .eq("tenant_id", auth.tenantId)
      .eq("is_customer", true)
      .eq("status", "ACTIVE")
      .order("code"),
    supabase.from("party_address_assignments")
      .select(`
        party_id,use_for_pickup,use_for_delivery,is_default_pickup,is_default_delivery,
        address:party_addresses!party_address_assignments_address_id_fkey(
          id,code,name,address_line1,address_line2,postal_code,city,region,subdivision_key,country_code,
          contact_name,contact_phone,contact_email,instructions,is_active
        )
      `)
      .eq("tenant_id", auth.tenantId)
      .eq("party_id", customer.id),
  ]);

  if (customersResult.error || assignmentsResult.error) {
    console.error("Customer addresses GET", customersResult.error || assignmentsResult.error);
    return NextResponse.json({ error: "No se pudieron cargar las direcciones." }, { status: 500 });
  }

  const addresses = (assignmentsResult.data ?? []).map((assignment: any) => ({
    id: assignment.address.id,
    code: assignment.address.code,
    name: assignment.address.name ?? "",
    addressLine1: assignment.address.address_line1,
    addressLine2: assignment.address.address_line2 ?? "",
    postalCode: assignment.address.postal_code ?? "",
    city: assignment.address.city,
    region: assignment.address.region ?? "",
    subdivisionKey: assignment.address.subdivision_key ?? "",
    countryCode: String(assignment.address.country_code).trim(),
    contactName: assignment.address.contact_name ?? "",
    contactPhone: assignment.address.contact_phone ?? "",
    contactEmail: assignment.address.contact_email ?? "",
    instructions: assignment.address.instructions ?? "",
    isActive: assignment.address.is_active,
    useForPickup: assignment.use_for_pickup,
    useForDelivery: assignment.use_for_delivery,
    isDefaultPickup: assignment.is_default_pickup,
    isDefaultDelivery: assignment.is_default_delivery,
  }));

  const addressIds = addresses.map(item => item.id);
  let links: any[] = [];
  if (addressIds.length) {
    const linksResult = await supabase.from("party_address_assignments")
      .select("address_id,party_id")
      .eq("tenant_id", auth.tenantId)
      .in("address_id", addressIds);
    if (linksResult.error) return NextResponse.json({ error: "No se pudieron cargar las asociaciones." }, { status: 500 });
    links = linksResult.data ?? [];
  }

  const codeById = new Map((customersResult.data ?? []).map((item: any) => [item.id, item.code]));
  const assignedByAddress = new Map<string, string[]>();
  links.forEach(link => assignedByAddress.set(link.address_id, [...(assignedByAddress.get(link.address_id) ?? []), codeById.get(link.party_id)].filter(Boolean) as string[]));

  return NextResponse.json({
    item: { customerCode, addresses: addresses.map(address => ({ ...address, assignedCustomerCodes: assignedByAddress.get(address.id) ?? [customerCode] })) },
    customers: (customersResult.data ?? []).map((item: any) => ({ code: item.code, name: item.trade_name ?? item.legal_name ?? item.code })),
    canEdit: !auth.isReview && EDIT_ROLES.has(auth.role),
  }, { headers: { "Cache-Control": "no-store" } });
}

async function writeAddress(request: Request, method: "POST" | "PUT") {
  const auth = await getAuthenticatedContext();
  if (!auth) return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  if (!EDIT_ROLES.has(auth.role)) return NextResponse.json({ error: "No tienes permisos para modificar el maestro de direcciones." }, { status: 403 });

  let body: Record<string, unknown>;
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "JSON no válido." }, { status: 400 }); }

  const customerCode = text(body.customerCode).toUpperCase();
  const address = (body.address && typeof body.address === "object" ? body.address : {}) as Record<string, unknown>;
  const useForPickup = Boolean(address.useForPickup);
  const useForDelivery = Boolean(address.useForDelivery);
  const countryCode = text(address.countryCode).toUpperCase();
  if (!customerCode || !text(address.name) || text(address.addressLine1).length < 5 || !text(address.city) || !COUNTRY_PATTERN.test(countryCode)) {
    return NextResponse.json({ error: "Nombre, dirección, población y país son obligatorios." }, { status: 400 });
  }
  if (!hasOperationalUse(useForPickup, useForDelivery)) {
    return NextResponse.json({ error: "La dirección debe poder utilizarse para recogida, entrega o ambas." }, { status: 400 });
  }

  const supabase = createSupabaseAdmin();
  const customer = await findCustomer(supabase, auth.tenantId, customerCode);
  if (!customer) return NextResponse.json({ error: "Cliente no encontrado." }, { status: 404 });

  const assignedCodes = normalizeCustomerAssignments(customerCode, address.assignedCustomerCodes);
  const { data: assignedParties, error: assignedError } = await supabase.from("parties")
    .select("id,code")
    .eq("tenant_id", auth.tenantId)
    .eq("is_customer", true)
    .in("code", assignedCodes);
  if (assignedError) throw assignedError;
  if ((assignedParties ?? []).length !== assignedCodes.length) return NextResponse.json({ error: "Una de las empresas asignadas no es válida." }, { status: 400 });

  const addressId = text(body.addressId);
  let persisted: any;
  const values = {
    name: text(address.name),
    address_line1: text(address.addressLine1),
    address_line2: text(address.addressLine2) || null,
    postal_code: text(address.postalCode) || null,
    city: text(address.city),
    region: text(address.region) || null,
    subdivision_key: text(address.subdivisionKey) || null,
    country_code: countryCode,
    contact_name: text(address.contactName) || null,
    contact_phone: text(address.contactPhone) || null,
    contact_email: text(address.contactEmail) || null,
    instructions: text(address.instructions) || null,
    is_active: address.isActive !== false,
    address_type: "OPERATING",
    updated_at: new Date().toISOString(),
  };

  if (method === "POST") {
    const { data, error } = await supabase.from("party_addresses")
      .insert({ ...values, tenant_id: auth.tenantId, party_id: customer.id })
      .select("id,code")
      .single();
    if (error) throw error;
    persisted = data;
  } else {
    if (!addressId) return NextResponse.json({ error: "Dirección obligatoria." }, { status: 400 });
    const { data: allowed } = await supabase.from("party_address_assignments")
      .select("id")
      .eq("tenant_id", auth.tenantId)
      .eq("address_id", addressId)
      .eq("party_id", customer.id)
      .maybeSingle();
    if (!allowed) return NextResponse.json({ error: "La dirección no está asignada a este cliente." }, { status: 403 });
    const { data, error } = await supabase.from("party_addresses")
      .update(values)
      .eq("tenant_id", auth.tenantId)
      .eq("id", addressId)
      .select("id,code")
      .single();
    if (error) throw error;
    persisted = data;
  }

  const assignments = (assignedParties ?? []).map((party: any) => ({
    tenant_id: auth.tenantId,
    address_id: persisted.id,
    party_id: party.id,
    use_for_pickup: useForPickup,
    use_for_delivery: useForDelivery,
    is_default_pickup: party.id === customer.id && Boolean(address.isDefaultPickup),
    is_default_delivery: party.id === customer.id && Boolean(address.isDefaultDelivery),
    created_by: auth.userId,
    updated_at: new Date().toISOString(),
  }));
  const { error: upsertError } = await supabase.from("party_address_assignments")
    .upsert(assignments, { onConflict: "tenant_id,address_id,party_id" });
  if (upsertError) throw upsertError;

  const keepPartyIds = new Set((assignedParties ?? []).map((party: any) => party.id));
  const { data: currentLinks } = await supabase.from("party_address_assignments")
    .select("id,party_id")
    .eq("tenant_id", auth.tenantId)
    .eq("address_id", persisted.id);
  const removeIds = (currentLinks ?? []).filter((link: any) => !keepPartyIds.has(link.party_id)).map((link: any) => link.id);
  if (removeIds.length) await supabase.from("party_address_assignments").delete().in("id", removeIds);

  await supabase.from("audit_events").insert({
    tenant_id: auth.tenantId,
    entity_type: "party_address",
    entity_id: persisted.id,
    action: method === "POST" ? "CREATE" : "UPDATE",
    actor_user_id: auth.userId,
    source_channel: "FORNEXA_WEB",
    changed_fields: ["address", "subdivision", "customer_assignments", "operational_usage"],
    after_data: { customerCode, subdivisionKey: text(address.subdivisionKey) || null, assignedCustomerCodes: assignedCodes, useForPickup, useForDelivery },
  });

  return NextResponse.json({ item: { id: persisted.id, code: persisted.code } }, { status: method === "POST" ? 201 : 200 });
}

export async function POST(request: Request) {
  try { return await writeAddress(request, "POST"); }
  catch (error) { console.error("Customer addresses POST", error); return NextResponse.json({ error: "No se pudo crear la dirección." }, { status: 500 }); }
}

export async function PUT(request: Request) {
  try { return await writeAddress(request, "PUT"); }
  catch (error) { console.error("Customer addresses PUT", error); return NextResponse.json({ error: "No se pudo actualizar la dirección." }, { status: 500 }); }
}
