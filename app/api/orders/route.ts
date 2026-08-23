import { NextResponse } from "next/server";
import { getAuthenticatedContext, getAuthenticatedOrReviewContext } from "@/lib/auth-context";
import { createSupabaseAdmin } from "@/lib/supabase-admin";
import { evaluateAdrWarnings, shouldBlockForPolicy, type AdrDeclaration, type AdrFrequency, type AdrLineInput, type AdrPolicy, type HazardStatus } from "@/lib/adr";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const LEGACY_SERVICE_CODES: Record<string, string> = {
  "Grupaje": "GROUPAGE",
  "LTL": "LTL",
  "Carga completa": "FTL",
  "Paquetería": "PARCEL",
  "Directo": "DIRECT",
};

const STATUS_LABELS: Record<string, string> = {
  DRAFT: "Borrador",
  READY: "Preparada",
  PARTIALLY_PLANNED: "Parcialmente planificada",
  PLANNED: "Planificada",
  IN_TRANSIT: "En tránsito",
  COMPLETED: "Completada",
  CANCELLED: "Cancelada",
};

function text(value: unknown) {
  return String(value ?? "").trim();
}

function numberOrNull(value: unknown) {
  const raw = text(value).replace(",", ".");
  if (!raw) return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function integerOrNull(value: unknown) {
  const parsed = Number(text(value));
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : null;
}

function dateOrNull(value: unknown) {
  const raw = text(value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  return `${raw}T00:00:00.000Z`;
}

export async function GET() {
  const auth = await getAuthenticatedOrReviewContext();
  if (!auth) return NextResponse.json({ error: "No autorizado." }, { status: 401 });

  const tenantId = auth.tenantId;
  const supabase = createSupabaseAdmin();
  const { data, error } = await supabase
    .from("orders")
    .select(`
      id,code,customer_reference,packages,gross_weight,volume,linear_meters,goods_description,adr,status,created_at,
      customer:parties!orders_customer_id_fkey(code,trade_name,legal_name),
      pickup:party_addresses!orders_pickup_address_id_fkey(code,city,country_code),
      delivery:party_addresses!orders_delivery_address_id_fkey(code,city,country_code),
      service:service_catalog!orders_service_id_fkey(code,name),
      expeditions(id,code,status)
    `)
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Orders API GET error", error);
    return NextResponse.json({ error: "No se pudieron cargar las partidas." }, { status: 500 });
  }

  const items = (data ?? []).map((order: any) => ({
    id: order.code,
    customerCode: order.customer?.code ?? null,
    customer: order.customer?.trade_name ?? order.customer?.legal_name ?? null,
    reference: order.customer_reference,
    origin: order.pickup?.city ?? null,
    originCode: order.pickup?.code ?? null,
    destination: order.delivery?.city ?? null,
    destinationCode: order.delivery?.code ?? null,
    serviceCode: order.service?.code ?? null,
    service: order.service?.name ?? null,
    packages: order.packages,
    weight: order.gross_weight,
    volume: order.volume,
    linearMeters: order.linear_meters,
    adr: order.adr,
    status: STATUS_LABELS[order.status] ?? order.status,
    expeditionCode: order.expeditions?.[0]?.code ?? null,
    createdAt: order.created_at,
  }));

  return NextResponse.json({ items }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  const auth = await getAuthenticatedContext();
  if (!auth) return NextResponse.json({ error: "No autorizado." }, { status: 401 });

  const tenantId = auth.tenantId;
  const userId = auth.userId;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON no válido." }, { status: 400 });
  }

  const customerCode = text(body.customerCode).toUpperCase();
  const pickupAddressId = text(body.pickupAddressId);
  const deliveryAddressId = text(body.deliveryAddressId);
  const pickupCode = text(body.pickupCode).toUpperCase();
  const deliveryCode = text(body.deliveryCode).toUpperCase();
  const requestedServiceCode = text(body.serviceCode).toUpperCase() || LEGACY_SERVICE_CODES[text(body.service)] || "";
  const packages = integerOrNull(body.packages);
  const grossWeight = numberOrNull(body.grossWeight);

  if (!customerCode || packages === null || packages < 1 || grossWeight === null) {
    return NextResponse.json({ error: "Customer ID, bultos y peso son obligatorios." }, { status: 400 });
  }

  const supabase = createSupabaseAdmin();

  const { data: customer, error: customerError } = await supabase
    .from("parties")
    .select("id,code,adr_control")
    .eq("tenant_id", tenantId)
    .eq("code", customerCode)
    .eq("is_customer", true)
    .maybeSingle();

  if (customerError) throw customerError;
  if (!customer) return NextResponse.json({ error: "Customer ID no válido para este tenant." }, { status: 400 });
  const customerId = customer.id;

  async function resolveAddress(addressId: string, code: string, use: "pickup" | "delivery") {
    if (!addressId && !code) return null;
    let query = supabase
      .from("party_addresses")
      .select("id,code,party_id")
      .eq("tenant_id", tenantId)
      .eq("is_active", true);
    query = addressId ? query.eq("id", addressId) : query.eq("code", code);
    const { data, error } = await query.maybeSingle();
    if (error) throw error;
    if (!data) return null;
    const { data: assignment, error: assignmentError } = await supabase
      .from("party_address_assignments")
      .select("id")
      .eq("tenant_id", tenantId)
      .eq("address_id", data.id)
      .eq("party_id", customerId)
      .eq(use === "pickup" ? "use_for_pickup" : "use_for_delivery", true)
      .maybeSingle();
    if (assignmentError) throw assignmentError;
    if (!assignment) return null;
    return data;
  }

  const [pickup, delivery] = await Promise.all([
    resolveAddress(pickupAddressId, pickupCode, "pickup"),
    resolveAddress(deliveryAddressId, deliveryCode, "delivery"),
  ]);
  if ((pickupAddressId || pickupCode) && !pickup) return NextResponse.json({ error: "Punto de recogida no válido o no asignado a este cliente." }, { status: 400 });
  if ((deliveryAddressId || deliveryCode) && !delivery) return NextResponse.json({ error: "Punto de entrega no válido o no asignado a este cliente." }, { status: 400 });

  let serviceId: string | null = null;
  if (requestedServiceCode) {
    const { data: service, error: serviceError } = await supabase
      .from("service_catalog")
      .select("id")
      .eq("tenant_id", tenantId)
      .eq("code", requestedServiceCode)
      .maybeSingle();
    if (serviceError) throw serviceError;
    if (!service) return NextResponse.json({ error: "Servicio no válido para este tenant." }, { status: 400 });
    serviceId = service.id;
  }

  const { data: adrProfile } = await supabase.from("party_adr_profiles")
    .select("frequency,validation_policy")
    .eq("tenant_id", tenantId).eq("party_id", customer.id).maybeSingle();
  const frequency = (adrProfile?.frequency ?? (customer.adr_control ? "SOMETIMES" : "NEVER")) as AdrFrequency;
  const validationPolicy = (adrProfile?.validation_policy ?? "WARNING") as AdrPolicy;
  const legacyAdr = text(body.adr).toUpperCase();
  const requestedDeclaration = text(body.adrDeclaration).toUpperCase();
  const adrDeclaration = (["UNANSWERED", "NO", "YES"].includes(requestedDeclaration)
    ? requestedDeclaration
    : legacyAdr === "S" ? "YES" : legacyAdr === "N" ? "NO" : "UNANSWERED") as AdrDeclaration;

  const rawLines = Array.isArray(body.lines) ? body.lines as Record<string, unknown>[] : [];
  const inputLines: AdrLineInput[] = (rawLines.length ? rawLines : [{
    description: body.goodsDescription,
    hazardStatus: adrDeclaration === "YES" ? "UNKNOWN" : "NON_HAZARDOUS",
    packageCount: body.packages,
  }]).map(line => ({
    sku: text(line.sku).toUpperCase() || undefined,
    description: text(line.description) || text(body.goodsDescription) || "Mercancía sin descripción",
    hazardStatus: (["UNKNOWN", "NON_HAZARDOUS", "HAZMAT"].includes(text(line.hazardStatus).toUpperCase())
      ? text(line.hazardStatus).toUpperCase()
      : adrDeclaration === "YES" ? "UNKNOWN" : "NON_HAZARDOUS") as HazardStatus,
    hazmatEntryId: text(line.hazmatEntryId) || undefined,
    technicalName: text(line.technicalName) || undefined,
    netQuantity: numberOrNull(line.netQuantity),
    quantityUom: text(line.quantityUom) || undefined,
    packageCount: integerOrNull(line.packageCount),
    packagingTypeId: text(line.packagingTypeId) || undefined,
    rememberForProduct: Boolean(line.rememberForProduct),
  }));
  const adrWarnings = evaluateAdrWarnings(adrDeclaration, frequency, inputLines);
  if (shouldBlockForPolicy(validationPolicy, adrWarnings)) {
    return NextResponse.json({ error: `La política ADR del cliente bloquea la confirmación: ${adrWarnings[0]?.message}` }, { status: 400 });
  }

  const entryIds = [...new Set(inputLines.map(line => line.hazmatEntryId).filter(Boolean))] as string[];
  const { data: entries, error: entriesError } = entryIds.length ? await supabase.from("hazmat_entries").select(`
    id,edition_id,un_number,proper_shipping_name_es,technical_name_required,class_code,
    subsidiary_risks,label_codes,packing_group,hazard_identification_number,
    tunnel_restriction_code,transport_category,environmentally_hazardous,
    edition:hazmat_editions!inner(code,status)
  `).in("id", entryIds).eq("edition.status", "ACTIVE") : { data: [], error: null };
  if (entriesError) return NextResponse.json({ error: "No se pudo validar el maestro ADR." }, { status: 500 });
  const entryById = new Map((entries ?? []).map((entry: any) => [entry.id, entry]));
  inputLines.forEach((line, index) => {
    if (line.hazmatEntryId && !entryById.has(line.hazmatEntryId)) adrWarnings.push({ code: "ADR_MASTER_ENTRY_NOT_ACTIVE", line: index + 1, message: `La clasificación de la línea ${index + 1} no pertenece a una edición ADR activa.` });
    const entry = line.hazmatEntryId ? entryById.get(line.hazmatEntryId) : null;
    if (entry?.technical_name_required && !line.technicalName) adrWarnings.push({ code: "ADR_TECHNICAL_NAME_MISSING", line: index + 1, message: `La línea ${index + 1} requiere nombre técnico para su entrada N.E.P.` });
  });

  const activeEdition = (entries ?? [])[0]?.edition_id ?? null;
  const adr = { declared: adrDeclaration === "YES", declaration: adrDeclaration, warningCount: adrWarnings.length, warnings: adrWarnings };

  const insert = {
    tenant_id: tenantId,
    customer_id: customer.id,
    customer_reference: text(body.customerReference) || null,
    service_id: serviceId,
    pickup_address_id: pickup?.id ?? null,
    delivery_address_id: delivery?.id ?? null,
    requested_pickup_start: dateOrNull(body.requestedDate),
    packages,
    gross_weight: grossWeight,
    volume: numberOrNull(body.volume),
    linear_meters: numberOrNull(body.linearMeters),
    goods_description: text(body.goodsDescription) || null,
    adr,
    hazmat_declaration: adrDeclaration,
    hazmat_edition_id: activeEdition,
    hazmat_validation_status: adrWarnings.length ? (validationPolicy === "ACKNOWLEDGEMENT" ? "ACKNOWLEDGED" : "WARNING") : "VALIDATED",
    status: "READY",
    metadata: {
      source: "web_partida_form",
      actorUserId: userId,
      pickup: {
        code: pickupCode || null,
        address: text(body.pickupAddress) || null,
        country: text(body.pickupCountry).toUpperCase() || null,
        postalCode: text(body.pickupPostalCode) || null,
        zone: text(body.pickupZone) || null,
        shipper: text(body.shipper) || null,
      },
      delivery: {
        code: deliveryCode || null,
        address: text(body.deliveryAddress) || null,
        country: text(body.deliveryCountry).toUpperCase() || null,
        postalCode: text(body.deliveryPostalCode) || null,
        zone: text(body.deliveryZone) || null,
        consignee: text(body.consignee) || null,
      },
    },
  };

  const { data: order, error: insertError } = await supabase
    .from("orders")
    .insert(insert)
    .select("id,code,status,created_at,business_id,revision_number")
    .single();

  if (insertError) {
    console.error("Orders API POST error", insertError);
    return NextResponse.json({ error: "No se pudo guardar la partida." }, { status: 500 });
  }

  try {
    for (const [index, line] of inputLines.entries()) {
      const entry: any = line.hazmatEntryId ? entryById.get(line.hazmatEntryId) : null;
      let productId: string | null = null;
      if (line.sku) {
        const { data: existingProduct } = await supabase.from("products").select("id,hazard_status")
          .eq("tenant_id", tenantId).eq("customer_id", customer.id).eq("sku", line.sku).maybeSingle();
        if (existingProduct) productId = existingProduct.id;
        else if (line.rememberForProduct) {
          const { data: product, error: productError } = await supabase.from("products").insert({
            tenant_id: tenantId, customer_id: customer.id, sku: line.sku,
            name: line.description || line.sku, hazard_status: line.hazardStatus,
            metadata: { source: "order_creation", createdBy: userId },
          }).select("id").single();
          if (productError) throw productError;
          productId = product.id;
        }
      }

      const effectiveHazardStatus = adrDeclaration === "NO" && line.hazardStatus === "UNKNOWN" ? "NON_HAZARDOUS" : line.hazardStatus;
      const { data: orderLine, error: orderLineError } = await supabase.from("order_lines").insert({
        tenant_id: tenantId,
        order_id: order.id,
        line_number: index + 1,
        description: line.description || "Mercancía sin descripción",
        sku: line.sku || null,
        product_id: productId,
        packages: line.packageCount,
        hazard_status: effectiveHazardStatus,
        adr: entry ? { entryId: entry.id, unNumber: entry.un_number, edition: entry.edition?.code ?? null } : {},
      }).select("id").single();
      if (orderLineError) throw orderLineError;

      if (entry) {
        const { error: hazmatLineError } = await supabase.from("order_line_hazmat").insert({
          order_line_id: orderLine.id,
          tenant_id: tenantId,
          hazmat_entry_id: entry.id,
          edition_id: entry.edition_id,
          packaging_type_id: line.packagingTypeId || null,
          technical_name: line.technicalName || null,
          net_quantity: line.netQuantity,
          quantity_uom: line.quantityUom || null,
          package_count: line.packageCount,
          un_number: entry.un_number,
          proper_shipping_name: entry.proper_shipping_name_es,
          class_code: entry.class_code,
          subsidiary_risks: entry.subsidiary_risks,
          label_codes: entry.label_codes,
          packing_group: entry.packing_group,
          hazard_identification_number: entry.hazard_identification_number,
          tunnel_restriction_code: entry.tunnel_restriction_code,
          transport_category: entry.transport_category,
          environmentally_hazardous: entry.environmentally_hazardous,
          calculation_reasons: [{ code: "PENDING_RULE_IMPORT", message: "Pendiente de cálculo con reglas ADR verificadas." }],
          rule_version: entry.edition?.code ?? null,
        });
        if (hazmatLineError) throw hazmatLineError;

        if (productId && line.rememberForProduct) {
          await supabase.from("product_hazmat_assignments").update({ valid_to: new Date().toISOString(), status: "RETIRED" })
            .eq("tenant_id", tenantId).eq("product_id", productId).is("valid_to", null);
          const { error: assignmentError } = await supabase.from("product_hazmat_assignments").insert({
            tenant_id: tenantId, product_id: productId, hazmat_entry_id: entry.id, edition_id: entry.edition_id,
            status: "VERIFIED", remembered_from_order_line_id: orderLine.id, approved_at: new Date().toISOString(), approved_by: userId,
          });
          if (assignmentError) throw assignmentError;
          await supabase.from("products").update({ hazard_status: "HAZMAT", updated_at: new Date().toISOString() }).eq("id", productId).eq("tenant_id", tenantId);
        }
      }
    }

    const snapshot = { order: insert, lines: inputLines, adrWarnings };
    const { data: revision, error: revisionError } = await supabase.from("entity_revisions").insert({
      tenant_id: tenantId, entity_type: "ORDER", business_id: order.business_id, entity_id: order.id,
      revision_number: order.revision_number, lifecycle_status: "DRAFT", snapshot, created_by: userId,
    }).select("id").single();
    if (revisionError) throw revisionError;
    await supabase.from("order_hazmat_assessments").insert({
      tenant_id: tenantId, order_id: order.id, edition_id: activeEdition,
      status: adrWarnings.length ? (validationPolicy === "ACKNOWLEDGEMENT" ? "ACKNOWLEDGED" : "WARNING") : "VALIDATED",
      warnings: adrWarnings, assessed_by: userId,
    });
    await supabase.from("audit_events").insert({
      tenant_id: tenantId, entity_type: "ORDER", entity_id: order.id, business_id: order.business_id,
      revision_id: revision.id, action: "CREATE", actor_user_id: userId, source_channel: "FORNEXA_WEB",
      user_agent: request.headers.get("user-agent"), ip_address: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || null,
      changed_fields: Object.keys(insert), after_data: snapshot,
    });
  } catch (error) {
    console.error("Orders API line persistence error", error);
    await supabase.from("orders").delete().eq("id", order.id).eq("tenant_id", tenantId);
    return NextResponse.json({ error: "No se pudo guardar la clasificación por líneas; no se ha conservado un pedido parcial." }, { status: 500 });
  }

  return NextResponse.json({
    item: {
      id: order.code,
      uuid: order.id,
      status: STATUS_LABELS[order.status] ?? order.status,
      createdAt: order.created_at,
      adrWarnings: adrWarnings.length,
    },
  }, { status: 201, headers: { "Cache-Control": "no-store" } });
}
