import Link from "next/link";
import { cookies } from "next/headers";
import FornexaLogo from "@/app/components/FornexaLogo";
import { parseAuthEmailFlow, RECOVERY_TOKEN_COOKIE } from "@/lib/auth-flow";

export const dynamic = "force-dynamic";

type VerifyPageProps = {
  searchParams: Promise<{ flow?: string }>;
};

export default async function VerifyPage({ searchParams }: VerifyPageProps) {
  const { flow: rawFlow } = await searchParams;
  const flow = parseAuthEmailFlow(rawFlow);
  const cookieStore = await cookies();
  const hasPendingToken = Boolean(cookieStore.get(RECOVERY_TOKEN_COOKIE)?.value);
  const firstAccess = flow === "first-access";

  return (
    <main className="auth-page" style={{ width: "100%", maxWidth: "100vw", overflowX: "hidden" }}>
      <section className="auth-brand-panel" style={{ minWidth: 0 }}>
        <Link href="/" className="auth-logo" aria-label="4NXA FORNEXA"><FornexaLogo /></Link>
        <div className="auth-brand-copy">
          <span className="card-kicker">SUPPLY CHAIN SUITE</span>
          <h1>Confirma que eres tú</h1>
          <p>El enlace todavía no se ha consumido. Continúa solo si solicitaste esta operación.</p>
        </div>
        <div className="auth-security-list">
          <span>✓ Token de un solo uso</span>
          <span>✓ Válido también al abrirlo desde otro dispositivo</span>
          <span>✓ Protegido frente a scanners automáticos de correo</span>
        </div>
      </section>
      <section className="auth-form-panel" style={{ minWidth: 0, width: "100%" }}>
        <div className="auth-card" style={{ minWidth: 0, maxWidth: "100%" }}>
          <div className="auth-top-links"><Link href="/login" className="auth-back">← Volver al acceso</Link></div>
          <div className="auth-heading">
            <span className="card-kicker">FORNEXA ACCESS</span>
            <h2>{hasPendingToken ? (firstAccess ? "Activa tu acceso" : "Restablece tu contraseña") : "Enlace no válido"}</h2>
            <p>{hasPendingToken
              ? "Pulsa el botón para verificar el enlace y continuar de forma segura."
              : "El enlace ha caducado, ya se ha utilizado o no contiene un token válido."}</p>
          </div>
          {hasPendingToken ? (
            <form action="/auth/confirm" method="post">
              <input type="hidden" name="flow" value={flow} />
              <button className="auth-submit" type="submit">
                {firstAccess ? "Verificar y crear contraseña" : "Verificar y continuar"}
              </button>
            </form>
          ) : (
            <Link className="auth-submit" href="/login">Solicitar un nuevo enlace</Link>
          )}
          <footer className="auth-footer"><span>Acceso protegido</span><span>Privacidad</span><span>Soporte</span></footer>
        </div>
      </section>
    </main>
  );
}
