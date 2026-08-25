export type FiscalRule = {
  label: string;
  hint: string;
  normalize: (value: string) => string;
  validate: (value: string) => boolean;
};

function compact(value: string) {
  return value.trim().toUpperCase().replace(/[\s.\-/]/g, "");
}

const rules: Record<string, FiscalRule> = {
  ES: {
    label: "NIF / CIF",
    hint: "9 caracteres; p. ej. B46928173",
    normalize: compact,
    validate: value => /^[A-Z0-9][0-9]{7}[A-Z0-9]$/.test(compact(value)),
  },
  FR: {
    label: "TVA",
    hint: "FR + 2 caracteres + 9 dígitos",
    normalize: compact,
    validate: value => /^FR[A-Z0-9]{2}[0-9]{9}$/.test(compact(value)),
  },
  PT: {
    label: "NIF",
    hint: "PT + 9 dígitos",
    normalize: compact,
    validate: value => /^PT[0-9]{9}$/.test(compact(value)),
  },
  BH: {
    label: "VAT / identificador fiscal",
    hint: "Baréin: 15 dígitos; se admite prefijo BH",
    normalize: compact,
    validate: value => /^(?:BH)?[0-9]{15}$/.test(compact(value)),
  },
  GB: {
    label: "VAT number",
    hint: "GB + 9 o 12 dígitos (formatos empresariales habituales)",
    normalize: compact,
    validate: value => /^GB(?:[0-9]{9}|[0-9]{12})$/.test(compact(value)),
  },
  DE: {
    label: "USt-IdNr.",
    hint: "DE + 9 dígitos",
    normalize: compact,
    validate: value => /^DE[0-9]{9}$/.test(compact(value)),
  },
  IT: {
    label: "Partita IVA",
    hint: "IT + 11 dígitos",
    normalize: compact,
    validate: value => /^IT[0-9]{11}$/.test(compact(value)),
  },
  NL: {
    label: "BTW-id",
    hint: "NL + 9 dígitos + B + 2 dígitos",
    normalize: compact,
    validate: value => /^NL[0-9]{9}B[0-9]{2}$/.test(compact(value)),
  },
  BE: {
    label: "TVA / BTW",
    hint: "BE + 10 dígitos",
    normalize: compact,
    validate: value => /^BE[0-9]{10}$/.test(compact(value)),
  },
};

export function fiscalRuleForCountry(countryCode: string): FiscalRule {
  const country = countryCode.trim().toUpperCase();
  const known = rules[country];
  if (known) return known;
  return {
    label: "Identificador fiscal",
    hint: `${country || "ISO"} + identificador local (5-30 caracteres alfanuméricos)`,
    normalize: compact,
    validate: value => {
      const normalized = compact(value);
      return Boolean(country && new RegExp(`^${country}[A-Z0-9]{5,30}$`).test(normalized));
    },
  };
}
