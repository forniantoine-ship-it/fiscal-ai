import assert from "node:assert/strict";

import { createDocumentFact } from "./document-fact";
import { createFactExtractionResult } from "./fact-extraction-result";
import { deriveDocumentFacts } from "./derivation/derivation-engine";
import { extractInpiRneDeterministicFacts } from "./extraction/inpi-rne/deterministic-inpi-rne-extractor";
import { INPI_RNE_808900351_OCR } from "./extraction/inpi-rne/fixtures/inpi-rne-808900351.fixture";
import {
  projectDocumentFactsToActivite,
  type ActiviteFactProjection,
} from "./activite-fact-projection";
import { projectGroundedFactsToActivite } from "./activite-facts-projection";
import { ACTIVITE_DOCUMENT_ONLY_FACT_TYPES } from "./activite-fact-projection-map";
import { findFactsByType } from "./activite-gpt-to-facts";

function run(name: string, fn: () => void) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
  } catch (error) {
    console.error(`  ✗ ${name}`);
    throw error;
  }
}

function buildInpiProjection(): ActiviteFactProjection {
  const deterministic = extractInpiRneDeterministicFacts(INPI_RNE_808900351_OCR, "808900351-reference");
  const derivation = deriveDocumentFacts(deterministic);
  const extraction = createFactExtractionResult({
    documentId: "808900351-reference",
    extractorId: "activite-fact-pipeline-v1",
    facts: derivation.facts,
  });

  return projectDocumentFactsToActivite(extraction);
}

console.log("activite-fact-projection.test.ts");

run("projects identity and SIREN to current form fields", () => {
  const projection = buildInpiProjection();

  assert.equal(projection.formValues.lastName, "FORNI");
  assert.equal(projection.formValues.firstName, "ANTOINE");
  assert.equal(projection.formValues.siren, "808900351");
  assert.equal(projection.fieldProvenance.lastName?.status, "extracted");
  assert.equal(projection.fieldProvenance.siren?.status, "extracted");
});

run("never maps headquarters to personal address fields", () => {
  const projection = buildInpiProjection();

  assert.equal(projection.formValues.personalAddress, undefined);
  assert.equal(projection.formValues.personalCity, undefined);
  assert.equal(projection.formValues.personalPostalCode, undefined);
  assert.equal(projection.fieldProvenance.personalAddress?.status, "missing");
  assert.ok(projection.missingUserInput.includes("personalAddress"));
  assert.ok(projection.documentOnly.some((fact) => fact.factType === "address.headquarters"));
});

run("projects principal active establishment address to establishment fields", () => {
  const projection = buildInpiProjection();

  assert.ok(projection.formValues.establishmentAddress?.includes("353 RUE DE PREMARCHAND"));
  assert.equal(projection.formValues.establishmentPostalCode, "33140");
  assert.equal(projection.formValues.establishmentCity, "CADAUJAC");
  assert.equal(projection.fieldProvenance.establishmentAddress?.status, "proposed");
  assert.equal(projection.fieldProvenance.establishmentAddress?.origin, "fiscal_ai");
  assert.ok(projection.fieldProvenance.establishmentAddress?.evidence?.includes("Principal"));
  assert.ok(projection.fieldProvenance.establishmentAddress?.evidence?.includes("actif"));
  assert.ok(projection.fieldProvenance.establishmentAddress?.evidence?.includes("80890035100020"));
  assert.ok(projection.proposedFieldKeys.includes("establishmentAddress"));
});

run("keeps registry and secondary establishment facts document-only", () => {
  const projection = buildInpiProjection();

  for (const type of [
    "registry.siret",
    "registry.ape_code",
    "registry.legal_form",
    "establishment.type",
  ] as const) {
    assert.ok(
      projection.documentOnly.some((fact) => fact.factType === type),
      `expected document-only fact ${type}`,
    );
  }

  assert.ok(
    projection.documentOnly.some(
      (fact) =>
        fact.factType === "address.establishment" && fact.entityId === "80890035100012",
    ),
  );
});

run("marks missing contact fields for user input", () => {
  const projection = buildInpiProjection();

  assert.equal(projection.formValues.email, undefined);
  assert.equal(projection.formValues.telephone, undefined);
  assert.ok(projection.missingUserInput.includes("email"));
  assert.ok(projection.missingUserInput.includes("telephone"));
});

run("does not mutate fact statuses during projection", () => {
  const deterministic = extractInpiRneDeterministicFacts(INPI_RNE_808900351_OCR, "808900351-reference");
  const derivation = deriveDocumentFacts(deterministic);
  const before = derivation.facts.map((fact) => `${fact.id}:${fact.status}`);

  const extraction = createFactExtractionResult({
    documentId: "808900351-reference",
    extractorId: "activite-fact-pipeline-v1",
    facts: derivation.facts,
  });
  projectDocumentFactsToActivite(extraction);

  const after = derivation.facts.map((fact) => `${fact.id}:${fact.status}`);
  assert.deepEqual(after, before);
});

run("preserves PROPOSED SIREN without promotion", () => {
  const siret = createDocumentFact({
    id: "doc-1:siret",
    type: "registry.siret",
    documentId: "doc-1",
    value: "12345678900012",
    status: "extracted",
    origin: "document",
    fieldSource: "extracted",
    requiresConfirmation: false,
  });

  const derivation = deriveDocumentFacts([siret]);
  const extraction = createFactExtractionResult({
    documentId: "doc-1",
    extractorId: "test",
    facts: derivation.facts,
  });

  const projection = projectDocumentFactsToActivite(extraction);
  const sirenFact = findFactsByType(derivation.facts, "registry.siren")[0]!;

  assert.equal(sirenFact.status, "proposed");
  assert.equal(projection.formValues.siren, "123456789");
  assert.equal(projection.fieldProvenance.siren?.status, "proposed");
  assert.ok(projection.proposedConfirmation.some((entry) => entry.fact.factType === "registry.siren"));
});

run("parses headquarters country into document-only derived fact", () => {
  const deterministic = extractInpiRneDeterministicFacts(INPI_RNE_808900351_OCR, "808900351-reference");
  const derivation = deriveDocumentFacts(deterministic);
  const hq = findFactsByType(deterministic, "address.headquarters")[0]!;
  const country = derivation.derivedFacts.find(
    (fact) => fact.type === "address.country" && fact.derivedFrom?.includes(hq.id),
  );

  assert.equal(
    derivation.derivedFacts.find(
      (fact) => fact.type === "address.city" && fact.derivedFrom?.includes(hq.id),
    )?.value,
    "CADAUJAC",
  );
  assert.equal(country?.value, "FRANCE");
  assert.ok((ACTIVITE_DOCUMENT_ONLY_FACT_TYPES as readonly string[]).includes("address.country"));
});

run("legacy groundedData keeps deterministic establishment out of GPT intermediary", () => {
  const deterministic = extractInpiRneDeterministicFacts(INPI_RNE_808900351_OCR, "808900351-reference");
  const derivation = deriveDocumentFacts(deterministic);
  const extraction = createFactExtractionResult({
    documentId: "808900351-reference",
    extractorId: "activite-fact-pipeline-v1",
    facts: derivation.facts,
  });

  const legacy = projectGroundedFactsToActivite(extraction, {});

  assert.equal(legacy.groundedData.nom, "FORNI");
  assert.equal(legacy.groundedData.adresseEntrepreneur, undefined);
  assert.equal(legacy.groundedData.adresseEtablissement, undefined);
  assert.ok(legacy.projection.formValues.establishmentAddress?.includes("353 RUE DE PREMARCHAND"));
});

console.log("All activite-fact-projection tests passed.");
