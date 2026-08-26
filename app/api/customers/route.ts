import { NextResponse } from "next/server";
import { getAuthenticatedContext, getAuthenticatedOrReviewContext } from "@/lib/auth-context";
import { createSupabaseAdmin, numericValue } from "@/lib/supabase-admin";
import { fiscalRuleForCountry } from "@/lib/fiscal-id";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const EDIT_ROLES = new Set(["OWNER", "ADMIN", "OPERATOR"]);
const STATUSES = new Set(["DRAFT", "ACTIVE", "REVIEW", "BLOCKED", "INACTIVE"]);
const GENERIC_NAMES = new Set(["NUEVO", "NUEVA", "CLIENTE", "EMPRESA", "PRUEBA", "TEST"]);

function text(value: unknown) {
  return String(value ?? "").trim();
}

function upper(value: unknown) {
  return text(value).toUpperCase();
}

function integer(value: unknown) {
  const parsed = Number(typeof value === "string" ? value.match(/\d+/)?.[0] : value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : null;
}

function relationFlags(value: unknown, isCustomer: unknown, isSupplier: unknown) {
  if (text(value)) {
    const relation = text(value).toLowerCase();
    return { isCustomer: relation.includes("cliente"), isSupplier: relation.includes("proveedor") };
  }
  return { isCustomer: isCustomer !== false, isSupplier: Boolean(isSupplier) };
}

function relationLabel(isCustomer: boolean, isSupplier: boolean) {
  if (isCustomer && isSupplier) return "Cliente y proveedor";
  return isSupplier ? "Proveedor" : "Cliente";
}

function normalizedStatus(value: unknown) {
  const status = upper(value) || "DRAFT";
  if (status === "ACTIVO") return "ACTIVE";
  if (status === "INACTIVO") return "INACTIVE";
  if (status === "BLOQUEADO") return "BLOCKED";
  if (status === "EN REVISIÓN") return "REVIEW";
  return status;
}

async function findParty(supabase: ReturnType<typeof createSupabaseAdmin>, tenantId: string, code: string) {
  const { data, error } = await supabase.from("parties")
    .select("*")
    .eq("tenant_id", tenantId)
    .eq("code", code)
    .eq("is_customer", true)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function GET(request: Request) {
  const auth = await getAuthenticatedOrReviewContext();
  if (!auth) return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  const code = upper(new URL(request.url).searchParams.get("customerCode"));
  if (!code) return NextResponse.json({ error: "Customer ID obligatorio." }, { status: 400 });

  const supabase = createSupabaseAdmin();
  const party = await findParty(supabase, auth.tenantId, code);
  if (!party) return NextResponse.json({ error: "Cliente no encontrado." }, { status: 404 });

  const [billingResult, blocksResult] = await Promise.all([
    supabase.from("customer_billing_profiles").select("*").eq("tenant_id", auth.tenantId).eq("party_id", party.id).maybeSingle(),
    supabase.from("customer_blocks").select("id,block_type,behavior,reason,blocked_at").eq("tenant_id", auth.tenantId).eq("party_id", party.id).is("released_at", null).order("blocked_at", { ascending: false }),
  ]);
  if (billingResult.error || blocksResult.error) {
    console.error("Customers GET", billingResult.error || blocksResult.error);
    return NextResponse.json({ error: "No se pudo cargar la ficha del cliente." }, { status: 500 });
  }

  return NextResponse.json({
    item: {
      id: party.id,
      code: party.code,
      legalName: party.legal_name,
      tradeName: party.trade_name ?? "",
      taxId: party.tax_id ?? "",
      countryCode: String(party.country_code).trim(),
      language: party.language,
      currency: String(party.currency).trim(),
      isCustomer: party.is_customer,
      isSupplier: party.is_supplier,
      partyType: relationLabel(Boolean(party.is_customer), Boolean(party.is_supplier)),
      status: party.status,
      eori: party.eori ?? "",
      gln: party.gln ?? "",
      cnaeCode: party.cnae_code ?? "",
      commercialRegister: party.commercial_register ?? "",
      businessGroupPartyId: party.business_group_party_id,
      billingPartyId: party.billing_party_id,
      accountManagerUserId: party.account_manager_user_id,
      notes: party.metadata?.notes ?? "",
      metadata: {
        ...(party.metadata ?? {}),
        payment_method: billingResult.data?.payment_method ?? party.metadata?.payment_method ?? "",
        payment_terms: billingResult.data?.payment_terms_days ?? party.metadata?.payment_terms ?? "",
        credit_limit: billingResult.data?.credit_limit ?? party.metadata?.credit_limit ?? "",
        billing_email: billingResult.data?.billing_email ?? party.metadata?.billing_email ?? "",
        sales_email: billingResult.data?.sales_email ?? party.metadata?.sales_email ?? "",
      },
      billing: billingResult.data ? {
        paymentMethod: billingResult.data.payment_method ?? "",
        paymentTermsDays: billingResult.data.payment_terms_days,
        creditLimit: billingResult.data.credit_limit,
        creditInsurance: billingResult.data.credit_insurance,
        invoiceGrouping: billingResult.data.invoice_grouping ?? "",
        requiresOrderReference: billingResult.data.requires_order_reference,
        taxRegime: billingResult.data.tax_regime ?? "",
        invoiceChannel: billingResult.data.invoice_channel ?? "",
        billingEmail: billingResult.data.billing_email ?? "",
        salesEmail: billingResult.data.sales_email ?? "",
      } : null,
      activeBlocks: blocksResult.data ?? [],
    },
    canEdit: !auth.isReview && EDIT_ROLES.has(auth.role),
  }, { headers: { "Cache-Control": "no-store" } });
}

async function writeCustomer(request: Request, method: "POST" | "PUT") {
  const auth = await getAuthenticatedContext();
  if (!auth) return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  if (!EDIT_ROLES.has(auth.role)) return NextResponse.json({ error: "No tienes permisos para modificar clientes." }, { status: 403 });

  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "JSON no válido." }, { status: 400 });
  const legalName = text(body.legalName);
  const tradeName = text(body.tradeName);
  const countryCode = upper(body.countryCode);
  const status = normalizedStatus(body.status);
  const fiscalRule = fiscalRuleForCountry(countryCode);
  const taxId = upper(body.taxId);
  const flags = relationFlags(body.partyType, body.isCustomer, body.isSupplier);
  const errors: string[] = [];
  if (legalName.length < 3) errors.push("Razón social: mínimo 3 caracteres.");
  if (tradeName.length < 2) errors.push("Nombre comercial: mínimo 2 caracteres.");
  if (!/^[A-Z]{2}$/.test(countryCode)) errors.push("País fiscal: código ISO no válido.");
  if (!taxId || !fiscalRule.validate(taxId)) errors.push(`${fiscalRule.label}: ${fiscalRule.hint}.`);
  if (!STATUSES.has(status)) errors.push("Estado de cliente no válido.");
  if (!flags.isCustomer && !flags.isSupplier) errors.push("Selecciona una relación comercial.");
  if (errors.length) {
    return NextResponse.json({ error: "Revisa los datos de la ficha.", errors }, { status: 400 });
  }
  if ((GENERIC_NAMES.has(upper(legalName)) || GENERIC_NAMES.has(upper(tradeName))) && body.confirmGenericName !== true) {
    return NextResponse.json({ error: "El nombre parece genérico o de prueba. Confirma expresamente para guardarlo." }, { status: 409 });
  }

  const code = upper(body.customerCode);
  const supabase = createSupabaseAdmin();
  const before = method === "PUT" ? await findParty(supabase, auth.tenantId, code) : null;
  if (method === "PUT" && !before) return NextResponse.json({ error: "Cliente no encontrado." }, { status: 404 });

  const partyValues = {
    legal_name: legalName,
    trade_name: tradeName,
    tax_id: fiscalRule.normalize(taxId),
    country_code: countryCode,
    language: text(body.language) || "es",
    currency: upper(body.currency) || "EUR",
    is_customer: flags.isCustomer,
    is_supplier: flags.isSupplier,
    status,
    eori: upper(body.eori) || null,
    gln: text(body.gln) || null,
    cnae_code: text(body.cnaeCode) || null,
    commercial_register: text(body.commercialRegister) || null,
    business_group_party_id: text(body.businessGroupPartyId) || null,
    billing_party_id: text(body.billingPartyId) || null,
    account_manager_user_id: text(body.accountManagerUserId) || null,
    metadata: {
      ...(before?.metadata ?? {}),
      rate: text(body.rate) || before?.metadata?.rate || null,
      account_manager: text(body.accountManager) || before?.metadata?.account_manager || null,
      notes: text(body.notes) || null,
    },
    updated_at: new Date().toISOString(),
  };

  let party: Record<string, any>;
  if (method === "POST") {
    const result = await supabase.from("parties").insert({ ...partyValues, tenant_id: auth.tenantId }).select("*").single();
    if (result.error) throw result.error;
    party = result.data;
  } else {
    const result = await supabase.from("parties").update(partyValues).eq("tenant_id", auth.tenantId).eq("id", before.id).select("*").single();
    if (result.error) throw result.error;
    party = result.data;
  }

  const nestedBilling = body.billing && typeof body.billing === "object" ? body.billing as Record<string, unknown> : {};
  const billing: Record<string, unknown> = {
    ...nestedBilling,
    paymentMethod: nestedBilling.paymentMethod ?? body.paymentMethod,
    paymentTermsDays: nestedBilling.paymentTermsDays ?? body.paymentTerms,
    creditLimit: nestedBilling.creditLimit ?? body.creditLimit,
    billingEmail: nestedBilling.billingEmail ?? body.billingEmail,
    salesEmail: nestedBilling.salesEmail ?? body.salesEmail,
  };
  const billingValues = {
    party_id: party.id,
    tenant_id: auth.tenantId,
    payment_method: text(billing.paymentMethod) || null,
    payment_terms_days: integer(billing.paymentTermsDays),
    credit_limit: numericValue(text(billing.creditLimit).replace(/[^0-9,.-]/g, "")),
    credit_insurance: Boolean(billing.creditInsurance),
    invoice_grouping: text(billing.invoiceGrouping) || null,
    requires_order_reference: Boolean(billing.requiresOrderReference),
    tax_regime: text(billing.taxRegime) || null,
    invoice_channel: text(billing.invoiceChannel) || null,
    billing_email: text(billing.billingEmail) || null,
    sales_email: text(billing.salesEmail) || null,
    updated_at: new Date().toISOString(),
  };
  const billingResult = await supabase.from("customer_billing_profiles").upsert(billingValues, { onConflict: "party_id" });
  if (billingResult.error) throw billingResult.error;

  await supabase.from("audit_events").insert({
    tenant_id: auth.tenantId,
    entity_type: "PARTY",
    entity_id: party.id,
    action: method === "POST" ? "CREATE" : "UPDATE",
    actor_user_id: auth.userId,
    source_channel: "FORNEXA_WEB",
    changed_fields: ["identity", "billing_profile", "status"],
    before_data: before,
    after_data: { party: partyValues, billing: billingValues },
  });

  return NextResponse.json({ item: { id: party.id, code: party.code, status: party.status } }, { status: method === "POST" ? 201 : 200 });
}

export async function POST(request: Request) {
  try { return await writeCustomer(request, "POST"); }
  catch (error) { console.error("Customers POST", error); return NextResponse.json({ error: "No se pudo crear el cliente." }, { status: 500 }); }
}

export async function PUT(request: Request) {
  try { return await writeCustomer(request, "PUT"); }
  catch (error) { console.error("Customers PUT", error); return NextResponse.json({ error: "No se pudo actualizar el cliente." }, { status: 500 }); }
}
