/**
 * Single decision point for illustrative ("atrezzo") data.
 *
 * Production must never render fictitious operational data. Preview and local
 * development keep the demo content so the product can still be shown without
 * real customers. The decision fails closed: an unknown or missing environment
 * is treated as production.
 */
export type DeploymentEnvironment = "production" | "preview" | "development" | "unknown";

type EnvSource = Record<string, string | undefined>;

const KNOWN_VERCEL_ENVIRONMENTS = new Set(["production", "preview", "development"]);

export function resolveDeploymentEnvironment(env: EnvSource = process.env): DeploymentEnvironment {
  const vercel = (env.VERCEL_ENV ?? env.NEXT_PUBLIC_VERCEL_ENV ?? "").trim().toLowerCase();
  if (KNOWN_VERCEL_ENVIRONMENTS.has(vercel)) return vercel as DeploymentEnvironment;
  // Outside Vercel only a local `next dev` session counts as development.
  if (!vercel && env.NODE_ENV === "development") return "development";
  return "unknown";
}

export function isDemoDataAllowed(env: EnvSource = process.env): boolean {
  const environment = resolveDeploymentEnvironment(env);
  return environment === "preview" || environment === "development";
}
