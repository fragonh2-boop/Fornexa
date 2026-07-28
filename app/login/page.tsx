"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, Suspense, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type AccessMode = "session" | "first-access" | "recover";

const modeCopy = {
  session: {
    title: "Mi sesión",
    description: "Accede con tus credenciales corporativas.",
    submit: "Entrar en FORNEXA",
  },
  "first-access": {
    title: "Primera vez en FORNEXA",
    description: "Te enviaremos un enlace seguro por correo para verificar tu identidad y continuar.",
    submit: "Enviar email de verificación",
  },
  recover: {
    title: "Recuperar contraseña",
    description: "Te enviaremos un enlace seguro para crear una nueva contraseña.",
    submit: "Enviar enlace de recuperación",
  },
};

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [mode, setMode] = useState<AccessMode>("session");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(true);
  const [message, setMessage] = useState("");
  const [isError, setIsError] = useState(false);
  const [loading, setLoading] = useState(false);

  const callbackError = useMemo(() => {
    const error = searchParams.get("error");
    if (error === "missing_code") return "El enlace de acceso no contiene un código válido.";
    if (error === "invalid_link") return "El enlace ha caducado o ya ha sido utilizado.";
    return "";
  }, [searchParams]);

  function changeMode(nextMode: AccessMode) {
    setMode(nextMode);
    setMessage("");
    setIsError(false);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    setIsError(false);

    if (!email.includes("@")) {
      setMessage("Introduce un correo electrónico válido.");
      setIsError(true);
      return;
    }

    if (mode === "session" && password.length < 8) {
      setMessage("La contraseña debe contener al menos 8 caracteres.");
      setIsError(true);
      return;
    }

    setLoading(true);

    try {
      const supabase = createClient();
      const origin = window.location.origin;

      if (mode === "session") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        router.push("/onboarding");
        router.refresh();
        return;
      }

      if (mode === "first-access") {
        const { error } = await supabase.auth.signInWithOtp({
          email,
          options: {
            emailRedirectTo: `${origin}/auth/callback?next=/onboarding`,
            shouldCreateUser: true,
          },
        });
        if (error) throw error;
        setMessage("Email enviado. Revisa también la carpeta de spam o correo no deseado.");
        return;
      }

      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${origin}/auth/callback?next=/reset-password`,
      });
      if (error) throw error;
      setMessage("Te hemos enviado el enlace de recuperación. Revisa también la carpeta de spam.");
    } catch (error) {
      setIsError(true);
      setMessage(error instanceof Error ? error.message : "No se ha podido completar la solicitud.");
    } finally {
      setLoading(false);
    }
  }

  const currentCopy = modeCopy[mode];

  return (
    <main className="auth-page">
      <section className="auth-brand-panel">
        <Link href="/" className="auth-logo">FORNEXA</Link>
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

      <section className="auth-form-panel">
        <div className="auth-card">
          <div className="auth-top-links">
            <Link href="/" className="auth-back">← Volver a FORNEXA</Link>
          </div>

          <div className="auth-tabs auth-tabs-three" role="tablist" aria-label="Opciones de acceso">
            <button className={mode === "session" ? "active" : ""} onClick={() => changeMode("session")} type="button">Mi sesión</button>
            <button className={mode === "first-access" ? "active" : ""} onClick={() => changeMode("first-access")} type="button">Primera vez</button>
            <button className={mode === "recover" ? "active" : ""} onClick={() => changeMode("recover")} type="button">Recuperar contraseña</button>
          </div>

          <div className="auth-heading">
            <span className="card-kicker">FORNEXA ACCESS</span>
            <h2>{currentCopy.title}</h2>
            <p>{currentCopy.description}</p>
          </div>

          <form onSubmit={handleSubmit} noValidate>
            <label className="auth-field">
              Correo electrónico
              <input type="email" autoComplete="email" placeholder="nombre@empresa.com" value={email} onChange={(event) => setEmail(event.target.value)} disabled={loading} />
            </label>

            {mode === "session" && (
              <label className="auth-field">
                Contraseña
                <div className="password-field">
                  <input type={showPassword ? "text" : "password"} autoComplete="current-password" placeholder="Mínimo 8 caracteres" value={password} onChange={(event) => setPassword(event.target.value)} disabled={loading} />
                  <button type="button" onClick={() => setShowPassword((current) => !current)}>{showPassword ? "Ocultar" : "Mostrar"}</button>
                </div>
              </label>
            )}

            {mode === "session" && (
              <div className="auth-options">
                <label><input type="checkbox" checked={remember} onChange={(event) => setRemember(event.target.checked)} /> Mantener mi sesión iniciada</label>
                <button type="button" onClick={() => changeMode("recover")}>¿Has olvidado la contraseña?</button>
              </div>
            )}

            <button className="auth-submit" type="submit" disabled={loading}>{loading ? "Procesando..." : currentCopy.submit}</button>
            {(callbackError || message) && <p className={`auth-message${isError || callbackError ? " auth-message-error" : ""}`} role="status">{callbackError || message}</p>}
          </form>

          <footer className="auth-footer">
            <span>Acceso protegido</span><span>Privacidad</span><span>Soporte</span>
          </footer>
        </div>
      </section>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<main className="auth-page"><section className="auth-form-panel"><div className="auth-card">Cargando acceso...</div></section></main>}>
      <LoginForm />
    </Suspense>
  );
}
