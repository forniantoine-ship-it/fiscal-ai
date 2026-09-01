import assert from "node:assert/strict";

import {
  findSiretInText,
  groundActiviteGptExtraction,
  groundGptEmail,
  groundGptSiren,
  groundGptTelephone,
  isAddressGroundedInText,
  isEmailGroundedInText,
  isNameGroundedInText,
  isPhoneGroundedInText,
  isSirenGroundedInText,
} from "./activite-gpt-grounding";
import { prefillActiviteFormFromGpt } from "./activite-gpt-ui-prefill";

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

console.log("activite-gpt-grounding.test.ts");

run("accepts email present in OCR with spacing normalization", () => {
  assert.equal(isEmailGroundedInText("elodie.durand@mail.fr", OCR_SAMPLE), true);
  const decision = groundGptEmail(" elodie.durand@mail.fr ", OCR_SAMPLE);
  assert.equal(decision?.outcome, "accepted");
});

run("rejects hallucinated email", () => {
  const decision = groundGptEmail("marie.dupont@example.com", OCR_SAMPLE);
  assert.equal(decision?.outcome, "rejected");
  assert.equal(decision?.rejectedValue, "marie.dupont@example.com");
});

run("accepts phone with different formatting", () => {
  assert.equal(isPhoneGroundedInText("06 12 34 56 78", OCR_SAMPLE), true);
  assert.equal(isPhoneGroundedInText("+33 6 12 34 56 78", OCR_SAMPLE), true);
  const decision = groundGptTelephone("06 12 34 56 78", OCR_SAMPLE);
  assert.equal(decision?.outcome, "accepted");
});

run("rejects hallucinated phone", () => {
  const decision = groundGptTelephone("07 00 00 00 00", OCR_SAMPLE);
  assert.equal(decision?.outcome, "rejected");
});

run("accepts spaced SIREN", () => {
  assert.equal(isSirenGroundedInText("123456789", OCR_SAMPLE), true);
  assert.equal(isSirenGroundedInText("123 456 789", OCR_SAMPLE), true);
});

run("accepts accented first name tokens", () => {
  assert.equal(isNameGroundedInText("Élodie", OCR_SAMPLE), true);
  assert.equal(isNameGroundedInText("DURAND", OCR_SAMPLE), true);
});

run("accepts address via postal code and city", () => {
  assert.equal(
    isAddressGroundedInText("15 route de Saint-Germain\n33650 Saint-Médard-d'Eyrans", OCR_SAMPLE),
    true,
  );
});

run("rejects hallucinated address", () => {
  assert.equal(isAddressGroundedInText("4 allée Malbec\n33650 Saint-Médard-d'Eyrans", OCR_SAMPLE), false);
});

run("groundActiviteGptExtraction rejects hallucinated GPT values", () => {
  const result = groundActiviteGptExtraction(OCR_SAMPLE, {
    nom: "DURAND",
    prenom: "Élodie",
    siren: "123456789",
    email: "marie.dupont@example.com",
    telephone: "07 00 00 00 00",
    adresseEntrepreneur: "4 allée Malbec\n33650 Saint-Médard-d'Eyrans",
  });

  assert.equal(result.groundedData.email, undefined);
  assert.equal(result.groundedData.telephone, undefined);
  assert.equal(result.groundedData.adresseEntrepreneur, undefined);
  assert.equal(result.fieldProvenance.email?.status, "missing");
  assert.equal(result.fieldProvenance.email?.rejectedValue, "marie.dupont@example.com");
  assert.equal(result.fieldProvenance.telephone?.rejectedValue, "07 00 00 00 00");
  assert.equal(result.fieldProvenance.personalAddress?.status, "missing");
  assert.equal(result.fieldProvenance.personalAddress?.rejectedValue, undefined);
  assert.equal(result.groundedData.nom, "DURAND");
});

run("proposes SIREN derived from SIRET when SIREN only appears via SIRET", () => {
  const ocr = `
SIRET : 98765432100011
Nom : Martin
`.trim();

  const result = groundActiviteGptExtraction(ocr, {
    nom: "Martin",
    siren: "987654321",
  });

  assert.equal(findSiretInText(ocr), "98765432100011");
  assert.equal(result.groundedData.siren, "987654321");
  assert.equal(result.fieldProvenance.siren?.status, "proposed");
  assert.equal(result.fieldProvenance.siren?.fieldSource, "derived");
});

run("proposes SIREN from SIRET when GPT omitted SIREN", () => {
  const ocr = "SIRET 55566677700019\nNom : Bernard";
  const result = groundActiviteGptExtraction(ocr, { nom: "Bernard" });

  assert.equal(result.groundedData.siren, "555666777");
  assert.equal(result.fieldProvenance.siren?.status, "proposed");
});

run("accepts explicit labelled SIREN as extracted", () => {
  const ocr = "SIREN : 123 456 789\nSIRET : 12345678900012";
  const result = groundActiviteGptExtraction(ocr, { siren: "123456789" });
  assert.equal(result.fieldProvenance.siren?.status, "extracted");
  assert.equal(result.fieldProvenance.siren?.fieldSource, "extracted");
});

run("prefill does not write rejected GPT values into form", () => {
  const workspace = {
    fiscalYear: { id: "fy-1", year: 2025 },
    properties: [],
    documents: [],
    extractions: [],
    validationItems: [],
    ledgerEntries: [],
    declarationDraft: { completedSteps: [] },
  };

  const ui = prefillActiviteFormFromGpt(
    {
      success: true,
      data: {
        nom: "DURAND",
        email: "marie.dupont@example.com",
      },
    },
    workspace,
    { rawText: OCR_SAMPLE },
  );

  assert.equal(ui.formValues.lastName, "DURAND");
  assert.equal(ui.formValues.email, undefined);
  assert.equal(ui.fieldProvenance.email?.status, "missing");
  assert.equal(ui.fieldProvenance.email?.rejectedValue, "marie.dupont@example.com");
});

// Cycle 21 — F-009 : storeToProvenanceMap(mergeResult.store) ne portait jamais
// rejectedValue jusqu'à l'écran, car le field store (ledger cross-documents,
// activite-field-store.ts) n'écrit délibérément aucune entrée pour une valeur
// rejetée (isIncomingMergeable exclut provenance.rejectedValue) — un choix de
// conception correct pour un LEDGER de valeurs confirmées, mais qui faisait
// disparaître à tort l'information de rejet du retour immédiat à l'écran.
// Corrigé en réinjectant rejectedValue depuis la projection de CETTE
// extraction (qui, elle, le calcule déjà) sans jamais l'écrire dans le ledger
// persistant. Ce test verrouille les deux moitiés du correctif : le retour
// immédiat ET la non-persistance dans le ledger (le rejet ne doit jamais
// s'accumuler ni contaminer un futur document).
run("le ledger persistant ne conserve jamais une valeur rejetée (seul le retour immédiat la porte)", () => {
  const workspace = {
    fiscalYear: { id: "fy-1", year: 2025 },
    properties: [],
    documents: [],
    extractions: [],
    validationItems: [],
    ledgerEntries: [],
    declarationDraft: { completedSteps: [] },
  };

  const ui = prefillActiviteFormFromGpt(
    { success: true, data: { nom: "DURAND", email: "marie.dupont@example.com" } },
    workspace,
    { rawText: OCR_SAMPLE },
  );

  assert.equal(
    ui.fieldStore?.fieldLedgers.email,
    undefined,
    "aucune entrée de ledger ne doit exister pour un champ rejeté — seule la projection de cette extraction porte rejectedValue",
  );

  // Un second document, sans email du tout : le rejet du premier document ne
  // doit jamais "fuiter" dans ce nouvel essai comme si c'était son propre rejet.
  const ui2 = prefillActiviteFormFromGpt(
    { success: true, data: { nom: "DURAND" } },
    { ...workspace, declarationDraft: { completedSteps: [], activiteFieldStore: ui.fieldStore } },
    { rawText: OCR_SAMPLE, documentId: "doc-2" },
  );
  assert.equal(
    ui2.fieldProvenance.email?.rejectedValue,
    undefined,
    "le rejet du premier document ne doit pas contaminer un second document qui ne propose rien",
  );
});

console.log("All activite-gpt-grounding tests passed.");
