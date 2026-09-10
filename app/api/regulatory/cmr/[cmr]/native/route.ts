import { getAuthenticatedContext } from "@/lib/auth-context";
import { generateDeCANativePdf, type DeCAGoodsLine } from "@/lib/deca-pdf";
import {
  generateRegulatoryObjectNonce,
  generateRegulatoryPublicToken,
  REGULATORY_DOCUMENT_BUCKET,
  REGULATORY_PDF_MAX_BYTES,
  regulatoryArtifactStoragePath,
  regulatoryPublicUrl,
  sha256Hex,
} from "@/lib/regulatory-documents";
import { decaMinimumPublicUntilMs } from "@/lib/regulatory-lifecycle";
import { createSupabaseAdmin } from "@/lib/supabase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const noStore = { "Cache-Control": "private, no-cache, no-store, max-age=0, must-revalidate" };
const issuerRoles = new Set(["OWNER", "ADMIN"]);
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type IssuanceRow = {
  artifact_id: string;
  access_id: string;
  artifact_issued_at: string;
};

function errorResponse(message: string, status: number) {
  return Response.json({ error: message }, { status, headers: noStore });
}

function requiredUuid(body: Record<string, unknown>, field: string) {
  const value = body[field];
  return typeof value === "string" && uuidPattern.test(value.trim()) ? value.trim() : null;
}

function parseIso(value: unknown) {
  if (typeof value !== "string" || !value.trim()) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
}

function parseDateOnly(value: unknown) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const parsed = Date.parse(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed) && new Date(parsed).toISOString().slice(0, 10) === value ? value : null;
}

function optionalText(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function domicile(address: {
  address_line1: string | null;
  address_line2: string | null;
  postal_code: string | null;
  city: string | null;
  region: string | null;
  country_code: string | null;
}) {
  return [
    address.address_line1,
    address.address_line2,
    [address.postal_code, address.city].filter(Boolean).join(" "),
    address.region,
    address.country_code,
  ].filter((value): value is string => Boolean(value?.trim())).join(", ");
}

export async function POST(request: Request, context: { params: Promise<{ cmr: string }> }) {
  const authenticated = await getAuthenticatedContext();
  if (!authenticated) return errorResponse("Acceso interno no válido.", 401);
  if (!issuerRoles.has(authenticated.role.toUpperCase())) return errorResponse("Permisos insuficientes.", 403);

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return errorResponse("JSON no válido.", 400);
  }
  const body = (payload ?? {}) as Record<string, unknown>;

  const contractualShipperPartyId = requiredUuid(body, "contractual_shipper_party_id");
  const contractualShipperAddressId = requiredUuid(body, "contractual_shipper_address_id");
  const effectiveCarrierPartyId = requiredUuid(body, "effective_carrier_party_id");
  const transportDate = parseDateOnly(body.transport_date);
  const publicUntil = parseIso(body.public_until);
  const serviceCompletedAt = body.service_completed_at == null ? null : parseIso(body.service_completed_at);
  const articulatedVehicle = body.articulated_vehicle;
  const specialAuthorizationRequired = body.special_circulation_authorization_required;

  if (!contractualShipperPartyId) return errorResponse("contractual_shipper_party_id es obligatorio.", 400);
  if (!contractualShipperAddressId) return errorResponse("contractual_shipper_address_id es obligatorio.", 400);
  if (!effectiveCarrierPartyId) return errorResponse("effective_carrier_party_id es obligatorio.", 400);
  if (!transportDate) return errorResponse("transport_date es obligatorio en formato YYYY-MM-DD.", 400);
  if (typeof articulatedVehicle !== "boolean") {
    return errorResponse("articulated_vehicle debe indicarse explícitamente.", 400);
  }
  if (typeof specialAuthorizationRequired !== "boolean") {
    return errorResponse("special_circulation_authorization_required debe indicarse explícitamente.", 400);
  }
  if (!publicUntil) return errorResponse("public_until es obligatorio y debe ser una fecha ISO válida.", 400);
  if (body.service_completed_at != null && !serviceCompletedAt) {
    return errorResponse("service_completed_at no es válido.", 400);
  }
  if (Date.parse(publicUntil) <= Date.now()) return errorResponse("public_until debe estar en el futuro.", 400);
  if (serviceCompletedAt) {
    const minimumPublicUntil = decaMinimumPublicUntilMs(serviceCompletedAt);
    if (minimumPublicUntil == null || Date.parse(publicUntil) < minimumPublicUntil) {
      return errorResponse("public_until debe cubrir al menos siete días naturales tras la finalización del servicio.", 400);
    }
  }

  const { cmr } = await context.params;
  let cmrNumber: string;
  try {
    cmrNumber = decodeURIComponent(cmr).trim().toUpperCase();
  } catch {
    return errorResponse("CMR no válido.", 400);
  }
  if (!cmrNumber) return errorResponse("CMR no válido.", 400);

  const admin = createSupabaseAdmin();
  const { data: document, error: documentError } = await admin
    .from("cmr_documents")
    .select("id,cmr_number,tenant_id,pickup_location,delivery_location,goods_description,packages,packaging,gross_weight,vehicle_registration,trailer_registration,trip_record_id")
    .eq("cmr_number", cmrNumber)
    .eq("tenant_id", authenticated.tenantId)
    .maybeSingle();
  if (documentError) throw documentError;
  if (!document) return errorResponse("CMR no disponible.", 404);

  const [shipperResult, shipperAddressResult, carrierResult, goodsResult, latestResult] = await Promise.all([
    admin.from("parties").select("id,legal_name,tax_id")
      .eq("id", contractualShipperPartyId).eq("tenant_id", authenticated.tenantId).maybeSingle(),
    admin.from("party_addresses")
      .select("id,party_id,address_type,address_line1,address_line2,postal_code,city,region,country_code")
      .eq("id", contractualShipperAddressId)
      .eq("tenant_id", authenticated.tenantId)
      .eq("party_id", contractualShipperPartyId)
      .eq("address_type", "FISCAL")
      .eq("is_active", true)
      .maybeSingle(),
    admin.from("parties").select("id,legal_name,tax_id")
      .eq("id", effectiveCarrierPartyId).eq("tenant_id", authenticated.tenantId).maybeSingle(),
    admin.from("cmr_goods_lines")
      .select("sequence,goods_description,packages,packaging_code,packaging_description,gross_weight")
      .eq("cmr_id", document.id).order("sequence", { ascending: true }),
    admin.from("regulatory_document_artifacts")
      .select("id,version,document_created_at")
      .eq("cmr_id", document.id)
      .eq("tenant_id", authenticated.tenantId)
      .eq("document_kind", "deca")
      .eq("regulatory_scope", "deca_es")
      .order("version", { ascending: false }).limit(1).maybeSingle(),
  ]);

  if (shipperResult.error) throw shipperResult.error;
  if (shipperAddressResult.error) throw shipperAddressResult.error;
  if (carrierResult.error) throw carrierResult.error;
  if (goodsResult.error) throw goodsResult.error;
  if (latestResult.error) throw latestResult.error;
  if (!shipperResult.data) return errorResponse("Cargador contractual no disponible en el tenant.", 400);
  if (!shipperAddressResult.data) {
    return errorResponse("El cargador contractual necesita un domicilio FISCAL canónico seleccionado.", 400);
  }
  if (!carrierResult.data) return errorResponse("Transportista efectivo no disponible en el tenant.", 400);

  let linkedTrip: { vehicle_id: string | null; trailer_registration: string | null } | null = null;
  let linkedVehicleRegistration: string | null = null;
  if (document.trip_record_id) {
    const { data: trip, error: tripError } = await admin.from("trips")
      .select("vehicle_id,trailer_registration")
      .eq("id", document.trip_record_id).eq("tenant_id", authenticated.tenantId).maybeSingle();
    if (tripError) throw tripError;
    linkedTrip = trip;
    if (trip?.vehicle_id) {
      const { data: vehicle, error: vehicleError } = await admin.from("vehicles")
        .select("registration").eq("id", trip.vehicle_id).eq("tenant_id", authenticated.tenantId).maybeSingle();
      if (vehicleError) throw vehicleError;
      linkedVehicleRegistration = vehicle?.registration ?? null;
    }
  }

  const tractorRegistration = optionalText(document.vehicle_registration) ?? linkedVehicleRegistration ?? "";
  const trailerRegistration = optionalText(document.trailer_registration) ?? optionalText(linkedTrip?.trailer_registration) ?? null;
  const grossWeightKg = Number(document.gross_weight);
  const nowIso = new Date().toISOString();
  const documentCreatedAt = latestResult.data?.document_created_at ?? nowIso;
  const version = (latestResult.data?.version ?? 0) + 1;
  const rawToken = generateRegulatoryPublicToken();
  const origin = new URL(request.url).origin;
  const publicUrl = regulatoryPublicUrl(origin, rawToken);
  const fiscalDomicile = domicile(shipperAddressResult.data);

  const goodsLines: DeCAGoodsLine[] = (goodsResult.data ?? []).map((line) => ({
    sequence: line.sequence,
    description: line.goods_description,
    packages: line.packages,
    packaging: line.packaging_description ?? line.packaging_code,
    grossWeightKg: line.gross_weight == null ? null : Number(line.gross_weight),
  }));

  let pdf: Uint8Array;
  try {
    pdf = generateDeCANativePdf({
      documentNumber: document.cmr_number,
      contractualShipper: {
        legalName: shipperResult.data.legal_name ?? "",
        taxId: shipperResult.data.tax_id ?? "",
        domicile: fiscalDomicile,
      },
      effectiveCarrier: {
        legalName: carrierResult.data.legal_name ?? "",
        taxId: carrierResult.data.tax_id ?? "",
      },
      origin: document.pickup_location ?? "",
      destination: document.delivery_location ?? "",
      goodsDescription: document.goods_description ?? "",
      grossWeightKg,
      packages: document.packages,
      packaging: document.packaging,
      goodsLines,
      transportDate,
      tractorRegistration,
      articulatedVehicle,
      trailerRegistration,
      specialCirculationAuthorizationRequired: specialAuthorizationRequired,
      specialCirculationAuthorization: optionalText(body.special_circulation_authorization),
      observations: optionalText(body.observations),
      publicUrl,
      createdAt: documentCreatedAt,
      modifiedAt: nowIso,
    });
  } catch (error) {
    return errorResponse(error instanceof Error ? error.message : "No se pudo generar el DeCA.", 422);
  }

  if (!pdf.byteLength || pdf.byteLength > REGULATORY_PDF_MAX_BYTES) {
    return errorResponse("El PDF DeCA nativo supera el límite regulatorio de 5 MB.", 422);
  }

  const objectNonce = generateRegulatoryObjectNonce();
  const storagePath = regulatoryArtifactStoragePath({
    tenantId: authenticated.tenantId,
    cmrId: document.id,
    documentKind: "deca",
    regulatoryScope: "deca_es",
    version,
    objectNonce,
  });
  const sha256 = sha256Hex(pdf);
  const tokenHash = sha256Hex(rawToken);
  const validFrom = nowIso;

  const { error: uploadError } = await admin.storage.from(REGULATORY_DOCUMENT_BUCKET).upload(storagePath, pdf, {
    contentType: "application/pdf",
    cacheControl: "0",
    upsert: false,
  });
  if (uploadError) throw uploadError;

  const metadata = {
    cmr_number: document.cmr_number,
    issuance_mode: "native_deca_pdf",
    regulatory_template: "deca_es_article_6_v1",
    m8_status: "not_decided",
    contractual_shipper_party_id: contractualShipperPartyId,
    contractual_shipper_address_id: contractualShipperAddressId,
    effective_carrier_party_id: effectiveCarrierPartyId,
    transport_date: transportDate,
    articulated_vehicle: articulatedVehicle,
    special_circulation_authorization_required: specialAuthorizationRequired,
    public_capability_storage: "sha256_only",
  };

  const { data: issuanceData, error: issuanceError } = await admin.rpc("fornexa_issue_deca_native_artifact", {
    p_tenant_id: authenticated.tenantId,
    p_cmr_id: document.id,
    p_version: version,
    p_storage_path: storagePath,
    p_sha256: sha256,
    p_byte_size: pdf.byteLength,
    p_document_created_at: documentCreatedAt,
    p_document_modified_at: nowIso,
    p_supersedes_artifact_id: latestResult.data?.id ?? null,
    p_metadata: metadata,
    p_token_hash: tokenHash,
    p_valid_from: validFrom,
    p_service_completed_at: serviceCompletedAt,
    p_public_until: publicUntil,
  }).single();

  if (issuanceError) {
    const { error: cleanupError } = await admin.storage.from(REGULATORY_DOCUMENT_BUCKET).remove([storagePath]);
    if (cleanupError) throw cleanupError;
    if (issuanceError.code === "23505") {
      return errorResponse("Otra versión DeCA se emitió simultáneamente; reintenta sobre el estado actualizado.", 409);
    }
    if (issuanceError.code === "22023") {
      return errorResponse("Los datos de emisión DeCA no superan las validaciones de integridad.", 400);
    }
    throw issuanceError;
  }

  const issuance = issuanceData as IssuanceRow | null;
  if (!issuance) {
    const { error: cleanupError } = await admin.storage.from(REGULATORY_DOCUMENT_BUCKET).remove([storagePath]);
    if (cleanupError) throw cleanupError;
    throw new Error("La emisión DeCA no devolvió trazabilidad de artefacto y capability.");
  }

  return Response.json({
    artifact: {
      id: issuance.artifact_id,
      version,
      sha256,
      byte_size: pdf.byteLength,
      issued_at: issuance.artifact_issued_at,
      document_created_at: documentCreatedAt,
      document_modified_at: nowIso,
    },
    access: {
      id: issuance.access_id,
      valid_from: validFrom,
      service_completed_at: serviceCompletedAt,
      public_until: publicUntil,
    },
    public_url: publicUrl,
    token: rawToken,
    token_notice: "El token se muestra una sola vez; FORNEXA solo persiste su SHA-256.",
  }, { status: 201, headers: noStore });
}
