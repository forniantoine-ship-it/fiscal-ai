import assert from "node:assert/strict";

import { groundActiviteFactExtraction } from "@/lib/documents/facts/grounding-engine";
import { INPI_RNE_808900351_OCR } from "@/lib/documents/facts/extraction/inpi-rne/fixtures/inpi-rne-808900351.fixture";
import {
  createDocumentFactSnapshot,
  mergeActiviteDocumentProjection,
  mergeDocumentIntoDossierStore,
} from "@/lib/lmnp/services/activite-document-merge";
import {
  createEmptyActiviteFieldStore,
  storeToFormValues,
} from "@/lib/lmnp/services/activite-field-store";
import {
  extractedInpiFieldProvenance,
  proposedEstablishmentAddressProvenance,
  userActiviteFieldProvenance,
} from "@/lib/lmnp/services/activite-field-provenance";
import { prefillActiviteFormFromGpt } from "@/lib/lmnp/services/activite-gpt-ui-prefill";

const EMPTY_WORKSPACE = {
  fiscalYear: { id: "fy-1", year: 2025 },
  properties: [],
  documents: [],
  extractions: [],
  validationItems: [],
  ledgerEntries: [],
  declarationDraft: { completedSteps: [] },
};

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

function run(name: string, fn: () => void) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
  } catch (error) {
    console.error(`  ✗ ${name}`);
    throw error;
  }
}

function groundedProjection(rawText: string, gptData: Record<string, string | null | undefined>, documentId: string) {
  const grounded = groundActiviteFactExtraction(rawText, gptData, documentId);
  const projection = grounded.activiteProjection?.projection;
  assert.ok(projection, "projection required");
  return {
    projection,
    snapshot: createDocumentFactSnapshot({
      documentId,
      extractorId: grounded.extraction.extractorId,
      facts: grounded.extraction.facts,
    }),
  };
}

function workspaceAfterPrefill(
  workspace: typeof EMPTY_WORKSPACE,
  result: ReturnType<typeof prefillActiviteFormFromGpt>,
) {
  return {
    ...workspace,
    declarationDraft: {
      ...workspace.declarationDraft,
      ...(result.draftPatch ?? {}),
    },
  };
}

console.log("activite-document-merge.test.ts");

run("A. premier document remplit le store courant", () => {
  const result = prefillActiviteFormFromGpt(
    { success: true, data: {} },
    EMPTY_WORKSPACE,
    { rawText: INPI_RNE_808900351_OCR, documentId: "doc-808900351" },
  );

  assert.equal(result.formValues.lastName, "FORNI");
  assert.equal(result.formValues.siren, "808900351");
  assert.ok(result.fieldStore?.documentSnapshots["doc-808900351"]);
  assert.equal(result.mergeResult?.applied.length, 6);
});

run("B. document complémentaire conserve identité et ajoute contacts", () => {
  const doc1 = prefillActiviteFormFromGpt(
    { success: true, data: {} },
    EMPTY_WORKSPACE,
    { rawText: INPI_RNE_808900351_OCR, documentId: "doc-808900351" },
  );

  const complementOcr = `
Nom : FORNI
Prénom : ANTOINE
SIREN : 808900351
Email : contact@forni.fr
Téléphone : 0611223344
`.trim();

  const doc2 = prefillActiviteFormFromGpt(
    { success: true, data: { email: "contact@forni.fr", telephone: "0611223344" } },
    workspaceAfterPrefill(EMPTY_WORKSPACE, doc1),
    { rawText: complementOcr, documentId: "doc-complement" },
  );

  assert.equal(doc2.formValues.lastName, "FORNI");
  assert.equal(doc2.formValues.firstName, "ANTOINE");
  assert.equal(doc2.formValues.siren, "808900351");
  assert.equal(doc2.formValues.email, "contact@forni.fr");
  assert.equal(doc2.formValues.telephone, "0611223344");
});

run("C. nouveau document remplace des valeurs EXTRACTED", () => {
  const doc1 = prefillActiviteFormFromGpt(
    { success: true, data: {} },
    EMPTY_WORKSPACE,
    { rawText: INPI_RNE_808900351_OCR, documentId: "doc-808900351" },
  );

  const doc2 = prefillActiviteFormFromGpt(
    { success: true, data: DOC2_GPT },
    workspaceAfterPrefill(EMPTY_WORKSPACE, doc1),
    { rawText: DOC2_OCR, documentId: "doc-2" },
  );

  assert.equal(doc2.formValues.lastName, "MARTIN");
  assert.equal(doc2.formValues.firstName, "Sophie");
  assert.equal(doc2.formValues.siren, "205678912");
  const history = doc2.fieldStore?.fieldLedgers.lastName?.history ?? [];
  assert.equal(history.length, 1);
  assert.equal(history[0]?.value, "FORNI");
  assert.equal(history[0]?.sourceDocumentId, "doc-808900351");
  assert.equal(history[0]?.replacedByDocumentId, "doc-2");
});

run("D. absence de champ conserve ancienne valeur", () => {
  const doc1 = prefillActiviteFormFromGpt(
    { success: true, data: DOC2_GPT },
    EMPTY_WORKSPACE,
    { rawText: DOC2_OCR, documentId: "doc-2" },
  );

  const partialOcr = `
Nom : MARTIN
Prénom : Sophie
SIREN : 205678912
`.trim();

  const doc2 = prefillActiviteFormFromGpt(
    { success: true, data: { nom: "MARTIN", prenom: "Sophie", siren: "205678912" } },
    workspaceAfterPrefill(EMPTY_WORKSPACE, doc1),
    { rawText: partialOcr, documentId: "doc-partial" },
  );

  assert.equal(doc2.formValues.email, "s.martin@gmail.com");
  assert.equal(doc2.formValues.telephone, "0678123456");
  assert.ok(doc2.formValues.personalAddress?.includes("Acacias"));
});

run("E. PROPOSED remplace PROPOSED non confirmé", () => {
  const workspace = {
    ...EMPTY_WORKSPACE,
    declarationDraft: {
      completedSteps: [],
      establishmentAddress: "Ancienne proposition",
      establishmentCity: "Bordeaux",
      establishmentPostalCode: "33000",
      activiteFieldProvenance: {
        establishmentAddress: proposedEstablishmentAddressProvenance({ evidence: "ancienne" }),
        establishmentCity: proposedEstablishmentAddressProvenance({ evidence: "ancienne" }),
        establishmentPostalCode: proposedEstablishmentAddressProvenance({ evidence: "ancienne" }),
      },
    },
  };

  const result = prefillActiviteFormFromGpt(
    { success: true, data: {} },
    workspace,
    { rawText: INPI_RNE_808900351_OCR, documentId: "doc-rne-replace-proposed" },
  );

  assert.ok(result.formValues.establishmentAddress?.includes("353 RUE DE PREMARCHAND"));
  assert.notEqual(result.formValues.establishmentAddress, "Ancienne proposition");
  assert.equal(result.fieldProvenance.establishmentAddress?.status, "proposed");
});

run("F. EXTRACTED remplace PROPOSED dérivé pour SIREN", () => {
  const ocrSiretOnly = `
SIRET : 98765432100011
Nom : Martin
`.trim();
  const { projection, snapshot } = groundedProjection(ocrSiretOnly, { nom: "Martin" }, "doc-siret");

  const first = mergeDocumentIntoDossierStore(createEmptyActiviteFieldStore(), snapshot, projection);
  assert.equal(storeToFormValues(first.store).siren, "987654321");

  const explicitSirenOcr = `
SIREN : 123456789
Nom : Martin
`.trim();
  const secondGrounded = groundedProjection(
    explicitSirenOcr,
    { nom: "Martin", siren: "123456789" },
    "doc-siren-explicit",
  );
  const second = mergeDocumentIntoDossierStore(
    first.store,
    secondGrounded.snapshot,
    secondGrounded.projection,
  );

  assert.equal(storeToFormValues(second.store).siren, "123456789");
  assert.equal(second.store.fieldLedgers.siren?.history[0]?.value, "987654321");
});

run("G. EXTRACTED doc2 remplace EXTRACTED doc1 différent", () => {
  const doc1 = prefillActiviteFormFromGpt(
    { success: true, data: { siren: "111111111", nom: "A", prenom: "B" } },
    EMPTY_WORKSPACE,
    {
      rawText: "Nom : A\nPrénom : B\nSIREN : 111111111",
      documentId: "doc-siren-1",
    },
  );

  const doc2 = prefillActiviteFormFromGpt(
    { success: true, data: { siren: "222222222", nom: "C", prenom: "D" } },
    workspaceAfterPrefill(EMPTY_WORKSPACE, doc1),
    {
      rawText: "Nom : C\nPrénom : D\nSIREN : 222222222",
      documentId: "doc-siren-2",
    },
  );

  assert.equal(doc2.formValues.siren, "222222222");
  assert.equal(doc2.fieldStore?.fieldLedgers.siren?.history[0]?.value, "111111111");
});

run("H. userValidated protège contre merge", () => {
  const doc1 = prefillActiviteFormFromGpt(
    { success: true, data: {} },
    EMPTY_WORKSPACE,
    { rawText: INPI_RNE_808900351_OCR, documentId: "doc-808900351" },
  );

  const workspace = {
    ...workspaceAfterPrefill(EMPTY_WORKSPACE, doc1),
    declarationDraft: {
      ...workspaceAfterPrefill(EMPTY_WORKSPACE, doc1).declarationDraft,
      activiteUserValidatedFields: { lastName: true },
      exploitantLastName: "DUPONT",
      activiteFieldProvenance: {
        ...doc1.fieldProvenance,
        lastName: userActiviteFieldProvenance(true),
      },
    },
  };

  const doc2 = prefillActiviteFormFromGpt(
    { success: true, data: DOC2_GPT },
    workspace,
    { rawText: DOC2_OCR, documentId: "doc-2", userValidatedFields: { lastName: true } },
  );

  assert.equal(doc2.formValues.lastName, "DUPONT");
  assert.equal(doc2.formValues.firstName, "Sophie");
});

run("I. userConfirmed protège contre merge", () => {
  const workspace = {
    ...EMPTY_WORKSPACE,
    declarationDraft: {
      completedSteps: [],
      establishmentAddress: "Adresse confirmée",
      establishmentCity: "Lyon",
      establishmentPostalCode: "69009",
      activiteFieldProvenance: {
        establishmentAddress: {
          ...proposedEstablishmentAddressProvenance({ evidence: "confirmée" }),
          status: "extracted",
          origin: "user",
          userConfirmed: true,
        },
        establishmentCity: {
          ...proposedEstablishmentAddressProvenance({ evidence: "confirmée" }),
          status: "extracted",
          origin: "user",
          userConfirmed: true,
        },
        establishmentPostalCode: {
          ...proposedEstablishmentAddressProvenance({ evidence: "confirmée" }),
          status: "extracted",
          origin: "user",
          userConfirmed: true,
        },
      },
    },
  };

  const result = prefillActiviteFormFromGpt(
    { success: true, data: DOC2_GPT },
    workspace,
    { rawText: DOC2_OCR, documentId: "doc-2" },
  );

  assert.equal(result.formValues.establishmentAddress, "Adresse confirmée");
  assert.equal(result.formValues.establishmentCity, "Lyon");
});

run("J. même valeur ne crée pas d'historique inutile", () => {
  const doc1 = prefillActiviteFormFromGpt(
    { success: true, data: { nom: "FORNI" } },
    EMPTY_WORKSPACE,
    { rawText: "Nom : FORNI\nPrénom : ANTOINE\nSIREN : 808900351", documentId: "doc-1" },
  );

  const doc2 = prefillActiviteFormFromGpt(
    { success: true, data: { nom: "FORNI" } },
    workspaceAfterPrefill(EMPTY_WORKSPACE, doc1),
    { rawText: "Nom : FORNI\nPrénom : ANTOINE\nSIREN : 808900351", documentId: "doc-2" },
  );

  assert.equal(doc2.formValues.lastName, "FORNI");
  assert.equal(doc2.mergeResult?.historized.includes("lastName"), false);
  assert.ok(doc2.mergeResult?.refreshed.includes("lastName"));
});

run("K. SIREN derived ne remplace pas SIREN extracted", () => {
  const explicit = prefillActiviteFormFromGpt(
    { success: true, data: {} },
    EMPTY_WORKSPACE,
    { rawText: INPI_RNE_808900351_OCR, documentId: "doc-explicit-siren" },
  );
  assert.equal(explicit.formValues.siren, "808900351");

  const siretOnly = prefillActiviteFormFromGpt(
    { success: true, data: { nom: "FORNI" } },
    workspaceAfterPrefill(EMPTY_WORKSPACE, explicit),
    {
      rawText: "SIRET : 80890035100020\nNom : FORNI",
      documentId: "doc-derived-siren",
    },
  );

  assert.equal(siretOnly.formValues.siren, "808900351");
  assert.equal(siretOnly.mergeResult?.preserved.includes("siren"), true);
});

run("L. SIREN extracted remplace SIREN derived", () => {
  const derived = prefillActiviteFormFromGpt(
    { success: true, data: { nom: "Martin" } },
    EMPTY_WORKSPACE,
    { rawText: "SIRET : 98765432100011\nNom : Martin", documentId: "doc-derived" },
  );
  assert.equal(derived.formValues.siren, "987654321");
  assert.equal(derived.fieldProvenance.siren?.status, "proposed");

  const extracted = prefillActiviteFormFromGpt(
    { success: true, data: { nom: "Martin", siren: "123456789" } },
    workspaceAfterPrefill(EMPTY_WORKSPACE, derived),
    { rawText: "SIREN : 123456789\nNom : Martin", documentId: "doc-extracted" },
  );

  assert.equal(extracted.formValues.siren, "123456789");
  assert.equal(extracted.fieldProvenance.siren?.status, "extracted");
});

run("M. adresses restent séparées par sémantique", () => {
  const result = prefillActiviteFormFromGpt(
    { success: true, data: DOC2_GPT },
    EMPTY_WORKSPACE,
    { rawText: DOC2_OCR, documentId: "doc-2" },
  );

  assert.ok(result.formValues.personalAddress?.includes("Acacias"));
  assert.ok(result.formValues.establishmentAddress?.includes("Lilas"));
  assert.notEqual(result.formValues.personalAddress, result.formValues.establishmentAddress);
});

run("N. historique contient sourceDocumentId + evidence", () => {
  const doc1 = prefillActiviteFormFromGpt(
    { success: true, data: {} },
    EMPTY_WORKSPACE,
    { rawText: INPI_RNE_808900351_OCR, documentId: "doc-808900351" },
  );

  const doc2 = prefillActiviteFormFromGpt(
    { success: true, data: DOC2_GPT },
    workspaceAfterPrefill(EMPTY_WORKSPACE, doc1),
    { rawText: DOC2_OCR, documentId: "doc-2" },
  );

  const history = doc2.fieldStore?.fieldLedgers.siren?.history[0];
  assert.equal(history?.sourceDocumentId, "doc-808900351");
  assert.equal(history?.replacedByDocumentId, "doc-2");
  assert.ok(history?.evidence || history?.value);
});

run("RÉEL 1 — doc1 INPI 808900351 puis doc2 Synthèse INPI", () => {
  const doc1 = prefillActiviteFormFromGpt(
    { success: true, data: {} },
    EMPTY_WORKSPACE,
    { rawText: INPI_RNE_808900351_OCR, documentId: "doc-808900351" },
  );

  const doc2 = prefillActiviteFormFromGpt(
    { success: true, data: DOC2_GPT },
    workspaceAfterPrefill(EMPTY_WORKSPACE, doc1),
    { rawText: DOC2_OCR, documentId: "doc-2" },
  );

  assert.equal(doc2.formValues.lastName, "MARTIN");
  assert.equal(doc2.formValues.firstName, "Sophie");
  assert.equal(doc2.formValues.siren, "205678912");
  assert.ok(doc2.formValues.personalAddress?.includes("Acacias"));
  assert.ok(doc2.formValues.establishmentAddress?.includes("Lilas"));
  assert.equal(doc2.formValues.email, "s.martin@gmail.com");
  assert.equal(doc2.formValues.telephone, "0678123456");
  assert.equal(doc2.fieldProvenance.personalAddress?.status, "extracted");
  assert.equal(doc2.fieldProvenance.establishmentAddress?.status, "proposed");
  assert.equal(doc2.fieldStore?.fieldLedgers.lastName?.history[0]?.value, "FORNI");
});

run("RÉEL 2 — identité doc1 + contacts doc2", () => {
  const identityOcr = `
Nom : FORNI
Prénom : ANTOINE
SIREN : 808900351
`.trim();

  const doc1 = prefillActiviteFormFromGpt(
    { success: true, data: { nom: "FORNI", prenom: "ANTOINE", siren: "808900351" } },
    EMPTY_WORKSPACE,
    { rawText: identityOcr, documentId: "doc-identity" },
  );

  const contactsOcr = `
Email : contact@forni.fr
Téléphone : 0611223344
`.trim();

  const doc2 = prefillActiviteFormFromGpt(
    { success: true, data: { email: "contact@forni.fr", telephone: "0611223344" } },
    workspaceAfterPrefill(EMPTY_WORKSPACE, doc1),
    { rawText: contactsOcr, documentId: "doc-contacts" },
  );

  assert.equal(doc2.formValues.lastName, "FORNI");
  assert.equal(doc2.formValues.firstName, "ANTOINE");
  assert.equal(doc2.formValues.siren, "808900351");
  assert.equal(doc2.formValues.email, "contact@forni.fr");
  assert.equal(doc2.formValues.telephone, "0611223344");
});

console.log("All activite-document-merge tests passed.");
