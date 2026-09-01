/**
 * Derivation rule identifiers — deterministic, testable, tunnel-agnostic.
 */
export const DERIVATION_RULES = {
  siren_from_siret: {
    label: "SIREN dérivé du SIRET",
    outputTypes: ["registry.siren"],
  },
  address_parse: {
    label: "Décomposition d'adresse",
    outputTypes: ["address.line", "address.postal_code", "address.city"],
  },
  ape_normalize: {
    label: "Normalisation du code APE",
    outputTypes: ["registry.ape_code"],
  },
} as const;

export type DerivationRuleId = keyof typeof DERIVATION_RULES;

export const ADDRESS_PARSE_SOURCE_TYPES = [
  "address.headquarters",
  "address.personal",
  "address.establishment",
] as const;

export type AddressParseSourceType = (typeof ADDRESS_PARSE_SOURCE_TYPES)[number];

export function isAddressParseSourceType(type: string): type is AddressParseSourceType {
  return (ADDRESS_PARSE_SOURCE_TYPES as readonly string[]).includes(type);
}
