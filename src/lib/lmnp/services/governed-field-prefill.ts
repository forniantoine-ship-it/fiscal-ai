import type { CreditFormValues, CreditLoanFormValues } from "@/lib/lmnp/services/credit-profile";
import {
  creditFromDraft,
  emptyLoanFormValues,
  financingToFormValues,
} from "@/lib/lmnp/services/credit-profile";
import type { LogementFormValues } from "@/lib/lmnp/services/logement-profile";
import { propertyToFormValues } from "@/lib/lmnp/services/logement-profile";
import type { DeclarationDraft } from "@/lib/lmnp/types";
import type { PersistedWorkspace } from "@/lib/lmnp/store/persistence";
import {
  restoreCreditFormPassive,
  restoreLogementFormPassive,
} from "@/lib/lmnp/services/passive-form-restore";

import {
  canPrefillFormField,
  ingestExtractionIntoStore,
  isEmptyValue,
  lockGovernedField,
  readGovernedValuesForTunnel,
} from "@/lib/documents/cross-tunnel-prefill";
import type {
  GovernedFieldExtractedBy,
  GovernedFieldStore,
} from "@/lib/documents/types/governed-field";
import type { CanonicalFieldKey, FiscalTunnel } from "@/lib/documents/tunnel-field-ownership";
import { canonicalFieldKey, getFieldOwner } from "@/lib/documents/tunnel-field-ownership";

export type ProcessGovernedExtractionParams = {
  draft?: DeclarationDraft;
  sourceTunnel: FiscalTunnel;
  documentId: string;
  sourceDocument: string;
  extractedBy: GovernedFieldExtractedBy;
  payload: Record<string, unknown>;
};

export type ProcessGovernedExtractionResult = {
  governedFields: GovernedFieldStore;
  appliedFields: CanonicalFieldKey[];
  creditFormPatch: CreditFormValues | null;
  logementFormPatch: LogementFormValues | null;
};

const CREDIT_CANONICAL_TO_FORM: Partial<
  Record<CanonicalFieldKey, keyof CreditLoanFormValues | keyof CreditFormValues["summary"]>
> = {
  lenderName: "bank",
  loanPrincipal: "borrowedAmount",
  loanRate: "rate",
  loanTermMonths: "durationMonths",
  monthlyPayment: "monthlyPayment",
  annualInterest: "annualInterest",
};

const LOGEMENT_CANONICAL_TO_FORM: Partial<Record<CanonicalFieldKey, keyof LogementFormValues>> = {
  propertyAddress: "address",
  propertyCity: "city",
  propertyPostalCode: "postalCode",
  acquisitionDate: "acquisitionDate",
  surfaceArea: "surface",
};

function formatGovernedValue(value: unknown): string {
  if (typeof value === "number") return String(value);
  if (typeof value === "string") return value;
  return String(value ?? "");
}

function applyCreditGovernedValues(
  base: CreditFormValues,
  governed: Partial<Record<CanonicalFieldKey, unknown>>,
  store: GovernedFieldStore,
): { values: CreditFormValues; patched: boolean } {
  const loans = base.loans.length ? [...base.loans] : [emptyLoanFormValues()];
  const primaryLoan: CreditLoanFormValues = { ...loans[0]! };
  const summary = { ...base.summary };
  let patched = false;

  for (const [canonical, formKey] of Object.entries(CREDIT_CANONICAL_TO_FORM) as [
    CanonicalFieldKey,
    keyof CreditLoanFormValues | keyof CreditFormValues["summary"],
  ][]) {
    const governedValue = governed[canonical];
    if (governedValue === undefined) continue;

    if (formKey in summary) {
      const current = summary[formKey as keyof CreditFormValues["summary"]];
      if (!canPrefillFormField(store, canonical, current)) continue;
      summary[formKey as keyof CreditFormValues["summary"]] = formatGovernedValue(governedValue);
      patched = true;
      continue;
    }

    const current = primaryLoan[formKey as keyof CreditLoanFormValues];
    if (!canPrefillFormField(store, canonical, current)) continue;
    (primaryLoan as unknown as Record<string, string>)[formKey] = formatGovernedValue(governedValue);
    patched = true;
  }

  loans[0] = primaryLoan;
  return { values: { loans, summary }, patched };
}

function applyLogementGovernedValues(
  base: LogementFormValues,
  governed: Partial<Record<CanonicalFieldKey, unknown>>,
  store: GovernedFieldStore,
): { values: LogementFormValues; patched: boolean } {
  const values = { ...base };
  let patched = false;

  for (const [canonical, formKey] of Object.entries(LOGEMENT_CANONICAL_TO_FORM) as [
    CanonicalFieldKey,
    keyof LogementFormValues,
  ][]) {
    const governedValue = governed[canonical];
    if (governedValue === undefined) continue;

    const current = values[formKey];
    if (!canPrefillFormField(store, canonical, current)) continue;

    if (formKey === "propertyType") {
      values.propertyType = governedValue as LogementFormValues["propertyType"];
    } else {
      (values as Record<string, unknown>)[formKey] = formatGovernedValue(governedValue);
    }
    patched = true;
  }

  return { values, patched };
}

export function readGovernedFieldStore(draft?: DeclarationDraft): GovernedFieldStore {
  return (draft?.governedFields ?? {}) as GovernedFieldStore;
}

const CREDIT_SUMMARY_FORM_KEYS = new Set<keyof CreditFormValues["summary"]>([
  "annualInterest",
  "annualInsurance",
  "annualFinancingCharges",
  "remainingCapital",
]);

function getCreditFormFieldValue(form: CreditFormValues, field: CanonicalFieldKey): unknown {
  const formKey = CREDIT_CANONICAL_TO_FORM[field];
  if (!formKey) return undefined;
  if (CREDIT_SUMMARY_FORM_KEYS.has(formKey as keyof CreditFormValues["summary"])) {
    return form.summary[formKey as keyof CreditFormValues["summary"]];
  }
  return form.loans[0]?.[formKey as keyof CreditLoanFormValues];
}

function getLogementFormFieldValue(form: LogementFormValues, field: CanonicalFieldKey): unknown {
  const formKey = LOGEMENT_CANONICAL_TO_FORM[field];
  if (!formKey) return undefined;
  return form[formKey];
}

/** Rule A — cross-tunnel values may only target empty form fields. */
function filterCrossTunnelPayloadForOccupiedForms(
  payload: Record<string, unknown>,
  sourceTunnel: FiscalTunnel,
  draft?: DeclarationDraft,
): Record<string, unknown> {
  const filtered: Record<string, unknown> = {};
  const creditForm = creditFromDraft(draft);
  const logementForm = propertyToFormValues();

  for (const [rawKey, value] of Object.entries(payload)) {
    const field = canonicalFieldKey(rawKey);
    if (!field) continue;

    const owner = getFieldOwner(field);
    if (!owner || sourceTunnel === owner) {
      filtered[rawKey] = value;
      continue;
    }

    const currentValue =
      owner === "credit"
        ? getCreditFormFieldValue(creditForm, field)
        : owner === "logement"
          ? getLogementFormFieldValue(logementForm, field)
          : undefined;

    if (isEmptyValue(currentValue)) {
      filtered[rawKey] = value;
    }
  }

  return filtered;
}

export function processGovernedExtraction(
  params: ProcessGovernedExtractionParams,
): ProcessGovernedExtractionResult {
  const currentStore = readGovernedFieldStore(params.draft);
  const payload = filterCrossTunnelPayloadForOccupiedForms(
    params.payload,
    params.sourceTunnel,
    params.draft,
  );

  const { store, applied } = ingestExtractionIntoStore({
    store: currentStore,
    sourceTunnel: params.sourceTunnel,
    sourceDocument: params.sourceDocument,
    extractedBy: params.extractedBy,
    payload,
  });

  const creditGoverned = readGovernedValuesForTunnel(store, "credit");
  const logementGoverned = readGovernedValuesForTunnel(store, "logement");

  const creditBase = creditFromDraft(params.draft);
  const creditResult = applyCreditGovernedValues(creditBase, creditGoverned, store);

  const logementBase = propertyToFormValues();
  const logementResult = applyLogementGovernedValues(logementBase, logementGoverned, store);

  return {
    governedFields: store,
    appliedFields: applied,
    creditFormPatch: creditResult.patched ? creditResult.values : null,
    logementFormPatch: logementResult.patched ? logementResult.values : null,
  };
}

export function hydrateCreditFormFromGovernedFields(
  draft: DeclarationDraft | undefined,
  options?: { passiveHydration?: boolean },
): CreditFormValues {
  if (options?.passiveHydration) {
    console.log("[prefill-skipped-hydration]", { tunnel: "credit", action: "governed_prefill" });
    return restoreCreditFormPassive(draft);
  }

  const store = readGovernedFieldStore(draft);
  const base = creditFromDraft(draft);
  const governed = readGovernedValuesForTunnel(store, "credit");
  return applyCreditGovernedValues(base, governed, store).values;
}

export function hydrateLogementFormFromGovernedFields(
  workspace: PersistedWorkspace,
  options?: { passiveHydration?: boolean },
): LogementFormValues {
  if (options?.passiveHydration) {
    console.log("[prefill-skipped-hydration]", { tunnel: "logement", action: "governed_prefill" });
    return restoreLogementFormPassive(workspace);
  }

  const store = readGovernedFieldStore(workspace.declarationDraft);
  const base = propertyToFormValues(workspace.properties[0]);
  const governed = readGovernedValuesForTunnel(store, "logement");
  return applyLogementGovernedValues(base, governed, store).values;
}

/** Maps user-edited credit form keys to canonical governed fields and locks them. */
export function lockCreditFormFieldEdits(
  store: GovernedFieldStore,
  previous: CreditFormValues,
  next: CreditFormValues,
): GovernedFieldStore {
  let updated = { ...store };
  const prevLoan = previous.loans[0] ?? emptyLoanFormValues();
  const nextLoan = next.loans[0] ?? emptyLoanFormValues();

  for (const [canonical, formKey] of Object.entries(CREDIT_CANONICAL_TO_FORM) as [
    CanonicalFieldKey,
    keyof CreditLoanFormValues | keyof CreditFormValues["summary"],
  ][]) {
    const prevValue =
      formKey in previous.summary
        ? previous.summary[formKey as keyof CreditFormValues["summary"]]
        : prevLoan[formKey as keyof CreditLoanFormValues];
    const nextValue =
      formKey in next.summary
        ? next.summary[formKey as keyof CreditFormValues["summary"]]
        : nextLoan[formKey as keyof CreditLoanFormValues];

    if (String(prevValue ?? "").trim() !== String(nextValue ?? "").trim() && String(nextValue ?? "").trim()) {
      updated = lockGovernedField(updated, canonical, nextValue);
    }
  }

  return updated;
}

/** Maps user-edited logement form keys to canonical governed fields and locks them. */
export function lockLogementFormFieldEdits(
  store: GovernedFieldStore,
  previous: LogementFormValues,
  next: LogementFormValues,
): GovernedFieldStore {
  let updated = { ...store };

  for (const [canonical, formKey] of Object.entries(LOGEMENT_CANONICAL_TO_FORM) as [
    CanonicalFieldKey,
    keyof LogementFormValues,
  ][]) {
    const prevValue = previous[formKey];
    const nextValue = next[formKey];
    if (String(prevValue ?? "").trim() !== String(nextValue ?? "").trim() && String(nextValue ?? "").trim()) {
      updated = lockGovernedField(updated, canonical, nextValue);
    }
  }

  return updated;
}

export function lockCanonicalFieldFromRawKey(
  store: GovernedFieldStore,
  rawKey: string,
  value: unknown,
): GovernedFieldStore {
  const field = canonicalFieldKey(rawKey);
  if (!field) return store;
  return lockGovernedField(store, field, value);
}