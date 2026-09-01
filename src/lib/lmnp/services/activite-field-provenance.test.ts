import assert from "node:assert/strict";

import type { ActiviteFormValues } from "@/components/lmnp/activite/ActiviteProfileFields";
import {
  applyUserEditsToProvenance,
  buildProvenanceAfterGptPrefill,
  extractedInpiFieldProvenance,
  inferLegacyActiviteFieldProvenance,
  missingInpiFieldProvenance,
  proposedDerivedSirenProvenance,
  proposedEstablishmentAddressProvenance,
  proposedFiscalAiFieldProvenance,
  toRuntimeFieldSource,
  uncertainFieldsFromProvenance,
  userActiviteFieldProvenance,
  getActiviteFieldStatusCopy,
  hasExtractedInpiAddressInGroup,
} from "./activite-field-provenance";
import { prefillActiviteFormFromGpt } from "./activite-gpt-ui-prefill";

function emptyForm(): ActiviteFormValues {
  return {};
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

console.log("activite-field-provenance.test.ts");

run("missing field has no runtime FieldSource", () => {
  assert.equal(toRuntimeFieldSource(missingInpiFieldProvenance()), undefined);
});

run("extracted INPI field maps to runtime extracted", () => {
  assert.equal(toRuntimeFieldSource(extractedInpiFieldProvenance()), "extracted");
});

run("proposed Fiscal AI field maps to runtime judgment", () => {
  assert.equal(toRuntimeFieldSource(proposedFiscalAiFieldProvenance()), "judgment");
});

run("user correction maps to user_correction", () => {
  assert.equal(toRuntimeFieldSource(userActiviteFieldProvenance(true)), "user_correction");
});

run("buildProvenanceAfterGptPrefill marks prefilled fields as extracted", () => {
  const values: ActiviteFormValues = {
    lastName: "Martin",
    firstName: "Paul",
  };

  const provenance = buildProvenanceAfterGptPrefill(values, ["lastName", "firstName"]);

  assert.equal(provenance.lastName?.status, "extracted");
  assert.equal(provenance.firstName?.status, "extracted");
  assert.equal(provenance.siren?.status, "missing");
  assert.equal(provenance.email?.status, "missing");
});

run("uncertainFieldsFromProvenance includes extracted and proposed only", () => {
  const provenance = {
    lastName: extractedInpiFieldProvenance(),
    email: missingInpiFieldProvenance(),
    telephone: proposedFiscalAiFieldProvenance(),
  };

  const uncertain = uncertainFieldsFromProvenance(provenance);
  assert.deepEqual(new Set(uncertain), new Set(["lastName", "telephone"]));
});

run("applyUserEditsToProvenance marks manual entry as user origin", () => {
  const provenance = buildProvenanceAfterGptPrefill(emptyForm(), []);
  const next: ActiviteFormValues = { email: "contact@example.org" };

  const updated = applyUserEditsToProvenance(provenance, ["email"], next);

  assert.equal(updated.email?.status, "extracted");
  assert.equal(updated.email?.origin, "user");
  assert.equal(updated.email?.fieldSource, "manual");
});

run("applyUserEditsToProvenance marks correction of GPT value", () => {
  const provenance = buildProvenanceAfterGptPrefill({ email: "wrong@example.org" }, ["email"]);
  const next: ActiviteFormValues = { email: "right@example.org" };

  const updated = applyUserEditsToProvenance(provenance, ["email"], next);

  assert.equal(updated.email?.fieldSource, "user_correction");
});

run("applyUserEditsToProvenance preserves proposed snapshot when correcting establishment", () => {
  const evidence = "353 RUE · Type Principal · Statut actif · SIRET 80890035100020";
  const provenance = {
    establishmentAddress: proposedEstablishmentAddressProvenance({ evidence }),
  };
  const previous: ActiviteFormValues = { establishmentAddress: "353 RUE DE PREMARCHAND" };
  const next: ActiviteFormValues = { establishmentAddress: "12 avenue modifiée" };

  const updated = applyUserEditsToProvenance(provenance, ["establishmentAddress"], next, previous);

  assert.equal(updated.establishmentAddress?.fieldSource, "user_correction");
  assert.equal(updated.establishmentAddress?.proposedSnapshot?.evidence, evidence);
  assert.equal(updated.establishmentAddress?.proposedSnapshot?.value, "353 RUE DE PREMARCHAND");
});

run("prefillActiviteFormFromGpt returns full provenance map", () => {
  const workspace = {
    fiscalYear: { id: "fy-1", year: 2025 },
    properties: [],
    documents: [],
    extractions: [],
    validationItems: [],
    ledgerEntries: [],
    declarationDraft: { completedSteps: [] },
  };

  const rawText = `
Nom : Durand
Prénom : Alice
SIREN : 123456789
`.trim();

  const result = prefillActiviteFormFromGpt(
    {
      success: true,
      data: {
        nom: "Durand",
        prenom: "Alice",
        siren: "123456789",
      },
    },
    workspace,
    { rawText },
  );

  assert.equal(result.skipped, false);
  assert.equal(result.formValues.lastName, "Durand");
  assert.equal(result.fieldProvenance.lastName?.status, "extracted");
  assert.equal(result.fieldProvenance.email?.status, "missing");
  assert.deepEqual(result.uncertainFields.sort(), ["firstName", "lastName", "siren"].sort());
});

run("getActiviteFieldStatusCopy surfaces missing / extracted / proposed labels", () => {
  assert.deepEqual(getActiviteFieldStatusCopy(missingInpiFieldProvenance(), false), {
    primary: "Non trouvé dans le document",
    secondary: "À compléter",
    tone: "missing",
  });
  assert.deepEqual(getActiviteFieldStatusCopy(undefined, false), {
    primary: "Non trouvé dans le document",
    secondary: "À compléter",
    tone: "missing",
  });
  assert.deepEqual(getActiviteFieldStatusCopy(missingInpiFieldProvenance(), false, true), {
    primary: "Non trouvé dans le document",
    tone: "missing",
  });
  assert.deepEqual(getActiviteFieldStatusCopy(extractedInpiFieldProvenance(), true), {
    primary: "Extrait du document INPI",
    tone: "extracted",
  });
  assert.deepEqual(getActiviteFieldStatusCopy(proposedDerivedSirenProvenance(), true), {
    primary: "Proposition Fiscal AI",
    tone: "proposed",
  });
});

run("hasExtractedInpiAddressInGroup requires extracted INPI address", () => {
  assert.equal(
    hasExtractedInpiAddressInGroup(
      { personalAddress: extractedInpiFieldProvenance() },
      ["personalAddress", "personalCity", "personalPostalCode"],
    ),
    true,
  );
  assert.equal(
    hasExtractedInpiAddressInGroup(
      { personalAddress: missingInpiFieldProvenance() },
      ["personalAddress", "personalCity", "personalPostalCode"],
    ),
    false,
  );
});

run("legacy inference treats empty fields as missing", () => {
  const provenance = inferLegacyActiviteFieldProvenance({});
  assert.equal(provenance.telephone?.status, "missing");
});

run("legacy inference treats populated fields as extracted", () => {
  const provenance = inferLegacyActiviteFieldProvenance({ siren: "123456789" });
  assert.equal(provenance.siren?.status, "extracted");
});

console.log("All activite-field-provenance tests passed.");
