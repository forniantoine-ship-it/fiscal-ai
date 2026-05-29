import type {
  ActiviteFieldKey,
  ActiviteFormValues,
} from "@/components/lmnp/activite/ActiviteProfileFields";
import { profileToFormValues } from "@/components/lmnp/activite/ActiviteProfileFields";
import type { ActiviteGptExtractionResult, ActiviteInpiGptData } from "@/lib/documents/gpt";
import {
  canAutofillActiviteField,
  isFirstImportForPrefill,
  toUserValidatedSet,
  type ActiviteUserValidatedFields,
} from "@/lib/lmnp/services/activite-form-state";
import { profileFromDraft } from "@/lib/lmnp/services/inpi-profile";
import { parseFrenchAddress } from "@/lib/lmnp/services/parse-french-address";
import type { PersistedWorkspace } from "@/lib/lmnp/store/persistence";

export type ActiviteGptPrefillOptions = {
  userValidatedFields?: ActiviteUserValidatedFields;
  forceReanalyze?: boolean;
  /** When true, skip GPT mapping (passive hydration). */
  passiveHydration?: boolean;
};

export type ActiviteGptPrefillResult = {
  formValues: ActiviteFormValues;
  uncertainFields: ActiviteFieldKey[];
  showUnrecognizedMessage: boolean;
  showManualCompletionMessage: boolean;
  prefilledFieldCount: number;
  skipped: boolean;
};

type GptFieldMapping = {
  sourceField: keyof ActiviteInpiGptData;
  targetField: keyof ActiviteFormValues;
  uncertainKey: ActiviteFieldKey;
  transform?: (value: string) => string;
};

const GPT_SCALAR_FIELD_MAPPINGS: GptFieldMapping[] = [
  { sourceField: "nom", targetField: "lastName", uncertainKey: "lastName" },
  { sourceField: "prenom", targetField: "firstName", uncertainKey: "firstName" },
  {
    sourceField: "siren",
    targetField: "siren",
    uncertainKey: "siren",
    transform: (value) => value.replace(/\D/g, "").slice(0, 9),
  },
  { sourceField: "email", targetField: "email", uncertainKey: "email" },
  { sourceField: "telephone", targetField: "telephone", uncertainKey: "telephone" },
];

function mapGptField(
  values: ActiviteFormValues,
  mapping: GptFieldMapping,
  rawValue: string | undefined,
  uncertainFields: ActiviteFieldKey[],
  userValidated: ReadonlySet<ActiviteFieldKey>,
): boolean {
  if (!canAutofillActiviteField(values, mapping.uncertainKey, userValidated)) return false;

  const trimmed = rawValue?.trim();
  if (!trimmed) return false;

  const value = mapping.transform ? mapping.transform(trimmed) : trimmed;
  if (!value) return false;

  (values as Record<string, string | undefined>)[mapping.targetField] = value;
  uncertainFields.push(mapping.uncertainKey);
  return true;
}

function mapParsedAddressToForm(
  values: ActiviteFormValues,
  prefix: "personal" | "establishment",
  rawValue: string | undefined,
  uncertainFields: ActiviteFieldKey[],
  userValidated: ReadonlySet<ActiviteFieldKey>,
): number {
  const trimmed = rawValue?.trim();
  if (!trimmed) return 0;

  const addressKey = `${prefix}Address` as ActiviteFieldKey;
  const cityKey = `${prefix}City` as ActiviteFieldKey;
  const postalKey = `${prefix}PostalCode` as ActiviteFieldKey;

  if (
    !canAutofillActiviteField(values, addressKey, userValidated) &&
    !canAutofillActiviteField(values, cityKey, userValidated) &&
    !canAutofillActiviteField(values, postalKey, userValidated)
  ) {
    return 0;
  }

  const parsed = parseFrenchAddress(trimmed);
  let mappedCount = 0;

  if (canAutofillActiviteField(values, addressKey, userValidated)) {
    (values as Record<string, string | undefined>)[addressKey] = parsed.address ?? trimmed;
    uncertainFields.push(addressKey);
    mappedCount++;
  }

  if (parsed.city && canAutofillActiviteField(values, cityKey, userValidated)) {
    (values as Record<string, string | undefined>)[cityKey] = parsed.city;
    uncertainFields.push(cityKey);
    mappedCount++;
  }

  if (parsed.postalCode && canAutofillActiviteField(values, postalKey, userValidated)) {
    (values as Record<string, string | undefined>)[postalKey] = parsed.postalCode;
    uncertainFields.push(postalKey);
    mappedCount++;
  }

  return mappedCount;
}

export function prefillActiviteFormFromGpt(
  extraction: ActiviteGptExtractionResult,
  workspace: PersistedWorkspace,
  options?: ActiviteGptPrefillOptions,
): ActiviteGptPrefillResult {
  const base = profileToFormValues(profileFromDraft(workspace));
  const draft = workspace.declarationDraft;
  const userValidated = toUserValidatedSet(options?.userValidatedFields ?? {});

  if (options?.passiveHydration) {
    console.log("[prefill-skipped-hydration]", { tunnel: "activite", action: "gpt_prefill" });
    return {
      formValues: base,
      uncertainFields: [],
      showUnrecognizedMessage: false,
      showManualCompletionMessage: false,
      prefilledFieldCount: 0,
      skipped: true,
    };
  }

  if (!options?.forceReanalyze && !isFirstImportForPrefill(draft, base)) {
    console.log("[gpt-prefill] skipped because persisted data exists");
    return {
      formValues: base,
      uncertainFields: [],
      showUnrecognizedMessage: false,
      showManualCompletionMessage: false,
      prefilledFieldCount: 0,
      skipped: true,
    };
  }

  console.log("[gpt-prefill] first import detected", {
    forceReanalyze: Boolean(options?.forceReanalyze),
  });

  const gptData = extraction.data;
  const values: ActiviteFormValues = { ...base };
  const uncertainFields: ActiviteFieldKey[] = [];
  let prefilledFieldCount = 0;

  for (const mapping of GPT_SCALAR_FIELD_MAPPINGS) {
    if (mapGptField(values, mapping, gptData[mapping.sourceField], uncertainFields, userValidated)) {
      prefilledFieldCount++;
    }
  }

  prefilledFieldCount += mapParsedAddressToForm(
    values,
    "personal",
    gptData.adresseEntrepreneur,
    uncertainFields,
    userValidated,
  );

  prefilledFieldCount += mapParsedAddressToForm(
    values,
    "establishment",
    gptData.adresseEtablissement,
    uncertainFields,
    userValidated,
  );

  return {
    formValues: values,
    uncertainFields: [...new Set(uncertainFields)],
    showUnrecognizedMessage: prefilledFieldCount === 0,
    showManualCompletionMessage: false,
    prefilledFieldCount,
    skipped: false,
  };
}
