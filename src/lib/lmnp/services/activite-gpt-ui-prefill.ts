import type {
  ActiviteFieldKey,
  ActiviteFormValues,
} from "@/components/lmnp/activite/ActiviteProfileFields";
import { profileToFormValues } from "@/components/lmnp/activite/ActiviteProfileFields";
import { groundActiviteFactExtraction } from "@/lib/documents/facts/grounding-engine";
import type { ActiviteGptExtractionResult } from "@/lib/documents/gpt";
import {
  ACTIVITE_GPT_PREFILLABLE_FIELDS,
  resolveActiviteFieldProvenance,
  uncertainFieldsFromProvenance,
  type ActiviteFieldProvenanceMap,
} from "@/lib/lmnp/services/activite-field-provenance";
import {
  createDocumentFactSnapshot,
  mergeActiviteDocumentProjection,
  type MergeDocumentIntoStoreResult,
} from "@/lib/lmnp/services/activite-document-merge";
import {
  activiteFieldStoreDraftPatch,
  storeToFormValues,
  storeToProvenanceMap,
  type ActiviteFieldStore,
} from "@/lib/lmnp/services/activite-field-store";
import {
  isActiviteDocumentEnrichment,
  readUserValidatedFields,
  resolveExistingActiviteFieldProvenance,
  shouldSkipGptPrefill,
  type ActiviteUserValidatedFields,
} from "@/lib/lmnp/services/activite-form-state";
import { profileFromDraft } from "@/lib/lmnp/services/inpi-profile";
import type { PersistedWorkspace } from "@/lib/lmnp/store/persistence";

export type ActiviteGptPrefillOptions = {
  userValidatedFields?: ActiviteUserValidatedFields;
  forceReanalyze?: boolean;
  /** Normalized OCR text used for deterministic post-GPT grounding. */
  rawText?: string;
  /** When true, skip GPT mapping (passive hydration). */
  passiveHydration?: boolean;
  /** Source document id for inter-document merge + snapshot persistence. */
  documentId?: string;
};

export type ActiviteGptPrefillResult = {
  formValues: ActiviteFormValues;
  fieldProvenance: ActiviteFieldProvenanceMap;
  uncertainFields: ActiviteFieldKey[];
  showUnrecognizedMessage: boolean;
  showManualCompletionMessage: boolean;
  prefilledFieldCount: number;
  skipped: boolean;
  fieldStore?: ActiviteFieldStore;
  mergeResult?: MergeDocumentIntoStoreResult;
  draftPatch?: ReturnType<typeof activiteFieldStoreDraftPatch>;
};

function skippedPrefillResult(
  formValues: ActiviteFormValues,
  workspace: PersistedWorkspace,
): ActiviteGptPrefillResult {
  const fieldProvenance = resolveActiviteFieldProvenance(
    formValues,
    workspace.declarationDraft,
  );

  return {
    formValues,
    fieldProvenance,
    uncertainFields: uncertainFieldsFromProvenance(fieldProvenance),
    showUnrecognizedMessage: false,
    showManualCompletionMessage: false,
    prefilledFieldCount: 0,
    skipped: true,
  };
}

export function prefillActiviteFormFromGpt(
  extraction: ActiviteGptExtractionResult,
  workspace: PersistedWorkspace,
  options?: ActiviteGptPrefillOptions,
): ActiviteGptPrefillResult {
  const base = profileToFormValues(profileFromDraft(workspace));
  const draft = workspace.declarationDraft;
  const userValidatedFields = {
    ...readUserValidatedFields(draft),
    ...options?.userValidatedFields,
  };
  const existingProvenance = resolveExistingActiviteFieldProvenance(base, draft);

  if (options?.passiveHydration) {
    console.log("[prefill-skipped-hydration]", { tunnel: "activite", action: "gpt_prefill" });
    return skippedPrefillResult(base, workspace);
  }

  if (shouldSkipGptPrefill(draft, options)) {
    console.log("[gpt-prefill] skipped because Activité profile is confirmed");
    return skippedPrefillResult(base, workspace);
  }

  console.log(
    isActiviteDocumentEnrichment(base)
      ? "[gpt-prefill] document enrichment"
      : "[gpt-prefill] first import",
    { forceReanalyze: Boolean(options?.forceReanalyze), documentId: options?.documentId ?? null },
  );

  const rawText = options?.rawText?.trim();
  if (!rawText) {
    return skippedPrefillResult(base, workspace);
  }

  const documentId = options?.documentId ?? "activite-document";
  const grounded = groundActiviteFactExtraction(rawText, extraction.data, documentId);
  const projection = grounded.activiteProjection?.projection;

  if (!projection) {
    return skippedPrefillResult(base, workspace);
  }

  console.log("[gpt-grounding]", {
    accepted: grounded.activiteProjection?.acceptedFieldKeys ?? [],
    rejected: grounded.activiteProjection?.rejectedFieldKeys ?? [],
    proposed: grounded.activiteProjection?.proposedFieldKeys ?? [],
  });

  const snapshot = createDocumentFactSnapshot({
    documentId,
    extractorId: grounded.extraction.extractorId,
    facts: grounded.extraction.facts,
  });

  const mergeResult = mergeActiviteDocumentProjection(
    draft,
    base,
    existingProvenance,
    snapshot,
    projection,
    { userValidated: userValidatedFields },
  );

  const formValues = storeToFormValues(mergeResult.store);
  const fieldProvenance = storeToProvenanceMap(mergeResult.store);

  // Cycle 21 — le field store (ledger cross-documents) exclut délibérément
  // toute valeur GPT rejetée (`isIncomingMergeable`, activite-document-merge.ts) :
  // un ledger de valeurs confirmées n'a pas vocation à retenir un essai
  // hallucinatoire. Mais la PROJECTION de cette extraction précise sait déjà
  // quelle valeur a été proposée puis rejetée (grounding-decisions.ts →
  // activite-fact-projection.ts) — cette information ne doit pas disparaître
  // du retour immédiat à l'écran simplement parce que le ledger persistant,
  // à raison, ne la conserve pas.
  for (const fieldKey of ACTIVITE_GPT_PREFILLABLE_FIELDS) {
    const rejectedValue = projection.fieldProvenance[fieldKey]?.rejectedValue;
    const current = fieldProvenance[fieldKey];
    if (rejectedValue && current?.status === "missing" && !current.rejectedValue) {
      fieldProvenance[fieldKey] = { ...current, rejectedValue };
    }
  }

  const prefilledFieldCount = mergeResult.applied.length + mergeResult.refreshed.length;

  console.log("[activite-document-merge]", {
    documentId,
    applied: mergeResult.applied,
    preserved: mergeResult.preserved,
    historized: mergeResult.historized,
    refreshed: mergeResult.refreshed,
  });

  console.log("[gpt-prefill] provenance", {
    extracted: ACTIVITE_GPT_PREFILLABLE_FIELDS.filter(
      (key) => fieldProvenance[key]?.status === "extracted",
    ),
    proposed: ACTIVITE_GPT_PREFILLABLE_FIELDS.filter(
      (key) => fieldProvenance[key]?.status === "proposed",
    ),
    missing: ACTIVITE_GPT_PREFILLABLE_FIELDS.filter(
      (key) => fieldProvenance[key]?.status === "missing",
    ),
  });

  const draftPatch = activiteFieldStoreDraftPatch(mergeResult.store, formValues, fieldProvenance);

  return {
    formValues,
    fieldProvenance,
    uncertainFields: uncertainFieldsFromProvenance(fieldProvenance),
    showUnrecognizedMessage: prefilledFieldCount === 0,
    showManualCompletionMessage: false,
    prefilledFieldCount,
    skipped: false,
    fieldStore: mergeResult.store,
    mergeResult,
    draftPatch,
  };
}

// Legacy exports kept for tests referencing projection field groups.
export const ACTIVITE_PROJECTION_PREFILL_FIELDS = [
  "lastName",
  "firstName",
  "siren",
  "email",
  "telephone",
] as const satisfies readonly ActiviteFieldKey[];

export const ACTIVITE_PROJECTION_PERSONAL_ADDRESS_FIELDS = [
  "personalAddress",
  "personalCity",
  "personalPostalCode",
] as const satisfies readonly ActiviteFieldKey[];

export const ACTIVITE_PROJECTION_ESTABLISHMENT_ADDRESS_FIELDS = [
  "establishmentAddress",
  "establishmentCity",
  "establishmentPostalCode",
] as const satisfies readonly ActiviteFieldKey[];
