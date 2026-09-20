export type CmrDraft = {
  source: string;
  expediciones: string[];
  viaje: string;
  customerIds: string[];
  expedidor: string;
  destinatario: string;
  carga: string;
  entrega: string;
  transportista: string;
  matricula: string;
  remolque: string;
  mercancia: string;
  bultos: string;
  embalaje: string;
  peso: string;
  volumen: string;
  instrucciones: string;
  adr: string;
  adrRegime: string;
  unNumber: string;
  adrClass: string;
  packingGroup: string;
  tunnelCode: string;
  adrDescription: string;
};

type CmrReadinessInput = Partial<CmrDraft> & { expedicion?: string };

type ReadinessCheck = {
  label: string;
  complete: boolean;
};

function hasText(value: unknown) {
  return typeof value === "string" && value.trim().length > 0;
}

function hasValues(value: unknown) {
  return Array.isArray(value) && value.some(hasText);
}

export function createEmptyCmrDraft(): CmrDraft {
  return {
    source: "expedicion",
    expediciones: [],
    viaje: "",
    customerIds: [],
    expedidor: "",
    destinatario: "",
    carga: "",
    entrega: "",
    transportista: "",
    matricula: "",
    remolque: "",
    mercancia: "",
    bultos: "",
    embalaje: "",
    peso: "",
    volumen: "",
    instrucciones: "",
    adr: "",
    adrRegime: "",
    unNumber: "",
    adrClass: "",
    packingGroup: "",
    tunnelCode: "",
    adrDescription: "",
  };
}

export function cmrDraftReadiness(input: CmrReadinessInput) {
  const hasExpedition = hasText(input.expedicion) || hasValues(input.expediciones);
  const checks: ReadinessCheck[] = [
    { label: "Expedición", complete: hasExpedition },
    { label: "Customer ID", complete: hasValues(input.customerIds) },
    { label: "Expedidor", complete: hasText(input.expedidor) },
    { label: "Destinatario", complete: hasText(input.destinatario) },
    { label: "Lugar de carga", complete: hasText(input.carga) },
    { label: "Lugar de entrega", complete: hasText(input.entrega) },
    { label: "Transportista", complete: hasText(input.transportista) },
    { label: "Mercancía", complete: hasText(input.mercancia) },
    { label: "Peso bruto", complete: hasText(input.peso) },
  ];

  if (input.source === "viaje") {
    checks.splice(1, 0, { label: "Viaje", complete: hasText(input.viaje) });
  }

  if (input.adr === "S") {
    checks.push({ label: "Régimen ADR", complete: hasText(input.adrRegime) });
  }

  const missing = checks.filter(check => !check.complete).map(check => check.label);
  const completed = checks.length - missing.length;
  return {
    missing,
    completeness: Math.round((completed / checks.length) * 100),
  };
}
