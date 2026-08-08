import { CanonicalDriverStatus, telematicsProviders } from "./providers";

export type ProviderReadiness = {
  provider: string;
  slug: string;
  configured: boolean;
  missingEnv: string[];
  publicContract: string;
  executableProbe: boolean;
};

export function getProviderReadiness(): ProviderReadiness[] {
  return telematicsProviders.map((provider) => {
    const missingEnv = provider.env.filter((key) => !process.env[key]);
    return {
      provider: provider.name,
      slug: provider.slug,
      configured: missingEnv.length === 0,
      missingEnv,
      publicContract: provider.readiness,
      executableProbe: ["samsara", "cartrack", "geotab"].includes(provider.slug),
    };
  });
}

export function providerBySlug(slug: string) {
  return telematicsProviders.find((provider) => provider.slug === slug);
}

export async function probeProvider(slug: string) {
  const provider = providerBySlug(slug);
  if (!provider) return { ok: false, status: 404, message: "Proveedor no registrado" };
  const readiness = getProviderReadiness().find((item) => item.slug === slug)!;
  if (!readiness.configured) {
    return { ok: false, status: 428, message: "Pendiente de credenciales/autorización", readiness };
  }

  try {
    if (slug === "samsara") {
      const response = await fetch(`${provider.baseUrl}/fleet/vehicles?limit=1`, {
        headers: { Authorization: `Bearer ${process.env.SAMSARA_API_TOKEN}` }, cache: "no-store",
      });
      return { ok: response.ok, status: response.status, message: response.ok ? "Samsara API accesible" : "Samsara rechazó el probe" };
    }

    if (slug === "cartrack") {
      const baseUrl = process.env.CARTRACK_BASE_URL;
      const auth = Buffer.from(`${process.env.CARTRACK_USERNAME}:${process.env.CARTRACK_PASSWORD}`).toString("base64");
      const response = await fetch(`${baseUrl}/rest/vehicles`, { headers: { Authorization: `Basic ${auth}`, Accept: "application/json" }, cache: "no-store" });
      return { ok: response.ok, status: response.status, message: response.ok ? "Cartrack API accesible" : "Cartrack rechazó el probe" };
    }

    if (slug === "geotab") {
      const server = process.env.GEOTAB_SERVER || "my.geotab.com";
      const response = await fetch(`https://${server}/apiv1`, {
        method: "POST", headers: { "content-type": "application/json" }, cache: "no-store",
        body: JSON.stringify({ method: "Authenticate", params: { database: process.env.GEOTAB_DATABASE, userName: process.env.GEOTAB_USERNAME, password: process.env.GEOTAB_PASSWORD } }),
      });
      return { ok: response.ok, status: response.status, message: response.ok ? "Geotab API respondió" : "Geotab rechazó el probe" };
    }

    return { ok: true, status: 200, message: "Configuración presente; probe live pendiente de contrato técnico del proveedor" };
  } catch (error) {
    return { ok: false, status: 502, message: error instanceof Error ? error.message : "Error de conectividad" };
  }
}

function activity(value: unknown): CanonicalDriverStatus["activity"] {
  const normalized = String(value ?? "").toUpperCase();
  if (normalized.includes("DRIV")) return "DRIVING";
  if (normalized.includes("WORK")) return "WORK";
  if (normalized.includes("AVAIL")) return "AVAILABLE";
  if (normalized.includes("REST") || normalized.includes("BREAK")) return "REST";
  return "UNKNOWN";
}

function secondsToMinutes(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(0, Math.round(n / 60)) : null;
}

export function normalizeSamsaraLive(payload: any): CanonicalDriverStatus[] {
  const rows = Array.isArray(payload?.data) ? payload.data : [];
  return rows.map((row: any) => ({
    provider: "samsara",
    driverId: String(row?.driver?.id ?? row?.driverId ?? ""),
    vehicleId: String(row?.vehicle?.id ?? row?.vehicleId ?? ""),
    activity: activity(row?.workingState ?? row?.activity),
    remainingUntilBreakMin: secondsToMinutes(row?.drivingTime?.remainingUntilBreakMs ? Number(row.drivingTime.remainingUntilBreakMs) / 1000 : row?.remainingUntilBreakSeconds),
    remainingDailyDrivingMin: secondsToMinutes(row?.drivingTime?.remainingDailyDrivingMs ? Number(row.drivingTime.remainingDailyDrivingMs) / 1000 : row?.remainingDailyDrivingSeconds),
    nextRequiredBreakMin: secondsToMinutes(row?.drivingTime?.nextRequiredBreakMs ? Number(row.drivingTime.nextRequiredBreakMs) / 1000 : row?.nextRequiredBreakSeconds),
    gpsLat: Number.isFinite(Number(row?.location?.latitude)) ? Number(row.location.latitude) : null,
    gpsLon: Number.isFinite(Number(row?.location?.longitude)) ? Number(row.location.longitude) : null,
    speedKmh: Number.isFinite(Number(row?.speedKph)) ? Number(row.speedKph) : null,
    observedAt: String(row?.updatedAtTime ?? row?.time ?? new Date().toISOString()),
    sourceId: String(row?.id ?? ""),
  }));
}
