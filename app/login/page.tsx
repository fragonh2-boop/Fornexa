"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";

type AccessMode = "session" | "first-access" | "recover";
type UserRole = "operator" | "shipper" | "receiver";

const roles: Array<{ value: UserRole; label: string; description: string }> = [
  { value: "operator", label: "Operador logístico", description: "Gestión integral de operaciones, transporte, clientes y colaboradores." },
  { value: "shipper", label: "Cargador", description: "Solicitudes, expediciones, documentación, costes y seguimiento." },
  { value: "receiver", label: "Receptor", description: "Entregas, confirmaciones, reservas, incidencias y ePOD." },
];

const modeCopy = {
  session: {
    title: "Mi sesión",
    description: "Accede con tus credenciales corporativas.",
    submit: "Entrar en FORNEXA",
  },
  "first-access": {
    title: "Primera vez en FORNEXA",
    description: "Activa tu usuario con la invitación recibida por correo.",
    submit: "Activar mi cuenta",
  },
  recover: {
    title: "Recuperar contraseña",
    description: "Te enviaremos un enlace seguro para crear una nueva contraseña.",
    submit: "Enviar enlace de recuperación",
  },
};

export default function LoginPage() {
  const [mode, setMode] = useState<AccessMode>("session");
  const [role, setRole] = useState<UserRole>("operator");
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

    const resultMessages: Record<AccessMode, string> = {
      session: "Datos validados. La autenticación real se conectará con Supabase Auth.",
      "first-access": "Invitación validada. El siguiente paso permitirá crear tu contraseña y aceptar las condiciones.",
      recover: "Solicitud validada. Se enviará un enlace de recuperación cuando activemos Supabase Auth.",
    };

    setMessage(resultMessages[mode]);
  }

  const selectedRole = roles.find((item) => item.value === role)!;
  const currentCopy = modeCopy[mode];

  return (
    <main className="auth-page">
      <section className="auth-brand-panel">
        <Link href="/" className="auth-logo">FORNEXA</Link>
        <div className="auth-brand-copy">
          <span className="card-kicker">SUPPLY CHAIN SUITE</span>
          <h1>Una plataforma; control total</h1>
          <p>Acceso seguro para usuarios registrados y seguimiento público de expediciones sin iniciar sesión.</p>
        </div>
        <div className="auth-security-list">
          <span>✓ Acceso por empresa, usuario y permisos</span>
          <span>✓ Primera activación y recuperación segura</span>
          <span>✓ Tracking público mediante URL, código o QR</span>
        </div>
      </section>

      <section className="auth-form-panel">
        <div className="auth-card">
          <div className="auth-top-links">
            <Link href="/" className="auth-back">← Volver a FORNEXA</Link>
            <Link href="/tracking" className="tracking-access">Consultar tracking →</Link>
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
            {mode !== "recover" && (
              <fieldset className="role-selector">
                <legend>Perfil de acceso</legend>
                <div className="role-grid role-grid-three">
                  {roles.map((item) => (
                    <label key={item.value} className={role === item.value ? "selected" : ""}>
                      <input type="radio" name="role" value={item.value} checked={role === item.value} onChange={() => setRole(item.value)} />
                      <span>{item.label}</span>
                    </label>
                  ))}
                </div>
                <small>{selectedRole.description}</small>
              </fieldset>
            )}

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

          <div className="public-tracking-note">
            <strong>¿Solo quieres consultar una expedición?</strong>
            <p>No necesitas una cuenta. Accede mediante el enlace recibido, introduce el código de seguimiento o escanea el QR.</p>
            <Link href="/tracking">Abrir tracking público</Link>
          </div>

          <footer className="auth-footer">
            <span>Acceso protegido</span><span>Privacidad</span><span>Soporte</span>
          </footer>
        </div>
      </section>
    </main>
  );
}
