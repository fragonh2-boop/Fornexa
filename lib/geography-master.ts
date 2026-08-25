export type GeographyCountry = {
  code: string;
  name: string;
};

export type GeographySubdivision = {
  id: string;
  code: string;
  name: string;
  postalPrefix: string | null;
};

type CountryRegionSource = {
  countryName?: string;
  countryShortCode?: string;
  regions?: Array<{ name?: string; shortCode?: string }>;
};

const WORLD_GEOGRAPHY_SOURCE = "https://raw.githubusercontent.com/country-regions/country-region-data/master/data.json";

export const spanishProvinces = [
  ["01", "Álava"], ["02", "Albacete"], ["03", "Alicante"], ["04", "Almería"], ["05", "Ávila"], ["06", "Badajoz"],
  ["07", "Illes Balears"], ["08", "Barcelona"], ["09", "Burgos"], ["10", "Cáceres"], ["11", "Cádiz"], ["12", "Castellón"],
  ["13", "Ciudad Real"], ["14", "Córdoba"], ["15", "A Coruña"], ["16", "Cuenca"], ["17", "Girona"], ["18", "Granada"],
  ["19", "Guadalajara"], ["20", "Gipuzkoa"], ["21", "Huelva"], ["22", "Huesca"], ["23", "Jaén"], ["24", "León"],
  ["25", "Lleida"], ["26", "La Rioja"], ["27", "Lugo"], ["28", "Madrid"], ["29", "Málaga"], ["30", "Murcia"],
  ["31", "Navarra"], ["32", "Ourense"], ["33", "Asturias"], ["34", "Palencia"], ["35", "Las Palmas"], ["36", "Pontevedra"],
  ["37", "Salamanca"], ["38", "Santa Cruz de Tenerife"], ["39", "Cantabria"], ["40", "Segovia"], ["41", "Sevilla"], ["42", "Soria"],
  ["43", "Tarragona"], ["44", "Teruel"], ["45", "Toledo"], ["46", "Valencia"], ["47", "Valladolid"], ["48", "Bizkaia"],
  ["49", "Zamora"], ["50", "Zaragoza"], ["51", "Ceuta"], ["52", "Melilla"],
] as const;

export const frenchDepartments = [
  ["01", "Ain"], ["02", "Aisne"], ["03", "Allier"], ["04", "Alpes-de-Haute-Provence"], ["05", "Hautes-Alpes"], ["06", "Alpes-Maritimes"],
  ["07", "Ardèche"], ["08", "Ardennes"], ["09", "Ariège"], ["10", "Aube"], ["11", "Aude"], ["12", "Aveyron"],
  ["13", "Bouches-du-Rhône"], ["14", "Calvados"], ["15", "Cantal"], ["16", "Charente"], ["17", "Charente-Maritime"], ["18", "Cher"],
  ["19", "Corrèze"], ["2A", "Corse-du-Sud"], ["2B", "Haute-Corse"], ["21", "Côte-d'Or"], ["22", "Côtes-d'Armor"], ["23", "Creuse"],
  ["24", "Dordogne"], ["25", "Doubs"], ["26", "Drôme"], ["27", "Eure"], ["28", "Eure-et-Loir"], ["29", "Finistère"],
  ["30", "Gard"], ["31", "Haute-Garonne"], ["32", "Gers"], ["33", "Gironde"], ["34", "Hérault"], ["35", "Ille-et-Vilaine"],
  ["36", "Indre"], ["37", "Indre-et-Loire"], ["38", "Isère"], ["39", "Jura"], ["40", "Landes"], ["41", "Loir-et-Cher"],
  ["42", "Loire"], ["43", "Haute-Loire"], ["44", "Loire-Atlantique"], ["45", "Loiret"], ["46", "Lot"], ["47", "Lot-et-Garonne"],
  ["48", "Lozère"], ["49", "Maine-et-Loire"], ["50", "Manche"], ["51", "Marne"], ["52", "Haute-Marne"], ["53", "Mayenne"],
  ["54", "Meurthe-et-Moselle"], ["55", "Meuse"], ["56", "Morbihan"], ["57", "Moselle"], ["58", "Nièvre"], ["59", "Nord"],
  ["60", "Oise"], ["61", "Orne"], ["62", "Pas-de-Calais"], ["63", "Puy-de-Dôme"], ["64", "Pyrénées-Atlantiques"], ["65", "Hautes-Pyrénées"],
  ["66", "Pyrénées-Orientales"], ["67", "Bas-Rhin"], ["68", "Haut-Rhin"], ["69", "Rhône"], ["70", "Haute-Saône"], ["71", "Saône-et-Loire"],
  ["72", "Sarthe"], ["73", "Savoie"], ["74", "Haute-Savoie"], ["75", "Paris"], ["76", "Seine-Maritime"], ["77", "Seine-et-Marne"],
  ["78", "Yvelines"], ["79", "Deux-Sèvres"], ["80", "Somme"], ["81", "Tarn"], ["82", "Tarn-et-Garonne"], ["83", "Var"],
  ["84", "Vaucluse"], ["85", "Vendée"], ["86", "Vienne"], ["87", "Haute-Vienne"], ["88", "Vosges"], ["89", "Yonne"],
  ["90", "Territoire de Belfort"], ["91", "Essonne"], ["92", "Hauts-de-Seine"], ["93", "Seine-Saint-Denis"], ["94", "Val-de-Marne"], ["95", "Val-d'Oise"],
  ["971", "Guadeloupe"], ["972", "Martinique"], ["973", "Guyane"], ["974", "La Réunion"], ["976", "Mayotte"],
] as const;

export function buildSubdivisionId(countryCode: string, subdivisionCode: string, postalPrefix?: string | null) {
  const country = countryCode.trim().toUpperCase();
  const subdivision = subdivisionCode.trim().toUpperCase();
  const prefix = String(postalPrefix ?? "").trim().toUpperCase() || subdivision;
  return `${prefix}-${country}-${subdivision}`;
}

function overrideSubdivisions(countryCode: string): GeographySubdivision[] | null {
  const country = countryCode.toUpperCase();
  if (country === "ES") {
    return spanishProvinces.map(([code, name]) => ({ id: buildSubdivisionId("ES", code, code), code, name, postalPrefix: code }));
  }
  if (country === "FR") {
    return frenchDepartments.map(([code, name]) => {
      const postalPrefix = code === "2A" || code === "2B" ? "20" : code;
      return { id: buildSubdivisionId("FR", code, postalPrefix), code, name, postalPrefix };
    });
  }
  return null;
}

function safeSubdivisionCode(name: string, shortCode?: string) {
  const explicit = String(shortCode ?? "").trim().toUpperCase();
  if (explicit) return explicit;
  return name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^A-Z0-9]+/gi, "-").replace(/^-|-$/g, "").toUpperCase().slice(0, 24);
}

export async function fetchWorldGeography(): Promise<CountryRegionSource[]> {
  const response = await fetch(WORLD_GEOGRAPHY_SOURCE, { next: { revalidate: 604800 } });
  if (!response.ok) throw new Error(`World geography source returned ${response.status}`);
  return await response.json() as CountryRegionSource[];
}

export function countriesFromSource(source: CountryRegionSource[]): GeographyCountry[] {
  const displayNames = new Intl.DisplayNames(["es"], { type: "region" });
  return source
    .map(item => String(item.countryShortCode ?? "").trim().toUpperCase())
    .filter(code => /^[A-Z]{2}$/.test(code))
    .map(code => ({ code, name: displayNames.of(code) || code }))
    .sort((a, b) => a.name.localeCompare(b.name, "es"));
}

export function subdivisionsFromSource(source: CountryRegionSource[], countryCode: string): GeographySubdivision[] {
  const country = countryCode.trim().toUpperCase();
  const override = overrideSubdivisions(country);
  if (override) return override;
  const item = source.find(entry => String(entry.countryShortCode ?? "").toUpperCase() === country);
  return (item?.regions ?? [])
    .map(region => {
      const name = String(region.name ?? "").trim();
      const code = safeSubdivisionCode(name, region.shortCode);
      return name && code ? { id: buildSubdivisionId(country, code), code, name, postalPrefix: null } : null;
    })
    .filter((value): value is GeographySubdivision => Boolean(value))
    .sort((a, b) => a.name.localeCompare(b.name, "es"));
}

export function subdivisionMatchesPostalCode(subdivision: Pick<GeographySubdivision, "postalPrefix">, postalCode: string) {
  if (!subdivision.postalPrefix) return true;
  const postal = postalCode.toUpperCase().replace(/[^A-Z0-9]/g, "");
  const prefix = subdivision.postalPrefix.toUpperCase().replace(/[^A-Z0-9]/g, "");
  return postal.startsWith(prefix);
}

export function inferSubdivisionFromPostalCode(subdivisions: GeographySubdivision[], postalCode: string) {
  const matching = subdivisions.filter(item => item.postalPrefix && subdivisionMatchesPostalCode(item, postalCode));
  return matching.length === 1 ? matching[0] : null;
}
