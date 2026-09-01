import assert from "node:assert/strict";

import {
  buildPrincipalEstablishmentEvidence,
  createDocumentFact,
  createFactExtractionResult,
  deriveDocumentFacts,
  extractInpiRneDeterministicFacts,
  groundActiviteFactExtraction,
  projectDocumentFactsToActivite,
} from "@/lib/documents/facts";
import { INPI_RNE_808900351_OCR } from "@/lib/documents/facts/extraction/inpi-rne/fixtures/inpi-rne-808900351.fixture";
import { findFactsByType, resolveFactForType } from "@/lib/documents/facts/activite-gpt-to-facts";
import { prefillActiviteFormFromGpt } from "@/lib/lmnp/services/activite-gpt-ui-prefill";
import { userActiviteFieldProvenance } from "@/lib/lmnp/services/activite-field-provenance";

function run(name: string, fn: () => void) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
  } catch (error) {
    console.error(`  ✗ ${name}`);
    throw error;
  }
}

const EMPTY_WORKSPACE = {
  fiscalYear: { id: "fy-1", year: 2025 },
  properties: [],
  documents: [],
  extractions: [],
  validationItems: [],
  ledgerEntries: [],
  declarationDraft: { completedSteps: [] },
};

console.log("activite-address-projection-cases.test.ts");

run("cas 1 — explicit personal address projects EXTRACTED to personal fields", () => {
  const rawText = `
Nom : Martin
Adresse personnelle : 15 route de Saint-Germain
33650 Saint-Médard-d'Eyrans
`.trim();

  const { activiteProjection, extraction } = groundActiviteFactExtraction(rawText, {
    adresseEntrepreneur: "15 route de Saint-Germain\n33650 Saint-Médard-d'Eyrans",
  });

  const projection = activiteProjection?.projection;
  assert.equal(projection?.fieldProvenance.personalAddress?.status, "extracted");
  assert.equal(projection?.formValues.personalAddress, "15 route de Saint-Germain");
  assert.equal(projection?.formValues.personalPostalCode, "33650");
  assert.equal(findFactsByType(extraction.facts, "address.headquarters").length, 0);
});

run("cas 3 — principal active establishment projects PROPOSED establishment fields", () => {
  const projection = projectDocumentFactsToActivite(
    createFactExtractionResult({
      documentId: "808900351-reference",
      extractorId: "test",
      facts: deriveDocumentFacts(
        extractInpiRneDeterministicFacts(INPI_RNE_808900351_OCR, "808900351-reference"),
      ).facts,
    }),
  );

  assert.equal(projection.fieldProvenance.establishmentAddress?.status, "proposed");
  assert.equal(projection.fieldProvenance.establishmentAddress?.origin, "fiscal_ai");
  assert.ok(projection.formValues.establishmentAddress?.includes("353 RUE DE PREMARCHAND"));
});

run("cas 4 — identical siège and establishment still keeps personal MISSING and establishment PROPOSED", () => {
  const projection = projectDocumentFactsToActivite(
    createFactExtractionResult({
      documentId: "808900351-reference",
      extractorId: "test",
      facts: deriveDocumentFacts(
        extractInpiRneDeterministicFacts(INPI_RNE_808900351_OCR, "808900351-reference"),
      ).facts,
    }),
  );

  const hq = findFactsByType(
    deriveDocumentFacts(
      extractInpiRneDeterministicFacts(INPI_RNE_808900351_OCR, "808900351-reference"),
    ).facts,
    "address.headquarters",
  )[0]?.value;
  assert.ok(hq?.includes("353 RUE DE PREMARCHAND"));
  assert.equal(projection.formValues.personalAddress, undefined);
  assert.equal(projection.fieldProvenance.personalAddress?.status, "missing");
  assert.equal(projection.fieldProvenance.establishmentAddress?.status, "proposed");
});

run("cas 5 — establishment different from siège remains PROPOSED only", () => {
  const principal = createDocumentFact({
    id: "doc:est-principal",
    type: "address.establishment",
    documentId: "doc",
    entityId: "80890035100020",
    value: "353 RUE DE PREMARCHAND\n33140 CADAUJAC",
    status: "extracted",
    origin: "document",
    fieldSource: "extracted",
    evidence: { snippet: "353 RUE DE PREMARCHAND" },
    requiresConfirmation: false,
  });
  const hq = createDocumentFact({
    id: "doc:hq",
    type: "address.headquarters",
    documentId: "doc",
    value: "1 AUTRE ADRESSE\n75001 PARIS",
    status: "extracted",
    origin: "document",
    fieldSource: "extracted",
    evidence: { snippet: "Adresse du siège" },
    requiresConfirmation: false,
  });
  const facts = [
    hq,
    principal,
    createDocumentFact({
      id: "doc:type",
      type: "establishment.type",
      documentId: "doc",
      entityId: "80890035100020",
      value: "Principal",
      status: "extracted",
      origin: "document",
      requiresConfirmation: false,
    }),
    createDocumentFact({
      id: "doc:status",
      type: "establishment.status",
      documentId: "doc",
      entityId: "80890035100020",
      value: "actif",
      status: "extracted",
      origin: "document",
      requiresConfirmation: false,
    }),
    createDocumentFact({
      id: "doc:siret",
      type: "registry.siret",
      documentId: "doc",
      entityId: "80890035100020",
      value: "80890035100020",
      status: "extracted",
      origin: "document",
      requiresConfirmation: false,
    }),
  ];

  const projection = projectDocumentFactsToActivite(
    createFactExtractionResult({
      documentId: "doc",
      extractorId: "test",
      facts,
    }),
  );

  assert.equal(projection.formValues.personalAddress, undefined);
  assert.equal(projection.fieldProvenance.establishmentAddress?.status, "proposed");
  assert.ok(projection.formValues.establishmentAddress?.includes("353 RUE DE PREMARCHAND"));
  assert.ok(
    buildPrincipalEstablishmentEvidence(facts, principal).includes("80890035100020"),
  );
});

run("cas 6 — user-validated personal address is not overwritten by projection prefill", () => {
  const workspace = {
    ...EMPTY_WORKSPACE,
    declarationDraft: {
      completedSteps: [],
      personalAddress: "12 rue saisie par l'utilisateur",
      personalCity: "Bordeaux",
      personalPostalCode: "33000",
      activiteUserValidatedFields: { personalAddress: true, personalCity: true, personalPostalCode: true },
      activiteFieldProvenance: {
        personalAddress: userActiviteFieldProvenance(true),
        personalCity: userActiviteFieldProvenance(true),
        personalPostalCode: userActiviteFieldProvenance(true),
      },
    },
  };

  const rawText = `
Nom : Martin
Adresse personnelle : 15 route de Saint-Germain
33650 Saint-Médard-d'Eyrans
`.trim();

  const result = prefillActiviteFormFromGpt(
    { success: true, data: { nom: "Martin", adresseEntrepreneur: "15 route de Saint-Germain\n33650 Saint-Médard-d'Eyrans" } },
    workspace,
    {
      rawText,
      forceReanalyze: true,
      userValidatedFields: { personalAddress: true, personalCity: true, personalPostalCode: true },
    },
  );

  assert.equal(result.formValues.personalAddress, "12 rue saisie par l'utilisateur");
  assert.equal(result.fieldProvenance.personalAddress?.origin, "user");
});

run("cas 7 — Property.address does not project into Activité address fields", () => {
  const workspace = {
    ...EMPTY_WORKSPACE,
    properties: [
      {
        id: "p-1",
        label: "Appartement",
        address: "42 cours Gambetta",
        city: "Bordeaux",
        postalCode: "33000",
      },
    ],
  };

  const result = prefillActiviteFormFromGpt(
    { success: true, data: {} },
    workspace,
    { rawText: INPI_RNE_808900351_OCR },
  );

  assert.equal(result.formValues.personalAddress, undefined);
  assert.notEqual(result.formValues.establishmentAddress, "42 cours Gambetta");
  assert.ok(result.formValues.establishmentAddress?.includes("353 RUE DE PREMARCHAND"));
});

run("cas 9 — ambiguous entrepreneur address stays MISSING on personal fields", () => {
  const rawText = `
Nom : DURAND
Adresse : 15 route de Saint-Germain
33650 Saint-Médard-d'Eyrans
`.trim();

  const { activiteProjection } = groundActiviteFactExtraction(rawText, {
    adresseEntrepreneur: "15 route de Saint-Germain\n33650 Saint-Médard-d'Eyrans",
  });

  const projection = activiteProjection?.projection;
  assert.equal(projection?.formValues.personalAddress, undefined);
  assert.equal(projection?.fieldProvenance.personalAddress?.status, "missing");
});

run("real INPI 808900351 — siège never personal, principal establishment PROPOSED in prefill", () => {
  const result = prefillActiviteFormFromGpt(
    { success: true, data: {} },
    EMPTY_WORKSPACE,
    { rawText: INPI_RNE_808900351_OCR },
  );

  assert.equal(result.formValues.personalAddress, undefined);
  assert.equal(result.fieldProvenance.personalAddress?.status, "missing");
  assert.ok(result.formValues.establishmentAddress?.includes("353 RUE DE PREMARCHAND"));
  assert.equal(result.fieldProvenance.establishmentAddress?.status, "proposed");
  assert.ok(result.fieldProvenance.establishmentAddress?.evidence?.includes("Principal"));
  assert.ok(result.fieldProvenance.establishmentAddress?.evidence?.includes("80890035100020"));
});

const DOC2_OCR = `
Synthèse INPI
Nom : MARTIN
Prénom : Sophie
SIREN : 205678912
Adresse du déclarant signataire : 27 Rue des Acacias, 34070 Montpellier
Adresse de l'entreprise : 8 chemin des Lilas, 69009 Lyon
Email : s.martin@gmail.com
Téléphone : 0678123456
`.trim();

const DOC2_GPT = {
  nom: "MARTIN",
  prenom: "Sophie",
  siren: "205678912",
  email: "s.martin@gmail.com",
  telephone: "0678123456",
  adresseEntrepreneur: "27 Rue des Acacias, 34070 Montpellier",
  adresseEtablissement: "8 chemin des Lilas, 69009 Lyon",
};

run("cas 10 — Synthèse INPI doc 2 projects personal EXTRACTED and establishment PROPOSED", () => {
  const { activiteProjection, extraction } = groundActiviteFactExtraction(DOC2_OCR, DOC2_GPT);
  const projection = activiteProjection?.projection;

  assert.equal(projection?.formValues.lastName, "MARTIN");
  assert.equal(projection?.formValues.firstName, "Sophie");
  assert.equal(projection?.formValues.siren, "205678912");
  assert.equal(projection?.formValues.email, "s.martin@gmail.com");
  assert.equal(projection?.formValues.telephone, "0678123456");

  assert.equal(projection?.fieldProvenance.personalAddress?.status, "extracted");
  assert.equal(projection?.fieldProvenance.personalAddress?.origin, "inpi_document");
  assert.ok(projection?.formValues.personalAddress?.includes("Acacias"));
  assert.ok(projection?.fieldProvenance.personalAddress?.evidence?.includes("déclarant signataire"));

  assert.equal(projection?.fieldProvenance.establishmentAddress?.status, "proposed");
  assert.equal(projection?.fieldProvenance.establishmentAddress?.origin, "fiscal_ai");
  assert.ok(projection?.formValues.establishmentAddress?.includes("Lilas"));
  assert.ok(projection?.fieldProvenance.establishmentAddress?.evidence?.includes("entreprise"));

  const establishment = resolveFactForType(extraction.facts, "address.establishment", {
    unscopedOnly: true,
  });
  assert.equal(establishment?.entityId, undefined);
  assert.ok(establishment?.evidence?.snippet?.includes("entreprise"));
});

run("cas 11 — unscoped establishment without semantic evidence stays MISSING", () => {
  const projection = projectDocumentFactsToActivite(
    createFactExtractionResult({
      documentId: "doc-ambiguous",
      extractorId: "test",
      facts: [
        createDocumentFact({
          id: "doc:est",
          type: "address.establishment",
          documentId: "doc-ambiguous",
          value: "8 chemin des Lilas, 69009 Lyon",
          status: "extracted",
          origin: "document",
          fieldSource: "extracted",
          evidence: { snippet: "8 chemin des Lilas, 69009 Lyon" },
          requiresConfirmation: false,
        }),
      ],
    }),
  );

  assert.equal(projection.formValues.establishmentAddress, undefined);
  assert.equal(projection.fieldProvenance.establishmentAddress?.status, "missing");
});

run("cas 12 — doc 2 prefill exposes personal and establishment fields", () => {
  const result = prefillActiviteFormFromGpt(
    { success: true, data: DOC2_GPT },
    EMPTY_WORKSPACE,
    { rawText: DOC2_OCR },
  );

  assert.equal(result.formValues.lastName, "MARTIN");
  assert.equal(result.formValues.firstName, "Sophie");
  assert.equal(result.formValues.siren, "205678912");
  assert.equal(result.fieldProvenance.personalAddress?.status, "extracted");
  assert.equal(result.fieldProvenance.establishmentAddress?.status, "proposed");
  assert.ok(result.formValues.establishmentAddress?.includes("Lilas"));
});

console.log("All activite-address-projection-cases tests passed.");
