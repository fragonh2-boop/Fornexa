import { NextResponse } from "next/server";
import { getAuthenticatedContext } from "@/lib/auth-context";
import { createSupabaseAdmin } from "@/lib/supabase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await getAuthenticatedContext();
  if (!auth) return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  const params = new URL(request.url).searchParams;
  const sku = params.get("sku")?.trim().toUpperCase();
  const customerCode = params.get("customerCode")?.trim().toUpperCase();
  if (!sku || !customerCode) return NextResponse.json({ item: null });

  const supabase = createSupabaseAdmin();
  const { data: customer } = await supabase.from("parties").select("id")
    .eq("tenant_id", auth.tenantId).eq("code", customerCode).eq("is_customer", true).maybeSingle();
  if (!customer) return NextResponse.json({ item: null });

  const { data, error } = await supabase.from("products").select(`
    id,sku,name,hazard_status,
    product_hazmat_assignments!product_hazmat_assignments_product_id_fkey(
      id,status,valid_to,hazmat_entry:hazmat_entries(
        id,entry_key,un_number,proper_shipping_name_es,class_code,subsidiary_risks,
        packing_group,hazard_identification_number,tunnel_restriction_code,
        limited_quantity_value,limited_quantity_uom,excepted_quantity_code,
        transport_category,technical_name_required,environmentally_hazardous,
        edition:hazmat_editions(code,status)
      )
    )
  `).eq("tenant_id", auth.tenantId).eq("customer_id", customer.id).eq("sku", sku).eq("status", "ACTIVE").maybeSingle();
  if (error) return NextResponse.json({ error: "No se pudo consultar el artículo." }, { status: 500 });
  const assignment = (data?.product_hazmat_assignments ?? []).find((item: any) => !item.valid_to && item.status !== "RETIRED");
  return NextResponse.json({ item: data ? {
    id: data.id,
    sku: data.sku,
    name: data.name,
    hazardStatus: data.hazard_status,
    hazmatEntry: assignment?.hazmat_entry ?? null,
    assignmentStatus: assignment?.status ?? null,
  } : null }, { headers: { "Cache-Control": "no-store" } });
}

