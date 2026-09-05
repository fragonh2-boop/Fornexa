import {
  REGULATORY_DOCUMENT_BUCKET,
  resolveRegulatoryPublicArtifact,
  sha256Hex,
} from "@/lib/regulatory-documents";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const noStore = {
  "Cache-Control": "private, no-cache, no-store, max-age=0, must-revalidate",
  Pragma: "no-cache",
  "Referrer-Policy": "no-referrer",
};

const unavailable = () => new Response("Documento no disponible.", { status: 404, headers: noStore });

export async function GET(_request: Request, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params;
  const resolved = await resolveRegulatoryPublicArtifact(decodeURIComponent(token));
  if (!resolved) return unavailable();

  const { admin, artifact } = resolved;
  const { data: file, error: downloadError } = await admin.storage
    .from(REGULATORY_DOCUMENT_BUCKET)
    .download(artifact.storage_path, {}, { cache: "no-store" });

  if (downloadError || !file) return unavailable();

  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  if (bytes.byteLength !== Number(artifact.byte_size)) return unavailable();
  if (sha256Hex(bytes).toLowerCase() !== String(artifact.sha256).toLowerCase()) return unavailable();

  const filename = `FORNEXA-DeCA-v${artifact.version}.pdf`;
  return new Response(buffer, {
    status: 200,
    headers: {
      ...noStore,
      "Content-Type": "application/pdf",
      "Content-Length": String(bytes.byteLength),
      "Content-Disposition": `attachment; filename="${filename}"`,
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'",
    },
  });
}
