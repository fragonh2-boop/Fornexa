import { getAuthenticatedContext } from "@/lib/auth-context";
import {
  REGULATORY_DOCUMENT_BUCKET,
  REGULATORY_PDF_MAX_BYTES,
  regulatoryArtifactStoragePath,
  sha256Hex,
} from "@/lib/regulatory-documents";
import { createSupabaseAdmin } from "@/lib/supabase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const noStore = { "Cache-Control": "private, no-cache, no-store, max-age=0, must-revalidate" };
const issuerRoles = new Set(["OWNER", "ADMIN"]);

function response(message: string, status: number) {
  return Response.json({ error: message }, { status, headers: noStore });
}

function looksLikePdf(bytes: Uint8Array) {
  if (bytes.byteLength < 8) return false;
  return new TextDecoder("ascii").decode(bytes.slice(0, 5)) === "%PDF-";
}

export async function POST(request: Request, context: { params: Promise<{ cmr: string }> }) {
  const authenticated = await getAuthenticatedContext();
  if (!authenticated) return response("Acceso interno no válido.", 401);
  if (!issuerRoles.has(authenticated.role.toUpperCase())) return response("Permisos insuficientes.", 403);

  const contentType = request.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase();
  if (contentType !== "application/pdf") return response("Se requiere un PDF.", 415);

  const buffer = await request.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  if (!bytes.byteLength || bytes.byteLength > REGULATORY_PDF_MAX_BYTES) {
    return response("El PDF supera el límite permitido.", 413);
  }
  if (!looksLikePdf(bytes)) return response("El contenido no parece un PDF válido.", 400);

  const { cmr } = await context.params;
  const cmrNumber = decodeURIComponent(cmr).trim().toUpperCase();
  if (!cmrNumber) return response("CMR no válido.", 400);

  const admin = createSupabaseAdmin();
  const { data: document, error: documentError } = await admin
    .from("cmr_documents")
    .select("id,cmr_number,tenant_id,created_at,updated_at")
    .eq("cmr_number", cmrNumber)
    .eq("tenant_id", authenticated.tenantId)
    .maybeSingle();

  if (documentError) throw documentError;
  if (!document) return response("CMR no disponible.", 404);

  const { data: latest, error: latestError } = await admin
    .from("regulatory_document_artifacts")
    .select("id,version")
    .eq("cmr_id", document.id)
    .eq("tenant_id", authenticated.tenantId)
    .eq("document_kind", "deca")
    .eq("regulatory_scope", "deca_es")
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (latestError) throw latestError;
  const version = (latest?.version ?? 0) + 1;
  const storagePath = regulatoryArtifactStoragePath({
    tenantId: authenticated.tenantId,
    cmrId: document.id,
    documentKind: "deca",
    regulatoryScope: "deca_es",
    version,
  });
  const sha256 = sha256Hex(bytes);

  const { error: uploadError } = await admin.storage
    .from(REGULATORY_DOCUMENT_BUCKET)
    .upload(storagePath, buffer, {
      contentType: "application/pdf",
      cacheControl: "0",
      upsert: false,
    });

  if (uploadError) throw uploadError;

  const { data: artifact, error: artifactError } = await admin
    .from("regulatory_document_artifacts")
    .insert({
      tenant_id: authenticated.tenantId,
      cmr_id: document.id,
      document_kind: "deca",
      regulatory_scope: "deca_es",
      version,
      mime_type: "application/pdf",
      storage_path: storagePath,
      sha256,
      byte_size: bytes.byteLength,
      document_created_at: document.created_at,
      document_modified_at: document.updated_at,
      supersedes_artifact_id: latest?.id ?? null,
      metadata: {
        cmr_number: document.cmr_number,
        issuance_mode: "uploaded_pdf",
        regulatory_template_status: "pending_m8_validation",
      },
    })
    .select("id,cmr_id,document_kind,regulatory_scope,version,sha256,byte_size,issued_at,supersedes_artifact_id")
    .single();

  if (artifactError) {
    await admin.storage.from(REGULATORY_DOCUMENT_BUCKET).remove([storagePath]);
    throw artifactError;
  }

  return Response.json(
    {
      artifact,
      public_access: null,
      note: "El artefacto queda privado hasta crear explícitamente una ventana de acceso público.",
    },
    { status: 201, headers: noStore },
  );
}
