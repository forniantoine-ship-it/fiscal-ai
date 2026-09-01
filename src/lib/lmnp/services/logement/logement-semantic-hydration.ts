import type { LogementActeExtraction } from "@/lib/documents/gpt/schemas/logement-acte.schema";

import type { LogementSemanticNormalizationResult } from "./logement-semantic-normalization";

/**
 * Bridge canonical semantic extraction → legacy LogementActeExtraction for UI prefill.
 * Keeps existing prefill/governed-store paths stable while canonical layer matures.
 */
export function canonicalToLogementActeExtraction(
  normalization: LogementSemanticNormalizationResult,
): LogementActeExtraction {
  const fields = normalization.normalizedCanonicalFields as Record<string, unknown>;
  const extraction: LogementActeExtraction = {};

  if (typeof fields.propertyAddress === "string" && fields.propertyAddress.trim()) {
    extraction.propertyAddress = fields.propertyAddress.trim();
  }
  if (typeof fields.propertyPostalCode === "string" && fields.propertyPostalCode.trim()) {
    extraction.propertyPostalCode = fields.propertyPostalCode.trim();
  }
  if (typeof fields.propertyCity === "string" && fields.propertyCity.trim()) {
    extraction.propertyCity = fields.propertyCity.trim();
  }
  if (typeof fields.propertyType === "string" && fields.propertyType.trim()) {
    extraction.propertyType = fields.propertyType.trim();
  }
  if (typeof fields.acquisitionDate === "string" && fields.acquisitionDate.trim()) {
    extraction.acquisitionDate = fields.acquisitionDate.trim();
  }
  if (typeof fields.acquisitionPrice === "number" && Number.isFinite(fields.acquisitionPrice)) {
    extraction.propertyPurchasePrice = fields.acquisitionPrice;
  }
  if (typeof fields.notaryFees === "number" && Number.isFinite(fields.notaryFees)) {
    extraction.notaryFees = fields.notaryFees;
  }
  if (typeof fields.livingArea === "number" && Number.isFinite(fields.livingArea)) {
    extraction.surfaceM2 = fields.livingArea;
  }
  if (typeof fields.loanAmount === "number" && Number.isFinite(fields.loanAmount)) {
    extraction.loanAmount = fields.loanAmount;
  }
  if (typeof fields.bankName === "string" && fields.bankName.trim()) {
    extraction.bankName = fields.bankName.trim();
  }
  if (typeof fields.durationMonths === "number" && Number.isFinite(fields.durationMonths)) {
    extraction.loanDurationMonths = fields.durationMonths;
  }
  if (typeof fields.monthlyPayment === "number" && Number.isFinite(fields.monthlyPayment)) {
    extraction.monthlyPayment = fields.monthlyPayment;
  }
  if (typeof fields.interestRate === "number" && Number.isFinite(fields.interestRate)) {
    extraction.interestRate = fields.interestRate;
  }

  return extraction;
}
