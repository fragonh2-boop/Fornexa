export type CompanyMasterData = {
  legalName: string;
  tradeName: string;
  taxId: string;
  address: string;
  postalCode: string;
  city: string;
  country: string;
  phone: string;
  email: string;
  website: string;
  logoText: string;
  cmrStamp: {
    title: string;
    legalName: string;
    taxId: string;
    location: string;
    registration: string;
  };
};

// Maestro provisional. En producción se sustituirá por datos persistidos en Supabase
// y por activos gráficos administrables (logo y sello en SVG/PNG).
export const companyMaster: CompanyMasterData = {
  legalName: "FORNEXA LOGISTICS, S.L.",
  tradeName: "FORNEXA",
  taxId: "B-12345678",
  address: "Av. de la Logística, 24",
  postalCode: "46980",
  city: "Paterna (Valencia)",
  country: "España",
  phone: "+34 960 000 000",
  email: "operaciones@fornexa.eu",
  website: "www.fornexa.eu",
  logoText: "FORNEXA",
  cmrStamp: {
    title: "EXPEDIDOR",
    legalName: "FORNEXA LOGISTICS, S.L.",
    taxId: "CIF B-12345678",
    location: "46980 PATERNA · VALENCIA · ESPAÑA",
    registration: "SELLO CMR · DATOS MAESTROS",
  },
};
