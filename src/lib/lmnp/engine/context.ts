import type {
  Alert,
  FiscalRegime,
  FiscalYear,
  LedgerEntry,
  LmnpDocument,
  Property,
  ValidationItem,
} from "../types";
import { getRequiredFieldKeys } from "../types/field-keys";
import { DOCUMENT_REQUIREMENTS } from "../constants/documents";
import type { DocumentRequirement } from "../constants/documents";

export interface EngineContext {
  fiscalYear: FiscalYear;
  properties: Property[];
  documents: LmnpDocument[];
  validationItems: ValidationItem[];
  ledgerEntries: LedgerEntry[];
  alerts: Alert[];
  flags: {
    regime: FiscalRegime;
    hasLoan: boolean;
    annualInterestCents: number;
  };
}

export function buildEngineContext(
  fiscalYear: FiscalYear,
  properties: Property[],
  documents: LmnpDocument[],
  validationItems: ValidationItem[],
  ledgerEntries: LedgerEntry[],
  alerts: Alert[],
): EngineContext {
  const interestEntry = ledgerEntries.find(
    (e) => e.status === "active" && e.fieldKey === "loan.annualInterest",
  );
  const pendingInterest = validationItems.find(
    (v) => v.fieldKey === "loan.annualInterest" && v.status === "pending",
  );
  let annualInterestCents = 0;
  if (interestEntry?.value.type === "money") annualInterestCents = interestEntry.value.amountCents;
  else if (pendingInterest?.proposedValue.type === "money")
    annualInterestCents = pendingInterest.proposedValue.amountCents;

  return {
    fiscalYear,
    properties,
    documents: documents.filter((d) => d.status !== "failed"),
    validationItems,
    ledgerEntries: ledgerEntries.filter((e) => e.status === "active"),
    alerts: alerts.filter((a) => a.status === "open" || a.status === "acknowledged"),
    flags: {
      regime: fiscalYear.regime,
      hasLoan: annualInterestCents > 0,
      annualInterestCents,
    },
  };
}

export function getApplicableRequirements(ctx: EngineContext): DocumentRequirement[] {
  return DOCUMENT_REQUIREMENTS.filter((req) => {
    if (!req.regimes.includes(ctx.flags.regime)) return false;
    if (req.condition === "reel_only" && ctx.flags.regime !== "reel") return false;
    if (req.condition === "has_loan" && !ctx.flags.hasLoan) return false;
    if (req.level === "conditional" && req.condition === "has_loan" && !ctx.flags.hasLoan)
      return false;
    return true;
  });
}

export function hasActiveLedgerForField(ctx: EngineContext, fieldKey: string): boolean {
  return ctx.ledgerEntries.some((e) => e.fieldKey === fieldKey);
}

export function getRequiredFields(ctx: EngineContext): string[] {
  return getRequiredFieldKeys(ctx.flags.regime);
}
