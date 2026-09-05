"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, Suspense, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { loginErrorMessage, type AuthEmailFlow } from "@/lib/auth-flow";
import FornexaLogo from "../components/FornexaLogo";

type AccessMode = "session" | "first-access" | "recover";

const modeCopy = {
  session: { title: "Mi sesión", description: "Accede con tus credenciales corporativas.", submit: "Entrar en FORNEXA" },
  "first-access": { title: "Primera vez en FORNEXA", description: "Si tu cuenta ya ha sido provisionada, te enviaremos un enlace seguro para verificar tu identidad y crear tu contraseña.", submit: "Enviar email de verificación" },
  recover: { title: "Recuperar contraseña", description: "Te enviaremos un enlace seguro para crear una nueva contraseña.", submit: "Enviar enlace de recuperación" },
};

function telemetrySessionId() {
  const existing = document.cookie
    .split(";")
    .map(part => part.trim())
    .find(part => part.startsWith("fornexa_tlm_session="))
    ?.slice("fornexa_tlm_session=".length);
  if (existing && /^[0-9a-f-]{36}$/i.test(existing)) return existing;
  const value = crypto.randomUUID();
  document.cookie = `fornexa_tlm_session=${value}; Path=/; Max-Age=86400; SameSite=Lax; Secure`;
  return value;
}

function emitAuthTelemetry(eventType: string, email: string, failureCode?: string) {
  void fetch("/api/telemetry/event", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      kind: "auth",
      session_id: telemetrySessionId(),
      event_type: eventType,
      email,
      failure_code: failureCode ?? null,
    }),
    keepalive: true,
    cache: "no-store",
  }).catch(() => undefined);
}

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [mode, setMode] = useState<AccessMode>("session");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [message, setMessage] = useState("");
  const [isError, setIsError] = useState(false);
  const [loading, setLoading] = useState(false);
  const [dismissedCallbackError, setDismissedCallbackError] = useState(false);

  const callbackError = useMemo(() => {
    const error = searchParams.get("error");
    if (error === "missing_code") return "El enlace de acceso no contiene un código válido.";
    if (error === "invalid_link") return "El enlace ha caducado o ya ha sido utilizado.";
    if (error === "auth_configuration") return "El servicio de acceso no está correctamente configurado.";
    return "";
  }, [searchParams]);
  const visibleCallbackError = dismissedCallbackError ? "" : callbackError;

  useEffect(() => {
    if (!callbackError) return;
    const timeout = window.setTimeout(() => {
      setDismissedCallbackError(true);
      window.history.replaceState(null, "", "/login");
    }, 8000);
    return () => window.clearTimeout(timeout);
  }, [callbackError]);

  function changeMode(nextMode: AccessMode) {
    setMode(nextMode);
    setMessage("");
    setIsError(false);
    if (callbackError) {
      setDismissedCallbackError(true);
      window.history.replaceState(null, "", "/login");
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    setIsError(false);
    if (!email.includes("@")) { setMessage("Introduce un correo electrónico válido."); setIsError(true); return; }
    if (mode === "session" && password.length < 8) { setMessage("La contraseña debe contener al menos 8 caracteres."); setIsError(true); return; }
    setLoading(true);
    try {
      if (mode === "recover" || mode === "first-access") {
        const flow: AuthEmailFlow = mode;
        const response = await fetch("/api/auth/recovery", {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          cache: "no-store",
          body: JSON.stringify({ email, flow }),
        });
        if (!response.ok) throw new Error("No se ha podido completar la solicitud.");
        emitAuthTelemetry(flow === "first-access" ? "FIRST_ACCESS_REQUEST" : "RECOVERY_REQUEST", email);
        setMessage(flow === "first-access"
          ? "Si la cuenta está provisionada, recibirás un enlace seguro para crear tu contraseña. Revisa también spam o correo no deseado."
          : "Si la cuenta existe, recibirás un enlace de recuperación. Revisa también la carpeta de spam.");
        return;
      }

      emitAuthTelemetry("LOGIN_ATTEMPT", email);
      const supabase = await createClient();
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        const failureCode = "code" in error && typeof error.code === "string" ? error.code : error.name;
        emitAuthTelemetry("LOGIN_FAILURE", email, failureCode);
        setIsError(true);
        setMessage(loginErrorMessage(error.message));
        return;
      }
      emitAuthTelemetry("LOGIN_SUCCESS", email);
      router.push("/dashboard");
      router.refresh();
    } catch {
      emitAuthTelemetry("LOGIN_FAILURE", email, "CLIENT_OR_NETWORK_ERROR");
      setIsError(true);
      setMessage("No se ha podido conectar al servicio de acceso. Vuelve a intentarlo; si continúa, recarga la página.");
    } finally { setLoading(false); }
  }

  const currentCopy = modeCopy[mode];

  return (
    <main className="auth-page" style={{ width: "100%", maxWidth: "100vw", overflowX: "hidden" }}>
      <section className="auth-brand-panel" style={{ minWidth: 0 }}>
        <Link href="/" className="login-brand-logo" aria-label="4NXA FORNEXA"><FornexaLogo /></Link>
        <div className="auth-brand-copy">
          <span className="card-kicker">SUPPLY CHAIN SUITE</span>
          <h1>Una plataforma; control total</h1>
          <p>Acceso seguro para usuarios registrados de FORNEXA.</p>
        </div>
        <div className="auth-security-list">
          <span>✓ Perfil, empresa y permisos asociados al usuario</span>
          <span>✓ Primera activación por correo</span>
          <span>✓ Preparado para MFA y SSO</span>
        </div>
      </section>
      <section className="auth-form-panel" style={{ minWidth: 0, width: "100%" }}>
        <div className="auth-card" style={{ minWidth: 0, maxWidth: "100%" }}>
          <div className="auth-top-links"><Link href="/" className="auth-back">← Volver a FORNEXA</Link></div>
          <div className="auth-tabs auth-tabs-three" role="tablist" aria-label="Opciones de acceso">
            <button className={mode === "session" ? "active" : ""} onClick={() => changeMode("session")} type="button">Mi sesión</button>
            <button className={mode === "first-access" ? "active" : ""} onClick={() => changeMode("first-access")} type="button">Primera vez</button>
            <button className={mode === "recover" ? "active" : ""} onClick={() => changeMode("recover")} type="button">Recuperar contraseña</button>
          </div>
          <div className="auth-heading"><span className="card-kicker">FORNEXA ACCESS</span><h2>{currentCopy.title}</h2><p>{currentCopy.description}</p></div>
          <form onSubmit={handleSubmit} noValidate>
            <label className="auth-field">Correo electrónico<input type="email" autoComplete="email" placeholder="nombre@empresa.com" value={email} onChange={(event) => setEmail(event.target.value)} disabled={loading} /></label>
            {mode === "session" && <label className="auth-field">Contraseña<div className="password-field"><input type={showPassword ? "text" : "password"} autoComplete="current-password" placeholder="Mínimo 8 caracteres" value={password} onChange={(event) => setPassword(event.target.value)} disabled={loading} /><button type="button" onClick={() => setShowPassword((current) => !current)}>{showPassword ? "Ocultar" : "Mostrar"}</button></div></label>}
            {mode === "session" && <div className="auth-options"><span>Sesión segura en este dispositivo</span><button type="button" onClick={() => changeMode("recover")}>¿Has olvidado la contraseña?</button></div>}
            <button className="auth-submit" type="submit" disabled={loading}>{loading ? "Procesando..." : currentCopy.submit}</button>
            {(message || visibleCallbackError) && <p className={`auth-message${isError || (!message && visibleCallbackError) ? " auth-message-error" : " auth-message-success"}`} role="status">{message || visibleCallbackError}</p>}
          </form>
          <footer className="auth-footer"><span>Acceso protegido</span><span>Privacidad</span><span>Soporte</span></footer>
        </div>
      </section>
    </main>
  );
}

export default function LoginPage() {
  return <Suspense fallback={<main className="auth-page"><section className="auth-form-panel"><div className="auth-card">Cargando acceso...</div></section></main>}><LoginForm /></Suspense>;
}
