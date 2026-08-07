import type { CustomsSystem } from "../types";

export const aeatSystems: Record<CustomsSystem, { label: string; purpose: string; guideVersion: string }> = {
  H1: { label: "Importación CAU H1", purpose: "Importación ordinaria", guideVersion: "3.16+" },
  H7: { label: "Importación H7", purpose: "Envíos de escaso valor", guideVersion: "3.20+" },
  AES: { label: "AES", purpose: "Exportación y salida", guideVersion: "1.25+" },
  NCTS6: { label: "NCTS6", purpose: "Tránsito", guideVersion: "1.20+" },
  G3: { label: "G3v2", purpose: "Presentación de mercancías", guideVersion: "2.14+" },
  G4: { label: "G4", purpose: "Depósito temporal", guideVersion: "1.15+" },
  G5: { label: "G5v2", purpose: "Movimientos de depósito temporal", guideVersion: "vigente" },
  EXS: { label: "EXS", purpose: "Declaración sumaria de salida", guideVersion: "v5" },
  POUS: { label: "PoUS", purpose: "Estatuto de mercancía de la Unión", guideVersion: "vigente" },
  DOCUMENTS: { label: "Documentos digitalizados", purpose: "Anexos justificativos", guideVersion: "vigente" },
};
