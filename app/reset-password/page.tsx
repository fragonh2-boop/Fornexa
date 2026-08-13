"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, Suspense, useState } from "react";
import { createClient } from "@/lib/supabase/client";

function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const firstAccess = searchParams.get("firstAccess") === "1";
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [message, setMessage] = useState("");
  const [isError, setIsError] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    setIsError(false);

    if (password.length < 8) {
      setMessage("La contraseña debe contener al menos 8 caracteres.");
      setIsError(true);
      return;
    }

    if (password !== confirmation) {
      setMessage("Las contraseñas no coinciden.");
      setIsError(true);
      return;
    }

    setLoading(true);
    try {
      const supabase = await createClient();
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      setMessage(firstAccess ? "Contraseña creada. Continuamos con la configuración inicial." : "Contraseña actualizada. Ya puedes iniciar sesión.");
      window.setTimeout(() => router.replace(firstAccess ? "/onboarding" : "/login"), 900);
    } catch (error) {
      setIsError(true);
      setMessage(error instanceof Error ? error.message : "No se ha podido actualizar la contraseña.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="auth-page">
      <section className="auth-brand-panel">
        <Link href="/" className="auth-logo">FORNEXA</Link>
        <div className="auth-brand-copy">
          <span className="card-kicker">SECURE ACCESS</span>
          <h1>{firstAccess ? "Activa tu cuenta" : "Nueva contraseña"}</h1>
          <p>{firstAccess ? "Crea tu contraseña para completar el primer acceso a FORNEXA." : "Define una contraseña segura para recuperar el acceso a tu cuenta."}</p>
        </div>
      </section>

      <section className="auth-form-panel">
        <div className="auth-card">
          <div className="auth-heading">
            <span className="card-kicker">FORNEXA ACCESS</span>
            <h2>{firstAccess ? "Crear contraseña" : "Restablecer contraseña"}</h2>
          </div>

          <form onSubmit={handleSubmit} noValidate>
            <label className="auth-field">
              Nueva contraseña
              <input type="password" autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} disabled={loading} />
            </label>
            <label className="auth-field">
              Repetir contraseña
              <input type="password" autoComplete="new-password" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} disabled={loading} />
            </label>
            <button className="auth-submit" type="submit" disabled={loading}>{loading ? "Actualizando..." : "Guardar contraseña"}</button>
            {message && <p className={`auth-message${isError ? " auth-message-error" : " auth-message-success"}`} role="status">{message}</p>}
          </form>

          <footer className="auth-footer">
            <Link href="/login">Volver al inicio de sesión</Link>
          </footer>
        </div>
      </section>
    </main>
  );
}

export default function ResetPasswordPage() {
  return <Suspense fallback={<main className="auth-page"><section className="auth-form-panel"><div className="auth-card">Preparando acceso seguro...</div></section></main>}><ResetPasswordForm /></Suspense>;
}
