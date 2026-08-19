"use client";

import dynamic from "next/dynamic";

const CmrDocumentPage = dynamic(
  () => import("../../dashboard/epod-cmr/[cmr]/page"),
  {
    ssr: false,
    loading: () => (
      <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 24, background: "#eef3f9" }}>
        <section style={{ padding: 24, borderRadius: 16, background: "white", border: "1px solid #dbe4ef", fontFamily: "Arial, sans-serif", color: "#172033" }}>
          Cargando CMR…
        </section>
      </main>
    ),
  },
);

export default function PublicCmrClient() {
  return <CmrDocumentPage />;
}
