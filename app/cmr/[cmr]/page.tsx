import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import PublicCmrClient from "./PublicCmrClient";
import {
  CMR_VIEW_SESSION_COOKIE,
  documentForAccessKey,
  documentForViewSession,
} from "@/lib/cmr-access";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  robots: { index: false, follow: false, noarchive: true },
  referrer: "no-referrer",
};

export default async function PublicCmrPage({
  params,
  searchParams,
}: {
  params: Promise<{ cmr: string }>;
  searchParams: Promise<{ key?: string }>;
}) {
  const [{ cmr }, query, store] = await Promise.all([params, searchParams, cookies()]);
  const cmrNumber = decodeURIComponent(cmr).toUpperCase();
  const key = query.key ?? "";

  if (key) {
    const document = await documentForAccessKey(key);
    if (!document || document.cmr_number !== cmrNumber) return unavailable();
    redirect(`/api/cmr/session/${encodeURIComponent(cmrNumber)}?key=${encodeURIComponent(key)}`);
  }

  const sessionToken = store.get(CMR_VIEW_SESSION_COOKIE)?.value;
  const document = await documentForViewSession(sessionToken, cmrNumber);
  if (!document) return unavailable();

  return <PublicCmrClient />;
}

function unavailable() {
  return (
    <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 24, background: "#eef3f9" }}>
      <section style={{ maxWidth: 520, padding: 32, borderRadius: 16, background: "white", border: "1px solid #dbe4ef", fontFamily: "Arial, sans-serif", color: "#172033" }}>
        <h1 style={{ marginTop: 0 }}>CMR no disponible</h1>
        <p>El enlace no es válido, ha caducado o no corresponde a este documento.</p>
      </section>
    </main>
  );
}
