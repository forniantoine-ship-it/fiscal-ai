import type { ActiviteFieldKey, ActiviteFormValues } from "@/components/lmnp/activite/ActiviteProfileFields";
import { profileToFormValues } from "@/components/lmnp/activite/ActiviteProfileFields";
import type { ActiviteFactProjection } from "@/lib/documents/facts/activite-fact-projection";
import type { DeclarationDraft } from "@/lib/lmnp/types";
import type { LmnpDocument } from "@/lib/lmnp/types";
import type { PersistedWorkspace } from "@/lib/lmnp/store/persistence";

import {
  activiteProvenanceDraftPatch,
  ACTIVITE_GPT_PREFILLABLE_FIELDS,
  missingInpiFieldProvenance,
  readActiviteFieldProvenance,
  resolveActiviteFieldProvenance,
  type ActiviteFieldProvenanceMap,
  type ActiviteUserValidatedFields,
} from "./activite-field-provenance";
import {
  bootstrapActiviteFieldStoreFromDraft,
  readActiviteFieldStore,
  storeToFormValues,
  storeToProvenanceMap,
} from "./activite-field-store";
import { profileFromDraft } from "./inpi-profile";

export { ACTIVITE_GPT_PREFILLABLE_FIELDS, type ActiviteUserValidatedFields } from "./activite-field-provenance";

export function hasPersistedActiviteFormData(draft?: DeclarationDraft): boolean {
  if (!draft) return false;
  if (draft.inpiConfirmedAt) return true;
  if (draft.inpiGptPrefillAppliedAt) return true;
  if (draft.siren?.trim()) return true;
  if (draft.exploitantFirstName?.trim() || draft.exploitantLastName?.trim()) return true;
  const personal =
    draft.personalAddress?.trim() ||
    draft.entrepreneurAddress?.trim() ||
    draft.establishmentAddress?.trim();
  if (personal) return true;
  if (draft.exploitantEmail?.trim() || draft.exploitantTelephone?.trim()) return true;
  return false;
}

export function shouldAutoRunGptPipeline(
  draft: DeclarationDraft | undefined,
  doc: LmnpDocument | undefined,
): boolean {
  if (!doc || doc.status !== "uploaded") return false;
  if (draft?.inpiConfirmedAt) return false;
  if (draft?.inpiGptPrefillAppliedAt) return false;
  if (hasPersistedActiviteFormData(draft)) return false;
  return true;
}

/**
 * Hard stop for automatic document enrichment.
 * Historical broad skip (persisted data / prior prefill timestamp) removed — see incremental merge.
 */
export function shouldSkipGptPrefill(
  draft: DeclarationDraft | undefined,
  options?: { forceReanalyze?: boolean },
): boolean {
  if (options?.forceReanalyze) return false;
  if (!draft) return false;
  return Boolean(draft.inpiConfirmedAt);
}

export function resolveExistingActiviteFieldProvenance(
  formValues: ActiviteFormValues,
  draft?: DeclarationDraft,
): ActiviteFieldProvenanceMap {
  const stored = readActiviteFieldProvenance(draft);
  if (Object.keys(stored).length > 0) return stored;
  return resolveActiviteFieldProvenance(formValues, draft);
}

/**
 * Incremental enrichment gate — never overwrite user-validated or settled fields.
 */
export function canEnrichActiviteFieldFromDocument(
  values: ActiviteFormValues,
  key: ActiviteFieldKey,
  userValidated: ReadonlySet<ActiviteFieldKey>,
  existingProvenance: ActiviteFieldProvenanceMap,
): boolean {
  if (userValidated.has(key)) return false;

  const existing = existingProvenance[key];
  const hasValue = !isActiviteFieldEmpty(values, key);

  if (existing?.userConfirmed) return false;

  if (existing?.status === "proposed" && hasValue) return false;

  if (hasValue && existing?.origin === "user") return false;

  if (
    hasValue &&
    existing?.status === "extracted" &&
    existing.origin === "inpi_document"
  ) {
    return false;
  }

  if (!hasValue) return true;

  if (!existing || existing.status === "missing") return true;

  return false;
}

export function readUserValidatedFields(
  draft?: DeclarationDraft,
): ActiviteUserValidatedFields {
  return (draft?.activiteUserValidatedFields ?? {}) as ActiviteUserValidatedFields;
}

export function toUserValidatedSet(
  fields: ActiviteUserValidatedFields,
): ReadonlySet<ActiviteFieldKey> {
  return new Set(
    Object.entries(fields)
      .filter(([, v]) => v)
      .map(([k]) => k as ActiviteFieldKey),
  );
}

export function isActiviteFieldEmpty(
  values: ActiviteFormValues,
  key: ActiviteFieldKey,
): boolean {
  const value = values[key as keyof ActiviteFormValues];
  return typeof value !== "string" || !value.trim();
}

export function canAutofillActiviteField(
  values: ActiviteFormValues,
  key: ActiviteFieldKey,
  userValidated: ReadonlySet<ActiviteFieldKey>,
): boolean {
  if (userValidated.has(key)) return false;
  return isActiviteFieldEmpty(values, key);
}

export function detectUserEditedActiviteFields(
  previous: ActiviteFormValues,
  next: ActiviteFormValues,
): ActiviteFieldKey[] {
  const edited: ActiviteFieldKey[] = [];

  for (const key of ACTIVITE_GPT_PREFILLABLE_FIELDS) {
    const prev = previous[key as keyof ActiviteFormValues];
    const curr = next[key as keyof ActiviteFormValues];
    if (typeof prev === "string" && typeof curr === "string" && prev.trim() !== curr.trim()) {
      edited.push(key);
    }
  }

  return edited;
}

export function mergeUserValidatedFields(
  existing: ActiviteUserValidatedFields,
  editedKeys: ActiviteFieldKey[],
): ActiviteUserValidatedFields {
  const merged = { ...existing };
  for (const key of editedKeys) {
    merged[key] = true;
    console.log("[user-edit] field locked from automatic overwrite", { field: key });
  }
  return merged;
}

export function activiteDraftPatchFromForm(
  values: ActiviteFormValues,
  provenance?: ActiviteFieldProvenanceMap,
): Partial<DeclarationDraft> {
  return {
    siren: values.siren?.trim(),
    siret: values.siret?.trim(),
    exploitantFirstName: values.firstName?.trim(),
    exploitantLastName: values.lastName?.trim(),
    exploitantEmail: values.email?.trim(),
    exploitantTelephone: values.telephone?.trim(),
    personalAddress: values.personalAddress?.trim(),
    personalCity: values.personalCity?.trim(),
    personalPostalCode: values.personalPostalCode?.trim(),
    establishmentAddress: values.establishmentAddress?.trim(),
    establishmentCity: values.establishmentCity?.trim(),
    establishmentPostalCode: values.establishmentPostalCode?.trim(),
    ...(provenance ? activiteProvenanceDraftPatch(provenance) : {}),
  };
}

export function hydrateActiviteFormFromWorkspace(workspace: PersistedWorkspace): {
  formValues: ActiviteFormValues;
  userValidatedFields: ActiviteUserValidatedFields;
  fieldProvenance: ActiviteFieldProvenanceMap;
  hasPersistedData: boolean;
} {
  const draft = workspace.declarationDraft;
  const profileValues = profileToFormValues(profileFromDraft(workspace));
  const userValidatedFields = readUserValidatedFields(draft);
  const hasPersistedData = hasPersistedActiviteFormData(draft);
  const existingProvenance = resolveActiviteFieldProvenance(profileValues, draft);
  const store = bootstrapActiviteFieldStoreFromDraft(draft, profileValues, existingProvenance);
  const hasStoreValues = Object.keys(store.fieldLedgers).length > 0;
  const formValues = hasStoreValues ? storeToFormValues(store) : profileValues;
  const fieldProvenance = hasStoreValues ? storeToProvenanceMap(store) : existingProvenance;

  console.log("[hydration-restore-only]", {
    hasPersistedData,
    inpiConfirmed: Boolean(draft?.inpiConfirmedAt),
    siren: formValues.siren ?? null,
    provenanceFieldCount: Object.keys(fieldProvenance).length,
    fieldStoreSnapshots: Object.keys(readActiviteFieldStore(draft).documentSnapshots).length,
  });

  return { formValues, userValidatedFields, fieldProvenance, hasPersistedData };
}

export function isFirstImportForPrefill(
  draft: DeclarationDraft | undefined,
  formValues: ActiviteFormValues,
): boolean {
  if (draft?.inpiConfirmedAt) return false;
  return ACTIVITE_GPT_PREFILLABLE_FIELDS.every((key) => isActiviteFieldEmpty(formValues, key));
}

export function isActiviteDocumentEnrichment(
  formValues: ActiviteFormValues,
): boolean {
  return ACTIVITE_GPT_PREFILLABLE_FIELDS.some((key) => !isActiviteFieldEmpty(formValues, key));
}

export function mergeActiviteFieldProvenanceFromProjection(
  projection: ActiviteFactProjection,
  prefilledKeys: readonly ActiviteFieldKey[],
  options: {
    existingProvenance: ActiviteFieldProvenanceMap;
    userValidated: ReadonlySet<ActiviteFieldKey>;
    formValues: ActiviteFormValues;
  },
): ActiviteFieldProvenanceMap {
  const prefilled = new Set(prefilledKeys);
  const next: ActiviteFieldProvenanceMap = { ...options.existingProvenance };

  for (const key of ACTIVITE_GPT_PREFILLABLE_FIELDS) {
    if (options.userValidated.has(key) && options.existingProvenance[key]) {
      next[key] = options.existingProvenance[key]!;
      continue;
    }

    if (prefilled.has(key)) {
      next[key] = projection.fieldProvenance[key] ?? missingInpiFieldProvenance();
      continue;
    }

    if (options.existingProvenance[key]) {
      next[key] = options.existingProvenance[key]!;
      continue;
    }

    next[key] = projection.fieldProvenance[key] ?? missingInpiFieldProvenance();
  }

  return next;
}
