import { redirect } from "next/navigation";
import { getAuthenticatedOrReviewContext } from "@/lib/auth-context";
import { createSupabaseAdmin } from "@/lib/supabase-admin";
import type { CmrCustomerOption } from "@/lib/cmr-customer-selection";
import NewCmrWorkspace from "./NewCmrWorkspace";

export const dynamic = "force-dynamic";

export default async function NewCmrPage() {
  const auth = await getAuthenticatedOrReviewContext();
  if (!auth) redirect("/login");

  try {
    const supabase = createSupabaseAdmin();
    const { data, error } = await supabase.from("parties")
      .select("code,trade_name,legal_name")
      .eq("tenant_id", auth.tenantId)
      .eq("is_customer", true)
      .eq("status", "ACTIVE")
      .order("code");
    if (error) throw error;
    const customers: CmrCustomerOption[] = (data ?? []).map(item => ({ code: item.code, name: item.trade_name || item.legal_name || item.code }));
    return <NewCmrWorkspace customers={customers} />;
  } catch {
    console.error("Nuevo CMR: lectura del maestro de clientes no disponible.");
    return <NewCmrWorkspace customers={[]} customerLoadError />;
  }
}
