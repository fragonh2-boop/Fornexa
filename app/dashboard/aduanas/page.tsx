import { createSupabaseAdmin } from "@/lib/supabase-admin";
import { getAuthenticatedOrReviewContext } from "@/lib/auth-context";
import CustomsListView from "./CustomsListView";

const DIRECTION_LABELS: Record<string, string> = {
  IMPORT: "Importación",
  EXPORT: "Exportación",
  TRANSIT: "Tránsito",
};

const STATUS_LABELS: Record<string, string> = {
  DRAFT: "Borrador",
  SUBMITTED: "Presentado",
  ACCEPTED: "Aceptado",
  CONTROL: "Control aduanero",
  RELEASED: "Levante",
  CLOSED: "Cerrado",
  REJECTED: "Rechazado",
  CANCELLED: "Cancelado",
};

function formatDate(value: string | null | undefined) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : new Intl.DateTimeFormat("es-ES", { dateStyle: "short", timeStyle: "short" }).format(date);
}

async function getCases() {
  const auth = await getAuthenticatedOrReviewContext();
  if (!auth) return [];

  const supabase = createSupabaseAdmin();
  const { data, error } = await supabase
    .from("customs_cases")
    .select("id, reference, country_code, direction, system, status, mrn, declarant_eori, representative_eori, payload, created_at, updated_at")
    .eq("tenant_id", auth.tenantId)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Aduanas: error al leer Supabase", error);
    return [];
  }

  return (data ?? []).map((item: any) => ({
    id: item.reference || item.id,
    direction: DIRECTION_LABELS[item.direction] ?? item.direction ?? "—",
    system: item.system || "—",
    status: STATUS_LABELS[item.status] ?? item.status ?? "—",
    mrn: item.mrn || "—",
    country: item.country_code || "—",
    declarant: item.declarant_eori || "—",
    representative: item.representative_eori || "—",
    updatedAt: formatDate(item.updated_at),
    payload: item.payload ?? {},
  }));
}

export default async function CustomsPage() {
  const cases = await getCases();
  return <CustomsListView cases={cases} />;
}
