import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { classifyRevenueHeader } from "./revenus-header-classification";

/**
 * Cycle 18 — audit adversarial (classification des en-têtes, PDF/OCR) : deux
 * divergences trouvées entre ce système et le système Excel/CSV
 * (spreadsheet-header-recognition.ts).
 */
describe("Cycle 18 — classifyRevenueHeader : synonymes réalistes non anchored", () => {
  it("\"Garantie loyers impayés\" est une indemnité d'assurance, jamais un dépôt de garantie", () => {
    assert.equal(classifyRevenueHeader("Garantie loyers impayés").transactionCategory, "insurance_indemnity");
  });

  it("\"GLI\" (sigle) reste reconnu (non-régression)", () => {
    assert.equal(classifyRevenueHeader("GLI").transactionCategory, "insurance_indemnity");
  });

  it("un vrai dépôt de garantie locative reste bien classé comme dépôt (non-régression)", () => {
    assert.equal(classifyRevenueHeader("Dépôt de garantie").transactionCategory, "deposit");
  });

  it("\"Loyer encaissé\" est reconnu comme loyer — le motif ancré `/^loyers?$/` le rejetait auparavant", () => {
    assert.equal(classifyRevenueHeader("Loyer encaissé").transactionCategory, "rent");
  });

  it("\"Loyers perçus\" est également reconnu (variante plurielle)", () => {
    assert.equal(classifyRevenueHeader("Loyers perçus").transactionCategory, "rent");
  });

  it("\"Loyer HC\" reste reconnu comme loyer (non-régression)", () => {
    assert.equal(classifyRevenueHeader("Loyer HC").transactionCategory, "rent");
  });
});
