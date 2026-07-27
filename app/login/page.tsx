"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";

type AccessMode = "session" | "first-access" | "recover";

const modeCopy = {
  session: {
    title: "Mi sesión",
    description: "Accede con tus credenciales corporativas.",
    submit: "Entrar en FORNEXA",
  },
  "first-access": {
    title: "Primera vez en FORNEXA",
    description: "Valida la invitación recibida por correo. Tu perfil y permisos ya estarán asociados a tu usuario.",
    submit: "Continuar",
  },
  recover: {
    title: "Recuperar contraseña",
    description: "Te enviaremos un enlace seguro para crear una nueva contraseña.",
    submit: "Enviar enlace de recuperación",
  },
};

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<AccessMode>("session");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [activationCode, setActivationCode] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(true);
  const [message, setMessage] = useState("");

  function changeMode(nextMode: AccessMode) {
    setMode(nextMode);
    setMessage("");
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");

    if (!email.includes("@")) {
      setMessage("Introduce un correo electrónico válido.");
      return;
    }

    if (mode === "session" && password.length < 8) {
      setMessage("La contraseña debe contener al menos 8 caracteres.");
      return;
    }

    if (mode === "first-access" && activationCode.trim().length < 6) {
      setMessage("Introduce el código de activación recibido por correo.");
      return;
    }

    if (mode === "first-access") {
      router.push("/onboarding");
      return;
    }

    setMessage(
      mode === "session"
        ? "Datos validados. El perfil, la empresa y los permisos se cargarán automáticamente al autenticar al usuario."
        : "Solicitud validada. Se enviará un enlace de recuperación cuando activemos Supabase Auth."
    );
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
          <span>✓ Primera activación guiada</span>
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
              <input type="email" autoComplete="email" placeholder="nombre@empresa.com" value={email} onChange={(event) => setEmail(event.target.value)} />
            </label>

            {mode === "first-access" && (
              <label className="auth-field">
                Código de activación
                <input type="text" autoComplete="one-time-code" placeholder="Código recibido por correo" value={activationCode} onChange={(event) => setActivationCode(event.target.value)} />
              </label>
            )}

            {mode === "session" && (
              <label className="auth-field">
                Contraseña
                <div className="password-field">
                  <input type={showPassword ? "text" : "password"} autoComplete="current-password" placeholder="Mínimo 8 caracteres" value={password} onChange={(event) => setPassword(event.target.value)} />
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

            <button className="auth-submit" type="submit">{currentCopy.submit}</button>
            {message && <p className="auth-message" role="status">{message}</p>}
          </form>

          <footer className="auth-footer">
            <span>Acceso protegido</span><span>Privacidad</span><span>Soporte</span>
          </footer>
        </div>
      </section>
    </main>
  );
}
