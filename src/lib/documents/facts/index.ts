export {
  FACT_TYPE_REGISTRY,
  ACTIVITE_GPT_FACT_TYPES,
  ACTIVITE_REGISTRY_FACT_TYPES,
  isFactType,
  type FactType,
} from "./fact-type-registry";

export {
  hasExplicitHeadquartersAddressLabel,
  hasExplicitEstablishmentAddressLabel,
  hasExplicitEstablishmentAddressEvidence,
  hasExplicitPersonalAddressLabel,
  hasExplicitPersonalAddressEvidence,
  findEstablishmentAddressSemanticEvidence,
  findPersonalAddressSemanticEvidence,
  resolveGptEntrepreneurAddressFactType,
} from "./activite-address-semantics";

export {
  DOCUMENT_FACT_SCHEMA_VERSION,
  createDocumentFact,
  createFactId,
  missingDocumentFact,
  type DocumentFact,
  type FactEvidence,
  type FactOrigin,
  type FactScope,
} from "./document-fact";

export {
  createFactExtractionResult,
  type FactExtractionResult,
} from "./fact-extraction-result";

export {
  ACTIVITE_GPT_EXTRACTOR_ID,
  ACTIVITE_GPT_TO_FACT_MAP,
  adaptActiviteGptToFactExtractionResult,
  adaptActiviteGptToFacts,
  findActiviteFact,
  findFactsByType,
  resolveFactForType,
} from "./activite-gpt-to-facts";

export {
  applyGroundingDecision,
  groundGptAddress,
  groundGptEmail,
  groundGptName,
  groundGptSiren,
  groundGptTelephone,
  groundSiretFromOcr,
  type GroundingDecision,
  type GroundingOutcome,
} from "./grounding-decisions";

export {
  findSirenInText,
  findSiretEvidenceSnippet,
  findSiretInText,
  isAddressGroundedInText,
  isEmailGroundedInText,
  isExplicitSirenInText,
  isNameGroundedInText,
  isPhoneGroundedInText,
  isSirenGroundedInText,
  normalizePhoneDigits,
} from "./grounding-text-matchers";

export {
  ACTIVITE_DOCUMENT_ONLY_FACT_TYPES,
  ACTIVITE_ESTABLISHMENT_ADDRESS_RULE,
  ACTIVITE_FORM_FIELD_KEYS,
  ACTIVITE_HEADQUARTERS_ADDRESS_RULE,
  ACTIVITE_PERSONAL_ADDRESS_RULE,
  ACTIVITE_SCALAR_PROJECTION_RULES,
  type ActiviteFactProjectionRule,
  type ActiviteProjectionCategory,
} from "./activite-fact-projection-map";

export {
  buildPrincipalEstablishmentEvidence,
  projectDocumentFactsToActivite,
  projectionCategoryForFactType,
  type ActiviteFactProjection,
  type ActiviteFormFieldProjection,
  type ActiviteProjectionFactRef,
  type ActiviteProposedConfirmation,
} from "./activite-fact-projection";

export {
  applyGroundingDecisionsToFacts,
  buildActiviteGroundingDecisions,
  projectGroundedFactsToActivite,
  type ActiviteFactsGroundingResult,
} from "./activite-facts-projection";

export {
  GroundingEngine,
  groundActiviteFactExtraction,
  groundingEngine,
  type GroundingEngineInput,
  type GroundingEngineResult,
} from "./grounding-engine";

export {
  buildMergedActiviteFacts,
} from "./extraction/build-merged-activite-facts";

export {
  deterministicInpiRneExtractor,
  extractInpiRneDeterministicFacts,
  DETERMINISTIC_INPI_RNE_EXTRACTOR_ID,
} from "./extraction/inpi-rne/deterministic-inpi-rne-extractor";

export {
  mergeDocumentFacts,
  type FactMergeConflict,
} from "./extraction/merge-document-facts";

export {
  DERIVATION_RULES,
  ADDRESS_PARSE_SOURCE_TYPES,
  DerivationEngine,
  createDerivedFact,
  createDerivedFactId,
  deriveAddressParse,
  deriveApeNormalize,
  deriveDocumentFacts,
  deriveSirenFromSiret,
  derivationEngine,
  findExtractedFact,
  hasDerivedFact,
  isAddressParseSourceType,
  isCanonicalApeCode,
  normalizeApeCode,
  parseAddressComponents,
  type AddressParseSourceType,
  type DerivationEngineResult,
  type DerivationRuleId,
  type DerivationStep,
  type ParsedAddressComponents,
} from "./derivation";
