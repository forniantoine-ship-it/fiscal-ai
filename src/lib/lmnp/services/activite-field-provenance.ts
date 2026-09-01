import type { ActiviteFieldKey, ActiviteFormValues } from "@/components/lmnp/activite/ActiviteProfileFields";
import type { DeclarationDraft } from "@/lib/lmnp/types";
import type { FieldSource } from "@/runtime/contracts/FieldSource";

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

function isActiviteFieldEmpty(values: ActiviteFormValues, key: ActiviteFieldKey): boolean {
  const value = values[key as keyof ActiviteFormValues];
  return typeof value !== "string" || !value.trim();
}

/**
 * Product-facing provenance for Activité / INPI fields.
 * Distinct from runtime `FieldSource` — mapped via `toRuntimeFieldSource`.
 */
export type ActiviteFieldStatus = "extracted" | "missing" | "proposed";

/** Where the displayed value comes from. */
export type ActiviteFieldOrigin = "inpi_document" | "fiscal_ai" | "user" | "product";

/** Fiscal AI proposal preserved after user confirmation or correction. */
export type ActiviteProposedSnapshot = {
  value?: string;
  evidence?: string;
  fieldSource?: FieldSource;
  origin?: ActiviteFieldOrigin;
  status?: ActiviteFieldStatus;
};

export type ActiviteFieldProvenance = {
  status: ActiviteFieldStatus;
  origin: ActiviteFieldOrigin;
  /** Bridge to runtime FieldSource when the field carries a value. */
  fieldSource?: FieldSource;
  /** OCR snippet supporting an extraction (Phase 2+). */
  evidence?: string;
  /** Normalized confidence 0–1 when available. */
  confidence?: number;
  /** Audit trail: GPT output rejected by OCR grounding (Phase 2). */
  rejectedValue?: string;
  /** User confirmed a PROPOSED value without editing it. */
  userConfirmed?: boolean;
  /** Original Fiscal AI proposal kept for audit after confirm/modify. */
  proposedSnapshot?: ActiviteProposedSnapshot;
};

export const ACTIVITE_ESTABLISHMENT_ADDRESS_FIELD_KEYS = [
  "establishmentAddress",
  "establishmentCity",
  "establishmentPostalCode",
] as const satisfies readonly ActiviteFieldKey[];

export type ActiviteFieldProvenanceMap = Partial<Record<ActiviteFieldKey, ActiviteFieldProvenance>>;

export type ActiviteFieldWithProvenance = {
  value?: string;
  provenance: ActiviteFieldProvenance;
};

export function missingInpiFieldProvenance(): ActiviteFieldProvenance {
  return { status: "missing", origin: "inpi_document" };
}

export function extractedInpiFieldProvenance(options?: {
  evidence?: string;
  confidence?: number;
}): ActiviteFieldProvenance {
  return {
    status: "extracted",
    origin: "inpi_document",
    fieldSource: "extracted",
    evidence: options?.evidence,
    confidence: options?.confidence,
  };
}

export function proposedFiscalAiFieldProvenance(options?: {
  evidence?: string;
  confidence?: number;
  rejectedValue?: string;
}): ActiviteFieldProvenance {
  return {
    status: "proposed",
    origin: "fiscal_ai",
    fieldSource: "judgment",
    evidence: options?.evidence,
    confidence: options?.confidence,
    rejectedValue: options?.rejectedValue,
  };
}

export function proposedEstablishmentAddressProvenance(options?: {
  evidence?: string;
}): ActiviteFieldProvenance {
  return {
    status: "proposed",
    origin: "fiscal_ai",
    fieldSource: "judgment",
    evidence: options?.evidence,
  };
}

/** SIREN explicitly derived from a SIRET found in the INPI document. */
export function proposedDerivedSirenProvenance(options?: {
  evidence?: string;
  confidence?: number;
}): ActiviteFieldProvenance {
  return {
    status: "proposed",
    origin: "fiscal_ai",
    fieldSource: "derived",
    evidence: options?.evidence,
    confidence: options?.confidence,
  };
}

export function rejectedGptFieldProvenance(rejectedValue: string): ActiviteFieldProvenance {
  return {
    status: "missing",
    origin: "inpi_document",
    rejectedValue,
  };
}

export function userActiviteFieldProvenance(isCorrection = false): ActiviteFieldProvenance {
  return {
    status: "extracted",
    origin: "user",
    fieldSource: isCorrection ? "user_correction" : "manual",
  };
}

function buildProposedSnapshot(
  previous: ActiviteFieldProvenance,
  proposedValue?: string,
): ActiviteProposedSnapshot {
  return {
    value: proposedValue,
    evidence: previous.evidence,
    fieldSource: previous.fieldSource,
    origin: previous.origin,
    status: previous.status,
  };
}

export function userConfirmedProposedFieldProvenance(
  previous: ActiviteFieldProvenance,
  confirmedValue?: string,
): ActiviteFieldProvenance {
  return {
    status: "extracted",
    origin: "user",
    fieldSource: "manual",
    userConfirmed: true,
    evidence: previous.evidence,
    proposedSnapshot: buildProposedSnapshot(previous, confirmedValue),
  };
}

export function userCorrectedProposedFieldProvenance(
  previous: ActiviteFieldProvenance,
  proposedValue?: string,
): ActiviteFieldProvenance {
  return {
    status: "extracted",
    origin: "user",
    fieldSource: "user_correction",
    userConfirmed: false,
    proposedSnapshot: buildProposedSnapshot(previous, proposedValue),
  };
}

export function hasProposedEstablishmentAddressGroup(
  provenance: ActiviteFieldProvenanceMap,
): boolean {
  return ACTIVITE_ESTABLISHMENT_ADDRESS_FIELD_KEYS.some(
    (key) => provenance[key]?.status === "proposed",
  );
}

export function confirmProposedEstablishmentAddressGroup(
  provenance: ActiviteFieldProvenanceMap,
  formValues: ActiviteFormValues,
): {
  provenance: ActiviteFieldProvenanceMap;
  validatedKeys: ActiviteFieldKey[];
} {
  const next: ActiviteFieldProvenanceMap = { ...provenance };
  const validatedKeys: ActiviteFieldKey[] = [];

  for (const key of ACTIVITE_ESTABLISHMENT_ADDRESS_FIELD_KEYS) {
    const previous = provenance[key];
    if (previous?.status !== "proposed") continue;
    if (isActiviteFieldEmpty(formValues, key)) continue;

    const confirmedValue = formValues[key as keyof ActiviteFormValues];
    next[key] = userConfirmedProposedFieldProvenance(
      previous,
      typeof confirmedValue === "string" ? confirmedValue : undefined,
    );
    validatedKeys.push(key);
  }

  return { provenance: next, validatedKeys };
}

/** Maps product provenance to the shared runtime FieldSource contract. */
export function toRuntimeFieldSource(provenance: ActiviteFieldProvenance): FieldSource | undefined {
  if (provenance.status === "missing") return undefined;
  return provenance.fieldSource ?? defaultFieldSourceFor(provenance);
}

function defaultFieldSourceFor(provenance: ActiviteFieldProvenance): FieldSource {
  if (provenance.origin === "user") return "manual";
  if (provenance.status === "proposed") return "judgment";
  return "extracted";
}

export function uncertainFieldsFromProvenance(
  provenance: ActiviteFieldProvenanceMap,
): ActiviteFieldKey[] {
  return ACTIVITE_GPT_PREFILLABLE_FIELDS.filter((key) => {
    const entry = provenance[key];
    return entry?.status === "extracted" || entry?.status === "proposed";
  });
}

export function readActiviteFieldProvenance(draft?: DeclarationDraft): ActiviteFieldProvenanceMap {
  return (draft?.activiteFieldProvenance ?? {}) as ActiviteFieldProvenanceMap;
}

export function activiteProvenanceDraftPatch(
  provenance: ActiviteFieldProvenanceMap,
): Partial<DeclarationDraft> {
  return { activiteFieldProvenance: provenance };
}

/**
 * Builds a complete provenance map after GPT prefill.
 * Fields mapped in this pass → EXTRACTED.
 * Empty fields → MISSING.
 * User-validated fields keep their prior provenance (typically user origin).
 */
export function buildProvenanceAfterGptPrefill(
  formValues: ActiviteFormValues,
  prefilledKeys: readonly ActiviteFieldKey[],
  options?: {
    existingProvenance?: ActiviteFieldProvenanceMap;
    userValidated?: ReadonlySet<ActiviteFieldKey>;
  },
): ActiviteFieldProvenanceMap {
  const prefilled = new Set(prefilledKeys);
  const existing = options?.existingProvenance ?? {};
  const userValidated = options?.userValidated ?? new Set<ActiviteFieldKey>();
  const next: ActiviteFieldProvenanceMap = {};

  for (const key of ACTIVITE_GPT_PREFILLABLE_FIELDS) {
    if (userValidated.has(key) && existing[key]) {
      next[key] = existing[key];
      continue;
    }

    if (prefilled.has(key) && !isActiviteFieldEmpty(formValues, key)) {
      next[key] = extractedInpiFieldProvenance();
      continue;
    }

    if (!isActiviteFieldEmpty(formValues, key)) {
      next[key] = existing[key] ?? userActiviteFieldProvenance();
      continue;
    }

    next[key] = missingInpiFieldProvenance();
  }

  return next;
}

/**
 * Legacy shim for workspaces persisted before activiteFieldProvenance existed.
 * Value present → extracted (best effort); empty → missing.
 */
export function inferLegacyActiviteFieldProvenance(
  formValues: ActiviteFormValues,
  userValidatedFields?: ActiviteUserValidatedFields,
): ActiviteFieldProvenanceMap {
  const provenance: ActiviteFieldProvenanceMap = {};

  for (const key of ACTIVITE_GPT_PREFILLABLE_FIELDS) {
    if (userValidatedFields?.[key]) {
      provenance[key] = userActiviteFieldProvenance(true);
      continue;
    }

    provenance[key] = isActiviteFieldEmpty(formValues, key)
      ? missingInpiFieldProvenance()
      : extractedInpiFieldProvenance();
  }

  return provenance;
}

export function resolveActiviteFieldProvenance(
  formValues: ActiviteFormValues,
  draft?: DeclarationDraft,
): ActiviteFieldProvenanceMap {
  const stored = readActiviteFieldProvenance(draft);
  if (Object.keys(stored).length > 0) return stored;

  return inferLegacyActiviteFieldProvenance(
    formValues,
    draft?.activiteUserValidatedFields as ActiviteUserValidatedFields | undefined,
  );
}

export function applyUserEditsToProvenance(
  provenance: ActiviteFieldProvenanceMap,
  editedKeys: readonly ActiviteFieldKey[],
  formValues: ActiviteFormValues,
  previousFormValues?: ActiviteFormValues,
): ActiviteFieldProvenanceMap {
  if (editedKeys.length === 0) return provenance;

  const next: ActiviteFieldProvenanceMap = { ...provenance };

  for (const key of editedKeys) {
    if (isActiviteFieldEmpty(formValues, key)) {
      next[key] = {
        status: "missing",
        origin: "user",
        fieldSource: "manual",
      };
      continue;
    }

    const previous = provenance[key];
    if (previous?.status === "proposed") {
      const proposedValue = previousFormValues?.[key as keyof ActiviteFormValues];
      next[key] = userCorrectedProposedFieldProvenance(
        previous,
        typeof proposedValue === "string" ? proposedValue : undefined,
      );
      continue;
    }

    const isCorrection =
      previous?.status === "extracted" ||
      (previous?.origin === "inpi_document" && previous.status !== "missing") ||
      previous?.origin === "fiscal_ai";

    next[key] = userActiviteFieldProvenance(isCorrection);
  }

  return next;
}

export function hasExtractedInpiAddressInGroup(
  provenance: ActiviteFieldProvenanceMap,
  keys: readonly ActiviteFieldKey[],
): boolean {
  return keys.some((key) => {
    const entry = provenance[key];
    return entry?.status === "extracted" && entry?.origin === "inpi_document";
  });
}

export type ActiviteFieldStatusCopy = {
  primary: string;
  secondary?: string;
  tone: "extracted" | "missing" | "proposed";
};

export function getActiviteFieldStatusCopy(
  provenance: ActiviteFieldProvenance | undefined,
  hasValue: boolean,
  focused = false,
  fieldKey?: ActiviteFieldKey,
): ActiviteFieldStatusCopy | null {
  const effective =
    provenance ?? (!hasValue ? missingInpiFieldProvenance() : undefined);
  if (!effective) return null;

  if (effective.status === "missing" && !hasValue) {
    return {
      primary: "Non trouvé dans le document",
      ...(focused ? {} : { secondary: "À compléter" }),
      tone: "missing",
    };
  }

  if (provenance?.status === "proposed" && hasValue) {
    const isEstablishmentField =
      fieldKey === "establishmentAddress" ||
      fieldKey === "establishmentCity" ||
      fieldKey === "establishmentPostalCode";

    return {
      primary: "Proposition Fiscal AI",
      ...(isEstablishmentField
        ? {
            secondary:
              "Établissement principal INPI — distinct du bien loué. À confirmer.",
          }
        : {}),
      tone: "proposed",
    };
  }

  if (
    provenance?.status === "extracted" &&
    provenance.origin === "inpi_document" &&
    hasValue
  ) {
    return {
      primary: "Extrait du document INPI",
      tone: "extracted",
    };
  }

  return null;
}

export function readActiviteFieldWithProvenance(
  key: ActiviteFieldKey,
  formValues: ActiviteFormValues,
  provenance: ActiviteFieldProvenanceMap,
): ActiviteFieldWithProvenance {
  const value = formValues[key as keyof ActiviteFormValues];
  const normalized = typeof value === "string" && value.trim() ? value : undefined;

  return {
    value: normalized,
    provenance: provenance[key] ?? (normalized ? extractedInpiFieldProvenance() : missingInpiFieldProvenance()),
  };
}
