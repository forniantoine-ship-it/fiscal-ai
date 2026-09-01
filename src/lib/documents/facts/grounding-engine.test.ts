import assert from "node:assert/strict";

import type { ActiviteInpiGptData } from "@/lib/documents/gpt";
import {
  adaptActiviteGptToFactExtractionResult,
  findActiviteFact,
  findFactsByType,
  groundActiviteFactExtraction,
  resolveFactForType,
} from "@/lib/documents/facts";

const OCR_SAMPLE = `
EXTRAIT INPI
Nom : DURAND
Prénom : Élodie
SIREN : 123 456 789
SIRET : 12345678900012
Email : elodie.durand@mail.fr
Téléphone : 06.12.34.56.78
Adresse : 15 route de Saint-Germain
33650 Saint-Médard-d'Eyrans
`.trim();

function run(name: string, fn: () => void) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
  } catch (error) {
    console.error(`  ✗ ${name}`);
    throw error;
  }
}

console.log("grounding-engine.test.ts");

run("explicit SIREN stays EXTRACTED with no derived SIREN duplicate", () => {
  const { extraction, derivation } = groundActiviteFactExtraction(OCR_SAMPLE, { siren: "123456789" });

  const siren = resolveFactForType(extraction.facts, "registry.siren");
  assert.equal(siren?.status, "extracted");
  assert.equal(siren?.fieldSource, "extracted");

  const derivedSirens = findFactsByType(extraction.facts, "registry.siren").filter(
    (fact) => fact.derivationRule === "siren_from_siret",
  );
  assert.equal(derivedSirens.length, 0);
  assert.equal(derivation.derivedFacts.some((fact) => fact.type === "registry.siren"), false);
});

run("SIRET only produces PROPOSED SIREN via DerivationEngine", () => {
  const ocr = `
SIRET : 98765432100011
Nom : Martin
`.trim();

  const { extraction, activiteProjection, derivation } = groundActiviteFactExtraction(ocr, {
    nom: "Martin",
  });

  const siren = resolveFactForType(extraction.facts, "registry.siren");
  assert.equal(siren?.status, "proposed");
  assert.equal(siren?.fieldSource, "derived");
  assert.equal(siren?.value, "987654321");
  assert.equal(siren?.derivationRule, "siren_from_siret");
  assert.equal(siren?.requiresConfirmation, true);
  assert.equal(siren?.evidence?.snippet, "SIRET 98765432100011");
  assert.deepEqual(siren?.derivedFrom, ["activite-document:registry.siret"]);
  assert.equal(derivation.steps.some((step) => step.rule === "siren_from_siret"), true);
  assert.equal(activiteProjection?.fieldProvenance.siren?.status, "proposed");
});

run("present email is EXTRACTED after grounding", () => {
  const { extraction, activiteProjection } = groundActiviteFactExtraction(OCR_SAMPLE, {
    email: "elodie.durand@mail.fr",
  });

  const email = resolveFactForType(extraction.facts, "contact.email");
  assert.equal(email?.status, "extracted");
  assert.ok(email?.evidence?.snippet);
  assert.equal(activiteProjection?.groundedData.email, "elodie.durand@mail.fr");
});

run("hallucinated GPT email stays MISSING after grounding", () => {
  const gptData: ActiviteInpiGptData = {
    nom: "DURAND",
    email: "marie.dupont@example.com",
  };
  const { extraction, activiteProjection } = groundActiviteFactExtraction(OCR_SAMPLE, gptData);

  const email = resolveFactForType(extraction.facts, "contact.email");
  assert.equal(email?.status, "missing");
  assert.equal(email?.rejectedValue, "marie.dupont@example.com");
  assert.equal(activiteProjection?.groundedData.email, undefined);
  assert.equal(activiteProjection?.fieldProvenance.email?.status, "missing");
});

run("explicit personal address runs grounding then address_parse derivation", () => {
  const ocr = `
EXTRAIT INPI
Nom : DURAND
Prénom : Élodie
Adresse personnelle : 15 route de Saint-Germain
33650 Saint-Médard-d'Eyrans
`.trim();

  const { extraction, derivation } = groundActiviteFactExtraction(ocr, {
    adresseEntrepreneur: "15 route de Saint-Germain\n33650 Saint-Médard-d'Eyrans",
  });

  const address = resolveFactForType(extraction.facts, "address.personal");
  assert.equal(address?.status, "extracted");

  const line = extraction.facts.find((fact) => fact.type === "address.line");
  assert.ok(line);
  assert.equal(line?.status, "proposed");
  assert.equal(line?.derivationRule, "address_parse");
  assert.equal(derivation.steps.some((step) => step.rule === "address_parse"), true);
  assert.equal(findFactsByType(extraction.facts, "address.headquarters").length, 0);
});

run("does not derive address sub-facts when entrepreneur address lacks explicit personal label", () => {
  const { extraction, derivation } = groundActiviteFactExtraction(OCR_SAMPLE, {
    adresseEntrepreneur: "15 route de Saint-Germain\n33650 Saint-Médard-d'Eyrans",
  });

  assert.equal(findFactsByType(extraction.facts, "address.headquarters").length, 0);
  assert.equal(resolveFactForType(extraction.facts, "address.personal")?.status, "missing");
  assert.equal(extraction.facts.some((fact) => fact.type === "address.line"), false);
  assert.equal(
    derivation.derivedFacts.some((fact) => fact.derivationRule === "address_parse"),
    false,
  );
});

run("does not derive address sub-facts when grounding rejects the address", () => {
  const ocr = `
Nom : DURAND
Adresse personnelle : 15 route de Saint-Germain
33650 Saint-Médard-d'Eyrans
`.trim();

  const { extraction, derivation } = groundActiviteFactExtraction(ocr, {
    adresseEntrepreneur: "4 allée Malbec\n33650 Saint-Médard-d'Eyrans",
  });

  assert.equal(resolveFactForType(extraction.facts, "address.personal")?.status, "missing");
  assert.equal(extraction.facts.some((fact) => fact.type === "address.line"), false);
  assert.equal(
    derivation.derivedFacts.some((fact) => fact.derivationRule === "address_parse"),
    false,
  );
});

run("extracts SIREN as EXTRACTED when explicitly labelled in OCR", () => {
  const gptData: ActiviteInpiGptData = { siren: "123456789" };
  const { extraction } = groundActiviteFactExtraction(OCR_SAMPLE, gptData);

  const siren = findActiviteFact(extraction.facts, "registry.siren");
  assert.equal(siren?.status, "extracted");
  assert.equal(siren?.value, "123456789");
  assert.equal(siren?.fieldSource, "extracted");
});

run("extracts SIRET as EXTRACTED from OCR even when GPT omits it", () => {
  const gptData: ActiviteInpiGptData = { nom: "DURAND" };
  const { extraction } = groundActiviteFactExtraction(OCR_SAMPLE, gptData);

  const siret = findActiviteFact(extraction.facts, "registry.siret");
  assert.equal(siret?.status, "extracted");
  assert.equal(siret?.value, "12345678900012");
  assert.ok(siret?.evidence?.snippet);
});

run("marks absent email as MISSING when GPT omits it", () => {
  const gptData: ActiviteInpiGptData = { nom: "DURAND" };
  const { extraction } = groundActiviteFactExtraction(OCR_SAMPLE, gptData);

  const email = findActiviteFact(extraction.facts, "contact.email");
  assert.equal(email?.status, "missing");
  assert.equal(email?.value, undefined);
});

run("proposes SIREN derived from SIRET when GPT value matches SIRET prefix", () => {
  const ocr = `
SIRET : 98765432100011
Nom : Martin
`.trim();

  const { extraction, activiteProjection } = groundActiviteFactExtraction(ocr, {
    nom: "Martin",
    siren: "987654321",
  });

  const siren = resolveFactForType(extraction.facts, "registry.siren");
  assert.equal(siren?.status, "proposed");
  assert.equal(siren?.fieldSource, "derived");
  assert.equal(siren?.value, "987654321");
  assert.equal(siren?.evidence?.snippet, "SIRET 98765432100011");
  assert.equal(activiteProjection?.fieldProvenance.siren?.status, "proposed");
});

run("preserves evidence snippet on EXTRACTED facts", () => {
  const { extraction } = groundActiviteFactExtraction(OCR_SAMPLE, {
    nom: "DURAND",
    email: "elodie.durand@mail.fr",
  });

  const email = findActiviteFact(extraction.facts, "contact.email");
  assert.equal(email?.status, "extracted");
  assert.ok(email?.evidence?.snippet);
});

run("adaptActiviteGptToFactExtractionResult maps GPT fields to canonical fact types", () => {
  const extraction = adaptActiviteGptToFactExtractionResult(
    {
      nom: "Martin",
      prenom: "Paul",
      siren: "123456789",
    },
    "doc-1",
  );

  assert.equal(extraction.extractorId, "activite-gpt-v1");
  assert.equal(findActiviteFact(extraction.facts, "person.name.family")?.value, "Martin");
  assert.equal(findActiviteFact(extraction.facts, "person.name.given")?.value, "Paul");
  assert.equal(findActiviteFact(extraction.facts, "registry.siren")?.origin, "gpt");
});

run("establishment address keeps semantic OCR evidence after grounding", () => {
  const ocr = `
Synthèse INPI
Nom : MARTIN
Adresse de l'entreprise : 8 chemin des Lilas, 69009 Lyon
`.trim();

  const { extraction, activiteProjection } = groundActiviteFactExtraction(ocr, {
    nom: "MARTIN",
    adresseEtablissement: "8 chemin des Lilas, 69009 Lyon",
  });

  const establishment = resolveFactForType(extraction.facts, "address.establishment", {
    unscopedOnly: true,
  });
  assert.equal(establishment?.status, "extracted");
  assert.ok(establishment?.evidence?.snippet?.includes("entreprise"));
  assert.ok(activiteProjection?.projection.formValues.establishmentAddress?.includes("Lilas"));
  assert.equal(activiteProjection?.projection.fieldProvenance.establishmentAddress?.status, "proposed");
});

run("declarant signataire personal address is EXTRACTED with semantic evidence", () => {
  const ocr = `
Nom : MARTIN
Adresse du déclarant signataire : 27 Rue des Acacias, 34070 Montpellier
`.trim();

  const { extraction, activiteProjection } = groundActiviteFactExtraction(ocr, {
    adresseEntrepreneur: "27 Rue des Acacias, 34070 Montpellier",
  });

  const personal = resolveFactForType(extraction.facts, "address.personal");
  assert.equal(personal?.status, "extracted");
  assert.ok(personal?.evidence?.snippet?.includes("déclarant signataire"));
  assert.equal(activiteProjection?.projection.fieldProvenance.personalAddress?.status, "extracted");
});

console.log("All grounding-engine tests passed.");
