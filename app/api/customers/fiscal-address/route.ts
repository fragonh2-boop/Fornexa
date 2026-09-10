import { NextResponse } from "next/server";
import { getAuthenticatedContext, getAuthenticatedOrReviewContext } from "@/lib/auth-context";
import { createSupabaseAdmin } from "@/lib/supabase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const EDIT_ROLES = new Set(["OWNER", "ADMIN", "OPERATOR"]);
const COUNTRY_PATTERN = /^[A-Z]{2}$/;
const FISCAL_CODE = "FISCAL";

function text(value: unknown) {
  return String(value ?? "").trim();
}

async function findCustomer(supabase: ReturnType<typeof createSupabaseAdmin>, tenantId: string, customerCode: string) {
  const { data, error } = await supabase.from("parties")
    .select("id,code,legal_name,trade_name,country_code")
    .eq("tenant_id", tenantId)
    .eq("code", customerCode)
    .eq("is_customer", true)
    .maybeSingle();
  if (error) throw error;
  return data;
}

function fiscalItem(address: any) {
  if (!address) return null;
  return {
    id: address.id,
    code: address.code,
    name: address.name ?? "Domicilio fiscal",
    addressLine1: address.address_line1,
    addressLine2: address.address_line2 ?? "",
    postalCode: address.postal_code ?? "",
    city: address.city,
    region: address.region ?? "",
    subdivisionKey: address.subdivision_key ?? "",
    countryCode: String(address.country_code).trim(),
    updatedAt: address.updated_at,
  };
}

export async function GET(request: Request) {
  try {
    const auth = await getAuthenticatedOrReviewContext();
    if (!auth) return NextResponse.json({ error: "No autorizado." }, { status: 401 });

    const customerCode = text(new URL(request.url).searchParams.get("customerCode")).toUpperCase();
    if (!customerCode) return NextResponse.json({ error: "Customer ID obligatorio." }, { status: 400 });

    const supabase = createSupabaseAdmin();
    const customer = await findCustomer(supabase, auth.tenantId, customerCode);
    if (!customer) return NextResponse.json({ error: "Cliente no encontrado." }, { status: 404 });

    const { data: fiscalRows, error } = await supabase.from("party_addresses")
      .select("id,code,name,address_line1,address_line2,postal_code,city,region,subdivision_key,country_code,updated_at")
      .eq("tenant_id", auth.tenantId)
      .eq("party_id", customer.id)
      .eq("address_type", "FISCAL")
      .eq("is_active", true)
      .order("updated_at", { ascending: false })
      .limit(2);
    if (error) throw error;
    if ((fiscalRows ?? []).length > 1) {
      return NextResponse.json({ error: "La empresa tiene más de un domicilio FISCAL activo. Requiere reconciliación antes de emitir documentos regulatorios." }, { status: 409 });
    }

    return NextResponse.json({
      item: {
        customerCode,
        customerName: customer.trade_name ?? customer.legal_name ?? customerCode,
        defaultCountryCode: String(customer.country_code ?? "ES").trim(),
        fiscalAddress: fiscalItem(fiscalRows?.[0]),
      },
      canEdit: !auth.isReview && EDIT_ROLES.has(auth.role.toUpperCase()),
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Customer fiscal address GET", error);
    return NextResponse.json({ error: "No se pudo cargar el domicilio fiscal." }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const auth = await getAuthenticatedContext();
    if (!auth) return NextResponse.json({ error: "No autorizado." }, { status: 401 });
    if (!EDIT_ROLES.has(auth.role.toUpperCase())) {
      return NextResponse.json({ error: "No tienes permisos para modificar el domicilio fiscal." }, { status: 403 });
    }

    let body: Record<string, unknown>;
    try { body = await request.json(); }
    catch { return NextResponse.json({ error: "JSON no válido." }, { status: 400 }); }

    const customerCode = text(body.customerCode).toUpperCase();
    const address = (body.address && typeof body.address === "object" ? body.address : {}) as Record<string, unknown>;
    const addressLine1 = text(address.addressLine1);
    const addressLine2 = text(address.addressLine2);
    const postalCode = text(address.postalCode);
    const city = text(address.city);
    const region = text(address.region);
    const subdivisionKey = text(address.subdivisionKey);
    const countryCode = text(address.countryCode).toUpperCase();

    if (!customerCode) return NextResponse.json({ error: "Customer ID obligatorio." }, { status: 400 });
    if (addressLine1.length < 5 || !city || !COUNTRY_PATTERN.test(countryCode)) {
      return NextResponse.json({ error: "Dirección, población y país son obligatorios para el domicilio fiscal." }, { status: 400 });
    }

    const supabase = createSupabaseAdmin();
    const customer = await findCustomer(supabase, auth.tenantId, customerCode);
    if (!customer) return NextResponse.json({ error: "Cliente no encontrado." }, { status: 404 });

    const { data: existingFiscal, error: existingError } = await supabase.from("party_addresses")
      .select("id,code")
      .eq("tenant_id", auth.tenantId)
      .eq("party_id", customer.id)
      .eq("address_type", "FISCAL")
      .limit(2);
    if (existingError) throw existingError;
    if ((existingFiscal ?? []).length > 1) {
      return NextResponse.json({ error: "La empresa tiene más de un domicilio FISCAL. Requiere reconciliación antes de guardar." }, { status: 409 });
    }

    const { data: reservedCodeRow, error: reservedError } = await supabase.from("party_addresses")
      .select("id,address_type")
      .eq("tenant_id", auth.tenantId)
      .eq("party_id", customer.id)
      .eq("code", FISCAL_CODE)
      .maybeSingle();
    if (reservedError) throw reservedError;
    if (reservedCodeRow && reservedCodeRow.address_type !== "FISCAL") {
      return NextResponse.json({ error: "El código canónico FISCAL está ocupado por una dirección no fiscal." }, { status: 409 });
    }

    const values = {
      tenant_id: auth.tenantId,
      party_id: customer.id,
      code: FISCAL_CODE,
      address_type: "FISCAL",
      name: text(address.name) || "Domicilio fiscal",
      address_line1: addressLine1,
      address_line2: addressLine2 || null,
      postal_code: postalCode || null,
      city,
      region: region || null,
      subdivision_key: subdivisionKey || null,
      country_code: countryCode,
      is_active: true,
      updated_at: new Date().toISOString(),
    };

    let persisted: any;
    const current = existingFiscal?.[0];
    if (current && current.code !== FISCAL_CODE) {
      const { data, error } = await supabase.from("party_addresses")
        .update(values)
        .eq("tenant_id", auth.tenantId)
        .eq("party_id", customer.id)
        .eq("id", current.id)
        .select("id,code,name,address_line1,address_line2,postal_code,city,region,subdivision_key,country_code,updated_at")
        .single();
      if (error) throw error;
      persisted = data;
    } else {
      const { data, error } = await supabase.from("party_addresses")
        .upsert(values, { onConflict: "tenant_id,party_id,code" })
        .select("id,code,name,address_line1,address_line2,postal_code,city,region,subdivision_key,country_code,updated_at")
        .single();
      if (error) throw error;
      persisted = data;
    }

    await supabase.from("audit_events").insert({
      tenant_id: auth.tenantId,
      entity_type: "party_address",
      entity_id: persisted.id,
      action: current ? "UPDATE_FISCAL" : "CREATE_FISCAL",
      actor_user_id: auth.userId,
      source_channel: "FORNEXA_WEB",
      changed_fields: ["fiscal_domicile"],
      after_data: { customerCode, addressType: "FISCAL", code: FISCAL_CODE, countryCode },
    });

    return NextResponse.json({ item: fiscalItem(persisted) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Customer fiscal address PUT", error);
    return NextResponse.json({ error: "No se pudo guardar el domicilio fiscal." }, { status: 500 });
  }
}
