import type { ActiviteFieldKey, ActiviteFormValues } from "@/components/lmnp/activite/ActiviteProfileFields";
import { profileToFormValues } from "@/components/lmnp/activite/ActiviteProfileFields";
import type { DeclarationDraft } from "@/lib/lmnp/types";
import type { LmnpDocument } from "@/lib/lmnp/types";
import type { PersistedWorkspace } from "@/lib/lmnp/store/persistence";

import { profileFromDraft } from "./inpi-profile";

export const ACTIVITE_GPT_PREFILLABLE_FIELDS: readonly ActiviteFieldKey[] = [
  "lastName",
  "firstName",
  "siren",
  "email",
  "telephone",
  "personalAddress",
  "personalCity",
  "personalPostalCode",
  "establishmentAddress",
  "establishmentCity",
  "establishmentPostalCode",
] as const;

export type ActiviteUserValidatedFields = Partial<Record<ActiviteFieldKey, boolean>>;

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

export function shouldSkipGptPrefill(
  draft: DeclarationDraft | undefined,
  options?: { forceReanalyze?: boolean },
): boolean {
  if (options?.forceReanalyze) return false;
  if (!draft) return false;
  if (draft.inpiConfirmedAt) return true;
  if (draft.inpiGptPrefillAppliedAt) return true;
  if (hasPersistedActiviteFormData(draft)) return true;
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
  };
}

export function hydrateActiviteFormFromWorkspace(workspace: PersistedWorkspace): {
  formValues: ActiviteFormValues;
  userValidatedFields: ActiviteUserValidatedFields;
  hasPersistedData: boolean;
} {
  const draft = workspace.declarationDraft;
  const formValues = profileToFormValues(profileFromDraft(workspace));
  const userValidatedFields = readUserValidatedFields(draft);
  const hasPersistedData = hasPersistedActiviteFormData(draft);

  console.log("[hydration-restore-only]", {
    hasPersistedData,
    inpiConfirmed: Boolean(draft?.inpiConfirmedAt),
    siren: formValues.siren ?? null,
  });

  return { formValues, userValidatedFields, hasPersistedData };
}

export function isFirstImportForPrefill(
  draft: DeclarationDraft | undefined,
  formValues: ActiviteFormValues,
): boolean {
  if (draft?.inpiGptPrefillAppliedAt) return false;
  if (draft?.inpiConfirmedAt) return false;
  return ACTIVITE_GPT_PREFILLABLE_FIELDS.every((key) => isActiviteFieldEmpty(formValues, key));
}
