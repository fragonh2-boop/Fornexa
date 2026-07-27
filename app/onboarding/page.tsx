"use client";

import Link from "next/link";
import { useState } from "react";

const steps = [
  { title: "Tu organización", text: "Confirma la empresa a la que pertenece tu usuario." },
  { title: "Tu perfil", text: "Revisa el perfil y los permisos que te han asignado." },
  { title: "Tus preferencias", text: "Selecciona idioma, zona horaria y notificaciones." },
  { title: "Listo para empezar", text: "Accede al entorno configurado para tu función." },
];

export default function OnboardingPage() {
  const [step, setStep] = useState(0);
  const current = steps[step];

  return (
    <main className="onboarding-page">
      <section className="onboarding-shell">
        <header className="onboarding-header">
          <Link href="/" className="auth-logo">FORNEXA</Link>
          <span>Primer acceso</span>
        </header>

        <div className="onboarding-progress" aria-label="Progreso de configuración">
          {steps.map((item, index) => (
            <span key={item.title} className={index <= step ? "active" : ""}>{index + 1}</span>
          ))}
        </div>

        <section className="onboarding-card">
          <span className="card-kicker">PASO {step + 1} DE {steps.length}</span>
          <h1>{current.title}</h1>
          <p>{current.text}</p>

          {step === 0 && (
            <div className="onboarding-summary">
              <strong>Empresa asignada</strong>
              <span>Demo Logistics Europe, S.L.</span>
            </div>
          )}

          {step === 1 && (
            <div className="onboarding-summary">
              <strong>Perfil asignado</strong>
              <span>Operador logístico</span>
              <small>Los permisos se administran desde la cuenta de empresa.</small>
            </div>
          )}

          {step === 2 && (
            <div className="onboarding-fields">
              <label>Idioma<select defaultValue="es"><option value="es">Español</option><option value="en">English</option><option value="fr">Français</option></select></label>
              <label>Zona horaria<select defaultValue="Europe/Madrid"><option>Europe/Madrid</option><option>Europe/Paris</option><option>Europe/London</option></select></label>
              <label><input type="checkbox" defaultChecked /> Recibir avisos operativos por correo</label>
            </div>
          )}

          {step === 3 && (
            <div className="onboarding-summary">
              <strong>Configuración completada</strong>
              <span>Tu empresa, perfil y preferencias están listos.</span>
            </div>
          )}

          <div className="onboarding-actions">
            <button type="button" className="secondary" disabled={step === 0} onClick={() => setStep((currentStep) => currentStep - 1)}>Anterior</button>
            {step < steps.length - 1 ? (
              <button type="button" onClick={() => setStep((currentStep) => currentStep + 1)}>Continuar</button>
            ) : (
              <Link className="login-trigger" href="/">Entrar en FORNEXA</Link>
            )}
          </div>
        </section>
      </section>
    </main>
  );
}
