"use client";

import { FormEvent, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import FornexaLogo from "@/app/components/FornexaLogo";
import {
  ONBOARDING_LANGUAGES,
  ONBOARDING_TIMEZONES,
  type OnboardingPreferences,
  validateOnboardingPreferences,
} from "@/lib/onboarding";
import { completeOnboarding } from "./actions";
import styles from "./onboarding.module.css";

type OnboardingWizardProps = {
  email: string;
  organization: { name: string; code: string; status: string };
  role: { label: string; summary: string; capabilities: string[] };
  initialPreferences: OnboardingPreferences;
  previouslyCompleted: boolean;
};

const steps = [
  { title: "Tu acceso", description: "Organización y permisos" },
  { title: "Preferencias", description: "Cómo quieres trabajar" },
  { title: "Revisión", description: "Comprueba y termina" },
];

export default function OnboardingWizard({
  email,
  organization,
  role,
  initialPreferences,
  previouslyCompleted,
}: OnboardingWizardProps) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [preferences, setPreferences] = useState(initialPreferences);
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();

  function setPreference<Key extends keyof OnboardingPreferences>(
    key: Key,
    value: OnboardingPreferences[Key],
  ) {
    setPreferences((current) => ({ ...current, [key]: value }));
    setError("");
  }

  function goBack() {
    setError("");
    setStep((current) => Math.max(0, current - 1));
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    if (step === 1) {
      const validated = validateOnboardingPreferences(preferences);
      if (!validated.ok) {
        setError(validated.error);
        return;
      }
      setPreferences(validated.data);
    }

    if (step < steps.length - 1) {
      setStep((current) => current + 1);
      return;
    }

    startTransition(async () => {
      const result = await completeOnboarding(preferences);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.replace("/dashboard");
      router.refresh();
    });
  }

  return (
    <main className={styles.page}>
      <div className={styles.shell}>
        <header className={styles.header}>
          <Link href="/" className={styles.logo} aria-label="4NXA FORNEXA">
            <FornexaLogo />
          </Link>
          <div className={styles.headerMeta}>
            <span>{previouslyCompleted ? "Configuración de perfil" : "Primera configuración"}</span>
            <strong>{email}</strong>
          </div>
        </header>

        <div className={styles.layout}>
          <aside className={styles.progressPanel} aria-label="Progreso de configuración">
            <span className={styles.progressKicker}>EMPECEMOS</span>
            <h1>{previouslyCompleted ? "Revisa tu espacio" : "Prepara tu espacio de trabajo"}</h1>
            <p>Solo necesitas confirmar tu acceso y elegir tus preferencias personales.</p>
            <ol className={styles.steps}>
              {steps.map((item, index) => (
                <li key={item.title} className={index === step ? styles.currentStep : index < step ? styles.completedStep : ""}>
                  <span className={styles.stepNumber} aria-hidden="true">{index < step ? "✓" : index + 1}</span>
                  <div>
                    <strong>{item.title}</strong>
                    <small>{item.description}</small>
                  </div>
                  {index === step && <span className={styles.srOnly}>Paso actual</span>}
                </li>
              ))}
            </ol>
            <div className={styles.securityNote}>
              <span aria-hidden="true">✓</span>
              <p><strong>Acceso verificado</strong> Tu contraseña y tu sesión ya están protegidas.</p>
            </div>
          </aside>

          <form className={styles.card} onSubmit={handleSubmit} noValidate>
            <div className={styles.cardTopline}>
              <span>PASO {step + 1} DE {steps.length}</span>
              <span>{Math.round(((step + 1) / steps.length) * 100)}%</span>
            </div>
            <div className={styles.progressTrack} aria-hidden="true"><span style={{ width: `${((step + 1) / steps.length) * 100}%` }} /></div>

            {step === 0 && (
              <section aria-labelledby="onboarding-access-title">
                <div className={styles.sectionHeading}>
                  <span className={styles.eyebrow}>ACCESO ASIGNADO</span>
                  <h2 id="onboarding-access-title">Este es tu espacio en FORNEXA</h2>
                  <p>Estos datos determinan dónde trabajas y qué puedes hacer. Los gestiona el administrador de la organización.</p>
                </div>

                <div className={styles.readOnlyGrid}>
                  <article className={styles.readOnlyCard}>
                    <div className={styles.readOnlyLabel}><span>Organización</span><em>Solo lectura</em></div>
                    <strong>{organization.name}</strong>
                    <small>{organization.code} · {organization.status}</small>
                  </article>
                  <article className={styles.readOnlyCard}>
                    <div className={styles.readOnlyLabel}><span>Perfil asignado</span><em>Solo lectura</em></div>
                    <strong>{role.label}</strong>
                    <small>{role.summary}</small>
                  </article>
                </div>

                <div className={styles.permissions}>
                  <strong>Tu perfil incluye</strong>
                  <ul>{role.capabilities.map((capability) => <li key={capability}>✓ {capability}</li>)}</ul>
                </div>
                <p className={styles.managedNote}>¿Algún dato no es correcto? Un administrador de tu organización debe modificar la asignación.</p>
              </section>
            )}

            {step === 1 && (
              <section aria-labelledby="onboarding-preferences-title">
                <div className={styles.sectionHeading}>
                  <span className={styles.eyebrow}>PREFERENCIAS PERSONALES</span>
                  <h2 id="onboarding-preferences-title">Adapta FORNEXA a tu forma de trabajar</h2>
                  <p>Estos campos sí son editables y se guardarán en tu perfil personal.</p>
                </div>

                <div className={styles.fields}>
                  <label className={styles.fullField} htmlFor="display-name">
                    <span>Nombre visible</span>
                    <input
                      id="display-name"
                      type="text"
                      autoComplete="name"
                      maxLength={80}
                      value={preferences.displayName}
                      onChange={(event) => setPreference("displayName", event.target.value)}
                      placeholder="Tu nombre y apellidos"
                      autoFocus
                    />
                    <small>Se utilizará para identificarte dentro del equipo.</small>
                  </label>
                  <label htmlFor="language">
                    <span>Idioma de la interfaz</span>
                    <select id="language" value={preferences.language} onChange={(event) => setPreference("language", event.target.value as OnboardingPreferences["language"])}>
                      {ONBOARDING_LANGUAGES.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                    </select>
                  </label>
                  <label htmlFor="timezone">
                    <span>Zona horaria</span>
                    <select id="timezone" value={preferences.timezone} onChange={(event) => setPreference("timezone", event.target.value as OnboardingPreferences["timezone"])}>
                      {ONBOARDING_TIMEZONES.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                    </select>
                  </label>
                </div>

                <label className={styles.checkboxCard} htmlFor="operational-emails">
                  <input
                    id="operational-emails"
                    type="checkbox"
                    checked={preferences.operationalEmailNotifications}
                    onChange={(event) => setPreference("operationalEmailNotifications", event.target.checked)}
                  />
                  <span>
                    <strong>Avisos operativos por correo</strong>
                    <small>Permite recibir incidencias y cambios relevantes relacionados con tu operativa.</small>
                  </span>
                </label>
              </section>
            )}

            {step === 2 && (
              <section aria-labelledby="onboarding-review-title">
                <div className={styles.sectionHeading}>
                  <span className={styles.eyebrow}>TODO PREPARADO</span>
                  <h2 id="onboarding-review-title">Revisa y entra en tu panel</h2>
                  <p>Guardaremos estas preferencias en tu perfil. Tu organización y tus permisos no se modificarán.</p>
                </div>

                <div className={styles.reviewList}>
                  <div><span>Organización</span><strong>{organization.name}</strong></div>
                  <div><span>Perfil</span><strong>{role.label}</strong></div>
                  <div><span>Nombre visible</span><strong>{preferences.displayName}</strong></div>
                  <div><span>Idioma</span><strong>{ONBOARDING_LANGUAGES.find(({ value }) => value === preferences.language)?.label}</strong></div>
                  <div><span>Zona horaria</span><strong>{ONBOARDING_TIMEZONES.find(({ value }) => value === preferences.timezone)?.label}</strong></div>
                  <div><span>Avisos por correo</span><strong>{preferences.operationalEmailNotifications ? "Activados" : "Desactivados"}</strong></div>
                </div>
                <button className={styles.editButton} type="button" onClick={() => setStep(1)}>Editar preferencias</button>
              </section>
            )}

            {error && <p className={styles.error} role="alert">{error}</p>}

            <div className={styles.actions}>
              <button className={styles.secondaryButton} type="button" onClick={goBack} disabled={step === 0 || isPending}>Anterior</button>
              <button className={styles.primaryButton} type="submit" disabled={isPending}>
                {isPending ? "Guardando configuración…" : step === steps.length - 1 ? "Guardar y entrar en FORNEXA" : "Continuar"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </main>
  );
}
