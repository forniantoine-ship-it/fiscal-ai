import { documentJourneyRoute } from "../routes";
import type { DeclarationDraft, Property } from "../types";
import { buildChargesExtraction, chargesFromDraft } from "./charges-profile";
import { ventilationFromDraft } from "./amortissement-profile";
import { revenusFromDraft } from "./revenus-profile";
import { sessionToExtractionData } from "./revenue-gpt-ui-prefill";

export const GENERATION_PRICE_TTC = 149;

export type DossierStepId =
  | "activite"
  | "logement"
  | "credit"
  | "amortissement"
  | "revenus"
  | "charges";

export type DossierStepStatus = "complete" | "incomplete";

export interface DossierStepItem {
  id: DossierStepId;
  completeLabel: string;
  status: DossierStepStatus;
}

export interface MissingDossierItem {
  id: string;
  label: string;
  href: string;
}

export interface FiscalSummary {
  rentalIncome: number;
  detectedCharges: number;
  calculatedAmortization: number;
  estimatedFiscalResult: number;
}

export interface ValidationDossierSnapshot {
  steps: DossierStepItem[];
  missing: MissingDossierItem[];
  isComplete: boolean;
  isMultiProperty: boolean;
  fiscalSummary: FiscalSummary;
  deadlineLabel: string;
}

export function formatCurrency(value: number): string {
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(value);
}

export function formatEstimatedResult(value: number): string {
  if (Math.abs(value) < 50) return "≈ 0 €";
  return formatCurrency(value);
}

function isActiviteComplete(draft?: DeclarationDraft): boolean {
  return Boolean(draft?.inpiConfirmedAt || draft?.siren?.trim());
}

function isLogementComplete(draft?: DeclarationDraft): boolean {
  return Boolean(draft?.logementConfirmedAt);
}

function isCreditComplete(draft?: DeclarationDraft): boolean {
  return Boolean(draft?.creditConfirmedAt || draft?.creditDeclaredNoneAt);
}

function isAmortissementComplete(draft?: DeclarationDraft): boolean {
  return Boolean(draft?.amortissementConfirmedAt);
}

function isRevenusComplete(draft?: DeclarationDraft): boolean {
  return Boolean(draft?.revenusConfirmedAt);
}

function isChargesComplete(draft?: DeclarationDraft): boolean {
  return Boolean(draft?.chargesConfirmedAt);
}

export function buildDossierSteps(draft?: DeclarationDraft): DossierStepItem[] {
  const checks: { id: DossierStepId; completeLabel: string; complete: boolean }[] = [
    { id: "activite", completeLabel: "Activité validée", complete: isActiviteComplete(draft) },
    { id: "logement", completeLabel: "Logement analysé", complete: isLogementComplete(draft) },
    { id: "credit", completeLabel: "Crédit analysé", complete: isCreditComplete(draft) },
    { id: "amortissement", completeLabel: "Amortissements calculés", complete: isAmortissementComplete(draft) },
    { id: "revenus", completeLabel: "Revenus détectés", complete: isRevenusComplete(draft) },
    { id: "charges", completeLabel: "Charges classées", complete: isChargesComplete(draft) },
  ];

  return checks.map((item) => ({
    id: item.id,
    completeLabel: item.completeLabel,
    status: item.complete ? "complete" : "incomplete",
  }));
}

const MISSING_STEP_COPY: Record<DossierStepId, { label: string; href: string }> = {
  activite: { label: "Activité incomplète", href: documentJourneyRoute("inpi") },
  logement: { label: "Logement incomplet", href: documentJourneyRoute("logement") },
  credit: { label: "Crédit incomplet", href: documentJourneyRoute("credit") },
  amortissement: { label: "Amortissements incomplets", href: documentJourneyRoute("amortissements") },
  revenus: { label: "Revenus manquants", href: documentJourneyRoute("revenus") },
  charges: { label: "Charges incomplètes", href: documentJourneyRoute("charges") },
};

export function buildMissingItems(steps: DossierStepItem[]): MissingDossierItem[] {
  return steps
    .filter((step) => step.status === "incomplete")
    .map((step) => ({
      id: step.id,
      label: MISSING_STEP_COPY[step.id].label,
      href: MISSING_STEP_COPY[step.id].href,
    }));
}

function totalAnnualAmortization(draft?: DeclarationDraft): number {
  const ventilation = ventilationFromDraft(draft);
  if (!ventilation?.components.length) return 8_120;
  return ventilation.components.reduce((sum, component) => sum + (component.annualAmortization ?? 0), 0);
}

export function buildFiscalSummary(
  draft: DeclarationDraft | undefined,
  properties: Property[],
  fiscalYear = new Date().getFullYear() - 1,
): FiscalSummary {
  const revenus =
    (draft?.revenueGptSession
      ? sessionToExtractionData(draft.revenueGptSession, fiscalYear)
      : undefined) ??
    revenusFromDraft(draft) ?? {
      properties: [],
      summary: { totalRevenue: 0, rentCount: 0, totalFees: 0, hasSecurityDeposit: false },
    };
  const charges = chargesFromDraft(draft) ?? buildChargesExtraction(properties, draft);
  const rentalIncome = revenus.summary.totalRevenue;
  const detectedCharges = charges.summary.totalCharges;
  const calculatedAmortization = totalAnnualAmortization(draft);
  const estimatedFiscalResult = rentalIncome - detectedCharges - calculatedAmortization;

  return {
    rentalIncome,
    detectedCharges,
    calculatedAmortization,
    estimatedFiscalResult,
  };
}

export function buildFiscalDeadlineLabel(fiscalYear: number): string {
  return `Déclaration à finaliser avant le 15 mai ${fiscalYear + 1}.`;
}

export function buildValidationDossierSnapshot(
  draft: DeclarationDraft | undefined,
  properties: Property[],
  fiscalYear: number,
): ValidationDossierSnapshot {
  const steps = buildDossierSteps(draft);
  const missing = buildMissingItems(steps);

  return {
    steps,
    missing,
    isComplete: missing.length === 0,
    isMultiProperty: properties.length > 1,
    fiscalSummary: buildFiscalSummary(draft, properties, fiscalYear),
    deadlineLabel: buildFiscalDeadlineLabel(fiscalYear),
  };
}
