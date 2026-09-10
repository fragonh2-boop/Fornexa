import { NextResponse } from "next/server";
import { getAuthenticatedContext, getAuthenticatedOrReviewContext } from "@/lib/auth-context";
import { createSupabaseAdmin } from "@/lib/supabase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const EDIT_ROLES = new Set(["OWNER", "ADMIN"]);
const COUNTRY_PATTERN = /^[A-Z]{2}$/;

type FiscalAddressRow = {
  id: string;
  code: string | null;
  name: string | null;
  address_line1: string;
  address_line2: string | null;
  postal_code: string | null;
  city: string;
  region: string | null;
  country_code: string;
  updated_at: string;
};

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

function fiscalItem(address: FiscalAddressRow | null | undefined) {
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
      .select("id,code,name,address_line1,address_line2,postal_code,city,region,country_code,updated_at")
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
        fiscalAddress: fiscalItem((fiscalRows?.[0] ?? null) as FiscalAddressRow | null),
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
    const countryCode = text(address.countryCode).toUpperCase();

    if (!customerCode) return NextResponse.json({ error: "Customer ID obligatorio." }, { status: 400 });
    if (addressLine1.length < 5 || !city || !COUNTRY_PATTERN.test(countryCode)) {
      return NextResponse.json({ error: "Dirección, población y país son obligatorios para el domicilio fiscal." }, { status: 400 });
    }

    const supabase = createSupabaseAdmin();
    const customer = await findCustomer(supabase, auth.tenantId, customerCode);
    if (!customer) return NextResponse.json({ error: "Cliente no encontrado." }, { status: 404 });

    const { data, error } = await supabase.rpc("fornexa_upsert_canonical_fiscal_address", {
      p_tenant_id: auth.tenantId,
      p_party_id: customer.id,
      p_actor_user_id: auth.userId,
      p_name: text(address.name) || "Domicilio fiscal",
      p_address_line1: addressLine1,
      p_address_line2: addressLine2 || null,
      p_postal_code: postalCode || null,
      p_city: city,
      p_region: region || null,
      p_country_code: countryCode,
    }).single();

    if (error) {
      if (error.code === "23505" || error.code === "22023") {
        return NextResponse.json({ error: "El domicilio FISCAL canónico está en un estado incompatible o se modificó simultáneamente. Recarga la ficha antes de continuar." }, { status: 409 });
      }
      if (error.code === "23503") {
        return NextResponse.json({ error: "El cliente ya no está disponible en esta organización." }, { status: 409 });
      }
      throw error;
    }

    return NextResponse.json({ item: fiscalItem(data as FiscalAddressRow | null) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Customer fiscal address PUT", error);
    return NextResponse.json({ error: "No se pudo guardar el domicilio fiscal." }, { status: 500 });
  }
}
