/**
 * Run: npx tsx src/lib/documents/facts/f009-fact-projection.test.ts
 */
import { createDocumentFact } from "./document-fact";
import type { DocumentFact } from "./document-fact";
import { createFactExtractionResult } from "./fact-extraction-result";
import { projectDocumentFactsToF009 } from "./f009-fact-projection";

function assertEqual<T>(actual: T, expected: T, message: string): void {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

function assertTrue(actual: boolean, message: string): void {
  if (!actual) throw new Error(`${message}: expected true, got false`);
}

const DOCUMENT_ID = "doc-1";

function companyFact(
  type: DocumentFact["type"],
  value: string,
  evidence = `${type} evidence`,
): DocumentFact {
  return createDocumentFact({
    type,
    documentId: DOCUMENT_ID,
    scope: "company",
    value,
    status: "extracted",
    origin: "document",
    fieldSource: "extracted",
    evidence: { snippet: evidence },
    extractorId: "deterministic-inpi-rne-v1",
  });
}

function establishmentFacts(input: {
  siret: string;
  status: "actif" | "fermé";
  type?: string;
}): DocumentFact[] {
  const entityId = input.siret;
  const base = (type: DocumentFact["type"], value: string) =>
    createDocumentFact({
      type,
      documentId: DOCUMENT_ID,
      scope: "establishment",
      entityId,
      value,
      status: "extracted",
      origin: "document",
      fieldSource: "extracted",
      evidence: { snippet: `${type} evidence` },
      extractorId: "deterministic-inpi-rne-v1",
    });

  return [
    base("registry.siret", input.siret),
    base("establishment.type", input.type ?? "Établissement principal"),
    base("establishment.status", input.status),
  ];
}

function buildExtraction(facts: DocumentFact[]) {
  return createFactExtractionResult({
    documentId: DOCUMENT_ID,
    extractorId: "test-fixture",
    facts,
  });
}

function runTests(): void {
  let passed = 0;
  let total = 0;

  function test(name: string, fn: () => void): void {
    total++;
    try {
      fn();
      passed++;
      console.log(`  ✓ ${name}`);
    } catch (err) {
      console.error(`  ✗ ${name}`);
      console.error(`    ${err instanceof Error ? err.message : err}`);
    }
  }

  console.log("f009-fact-projection.ts");

  test("SIRET : un seul établissement actif → résolu, provenance extracted", () => {
    const extraction = buildExtraction(establishmentFacts({ siret: "12345678901234", status: "actif" }));
    const result = projectDocumentFactsToF009(extraction);
    assertEqual(result.siret, "12345678901234", "siret");
    assertEqual(result.siretProvenance.status, "extracted", "siretProvenance.status");
    assertEqual(result.siretProvenance.origin, "inpi_document", "siretProvenance.origin");
    assertEqual(result.siretAmbiguous, false, "siretAmbiguous");
    assertEqual(result.siretCandidates.length, 1, "siretCandidates.length");
  });

  test("SIRET : aucun établissement actif → missing, non ambigu", () => {
    const extraction = buildExtraction(establishmentFacts({ siret: "12345678901234", status: "fermé" }));
    const result = projectDocumentFactsToF009(extraction);
    assertEqual(result.siret, undefined, "siret");
    assertEqual(result.siretProvenance.status, "missing", "siretProvenance.status");
    assertEqual(result.siretAmbiguous, false, "siretAmbiguous");
    assertEqual(result.siretCandidates.length, 0, "siretCandidates.length");
  });

  test("SIRET : deux établissements actifs → ambigu, siret non résolu, candidats exposés", () => {
    const facts = [
      ...establishmentFacts({ siret: "11111111100001", status: "actif", type: "Établissement principal" }),
      ...establishmentFacts({ siret: "22222222200002", status: "actif", type: "Établissement secondaire" }),
    ];
    const result = projectDocumentFactsToF009(buildExtraction(facts));
    assertEqual(result.siret, undefined, "siret");
    assertEqual(result.siretProvenance.status, "missing", "siretProvenance.status");
    assertTrue(result.siretAmbiguous, "siretAmbiguous");
    assertEqual(result.siretCandidates.length, 2, "siretCandidates.length");
  });

  test("SIRET : établissement fermé exclu même s'il est le seul présent avec un actif", () => {
    const facts = [
      ...establishmentFacts({ siret: "11111111100001", status: "actif" }),
      ...establishmentFacts({ siret: "33333333300003", status: "fermé" }),
    ];
    const result = projectDocumentFactsToF009(buildExtraction(facts));
    assertEqual(result.siret, "11111111100001", "siret");
    assertEqual(result.siretAmbiguous, false, "siretAmbiguous");
    assertEqual(result.siretCandidates.length, 1, "siretCandidates.length");
  });

  test("Dates : activity_start_date seul → résolu, normalisé en ISO", () => {
    const extraction = buildExtraction([companyFact("registry.activity_start_date", "05/03/2024")]);
    const result = projectDocumentFactsToF009(extraction);
    assertEqual(result.activityStartDate, "2024-03-05", "activityStartDate");
    assertEqual(result.activityStartDateProvenance.status, "extracted", "activityStartDateProvenance.status");
    assertEqual(result.datesAmbiguous, false, "datesAmbiguous");
    assertEqual(result.immatriculationDateRaw, undefined, "immatriculationDateRaw");
  });

  test("Dates : activity_start_date et immatriculation_date identiques → résolu, non ambigu", () => {
    const extraction = buildExtraction([
      companyFact("registry.activity_start_date", "05/03/2024"),
      companyFact("registry.immatriculation_date", "05/03/2024"),
    ]);
    const result = projectDocumentFactsToF009(extraction);
    assertEqual(result.activityStartDate, "2024-03-05", "activityStartDate");
    assertEqual(result.datesAmbiguous, false, "datesAmbiguous");
    assertEqual(result.immatriculationDateRaw, "2024-03-05", "immatriculationDateRaw");
  });

  test("Dates : activity_start_date et immatriculation_date différentes → ambigu, non résolu automatiquement", () => {
    const extraction = buildExtraction([
      companyFact("registry.activity_start_date", "05/03/2024"),
      companyFact("registry.immatriculation_date", "12/01/2024"),
    ]);
    const result = projectDocumentFactsToF009(extraction);
    assertEqual(result.activityStartDate, undefined, "activityStartDate");
    assertEqual(result.activityStartDateProvenance.status, "missing", "activityStartDateProvenance.status");
    assertTrue(result.datesAmbiguous, "datesAmbiguous");
    assertEqual(result.activityStartDateRaw, "2024-03-05", "activityStartDateRaw");
    assertEqual(result.immatriculationDateRaw, "2024-01-12", "immatriculationDateRaw");
  });

  test("Dates : aucune date présente → missing", () => {
    const result = projectDocumentFactsToF009(buildExtraction([]));
    assertEqual(result.activityStartDate, undefined, "activityStartDate");
    assertEqual(result.activityStartDateProvenance.status, "missing", "activityStartDateProvenance.status");
    assertEqual(result.datesAmbiguous, false, "datesAmbiguous");
  });

  test("Aucun fact → SIRET et dates tous missing, aucune ambiguïté", () => {
    const result = projectDocumentFactsToF009(buildExtraction([]));
    assertEqual(result.siret, undefined, "siret");
    assertEqual(result.siretAmbiguous, false, "siretAmbiguous");
    assertEqual(result.activityStartDate, undefined, "activityStartDate");
    assertEqual(result.datesAmbiguous, false, "datesAmbiguous");
  });

  console.log(`\n${passed}/${total} tests passés`);
  if (passed !== total) process.exit(1);
}

runTests();
