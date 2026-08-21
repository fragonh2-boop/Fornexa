import OnboardingWizard from "../onboarding/OnboardingWizard";

export default function OnboardingPreviewPage() {
  return (
    <OnboardingWizard
      email="usuario@fornexa.test"
      organization={{ name: "FORNEXA Pilot", code: "FORNEXA-PILOT", status: "PILOT" }}
      role={{
        label: "Propietario",
        summary: "Control total del espacio de trabajo y su configuración.",
        capabilities: ["Administración de usuarios", "Configuración de la organización", "Acceso operativo completo"],
      }}
      initialPreferences={{
        displayName: "Francisco González",
        language: "es",
        timezone: "Europe/Madrid",
        operationalEmailNotifications: true,
      }}
      previouslyCompleted={false}
    />
  );
}
