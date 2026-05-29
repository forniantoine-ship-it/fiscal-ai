/**
 * Crédit tunnel GPT schema (future).
 *
 * Owned by CREDIT tunnel:
 * - loanPrincipal, loanRate, loanTermMonths, annualInterest, lenderName
 *
 * NOT owned here:
 * - propertyAddress → LOGEMENT tunnel
 * - siren, siret → ACTIVITE tunnel
 *
 * Source of truth: offre de prêt, échéancier, tableau d'amortissement.
 */

export const CREDIT_GPT_FIELD_KEYS = [
  "loanPrincipal",
  "loanRate",
  "annualInterest",
  "lenderName",
] as const;
