/**
 * Addresses typed directly in "Nueva partida" when the pickup or delivery
 * point is not in the customer's address master.
 *
 * The address is always persisted (orders, expeditions and CMR reference
 * party_addresses by id). Only when the user ticks "save to master" is it
 * assigned to the customer, which is what makes it appear in future selectors.
 */
export const NEW_ADDRESS_OPTION = "__new__";

export type AddressUse = "pickup" | "delivery";

export type AdHocAddressDraft = {
  name: string;
  addressLine1: string;
  postalCode: string;
  city: string;
  countryCode: string;
  saveToMaster: boolean;
};

export type AdHocAddress = {
  name: string | null;
  addressLine1: string;
  postalCode: string;
  city: string;
  countryCode: string;
  saveToMaster: boolean;
};

export const EMPTY_AD_HOC_ADDRESS: AdHocAddressDraft = {
  name: "",
  addressLine1: "",
  postalCode: "",
  city: "",
  countryCode: "ES",
  saveToMaster: false,
};

function text(value: unknown) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

export function normalizeAdHocAddress(input: unknown, use: AddressUse): { ok: true; value: AdHocAddress } | { ok: false; errors: string[] } {
  const label = use === "pickup" ? "Dirección de recogida" : "Dirección de entrega";
  if (!input || typeof input !== "object") return { ok: false, errors: [`${label}: faltan los datos de la nueva dirección.`] };
  const raw = input as Record<string, unknown>;
  const name = text(raw.name);
  const addressLine1 = text(raw.addressLine1);
  const postalCode = text(raw.postalCode).toUpperCase();
  const city = text(raw.city);
  const countryCode = text(raw.countryCode).toUpperCase();
  const errors: string[] = [];
  if (addressLine1.length < 3 || addressLine1.length > 200) errors.push(`${label}: indica calle y número (3 a 200 caracteres).`);
  if (!/^[A-Z0-9][A-Z0-9 -]{1,11}$/.test(postalCode)) errors.push(`${label}: código postal no válido.`);
  if (city.length < 2 || city.length > 120) errors.push(`${label}: indica la población.`);
  if (!/^[A-Z]{2}$/.test(countryCode)) errors.push(`${label}: país con código ISO de dos letras (por ejemplo, ES).`);
  if (name.length > 120) errors.push(`${label}: el nombre del punto admite como máximo 120 caracteres.`);
  if (errors.length) return { ok: false, errors };
  return { ok: true, value: { name: name || null, addressLine1, postalCode, city, countryCode, saveToMaster: raw.saveToMaster === true } };
}
