import assert from "node:assert/strict";

import { INPI_RNE_808900351_OCR } from "@/lib/documents/facts/extraction/inpi-rne/fixtures/inpi-rne-808900351.fixture";
import {
  applyUserEditsToProvenance,
  confirmProposedEstablishmentAddressGroup,
  getActiviteFieldStatusCopy,
  hasProposedEstablishmentAddressGroup,
  proposedEstablishmentAddressProvenance,
  userActiviteFieldProvenance,
} from "@/lib/lmnp/services/activite-field-provenance";
import {
  hydrateActiviteFormFromWorkspace,
  mergeUserValidatedFields,
  toUserValidatedSet,
} from "@/lib/lmnp/services/activite-form-state";
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

const PROPOSED_EVIDENCE =
  "353 RUE DE PREMARCHAND · Type Principal · Statut actif · SIRET 80890035100020";

function proposedEstablishmentProvenance() {
  return {
    establishmentAddress: proposedEstablishmentAddressProvenance({ evidence: PROPOSED_EVIDENCE }),
    establishmentCity: proposedEstablishmentAddressProvenance({ evidence: PROPOSED_EVIDENCE }),
    establishmentPostalCode: proposedEstablishmentAddressProvenance({ evidence: PROPOSED_EVIDENCE }),
  };
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

console.log("activite-proposed-establishment-confirmation.test.ts");

run("1. PROPOSED → Confirmer keeps value and marks user-validated provenance", () => {
  const formValues = {
    establishmentAddress: "353 RUE DE PREMARCHAND",
    establishmentCity: "CADAUJAC",
    establishmentPostalCode: "33140",
  };
  const provenance = proposedEstablishmentProvenance();

  assert.equal(hasProposedEstablishmentAddressGroup(provenance), true);

  const { provenance: confirmed, validatedKeys } = confirmProposedEstablishmentAddressGroup(
    provenance,
    formValues,
  );

  assert.deepEqual(validatedKeys.sort(), [
    "establishmentAddress",
    "establishmentCity",
    "establishmentPostalCode",
  ].sort());
  assert.equal(confirmed.establishmentAddress?.status, "extracted");
  assert.equal(confirmed.establishmentAddress?.origin, "user");
  assert.equal(confirmed.establishmentAddress?.userConfirmed, true);
  assert.equal(confirmed.establishmentAddress?.fieldSource, "manual");
  assert.equal(hasProposedEstablishmentAddressGroup(confirmed), false);
  assert.equal(
    getActiviteFieldStatusCopy(confirmed.establishmentAddress, true, false, "establishmentAddress"),
    null,
  );
});

run("2. PROPOSED → Modifier keeps proposal evidence in audit snapshot", () => {
  const previous = {
    establishmentAddress: "353 RUE DE PREMARCHAND",
    establishmentCity: "CADAUJAC",
    establishmentPostalCode: "33140",
  };
  const next = {
    ...previous,
    establishmentAddress: "12 avenue modifiée",
  };
  const provenance = proposedEstablishmentProvenance();

  const updated = applyUserEditsToProvenance(
    provenance,
    ["establishmentAddress"],
    next,
    previous,
  );

  assert.equal(updated.establishmentAddress?.status, "extracted");
  assert.equal(updated.establishmentAddress?.origin, "user");
  assert.equal(updated.establishmentAddress?.fieldSource, "user_correction");
  assert.equal(updated.establishmentAddress?.proposedSnapshot?.evidence, PROPOSED_EVIDENCE);
  assert.equal(updated.establishmentAddress?.proposedSnapshot?.value, "353 RUE DE PREMARCHAND");
  assert.equal(updated.establishmentAddress?.proposedSnapshot?.status, "proposed");
  assert.equal(updated.establishmentAddress?.proposedSnapshot?.origin, "fiscal_ai");
});

run("3. user-validated establishment fields are never overwritten by prefill", () => {
  const workspace = {
    ...EMPTY_WORKSPACE,
    declarationDraft: {
      completedSteps: [],
      establishmentAddress: "Adresse validée par l'utilisateur",
      establishmentCity: "Bordeaux",
      establishmentPostalCode: "33000",
      activiteUserValidatedFields: {
        establishmentAddress: true,
        establishmentCity: true,
        establishmentPostalCode: true,
      },
      activiteFieldProvenance: {
        establishmentAddress: userActiviteFieldProvenance(true),
        establishmentCity: userActiviteFieldProvenance(true),
        establishmentPostalCode: userActiviteFieldProvenance(true),
      },
    },
  };

  const result = prefillActiviteFormFromGpt(
    { success: true, data: {} },
    workspace,
    { rawText: INPI_RNE_808900351_OCR, forceReanalyze: true },
  );

  assert.equal(result.formValues.establishmentAddress, "Adresse validée par l'utilisateur");
  assert.equal(result.fieldProvenance.establishmentAddress?.origin, "user");
});

run("4. confirm preserves original proposal evidence", () => {
  const formValues = {
    establishmentAddress: "353 RUE DE PREMARCHAND",
    establishmentCity: "CADAUJAC",
    establishmentPostalCode: "33140",
  };
  const provenance = proposedEstablishmentProvenance();

  const { provenance: confirmed } = confirmProposedEstablishmentAddressGroup(provenance, formValues);

  assert.equal(confirmed.establishmentAddress?.evidence, PROPOSED_EVIDENCE);
  assert.equal(confirmed.establishmentAddress?.proposedSnapshot?.evidence, PROPOSED_EVIDENCE);
  assert.equal(confirmed.establishmentAddress?.proposedSnapshot?.value, "353 RUE DE PREMARCHAND");
});

run("5. reload from draft keeps confirmed establishment state", () => {
  const provenance = proposedEstablishmentProvenance();
  const formValues = {
    establishmentAddress: "353 RUE DE PREMARCHAND",
    establishmentCity: "CADAUJAC",
    establishmentPostalCode: "33140",
  };

  const { provenance: confirmed, validatedKeys } = confirmProposedEstablishmentAddressGroup(
    provenance,
    formValues,
  );
  const validated = mergeUserValidatedFields({}, validatedKeys);

  const workspace = {
    ...EMPTY_WORKSPACE,
    declarationDraft: {
      completedSteps: [],
      establishmentAddress: formValues.establishmentAddress,
      establishmentCity: formValues.establishmentCity,
      establishmentPostalCode: formValues.establishmentPostalCode,
      activiteUserValidatedFields: validated,
      activiteFieldProvenance: confirmed,
      inpiGptPrefillAppliedAt: "2026-08-21T12:00:00.000Z",
    },
  };

  const hydrated = hydrateActiviteFormFromWorkspace(workspace);

  assert.equal(hydrated.formValues.establishmentAddress, "353 RUE DE PREMARCHAND");
  assert.equal(hydrated.fieldProvenance.establishmentAddress?.userConfirmed, true);
  assert.equal(hydrated.fieldProvenance.establishmentAddress?.evidence, PROPOSED_EVIDENCE);
  assert.equal(hydrated.userValidatedFields.establishmentAddress, true);
  assert.equal(hasProposedEstablishmentAddressGroup(hydrated.fieldProvenance), false);
  assert.equal(toUserValidatedSet(hydrated.userValidatedFields).has("establishmentAddress"), true);
});

run("prefill on INPI reference exposes PROPOSED establishment before confirmation", () => {
  const result = prefillActiviteFormFromGpt(
    { success: true, data: {} },
    EMPTY_WORKSPACE,
    { rawText: INPI_RNE_808900351_OCR },
  );

  assert.equal(hasProposedEstablishmentAddressGroup(result.fieldProvenance), true);
  assert.ok(result.fieldProvenance.establishmentAddress?.evidence?.includes("80890035100020"));
});

console.log("All activite-proposed-establishment-confirmation tests passed.");
