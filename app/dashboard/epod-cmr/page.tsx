import { type GridRow } from "../../components/DataGrid";
import { createSupabaseAdmin } from "@/lib/supabase-admin";
import CmrListView from "./CmrListView";

function formatDate(value: string | null | undefined) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : new Intl.DateTimeFormat("es-ES").format(date);
}

async function getDocuments() {
  const supabase = createSupabaseAdmin();
  const { data, error } = await supabase
    .from("cmr_documents")
    .select(`
      id,
      cmr_number,
      status,
      pickup_location,
      delivery_location,
      carrier_reservations,
      issued_at,
      trip_id,
      cmr_expeditions (
        sequence,
        expedition:expeditions!cmr_expeditions_expedition_id_fkey ( code )
      ),
      cmr_signatures ( role )
    `)
    .order("issued_at", { ascending: false });

  if (error) {
    console.error("CMR: error al leer Supabase", error);
    return [];
  }

  return (data ?? []).map((document: any) => {
    const expeditions = [...(document.cmr_expeditions ?? [])].sort((a: any, b: any) => (a.sequence ?? 0) - (b.sequence ?? 0));
    const expeditionCodes = expeditions.map((item: any) => item.expedition?.code).filter(Boolean);
    const signatures = document.cmr_signatures ?? [];
    const reservations = String(document.carrier_reservations || "").trim();
    return {
      cmr: document.cmr_number as string,
      expedicion: expeditionCodes.length ? expeditionCodes.join(", ") : "—",
      viaje: document.trip_id || "—",
      ruta: `${document.pickup_location || "—"} → ${document.delivery_location || "—"}`,
      fecha: formatDate(document.issued_at),
      firmas: `${signatures.length}/3`,
      reservas: reservations ? reservations : "Sin reservas",
      estado: document.status || "—",
    } satisfies GridRow;
  });
}

export default async function CmrPage() {
  const rows = await getDocuments();
  return <CmrListView rows={rows} />;
}
