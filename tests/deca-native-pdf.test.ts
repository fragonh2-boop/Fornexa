import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import fs from "node:fs";
import test from "node:test";
import {
  generateDeCANativePdf,
  validateDeCANativePdfInput,
  type DeCANativePdfInput,
} from "../lib/deca-pdf.ts";

const validInput: DeCANativePdfInput = {
  documentNumber: "DECA-E2E-001",
  contractualShipper: {
    legalName: "Fornexa Cargador, S.L.",
    taxId: "B12345678",
    domicile: "Avenida del Puerto 1, 46001 Valencia, ES",
  },
  effectiveCarrier: {
    legalName: "Fornexa Transporte, S.L.",
    taxId: "B87654321",
  },
  origin: "Valencia, España",
  destination: "Madrid, España",
  goodsDescription: "Componentes industriales",
  grossWeightKg: 2450.5,
  packages: 6,
  packaging: "Palet EUR",
  goodsLines: [
    {
      sequence: 1,
      description: "Componentes industriales",
      packages: 6,
      packaging: "Palet EUR",
      grossWeightKg: 2450.5,
    },
  ],
  transportDate: "2026-09-08",
  tractorRegistration: "1234 NXA",
  articulatedVehicle: true,
  trailerRegistration: "R-4321-NXA",
  specialCirculationAuthorizationRequired: false,
  specialCirculationAuthorization: null,
  observations: "Sin reservas.",
  publicUrl: "https://fornexasc.com/regulatory/d/abcdefghijklmnopqrstuvwxyzABCDEFGH123456789",
  createdAt: "2026-09-07T12:00:00.000Z",
  modifiedAt: "2026-09-07T12:30:00.000Z",
};

function assertPdfCrossReferenceIsConsistent(pdf: Uint8Array) {
  const bytes = Buffer.from(pdf);
  const source = bytes.toString("latin1");
  const startXrefMatch = source.match(/startxref\n(\d+)\n%%EOF\s*$/);
  assert.ok(startXrefMatch, "PDF must end with startxref and %%EOF");

  const xrefOffset = Number(startXrefMatch[1]);
  assert.equal(source.slice(xrefOffset, xrefOffset + 4), "xref", "startxref must point to xref");

  const xrefSection = source.slice(xrefOffset);
  const headerMatch = xrefSection.match(/^xref\n0 (\d+)\n/);
  assert.ok(headerMatch, "xref must declare object count");
  const declaredEntries = Number(headerMatch[1]);
  assert.ok(declaredEntries > 1);

  const xrefLines = xrefSection.split("\n").slice(2, 2 + declaredEntries);
  assert.equal(xrefLines[0], "0000000000 65535 f ");
  for (let objectId = 1; objectId < declaredEntries; objectId += 1) {
    const line = xrefLines[objectId];
    assert.match(line, /^\d{10} 00000 n $/);
    const objectOffset = Number(line.slice(0, 10));
    assert.equal(
      source.slice(objectOffset, objectOffset + `${objectId} 0 obj`.length),
      `${objectId} 0 obj`,
      `xref offset for object ${objectId} must point to its object header`,
    );
  }
}

test("native DeCA PDF is digital, bounded, metadata-stamped and contains vector QR content", () => {
  const pdf = generateDeCANativePdf(validInput);
  const source = Buffer.from(pdf).toString("latin1");
  const creationHex = Buffer.from("D:20260907120000Z", "latin1").toString("hex");
  const modificationHex = Buffer.from("D:20260907123000Z", "latin1").toString("hex");

  assert.ok(source.startsWith("%PDF-1.7"));
  assert.ok(source.includes("/BaseFont /Helvetica"));
  assert.ok(source.includes("/CreationDate <" + creationHex + ">"));
  assert.ok(source.includes("/ModDate <" + modificationHex + ">"));
  assert.ok(source.includes("<464f524e455841>"));
  assert.ok((source.match(/ re f/g) ?? []).length > 100, "QR must be drawn as native vector modules");
  assert.ok(pdf.byteLength > 1000);
  assert.ok(pdf.byteLength <= 5 * 1024 * 1024);
  assertPdfCrossReferenceIsConsistent(pdf);
});

test("native DeCA validation fails closed on mandatory article 6 data", () => {
  const missingCarrierTaxId = structuredClone(validInput);
  missingCarrierTaxId.effectiveCarrier.taxId = "";
  assert.ok(validateDeCANativePdfInput(missingCarrierTaxId).some((error) => error.includes("effectiveCarrier.taxId")));

  const missingTrailer = structuredClone(validInput);
  missingTrailer.trailerRegistration = null;
  assert.ok(validateDeCANativePdfInput(missingTrailer).some((error) => error.includes("trailerRegistration")));

  const missingSpecialAuthorization = structuredClone(validInput);
  missingSpecialAuthorization.specialCirculationAuthorizationRequired = true;
  missingSpecialAuthorization.specialCirculationAuthorization = null;
  assert.ok(
    validateDeCANativePdfInput(missingSpecialAuthorization).some((error) =>
      error.includes("specialCirculationAuthorization"),
    ),
  );

  const insecureUrl = structuredClone(validInput);
  insecureUrl.publicUrl = "http://example.test/regulatory/d/token";
  assert.ok(validateDeCANativePdfInput(insecureUrl).some((error) => error.includes("publicUrl debe ser HTTPS")));
});

test("native DeCA endpoint keeps regulatory roles explicit and canonical", () => {
  const route = fs.readFileSync("app/api/regulatory/cmr/[cmr]/native/route.ts", "utf8");

  assert.match(route, /contractual_shipper_party_id/);
  assert.match(route, /contractual_shipper_address_id/);
  assert.match(route, /effective_carrier_party_id/);
  assert.match(route, /\.eq\("address_type", "FISCAL"\)/);
  assert.match(route, /articulated_vehicle debe indicarse explícitamente/);
  assert.match(route, /special_circulation_authorization_required debe indicarse explícitamente/);
  assert.match(route, /generateDeCANativePdf/);
  assert.match(route, /fornexa_issue_deca_native_artifact/);
  assert.match(route, /public_capability_storage: "sha256_only"/);

  const metadataStart = route.indexOf("const metadata = {");
  const metadataEnd = route.indexOf("const { data: issuanceData", metadataStart);
  assert.ok(metadataStart >= 0 && metadataEnd > metadataStart);
  assert.doesNotMatch(route.slice(metadataStart, metadataEnd), /rawToken/);
});

test("atomic issuance RPC is invoker-only, service-role-only and validates defense-in-depth invariants", () => {
  const sql = fs.readFileSync(
    "supabase/migrations/20260907175000_deca_native_atomic_issuance.sql",
    "utf8",
  );

  assert.match(sql, /security invoker/i);
  assert.doesNotMatch(sql, /security definer/i);
  assert.match(sql, /set search_path = ''/i);
  assert.match(sql, /revoke all on function[\s\S]*from public, anon, authenticated;/i);
  assert.match(sql, /grant execute on function[\s\S]*to service_role;/i);
  assert.match(sql, /insert into public\.regulatory_document_artifacts/i);
  assert.match(sql, /insert into public\.regulatory_document_access_tokens/i);
  assert.match(sql, /CMR tenant mismatch/);
  assert.match(sql, /Superseded artifact mismatch/);
  assert.match(sql, /p_byte_size > 5242880/);
  assert.match(sql, /p_sha256 !~ '\^\[0-9a-fA-F\]\{64\}\$'/);
  assert.match(sql, /p_token_hash !~ '\^\[0-9a-fA-F\]\{64\}\$'/);
  assert.match(sql, /p_public_until <= p_valid_from/);
  assert.match(sql, /p_public_until < p_service_completed_at \+ interval '7 days'/);
});
