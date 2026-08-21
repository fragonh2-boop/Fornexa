export type AuthEmailFlow = "recover" | "first-access";

export const RECOVERY_TOKEN_COOKIE = "fornexa_recovery_token";

export function parseAuthEmailFlow(value: unknown): AuthEmailFlow {
  return value === "first-access" ? "first-access" : "recover";
}

export function resetPasswordPath(flow: AuthEmailFlow) {
  return flow === "first-access" ? "/reset-password?firstAccess=1" : "/reset-password";
}

export function recoveryVerificationPath(flow: AuthEmailFlow) {
  return flow === "first-access" ? "/auth/verify?flow=first-access" : "/auth/verify?flow=recover";
}

export function isSafeTokenHash(value: string | null | undefined) {
  return Boolean(value && value.length <= 1024 && /^[A-Za-z0-9._~-]+$/.test(value));
}

export function safeInternalPath(value: string | null | undefined, fallback: string) {
  return value?.startsWith("/")
    && !value.startsWith("//")
    && !value.includes("\\")
    && !/[\u0000-\u001f\u007f]/.test(value)
    ? value
    : fallback;
}

export function loginErrorMessage(message: string) {
  const normalized = message.toLowerCase();

  if (normalized.includes("invalid login credentials")) {
    return "El correo o la contraseña no son correctos. Si es tu primer acceso, abre el enlace de verificación y crea primero una contraseña.";
  }
  if (normalized.includes("email not confirmed")) {
    return "Debes confirmar primero el correo electrónico desde el enlace que te hemos enviado.";
  }
  if (normalized.includes("rate limit") || normalized.includes("too many requests")) {
    return "Se han realizado demasiados intentos. Espera unos minutos antes de volver a intentarlo.";
  }

  return "No se ha podido iniciar sesión. Revisa tus datos o inténtalo de nuevo más tarde.";
}

export function authEmailCopy(flow: AuthEmailFlow) {
  if (flow === "first-access") {
    return {
      subject: "Activa tu acceso a FORNEXA",
      heading: "Activa tu acceso",
      introduction: "Tu cuenta de FORNEXA está preparada. Verifica tu identidad y crea tu contraseña para acceder.",
      button: "Crear contraseña",
      tag: "first-access",
    };
  }

  return {
    subject: "Restablece tu contraseña de FORNEXA",
    heading: "Restablecer contraseña",
    introduction: "Hemos recibido una solicitud para crear una nueva contraseña para tu cuenta de FORNEXA.",
    button: "Crear nueva contraseña",
    tag: "password-recovery",
  };
}
