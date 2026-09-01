export {
  DERIVATION_RULES,
  ADDRESS_PARSE_SOURCE_TYPES,
  isAddressParseSourceType,
  type AddressParseSourceType,
  type DerivationRuleId,
} from "./derivation-rules";

export {
  createDerivedFact,
  createDerivedFactId,
  findExtractedFact,
  hasDerivedFact,
} from "./create-derived-fact";

export {
  DerivationEngine,
  deriveDocumentFacts,
  derivationEngine,
  type DerivationEngineResult,
  type DerivationStep,
} from "./derivation-engine";

export { deriveSirenFromSiret } from "./rules/siren-from-siret";
export { parseAddressComponents, type ParsedAddressComponents } from "./rules/address-parse";
export { deriveAddressParse } from "./rules/derive-address-parse";
export { isCanonicalApeCode, normalizeApeCode } from "./rules/ape-normalize";
export { deriveApeNormalize } from "./rules/derive-ape-normalize";
