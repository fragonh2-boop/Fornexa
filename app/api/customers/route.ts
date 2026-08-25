import { NextResponse } from "next/server";
import { getAuthenticatedContext } from "@/lib/auth-context";
import { createSupabaseAdmin } from "@/lib/supabase-admin";
import { fiscalRuleForCountry } from "@/lib/fiscal-id";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const EDIT_ROLES = new Set(["OWNER", "ADMIN", "OPERATOR"]);
const COUNTRY_PATTERN = /^[A-Z]{2}$/;
const CURRENCY_PATTERN = /^[A-Z]{3}$/;

function text(value: unknown) {
  return String(value ?? "").trim();
}

function relationFlags(value: string) {
  const relation = value.toLowerCase();
  return {
    is_customer: relation.includes("cliente"),
    is_supplier: relation.includes("proveedor"),
  };
}

async function writeCustomer(request: Request, method: "POST" | "PUT") {
  const auth = await getAuthenticatedContext();
  if (!auth) return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  if (!EDIT_ROLES.has(auth.role)) return NextResponse.json({ error: "No tienes permisos para modificar clientes." }, { status: 403 });

  let body: Record<string, unknown>;
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "JSON no válido." }, { status: 400 }); }

  const legalName = text(body.legalName);
  const tradeName = text(body.tradeName);
  const countryCode = text(body.countryCode).toUpperCase();
  const taxId = text(body.taxId).toUpperCase();
  const currency = text(body.currency || "EUR").toUpperCase();
  const language = text(body.language || "Español");
  const customerCode = text(body.customerCode).toUpperCase();
  const status = text(body.status || "Activo").toUpperCase() === "ACTIVO" ? "ACTIVE" : text(body.status || "ACTIVE").toUpperCase();
  const flags = relationFlags(text(body.partyType || "Cliente"));
  const fiscalRule = fiscalRuleForCountry(countryCode);

  const errors: string[] = [];
  if (legalName.length < 3) errors.push("Razón social: mínimo 3 caracteres.");
  if (tradeName.length < 2) errors.push("Nombre comercial: mínimo 2 caracteres.");
  if (!COUNTRY_PATTERN.test(countryCode)) errors.push("País fiscal: código ISO no válido.");
  if (!taxId || !fiscalRule.validate(taxId)) errors.push(`${fiscalRule.label}: ${fiscalRule.hint}.`);
  if (!CURRENCY_PATTERN.test(currency)) errors.push("Moneda: código ISO de 3 letras no válido.");
  if (!flags.is_customer && !flags.is_supplier) errors.push("Relación comercial: selecciona Cliente, Proveedor o ambos.");
  if (method === "PUT" && !customerCode) errors.push("Código de cliente obligatorio para actualizar.");
  if (errors.length) return NextResponse.json({ error: "Revisa los datos de la ficha.", errors }, { status: 400 });

  const metadata = {
    payment_method: text(body.paymentMethod),
    payment_terms: text(body.paymentTerms),
    credit_limit: text(body.creditLimit),
    rate: text(body.rate),
    billing_email: text(body.billingEmail),
    sales_email: text(body.salesEmail),
    account_manager: text(body.accountManager),
    notes: text(body.notes),
  };

  const values = {
    legal_name: legalName,
    trade_name: tradeName,
    tax_id: fiscalRule.normalize(taxId),
    country_code: countryCode,
    language: language.slice(0, 8).toLowerCase(),
    currency,
    ...flags,
    status,
    metadata,
    updated_at: new Date().toISOString(),
  };

  const supabase = createSupabaseAdmin();
  if (method === "POST") {
    const { data, error } = await supabase.from("parties")
      .insert({ ...values, tenant_id: auth.tenantId })
      .select("id,code,legal_name,trade_name,tax_id,country_code")
      .single();
    if (error) {
      console.error("Customer POST", error);
      return NextResponse.json({ error: error.code === "23505" ? "Ya existe una empresa con esos datos o código." : "No se pudo crear la empresa." }, { status: error.code === "23505" ? 409 : 500 });
    }
    await supabase.from("audit_events").insert({ tenant_id: auth.tenantId, entity_type: "party", entity_id: data.id, action: "CREATE", actor_user_id: auth.userId, source_channel: "FORNEXA_WEB", changed_fields: ["customer_master"], after_data: { code: data.code, countryCode, relation: flags } });
    return NextResponse.json({ item: data }, { status: 201 });
  }

  const { data, error } = await supabase.from("parties")
    .update(values)
    .eq("tenant_id", auth.tenantId)
    .eq("code", customerCode)
    .select("id,code,legal_name,trade_name,tax_id,country_code")
    .single();
  if (error) {
    console.error("Customer PUT", error);
    return NextResponse.json({ error: "No se pudo actualizar la empresa." }, { status: 500 });
  }
  await supabase.from("audit_events").insert({ tenant_id: auth.tenantId, entity_type: "party", entity_id: data.id, action: "UPDATE", actor_user_id: auth.userId, source_channel: "FORNEXA_WEB", changed_fields: ["customer_master"], after_data: { code: data.code, countryCode, relation: flags } });
  return NextResponse.json({ item: data });
}

export async function POST(request: Request) {
  return writeCustomer(request, "POST");
}

export async function PUT(request: Request) {
  return writeCustomer(request, "PUT");
}
