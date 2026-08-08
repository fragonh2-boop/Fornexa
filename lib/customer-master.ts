export type CustomerRecord = {
  code: string; legalName: string; tradeName: string; taxId: string; type: "Cliente" | "Proveedor" | "Cliente y proveedor";
  country: "ES" | "FR" | "PT"; province: string; city: string; segment: string; status: "Activo" | "En revisión" | "Bloqueado" | "Inactivo";
  salesEmail: string; phone: string; accountManager: string; paymentTerms: string; creditLimit: string; rate: string; adrControl: "S" | "N";
  shipments: number; openOffers: number; addresses: number; annualRevenue: string; lastActivity: string;
};

const locations = [
  ["Valencia","Valencia"],["Barcelona","Barcelona"],["Madrid","Madrid"],["Alicante","Alicante"],["Sevilla","Sevilla"],["Zaragoza","Zaragoza"],["Málaga","Málaga"],["Murcia","Murcia"],["Bizkaia","Bilbao"],["Asturias","Gijón"],["Navarra","Pamplona"],["Tarragona","Tarragona"],
] as const;
const prefixes = ["Mediterránea","Nova","Atlas","Iberia","Levante","Norte","Global","Delta","Horizonte","Vértice","Logis","Innova","Península","Central","Europa"];
const suffixes = ["Retail","Distribution","Components","Foods","Industrial","Pharma","Home","Automotive","Textile","Fresh","Packaging","Technology"];
const segments = ["Gran cuenta","Industria","Retail","Automoción","Alimentación","Distribución","E-commerce","Farmacéutico"];
const managers = ["Francisco González","Laura Pérez","Marc Vidal","Ana Torres","Sergio Romero"];

export const customers: CustomerRecord[] = Array.from({ length: 146 }, (_, index) => {
  const number = 146 - index;
  const [province, city] = locations[index % locations.length];
  const tradeName = index === 0 ? "Mediterránea Retail" : index === 1 ? "Nova Distribution" : index === 2 ? "Atlas Components" : `${prefixes[index % prefixes.length]} ${suffixes[(index * 5) % suffixes.length]} ${String(index + 1).padStart(2, "0")}`;
  const status: CustomerRecord["status"] = index < 132 ? "Activo" : index < 140 ? "En revisión" : index < 143 ? "Bloqueado" : "Inactivo";
  const slug = tradeName.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, ".");
  return {
    code: `CLI-${String(number).padStart(6, "0")}`, legalName: `${tradeName}, ${index % 4 === 0 ? "S.A." : "S.L."}`, tradeName,
    taxId: `${["B","A"][index % 2]}${String(46000000 + index * 7919).slice(0, 8)}`, type: index % 11 === 0 ? "Cliente y proveedor" : "Cliente",
    country: "ES", province, city, segment: segments[index % segments.length], status, salesEmail: `compras@${slug}.com`, phone: `+34 9${String(10000000 + index * 137).slice(-8)}`,
    accountManager: managers[index % managers.length], paymentTerms: index % 3 === 0 ? "60 días" : "30 días", creditLimit: `${(15 + index % 12) * 1000}.000,00 €`, rate: `TF-ES-${["FR","PT","DE","IT"][index % 4]}-${String((index % 9) + 1).padStart(2, "0")}`,
    adrControl: index % 7 === 0 ? "S" : "N",
    shipments: 4 + (index * 13) % 94, openOffers: (index * 7) % 8, addresses: 1 + index % 5, annualRevenue: `${(75 + (index * 37) % 925).toLocaleString("es-ES")}.000 €`, lastActivity: index % 2 ? "Hoy" : index % 3 ? "Ayer" : "Esta semana",
  };
});

export function getCustomer(id: string) { return customers.find(customer => customer.code === id || customer.tradeName === id); }
