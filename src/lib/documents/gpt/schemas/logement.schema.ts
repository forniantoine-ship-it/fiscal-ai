/**
 * Logement tunnel GPT schema (future).
 *
 * Owned by LOGEMENT tunnel:
 * - propertyAddress, propertyCity, propertyPostalCode
 * - acquisitionDate, acquisitionPrice, surfaceArea, propertyType
 *
 * NOT owned here (see tunnel-field-ownership.ts):
 * - siren, personalAddress → ACTIVITE tunnel
 * - loanPrincipal, annualInterest → CREDIT tunnel
 *
 * Source of truth: acte notarié, compromis, taxe foncière.
 */

export const LOGEMENT_GPT_FIELD_KEYS = [
  "propertyAddress",
  "propertyCity",
  "propertyPostalCode",
  "acquisitionDate",
  "propertyPurchasePrice",
] as const;
