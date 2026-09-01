import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { createDocumentFact } from "../document-fact";
import { deriveDocumentFacts } from "./derivation-engine";

const __dirname = dirname(fileURLToPath(import.meta.url));

function extractedFact(
  type: Parameters<typeof createDocumentFact>[0]["type"],
  value: string,
  id?: string,
) {
  return createDocumentFact({
    id: id ?? `doc-1:${type}`,
    type,
    documentId: "doc-1",
    value,
    status: "extracted",
    origin: "document",
    fieldSource: "extracted",
    evidence: { snippet: value },
    requiresConfirmation: false,
  });
}

function run(name: string, fn: () => void) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
  } catch (error) {
    console.error(`  ✗ ${name}`);
    throw error;
  }
}

console.log("derivation-engine.test.ts");

run("derives registry.siren PROPOSED from EXTRACTED registry.siret", () => {
  const siret = extractedFact("registry.siret", "12345678900012", "doc-1:siret");
  const { derivedFacts } = deriveDocumentFacts([siret]);

  assert.equal(derivedFacts.length, 1);
  const siren = derivedFacts[0]!;
  assert.equal(siren.type, "registry.siren");
  assert.equal(siren.status, "proposed");
  assert.equal(siren.origin, "deduction");
  assert.equal(siren.fieldSource, "derived");
  assert.equal(siren.value, "123456789");
  assert.equal(siren.derivationRule, "siren_from_siret");
  assert.deepEqual(siren.derivedFrom, ["doc-1:siret"]);
  assert.equal(siren.requiresConfirmation, true);
  assert.equal(siren.evidence?.snippet, "12345678900012");
});

run("does not derive redundant SIREN when explicit registry.siren is EXTRACTED", () => {
  const siret = extractedFact("registry.siret", "12345678900012", "doc-1:siret");
  const siren = extractedFact("registry.siren", "123456789", "doc-1:siren");

  const { derivedFacts } = deriveDocumentFacts([siret, siren]);
  assert.equal(derivedFacts.length, 0);
});

run("does not derive SIREN from invalid SIRET", () => {
  const invalidSiret = extractedFact("registry.siret", "12345", "doc-1:siret-invalid");
  const { derivedFacts } = deriveDocumentFacts([invalidSiret]);
  assert.equal(derivedFacts.length, 0);
});

run("parses address with postal code and city into PROPOSED sub-facts", () => {
  const address = extractedFact(
    "address.headquarters",
    "15 route de Saint-Germain\n33650 Saint-Médard-d'Eyrans",
    "doc-1:address-hq",
  );

  const { derivedFacts } = deriveDocumentFacts([address]);
  const byType = Object.fromEntries(derivedFacts.map((fact) => [fact.type, fact]));

  assert.equal(byType["address.line"]?.value, "15 route de Saint-Germain");
  assert.equal(byType["address.postal_code"]?.value, "33650");
  assert.equal(byType["address.city"]?.value, "Saint-Médard-d'Eyrans");

  for (const fact of derivedFacts) {
    assert.equal(fact.status, "proposed");
    assert.equal(fact.origin, "deduction");
    assert.equal(fact.fieldSource, "derived");
    assert.equal(fact.derivationRule, "address_parse");
    assert.deepEqual(fact.derivedFrom, ["doc-1:address-hq"]);
    assert.equal(fact.requiresConfirmation, true);
  }
});

run("does not invent postal code or city when address has no postal code", () => {
  const address = extractedFact(
    "address.establishment",
    "15 route de Saint-Germain",
    "doc-1:address-est",
  );

  const { derivedFacts } = deriveDocumentFacts([address]);
  const types = derivedFacts.map((fact) => fact.type);

  assert.ok(types.includes("address.line"));
  assert.equal(types.includes("address.postal_code"), false);
  assert.equal(types.includes("address.city"), false);
});

run("normalizes APE codes across common formats", () => {
  const dotted = extractedFact("registry.ape_code", "66.19B", "doc-1:ape-dotted");
  const spaced = extractedFact("registry.ape_code", "6619 B", "doc-1:ape-spaced");

  const dottedResult = deriveDocumentFacts([dotted]).derivedFacts[0]!;
  const spacedResult = deriveDocumentFacts([spaced]).derivedFacts[0]!;

  assert.equal(dottedResult.value, "6619B");
  assert.equal(spacedResult.value, "6619B");
  assert.equal(dottedResult.derivationRule, "ape_normalize");
  assert.equal(dottedResult.status, "proposed");
  assert.equal(dottedResult.requiresConfirmation, true);
});

run("does not derive APE normalization when value is already canonical", () => {
  const canonical = extractedFact("registry.ape_code", "6619B", "doc-1:ape-canonical");
  const { derivedFacts } = deriveDocumentFacts([canonical]);
  assert.equal(derivedFacts.length, 0);
});

run("derivation layer has no LMNP product dependency", () => {
  const derivationDir = join(__dirname);
  const files = [
    "derivation-engine.ts",
    "derivation-rules.ts",
    "create-derived-fact.ts",
    "rules/siren-from-siret.ts",
    "rules/address-parse.ts",
    "rules/derive-address-parse.ts",
    "rules/ape-normalize.ts",
    "rules/derive-ape-normalize.ts",
  ];

  for (const file of files) {
    const source = readFileSync(join(derivationDir, file), "utf8");
    assert.equal(source.includes("lmnp"), false, `${file} must not reference lmnp`);
    assert.equal(source.includes("ACTIVITE_REGIME"), false, `${file} must not reference regime`);
    assert.equal(source.includes("ActiviteInpiGptData"), false, `${file} must not reference Activite GPT`);
  }
});

console.log("All derivation-engine tests passed.");
