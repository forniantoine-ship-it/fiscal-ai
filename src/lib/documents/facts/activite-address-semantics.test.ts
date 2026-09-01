import assert from "node:assert/strict";

import {
  adaptActiviteGptToFacts,
  extractInpiRneDeterministicFacts,
  findFactsByType,
  groundActiviteFactExtraction,
  resolveFactForType,
} from "@/lib/documents/facts";
import {
  hasExplicitEstablishmentAddressLabel,
  hasExplicitPersonalAddressLabel,
  resolveGptEntrepreneurAddressFactType,
} from "@/lib/documents/facts/activite-address-semantics";
import { INPI_RNE_808900351_OCR } from "@/lib/documents/facts/extraction/inpi-rne/fixtures/inpi-rne-808900351.fixture";

function run(name: string, fn: () => void) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
  } catch (error) {
    console.error(`  ✗ ${name}`);
    throw error;
  }
}

console.log("activite-address-semantics.test.ts");

run("INPI Adresse du siège maps to address.headquarters only", () => {
  const facts = extractInpiRneDeterministicFacts(INPI_RNE_808900351_OCR, "doc-inpi");

  assert.equal(findFactsByType(facts, "address.headquarters").length, 1);
  assert.equal(findFactsByType(facts, "address.personal").length, 0);
  assert.ok(findFactsByType(facts, "address.headquarters")[0]?.value?.includes("CADAUJAC"));
});

run("explicit personal label maps GPT adresseEntrepreneur to address.personal", () => {
  const rawText = `
Nom : Martin
Adresse personnelle : 15 route de Saint-Germain
33650 Saint-Médard-d'Eyrans
`.trim();

  assert.equal(hasExplicitPersonalAddressLabel(rawText), true);
  assert.equal(
    resolveGptEntrepreneurAddressFactType(
      rawText,
      "15 route de Saint-Germain\n33650 Saint-Médard-d'Eyrans",
    ),
    "address.personal",
  );

  const facts = adaptActiviteGptToFacts(
    { adresseEntrepreneur: "15 route de Saint-Germain\n33650 Saint-Médard-d'Eyrans" },
    "doc-1",
    rawText,
  );

  const personal = resolveFactForType(facts, "address.personal");
  assert.equal(personal?.status, "proposed");
  assert.equal(personal?.value?.includes("Saint-Médard"), true);
  assert.equal(findFactsByType(facts, "address.headquarters").length, 0);
});

run("legacy adresseEntrepreneur without personal proof does not map to headquarters", () => {
  const rawText = `
Nom : DURAND
Adresse : 15 route de Saint-Germain
33650 Saint-Médard-d'Eyrans
`.trim();

  assert.equal(resolveGptEntrepreneurAddressFactType(rawText, "15 route de Saint-Germain"), null);

  const { extraction } = groundActiviteFactExtraction(rawText, {
    adresseEntrepreneur: "15 route de Saint-Germain\n33650 Saint-Médard-d'Eyrans",
  });

  assert.equal(findFactsByType(extraction.facts, "address.headquarters").length, 0);
  const personal = resolveFactForType(extraction.facts, "address.personal");
  assert.equal(personal?.status, "missing");
  assert.ok(personal?.rejectedValue?.includes("Saint-Médard"));
});

run("establishment GPT value maps to address.establishment", () => {
  const facts = adaptActiviteGptToFacts(
    { adresseEtablissement: "119 AV DE LA GARONNE\n33440 SAINT-LOUIS" },
    "doc-1",
  );

  const establishment = resolveFactForType(facts, "address.establishment");
  assert.equal(establishment?.status, "proposed");
  assert.ok(establishment?.value?.includes("GARONNE"));
});

run("adresse du déclarant signataire is explicit personal label", () => {
  const rawText = `
Nom : MARTIN
Adresse du déclarant signataire : 27 Rue des Acacias, 34070 Montpellier
`.trim();

  assert.equal(hasExplicitPersonalAddressLabel(rawText), true);
  assert.equal(
    resolveGptEntrepreneurAddressFactType(rawText, "27 Rue des Acacias, 34070 Montpellier"),
    "address.personal",
  );
});

run("generic Adresse label is not explicit personal", () => {
  const rawText = `
Nom : DURAND
Adresse : 15 route de Saint-Germain
`.trim();

  assert.equal(hasExplicitPersonalAddressLabel(rawText), false);
  assert.equal(resolveGptEntrepreneurAddressFactType(rawText, "15 route de Saint-Germain"), null);
});

run("adresse de l'entreprise is explicit establishment label", () => {
  const rawText = `Adresse de l'entreprise : 8 chemin des Lilas, 69009 Lyon`;

  assert.equal(hasExplicitEstablishmentAddressLabel(rawText), true);
});

run("does not create propertyAddress or address.property facts", () => {
  const { extraction } = groundActiviteFactExtraction(INPI_RNE_808900351_OCR, {
    adresseEntrepreneur: "353 RUE DE PREMARCHAND",
    adresseEtablissement: "353 RUE DE PREMARCHAND",
  });

  assert.equal(extraction.facts.some((fact) => fact.type === ("address.property" as never)), false);
  assert.equal(extraction.facts.some((fact) => /property/i.test(fact.type)), false);
});

console.log("All activite-address-semantics tests passed.");
