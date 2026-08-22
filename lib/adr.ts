export type AdrFrequency = "NEVER" | "SOMETIMES" | "ALWAYS";
export type AdrDeclaration = "UNANSWERED" | "NO" | "YES";
export type HazardStatus = "UNKNOWN" | "NON_HAZARDOUS" | "HAZMAT";
export type AdrPolicy = "INFO" | "WARNING" | "ACKNOWLEDGEMENT" | "BLOCKING";

export type AdrLineInput = {
  sku?: string;
  description?: string;
  hazardStatus: HazardStatus;
  hazmatEntryId?: string;
  technicalName?: string;
  netQuantity?: number | null;
  quantityUom?: string;
  packageCount?: number | null;
  packagingTypeId?: string;
  rememberForProduct?: boolean;
};

export type AdrWarning = {
  code: string;
  message: string;
  line?: number;
};

export function defaultAdrDeclaration(frequency: AdrFrequency): AdrDeclaration {
  if (frequency === "ALWAYS") return "YES";
  if (frequency === "NEVER") return "NO";
  return "UNANSWERED";
}

export function evaluateAdrWarnings(
  declaration: AdrDeclaration,
  frequency: AdrFrequency,
  lines: AdrLineInput[],
): AdrWarning[] {
  const warnings: AdrWarning[] = [];

  if (frequency === "SOMETIMES" && declaration === "UNANSWERED") {
    warnings.push({ code: "ADR_DECLARATION_UNANSWERED", message: "Indica expresamente si el pedido contiene mercancía ADR." });
  }

  if (frequency === "ALWAYS" && declaration === "NO") {
    warnings.push({ code: "ADR_CUSTOMER_ALWAYS_OVERRIDE", message: "Este cliente declara envíos ADR habitualmente, pero el pedido se ha marcado como no ADR." });
  }

  if (frequency === "NEVER" && declaration === "YES") {
    warnings.push({ code: "ADR_CUSTOMER_NEVER_OVERRIDE", message: "Este cliente no suele declarar ADR. Revisa la excepción antes de continuar." });
  }

  lines.forEach((line, index) => {
    const lineNumber = index + 1;
    if (declaration === "NO" && line.hazardStatus === "HAZMAT") {
      warnings.push({ code: "ADR_HEADER_LINE_CONFLICT", line: lineNumber, message: `La línea ${lineNumber} está clasificada como peligrosa y la cabecera indica no ADR.` });
    }
    if (declaration === "YES" && line.hazardStatus === "UNKNOWN") {
      warnings.push({ code: "ADR_LINE_UNRESOLVED", line: lineNumber, message: `La línea ${lineNumber} todavía no se ha clasificado.` });
    }
    if (line.hazardStatus === "HAZMAT" && !line.hazmatEntryId) {
      warnings.push({ code: "ADR_MASTER_ENTRY_MISSING", line: lineNumber, message: `La línea ${lineNumber} no tiene una entrada verificada del maestro ADR.` });
    }
    if (line.hazardStatus === "HAZMAT" && (!line.netQuantity || !line.quantityUom)) {
      warnings.push({ code: "ADR_QUANTITY_MISSING", line: lineNumber, message: `La línea ${lineNumber} necesita cantidad neta y unidad para evaluar exenciones.` });
    }
    if (line.hazardStatus === "HAZMAT" && (!line.packageCount || !line.packagingTypeId)) {
      warnings.push({ code: "ADR_PACKAGING_MISSING", line: lineNumber, message: `La línea ${lineNumber} necesita número y tipo de embalaje verificado.` });
    }
  });

  return warnings;
}

export function shouldBlockForPolicy(policy: AdrPolicy, warnings: AdrWarning[]) {
  return policy === "BLOCKING" && warnings.length > 0;
}

