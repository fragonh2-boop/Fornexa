type AuthErrorLike = {
  code?: string;
  message?: string;
  name?: string;
  status?: number;
};

const DEAD_SESSION_CODES = new Set([
  "bad_jwt",
  "refresh_token_not_found",
  "session_not_found",
  "user_not_found",
]);

const DEAD_SESSION_MESSAGE = /auth session missing|invalid jwt|refresh token not found|session not found|user not found/i;

export function supabaseAuthCookieBase(url: string) {
  try {
    const hostname = new URL(url).hostname;
    const projectRef = hostname.split(".")[0];
    return projectRef ? `sb-${projectRef}-auth-token` : null;
  } catch {
    return null;
  }
}

export function supabaseAuthCookieNames(
  cookies: ReadonlyArray<{ name: string }>,
  url: string,
) {
  const base = supabaseAuthCookieBase(url);
  if (!base) return [];

  return cookies
    .map(cookie => cookie.name)
    .filter(name => name === base || (
      name.startsWith(`${base}.`)
      && /^\d+$/.test(name.slice(base.length + 1))
    ));
}

export function shouldClearDeadSession(
  hasAuthCookies: boolean,
  userId: string | null,
  error: AuthErrorLike | null,
) {
  if (!hasAuthCookies || userId) return false;
  if (!error) return true;

  const code = error.code?.toLowerCase();
  if (code && DEAD_SESSION_CODES.has(code)) return true;
  if (error.name === "AuthSessionMissingError") return true;
  if (error.message && DEAD_SESSION_MESSAGE.test(error.message)) return true;

  return error.status === 400
    || error.status === 401
    || error.status === 403
    || error.status === 404;
}
