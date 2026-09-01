import assert from "node:assert/strict";

import { INPI_RNE_808900351_OCR } from "@/lib/documents/facts/extraction/inpi-rne/fixtures/inpi-rne-808900351.fixture";

import { prefillActiviteFormFromGpt } from "./activite-gpt-ui-prefill";

const EMPTY_WORKSPACE = {
  fiscalYear: { id: "fy-1", year: 2025 },
  properties: [],
  documents: [],
  extractions: [],
  validationItems: [],
  ledgerEntries: [],
  declarationDraft: { completedSteps: [] },
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

console.log("activite-gpt-ui-prefill.test.ts");

run("prefills FORNI / ANTOINE / SIREN from projection on real INPI OCR", () => {
  const result = prefillActiviteFormFromGpt(
    {
      success: true,
      data: {},
    },
    EMPTY_WORKSPACE,
    { rawText: INPI_RNE_808900351_OCR },
  );

  assert.equal(result.formValues.lastName, "FORNI");
  assert.equal(result.formValues.firstName, "ANTOINE");
  assert.equal(result.formValues.siren, "808900351");
  assert.equal(result.fieldProvenance.lastName?.status, "extracted");
  assert.equal(result.fieldProvenance.siren?.status, "extracted");
});

run("keeps email and telephone missing on INPI reference document", () => {
  const result = prefillActiviteFormFromGpt(
    {
      success: true,
      data: {},
    },
    EMPTY_WORKSPACE,
    { rawText: INPI_RNE_808900351_OCR },
  );

  assert.equal(result.formValues.email, undefined);
  assert.equal(result.formValues.telephone, undefined);
  assert.equal(result.fieldProvenance.email?.status, "missing");
  assert.equal(result.fieldProvenance.telephone?.status, "missing");
});

run("does not inject INPI headquarters as personal address", () => {
  const result = prefillActiviteFormFromGpt(
    {
      success: true,
      data: {},
    },
    EMPTY_WORKSPACE,
    { rawText: INPI_RNE_808900351_OCR },
  );

  assert.equal(result.formValues.personalAddress, undefined);
  assert.equal(result.formValues.personalCity, undefined);
  assert.equal(result.formValues.personalPostalCode, undefined);
  assert.equal(result.fieldProvenance.personalAddress?.status, "missing");
});

run("prefills principal establishment as PROPOSED on INPI reference document", () => {
  const result = prefillActiviteFormFromGpt(
    {
      success: true,
      data: {},
    },
    EMPTY_WORKSPACE,
    { rawText: INPI_RNE_808900351_OCR },
  );

  assert.ok(result.formValues.establishmentAddress?.includes("353 RUE DE PREMARCHAND"));
  assert.equal(result.formValues.establishmentPostalCode, "33140");
  assert.equal(result.formValues.establishmentCity, "CADAUJAC");
  assert.equal(result.fieldProvenance.establishmentAddress?.status, "proposed");
  assert.equal(result.fieldProvenance.establishmentAddress?.origin, "fiscal_ai");
});

run("preserves PROPOSED SIREN prefill and provenance", () => {
  const rawText = `
SIRET : 98765432100011
Nom : Martin
`.trim();

  const result = prefillActiviteFormFromGpt(
    {
      success: true,
      data: { nom: "Martin" },
    },
    EMPTY_WORKSPACE,
    { rawText },
  );

  assert.equal(result.formValues.siren, "987654321");
  assert.equal(result.fieldProvenance.siren?.status, "proposed");
  assert.equal(result.fieldProvenance.siren?.fieldSource, "derived");
});

run("does not prefill rejected GPT contact values", () => {
  const rawText = `
Nom : DURAND
Prénom : Élodie
SIREN : 123 456 789
`.trim();

  const result = prefillActiviteFormFromGpt(
    {
      success: true,
      data: {
        nom: "DURAND",
        prenom: "Élodie",
        siren: "123456789",
        email: "marie.dupont@example.com",
        telephone: "07 00 00 00 00",
      },
    },
    EMPTY_WORKSPACE,
    { rawText },
  );

  assert.equal(result.formValues.lastName, "DURAND");
  assert.equal(result.formValues.email, undefined);
  assert.equal(result.formValues.telephone, undefined);
  assert.equal(result.fieldProvenance.email?.status, "missing");
});

console.log("All activite-gpt-ui-prefill tests passed.");
