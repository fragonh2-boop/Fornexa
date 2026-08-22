import { NextResponse } from "next/server";
import { getAuthenticatedContext } from "@/lib/auth-context";
import { createSupabaseAdmin } from "@/lib/supabase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await getAuthenticatedContext();
  if (!auth) return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  const query = new URL(request.url).searchParams.get("q")?.trim() ?? "";
  if (query.length < 2) return NextResponse.json({ items: [] }, { headers: { "Cache-Control": "no-store" } });

  const supabase = createSupabaseAdmin();
  const safe = query.replace(/[%_,()]/g, " ").trim();
  const numeric = safe.replace(/^UN\s*/i, "").replace(/\D/g, "");
  let builder = supabase.from("hazmat_entries").select(`
    id,entry_key,un_number,proper_shipping_name_es,class_code,subsidiary_risks,
    packing_group,hazard_identification_number,tunnel_restriction_code,
    limited_quantity_value,limited_quantity_uom,excepted_quantity_code,
    transport_category,technical_name_required,environmentally_hazardous,
    edition:hazmat_editions!inner(code,status),
    hazmat_entry_packaging_options(
      id,packing_instruction_code,limited_quantity_allowed,excepted_quantity_allowed,
      packaging_type:hazmat_packaging_types(id,code,name_es,family)
    )
  `).eq("edition.status", "ACTIVE");
  builder = numeric.length >= 2
    ? builder.or(`un_number.ilike.%${numeric}%,proper_shipping_name_es.ilike.%${safe}%`)
    : builder.ilike("proper_shipping_name_es", `%${safe}%`);
  const { data, error } = await builder.order("un_number").limit(20);
  if (error) return NextResponse.json({ error: "No se pudo consultar el maestro ADR." }, { status: 500 });
  return NextResponse.json({ items: data ?? [] }, { headers: { "Cache-Control": "no-store" } });
}
