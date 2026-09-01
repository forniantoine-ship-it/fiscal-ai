import assert from "node:assert/strict";

import { findFactsByType } from "../../activite-gpt-to-facts";
import { extractInpiRneDeterministicFacts } from "./deterministic-inpi-rne-extractor";
import { INPI_RNE_808900351_OCR } from "./fixtures/inpi-rne-808900351.fixture";

function run(name: string, fn: () => void) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
  } catch (error) {
    console.error(`  ✗ ${name}`);
    throw error;
  }
}

function factValue(
  facts: ReturnType<typeof extractInpiRneDeterministicFacts>,
  type: Parameters<typeof findFactsByType>[1],
  entityId?: string,
): string | undefined {
  const matches = findFactsByType(facts, type);
  const fact = entityId ? matches.find((entry) => entry.entityId === entityId) : matches[0];
  return fact?.value;
}

console.log("deterministic-inpi-rne-extractor.test.ts");

run("extracts reference SIREN and both SIRETs", () => {
  const facts = extractInpiRneDeterministicFacts(INPI_RNE_808900351_OCR, "808900351-reference");

  assert.equal(factValue(facts, "registry.siren"), "808900351");
  assert.equal(factValue(facts, "registry.siret", "80890035100020"), "80890035100020");
  assert.equal(factValue(facts, "registry.siret", "80890035100012"), "80890035100012");
});

run("extracts company registry and identity fields", () => {
  const facts = extractInpiRneDeterministicFacts(INPI_RNE_808900351_OCR, "808900351-reference");

  assert.equal(factValue(facts, "person.name.family"), "FORNI");
  assert.equal(factValue(facts, "person.name.given"), "ANTOINE");
  assert.equal(factValue(facts, "registry.immatriculation_date"), "01/01/2015");
  assert.equal(factValue(facts, "registry.activity_start_date"), "02/01/2019");
  assert.equal(factValue(facts, "registry.legal_form"), "Entrepreneur individuel");
  assert.equal(factValue(facts, "registry.company_nature"), "Libérale non règlementée");
  assert.ok(factValue(facts, "registry.main_activity_label")?.includes("activités auxiliaires"));
  assert.equal(factValue(facts, "registry.ape_code"), "6619B");
});

run("extracts headquarters address", () => {
  const facts = extractInpiRneDeterministicFacts(INPI_RNE_808900351_OCR, "808900351-reference");
  const address = factValue(facts, "address.headquarters");
  assert.ok(address?.includes("353 RUE DE PREMARCHAND"));
  assert.ok(address?.includes("33140"));
  assert.ok(address?.includes("CADAUJAC"));
});

run("extracts principal and closed secondary establishments", () => {
  const facts = extractInpiRneDeterministicFacts(INPI_RNE_808900351_OCR, "808900351-reference");

  assert.equal(factValue(facts, "establishment.type", "80890035100020"), "Principal");
  assert.equal(factValue(facts, "establishment.status", "80890035100020"), "actif");
  assert.equal(factValue(facts, "establishment.activity_start_date", "80890035100020"), "02/01/2019");
  assert.ok(factValue(facts, "address.establishment", "80890035100020")?.includes("CADAUJAC"));

  assert.equal(factValue(facts, "establishment.type", "80890035100012"), "Secondaire fermé");
  assert.equal(factValue(facts, "establishment.status", "80890035100012"), "fermé");
  assert.equal(factValue(facts, "establishment.activity_start_date", "80890035100012"), "01/01/2015");
  assert.equal(factValue(facts, "establishment.closure_date", "80890035100012"), "02/01/2019");
  assert.ok(factValue(facts, "address.establishment", "80890035100012")?.includes("SAINT-LOUIS-DE-MONTFERRAND"));
});

run("marks extracted facts with document origin and evidence", () => {
  const facts = extractInpiRneDeterministicFacts(INPI_RNE_808900351_OCR, "808900351-reference");
  for (const fact of facts) {
    assert.equal(fact.status, "extracted");
    assert.equal(fact.origin, "document");
    assert.equal(fact.fieldSource, "extracted");
    assert.ok(fact.evidence?.snippet);
    assert.equal(fact.requiresConfirmation, false);
  }
});

run("does not invent email, phone, or LMNP regime facts", () => {
  const facts = extractInpiRneDeterministicFacts(INPI_RNE_808900351_OCR, "808900351-reference");
  assert.equal(findFactsByType(facts, "contact.email").length, 0);
  assert.equal(findFactsByType(facts, "contact.phone").length, 0);
  assert.equal(facts.some((fact) => /lmnp|regime/i.test(fact.type)), false);
});

console.log("All deterministic-inpi-rne-extractor tests passed.");
