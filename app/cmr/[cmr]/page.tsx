import PublicCmrClient from "./PublicCmrClient";
import { documentForAccessKey } from "@/lib/cmr-access";

export const dynamic = "force-dynamic";

export default async function PublicCmrPage({
  params,
  searchParams,
}: {
  params: Promise<{ cmr: string }>;
  searchParams: Promise<{ key?: string }>;
}) {
  const [{ cmr }, query] = await Promise.all([params, searchParams]);
  const cmrNumber = decodeURIComponent(cmr).toUpperCase();
  const key = query.key ?? "";
  const document = key ? await documentForAccessKey(key) : null;

  if (!document || document.cmr_number !== cmrNumber) {
    return (
      <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 24, background: "#eef3f9" }}>
        <section style={{ maxWidth: 520, padding: 32, borderRadius: 16, background: "white", border: "1px solid #dbe4ef", fontFamily: "Arial, sans-serif", color: "#172033" }}>
          <h1 style={{ marginTop: 0 }}>CMR no disponible</h1>
          <p>El enlace no es válido, ha caducado o no corresponde a este documento.</p>
        </section>
      </main>
    );
  }

  return <PublicCmrClient />;
}
