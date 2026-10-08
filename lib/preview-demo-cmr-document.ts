import type { CmrView } from "../app/dashboard/epod-cmr/[cmr]/CmrDocumentWorkspace";

// No document key, QR, signature or backend identifier is fabricated.
export function previewDemoCmrDocument(cmr: string): CmrView | null {
  if (!["DEMO-CMR-001", "DEMO-CMR-002", "DEMO-CMR-003"].includes(cmr)) return null;
  return {
    expedicion: "DEMO-EXP-001", viaje: "DEMO-VJ-001", fecha: "07/10/2026", estado: "Ficticio · No emitido",
    remitente: "Cliente ficticio Aurora", remitenteDireccion: "Dirección ficticia de origen",
    destinatario: "Destino ficticio Horizonte", destinatarioDireccion: "Dirección ficticia de entrega",
    carga: "Centro de muestra de origen", entrega: "Centro de muestra de destino",
    transportista: "Transportista ficticio", tractor: "DEMO", remolque: "—",
    goodsLines: [{ marks: "DEMO-PT-001", packages: "0", packaging: "Caja de muestra", description: "Mercancía completamente ficticia para comprobar la estructura y la lectura de textos largos sin emitir un documento regulatorio.", statisticalNumber: "—", weight: "0 kg", volume: "0 m³" }],
    senderInstructions: "Demostración sin validez documental.", carrierReservations: "Sin datos reales",
    particularTerms: "No válido para transporte", attachedDocuments: [], successiveCarriers: [],
    carriageCharges: "Simulado", cashOnDelivery: "Simulado", established: "Entorno demo",
    firmaExpedidor: "No firmado", firmaTransportista: "No firmado", firmaDestinatario: "No firmado",
  };
}
