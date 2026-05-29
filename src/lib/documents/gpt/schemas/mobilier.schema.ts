/**
 * Mobilier / factures tunnel GPT schema (future).
 *
 * Owned by MOBILIER tunnel:
 * - invoiceAmount, invoiceDate, supplierName, invoiceVat, furnitureDescription
 *
 * NOT owned here:
 * - propertyAddress → LOGEMENT tunnel
 * - siren → ACTIVITE tunnel
 *
 * Source of truth: factures, reçus.
 */

export const MOBILIER_GPT_FIELD_KEYS = [
  "invoiceAmount",
  "invoiceDate",
  "supplierName",
] as const;
