import { isDemoDataAllowed } from "./demo-mode.ts";

export const PREVIEW_DEMO_ROOT = "/demo";

export function isPreviewDemoPath(pathname: string | null | undefined) {
  return pathname === PREVIEW_DEMO_ROOT || Boolean(pathname?.startsWith(`${PREVIEW_DEMO_ROOT}/`));
}

// Public demo access requires the server's explicit Preview environment and opt-in.
// Neither NODE_ENV, NEXT_PUBLIC_*, cookies nor request parameters grant access.
export function isPreviewDemoEnabled(env: Record<string, string | undefined> = process.env) {
  return env.VERCEL_ENV === "preview" && isDemoDataAllowed(env) && env.FORNEXA_PREVIEW_DEMO === "1";
}

export function previewDemoRequestStatus(pathname: string, method: string, env: Record<string, string | undefined> = process.env) {
  if (!isPreviewDemoPath(pathname)) return null;
  if (!isPreviewDemoEnabled(env)) return 404;
  return method === "GET" || method === "HEAD" ? 200 : 405;
}
