export const DECA_PUBLIC_POST_COMPLETION_DAYS = 7;
export const DECA_PUBLIC_POST_COMPLETION_MS =
  DECA_PUBLIC_POST_COMPLETION_DAYS * 24 * 60 * 60 * 1000;

export type DeCAPublicAccessWindow = {
  valid_from: string;
  service_completed_at: string | null;
  public_until: string | null;
  deactivated_at: string | null;
};

export function decaMinimumPublicUntilMs(serviceCompletedAt: string) {
  const completedAt = Date.parse(serviceCompletedAt);
  if (!Number.isFinite(completedAt)) return null;
  return completedAt + DECA_PUBLIC_POST_COMPLETION_MS;
}

export function decaPublicAccessWindowIsUsable(row: DeCAPublicAccessWindow, now = Date.now()) {
  if (row.deactivated_at || !row.public_until) return false;

  const validFrom = Date.parse(row.valid_from);
  const publicUntil = Date.parse(row.public_until);
  if (!Number.isFinite(validFrom) || !Number.isFinite(publicUntil)) return false;
  if (validFrom > now || publicUntil < now) return false;

  if (row.service_completed_at) {
    const minimumPublicUntil = decaMinimumPublicUntilMs(row.service_completed_at);
    if (minimumPublicUntil == null || publicUntil < minimumPublicUntil) return false;
  }

  return true;
}
