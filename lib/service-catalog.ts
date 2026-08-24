export type Weekday = "L" | "M" | "X" | "J" | "V" | "S" | "D";

export type ServiceCoverage = {
  id: string;
  countryCode: string;
  country: string;
  zone: string;
  postalCodeRules: string[];
  terminalCity: string;
  terminalPostalCode: string;
  partner: string;
  serviceMode: "Grupaje" | "LTL" | "FTL" | "Express" | "Intermodal";
  departureDays: Weekday[];
  estimatedTransitDays: number;
  hub?: string;
  adr: "Sí" | "No" | "Consultar";
  active: boolean;
  source: string;
};

export type ShipmentDecisionInput = {
  originCountryCode: string;
  destinationCountryCode: string;
  destinationPostalCode: string;
  pallets: number;
  weightKg: number;
  adr: boolean;
  requestedDeliveryDate?: string;
};

export type ServiceProposal = {
  serviceId: string;
  score: number;
  feasible: boolean;
  reasons: string[];
};

export const serviceCatalog: ServiceCoverage[] = [
  {
    id: "SRV-FR-59273",
    countryCode: "FR",
    country: "Francia",
    zone: "Lille / Norte",
    postalCodeRules: ["59", "62"],
    terminalCity: "Fretin",
    terminalPostalCode: "59273",
    partner: "Red de corresponsalía Francia",
    serviceMode: "Grupaje",
    departureDays: ["L", "M", "X", "J", "V"],
    estimatedTransitDays: 2,
    hub: "Lille",
    adr: "Consultar",
    active: true,
    source: "DEPLIANT revisión 0152 · 09/03/2026",
  },
  {
    id: "SRV-FR-66600",
    countryCode: "FR",
    country: "Francia",
    zone: "Perpiñán / Pirineos Orientales",
    postalCodeRules: ["66"],
    terminalCity: "Rivesaltes",
    terminalPostalCode: "66600",
    partner: "Red de corresponsalía Francia",
    serviceMode: "Grupaje",
    departureDays: ["L", "M", "X", "J", "V"],
    estimatedTransitDays: 1,
    hub: "Perpiñán",
    adr: "Consultar",
    active: true,
    source: "DEPLIANT revisión 0152 · 09/03/2026",
  },
  {
    id: "SRV-DE-79331",
    countryCode: "DE",
    country: "Alemania",
    zone: "Baden-Württemberg",
    postalCodeRules: ["70-79"],
    terminalCity: "Teningen",
    terminalPostalCode: "79331",
    partner: "Red de corresponsalía Alemania",
    serviceMode: "Grupaje",
    departureDays: ["L", "M", "X", "J", "V"],
    estimatedTransitDays: 3,
    hub: "Sur de Alemania",
    adr: "Consultar",
    active: true,
    source: "DEPLIANT revisión 0152 · 09/03/2026",
  },
  {
    id: "SRV-DE-01723",
    countryCode: "DE",
    country: "Alemania",
    zone: "Sajonia",
    postalCodeRules: ["01-09"],
    terminalCity: "Wilsdruff",
    terminalPostalCode: "01723",
    partner: "Red de corresponsalía Alemania",
    serviceMode: "Grupaje",
    departureDays: ["L", "M", "X", "J", "V"],
    estimatedTransitDays: 4,
    hub: "Este de Alemania",
    adr: "Consultar",
    active: true,
    source: "DEPLIANT revisión 0152 · 09/03/2026",
  },
  {
    id: "SRV-IT-40010",
    countryCode: "IT",
    country: "Italia",
    zone: "Bologna / Emilia-Romagna",
    postalCodeRules: ["40-48"],
    terminalCity: "Bentivoglio",
    terminalPostalCode: "40010",
    partner: "ARCO Spedizioni S.p.A. · Filiale di Bologna",
    serviceMode: "Grupaje",
    departureDays: ["L", "M", "X", "J", "V"],
    estimatedTransitDays: 3,
    hub: "Interporto Bologna",
    adr: "Consultar",
    active: true,
    source: "DEPLIANT revisión 0152 · 09/03/2026",
  },
  {
    id: "SRV-IT-20020",
    countryCode: "IT",
    country: "Italia",
    zone: "Milán / Lombardía",
    postalCodeRules: ["20-23", "27"],
    terminalCity: "Lainate",
    terminalPostalCode: "20020",
    partner: "Red de corresponsalía Italia",
    serviceMode: "Grupaje",
    departureDays: ["L", "M", "X", "J", "V"],
    estimatedTransitDays: 3,
    hub: "Milán",
    adr: "Consultar",
    active: true,
    source: "DEPLIANT revisión 0152 · 09/03/2026",
  },
  {
    id: "SRV-PT-2660",
    countryCode: "PT",
    country: "Portugal",
    zone: "Lisboa",
    postalCodeRules: ["1", "2"],
    terminalCity: "São Julião do Tojal",
    terminalPostalCode: "2660",
    partner: "Red de corresponsalía Portugal",
    serviceMode: "Grupaje",
    departureDays: ["L", "M", "X", "J", "V"],
    estimatedTransitDays: 2,
    hub: "Lisboa",
    adr: "Consultar",
    active: true,
    source: "DEPLIANT revisión 0152 · 09/03/2026",
  },
];

function postalRuleMatches(postalCode: string, rule: string) {
  const prefix = Number(postalCode.slice(0, 2));
  if (rule.includes("-")) {
    const [from, to] = rule.split("-").map(Number);
    return prefix >= from && prefix <= to;
  }
  return postalCode.startsWith(rule);
}

export function proposeServices(input: ShipmentDecisionInput): ServiceProposal[] {
  return serviceCatalog
    .filter((service) => service.active && service.countryCode === input.destinationCountryCode)
    .map((service) => {
      const coverage = service.postalCodeRules.some((rule) => postalRuleMatches(input.destinationPostalCode, rule));
      const adrCompatible = !input.adr || service.adr !== "No";
      const reasons = [
        coverage ? "Código postal cubierto por la red" : "Código postal fuera de la cobertura configurada",
        adrCompatible ? "Compatibilidad ADR susceptible de validación" : "Servicio no compatible con ADR",
        `Tránsito de referencia: ${service.estimatedTransitDays} días`,
        `Salidas: ${service.departureDays.join("-")}`,
      ];
      return {
        serviceId: service.id,
        feasible: coverage && adrCompatible,
        score: Math.max(0, (coverage ? 65 : 5) + (adrCompatible ? 15 : 0) + Math.max(0, 20 - service.estimatedTransitDays * 3)),
        reasons,
      };
    })
    .sort((a, b) => b.score - a.score);
}
