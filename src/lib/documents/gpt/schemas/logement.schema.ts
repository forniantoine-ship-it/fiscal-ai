/**
 * Logement tunnel — canonical semantic schema entry point.
 *
 * @see logement-canonical-schema.ts — canonical fields per document intent
 * @see logement-semantic-vocabulary.ts — French legal vocabulary → canonical mapping
 * @see tunnel-field-ownership.ts — cross-tunnel field ownership
 */

export { CANONICAL_FIELD_KEYS_BY_INTENT } from "@/lib/lmnp/services/logement/logement-canonical-schema";
export { LOGEMENT_DOCUMENT_INTENTS } from "@/lib/lmnp/services/logement/logement-document-intent";

/** @deprecated Use CANONICAL_FIELD_KEYS_BY_INTENT.acquisition */
export const LOGEMENT_GPT_FIELD_KEYS = [
  "propertyAddress",
  "propertyCity",
  "propertyPostalCode",
  "acquisitionDate",
  "acquisitionPrice",
] as const;
