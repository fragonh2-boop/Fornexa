"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";

type AccessMode = "login" | "recover";
type UserRole = "operator" | "shipper" | "carrier" | "receiver";

const roles: Array<{ value: UserRole; label: string; description: string }> = [
  { value: "operator", label: "Operador logístico", description: "Gestión integral de operaciones, clientes y colaboradores." },
  { value: "shipper", label: "Cargador", description: "Solicitudes, expediciones, documentación y seguimiento." },
  { value: "carrier", label: "Transportista", description: "Servicios asignados, estados, incidencias y POD." },
  { value: "receiver", label: "Receptor", description: "Entregas, confirmaciones, reservas e incidencias." },
];

export default function LoginPage() {
  const [mode, setMode] = useState<AccessMode>("login");
  const [role, setRole] = useState<UserRole>("operator");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(true);
  const [message, setMessage] = useState("");

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");

    if (!email.includes("@")) {
      setMessage("Introduce un correo electrónico válido.");
      return;
    }

    if (mode === "login" && password.length < 8) {
      setMessage("La contraseña debe contener al menos 8 caracteres.");
      return;
    }

    setMessage(
      mode === "recover"
        ? "Te enviaremos las instrucciones de recuperación cuando activemos la autenticación real."
        : "Formulario validado. El siguiente paso será conectarlo con Supabase Auth."
    );
  }

  const selectedRole = roles.find((item) => item.value === role)!;

  return (
    <main className="auth-page">
      <section className="auth-brand-panel">
        <Link href="/" className="auth-logo">FORNEXA</Link>
        <div className="auth-brand-copy">
          <span className="card-kicker">SUPPLY CHAIN SUITE</span>
          <h1>Una plataforma; control total</h1>
          <p>Acceso seguro y segmentado para cada actor de la cadena de suministro.</p>
        </div>
        <div className="auth-security-list">
          <span>✓ Acceso por empresa y rol</span>
          <span>✓ Sesiones y permisos centralizados</span>
          <span>✓ Preparado para MFA y SSO</span>
        </div>
      </section>

      <section className="auth-form-panel">
        <div className="auth-card">
          <Link href="/" className="auth-back">← Volver a FORNEXA</Link>

          <div className="auth-tabs" role="tablist" aria-label="Acceso y recuperación">
            <button className={mode === "login" ? "active" : ""} onClick={() => { setMode("login"); setMessage(""); }} type="button">
              Iniciar sesión
            </button>
            <button className={mode === "recover" ? "active" : ""} onClick={() => { setMode("recover"); setMessage(""); }} type="button">
              Recuperar acceso
            </button>
          </div>

          <div className="auth-heading">
            <span className="card-kicker">FORNEXA ACCESS</span>
            <h2>{mode === "login" ? "Bienvenido de nuevo" : "Recupera tu contraseña"}</h2>
            <p>
              {mode === "login"
                ? "Selecciona tu perfil e introduce tus credenciales corporativas."
                : "Indica tu correo corporativo y te enviaremos las instrucciones."}
            </p>
          </div>

          <form onSubmit={handleSubmit} noValidate>
            {mode === "login" && (
              <fieldset className="role-selector">
                <legend>Perfil de acceso</legend>
                <div className="role-grid">
                  {roles.map((item) => (
                    <label key={item.value} className={role === item.value ? "selected" : ""}>
                      <input
                        type="radio"
                        name="role"
                        value={item.value}
                        checked={role === item.value}
                        onChange={() => setRole(item.value)}
                      />
                      <span>{item.label}</span>
                    </label>
                  ))}
                </div>
                <small>{selectedRole.description}</small>
              </fieldset>
            )}

            <label className="auth-field">
              Correo electrónico
              <input
                type="email"
                autoComplete="email"
                placeholder="nombre@empresa.com"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
            </label>

            {mode === "login" && (
              <label className="auth-field">
                Contraseña
                <div className="password-field">
                  <input
                    type={showPassword ? "text" : "password"}
                    autoComplete="current-password"
                    placeholder="Mínimo 8 caracteres"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                  />
                  <button type="button" onClick={() => setShowPassword((current) => !current)}>
                    {showPassword ? "Ocultar" : "Mostrar"}
                  </button>
                </div>
              </label>
            )}

            {mode === "login" && (
              <div className="auth-options">
                <label>
                  <input type="checkbox" checked={remember} onChange={(event) => setRemember(event.target.checked)} />
                  Mantener sesión iniciada
                </label>
                <button type="button" onClick={() => { setMode("recover"); setMessage(""); }}>
                  ¿Has olvidado la contraseña?
                </button>
              </div>
            )}

            <button className="auth-submit" type="submit">
              {mode === "login" ? "Entrar en FORNEXA" : "Enviar instrucciones"}
            </button>

            {message && <p className="auth-message" role="status">{message}</p>}
          </form>

          <footer className="auth-footer">
            <span>Acceso protegido</span>
            <span>Privacidad</span>
            <span>Soporte</span>
          </footer>
        </div>
      </section>
    </main>
  );
}
