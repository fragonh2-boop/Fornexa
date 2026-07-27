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

          {step === 0 && <div className="onboarding-summary"><strong>Empresa asignada</strong><span>Demo Logistics Europe, S.L.</span></div>}
          {step === 1 && <div className="onboarding-summary"><strong>Perfil asignado</strong><span>Operador logístico</span><small>Los permisos se administran desde la cuenta de empresa.</small></div>}
          {step === 2 && (
            <div className="onboarding-fields">
              <label>Idioma<select defaultValue="es"><option value="es">Español</option><option value="en">English</option><option value="fr">Français</option></select></label>
              <label>Zona horaria<select defaultValue="Europe/Madrid"><option>Europe/Madrid</option><option>Europe/Paris</option><option>Europe/London</option></select></label>
              <label className="check"><input type="checkbox" defaultChecked /> Recibir avisos operativos por correo</label>
            </div>
          )}
          {step === 3 && <div className="onboarding-summary"><strong>Configuración completada</strong><span>Tu empresa, perfil y preferencias están listos.</span></div>}

          <div className="onboarding-actions">
            <button type="button" className="secondary" disabled={step === 0} onClick={() => setStep((currentStep) => currentStep - 1)}>Anterior</button>
            {step < steps.length - 1 ? <button type="button" onClick={() => setStep((currentStep) => currentStep + 1)}>Continuar</button> : <Link className="finish" href="/">Entrar en FORNEXA</Link>}
          </div>
        </section>
      </section>

      <style jsx>{`
        .onboarding-page{min-height:100vh;padding:32px;background:radial-gradient(circle at 15% 15%,rgba(105,230,180,.09),transparent 30%),#07111f}
        .onboarding-shell{width:min(900px,100%);margin:0 auto}
        .onboarding-header{display:flex;justify-content:space-between;align-items:center;padding:10px 0 28px;color:#9fb0c5}
        .onboarding-progress{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin:18px 0 28px}
        .onboarding-progress span{display:grid;place-items:center;height:42px;border:1px solid rgba(255,255,255,.1);border-radius:999px;color:#6f8298;background:#0b1828;font-weight:800}
        .onboarding-progress span.active{color:#062117;background:#69e6b4;border-color:#69e6b4}
        .onboarding-card{padding:42px;background:linear-gradient(180deg,#111f34,#0e1c2f);border:1px solid rgba(255,255,255,.1);border-radius:24px;box-shadow:0 30px 90px rgba(0,0,0,.3)}
        h1{margin:12px 0 16px;font-size:clamp(42px,6vw,72px)}
        p{color:#9fb0c5;font-size:19px;line-height:1.6}
        .onboarding-summary,.onboarding-fields{display:grid;gap:10px;margin:30px 0;padding:24px;background:#081321;border:1px solid rgba(255,255,255,.1);border-radius:16px}
        .onboarding-summary span{font-size:22px}.onboarding-summary small{color:#71849a}
        .onboarding-fields label{display:grid;gap:8px;color:#c6d2df;font-size:13px;font-weight:800}
        .onboarding-fields select{padding:14px;color:#f7f9fc;background:#0b1828;border:1px solid rgba(255,255,255,.1);border-radius:10px}
        .onboarding-fields .check{display:flex;align-items:center;gap:10px}
        .onboarding-actions{display:flex;justify-content:space-between;gap:14px;margin-top:34px}
        .secondary{color:#f7f9fc;background:transparent;border:1px solid rgba(255,255,255,.15)}
        .secondary:disabled{opacity:.35;cursor:not-allowed}
        .finish{display:inline-flex;align-items:center;justify-content:center;padding:14px 19px;color:#062117;background:#69e6b4;border-radius:10px;font-weight:800}
        @media(max-width:650px){.onboarding-page{padding:18px}.onboarding-card{padding:26px}.onboarding-progress{gap:6px}.onboarding-actions{flex-direction:column-reverse}.onboarding-actions button,.finish{width:100%}}
      `}</style>
    </main>
  );
}
