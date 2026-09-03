import { notFound } from "next/navigation";
import { getAuthenticatedContext } from "@/lib/auth-context";
import { isPreviewReviewEnabled } from "@/lib/ai-review-preview";

export const dynamic = "force-dynamic";

export default async function ControlledAiReviewPage() {
  if (!isPreviewReviewEnabled()) notFound();
  const auth = await getAuthenticatedContext();
  if (!auth || auth.role !== "OWNER") notFound();

  return (
    <main style={{ maxWidth: 720, margin: "64px auto", padding: 24 }}>
      <h1>Revisión MMO-1 controlada</h1>
      <p>
        Esta superficie solo existe en el Preview del PR #38. Ejecuta un paquete fijo de código
        público; no admite datos ni instrucciones del navegador.
      </p>
      <form method="post" action="/api/internal/ai-review">
        <button type="submit">Ejecutar una revisión</button>
      </form>
    </main>
  );
}
