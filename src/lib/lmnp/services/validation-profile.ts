import { LMNP_ROUTES } from "../routes";
import type { DeclarationDraft, FiscalEngineOutput, Property } from "../types";
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
  incompleteLabel: string;
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
  const checks: {
    id: DossierStepId;
    completeLabel: string;
    incompleteLabel: string;
    complete: boolean;
  }[] = [
    {
      id: "activite",
      completeLabel: "Activité validée",
      incompleteLabel: "Activité à compléter",
      complete: isActiviteComplete(draft),
    },
    {
      id: "logement",
      completeLabel: "Logement analysé",
      incompleteLabel: "Logement à compléter",
      complete: isLogementComplete(draft),
    },
    {
      id: "credit",
      completeLabel: "Crédit analysé",
      incompleteLabel: "Crédit à compléter",
      complete: isCreditComplete(draft),
    },
    {
      id: "amortissement",
      completeLabel: "Amortissements calculés",
      incompleteLabel: "Amortissements à compléter",
      complete: isAmortissementComplete(draft),
    },
    {
      id: "revenus",
      completeLabel: "Revenus détectés",
      incompleteLabel: "Revenus à compléter",
      complete: isRevenusComplete(draft),
    },
    {
      id: "charges",
      completeLabel: "Charges classées",
      incompleteLabel: "Charges à compléter",
      complete: isChargesComplete(draft),
    },
  ];

  return checks.map((item) => ({
    id: item.id,
    completeLabel: item.completeLabel,
    incompleteLabel: item.incompleteLabel,
    status: item.complete ? "complete" : "incomplete",
  }));
}

const MISSING_STEP_COPY: Record<DossierStepId, { label: string; href: string }> = {
  activite: { label: "Activité incomplète", href: LMNP_ROUTES.activite },
  logement: { label: "Logement incomplet", href: LMNP_ROUTES.logement },
  credit: { label: "Crédit incomplet", href: LMNP_ROUTES.financement },
  amortissement: { label: "Amortissements incomplets", href: LMNP_ROUTES.amortissementsAssistant },
  revenus: { label: "Revenus manquants", href: LMNP_ROUTES.revenusAssistant },
  charges: { label: "Charges incomplètes", href: LMNP_ROUTES.chargesAssistant },
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
  const fromF014 = draft?.amortissementAssistant?.totalDotations;
  if (typeof fromF014 === "number" && Number.isFinite(fromF014)) {
    return fromF014;
  }
  const ventilation = ventilationFromDraft(draft);
  if (!ventilation?.components.length) return 0;
  return ventilation.components.reduce((sum, component) => sum + (component.annualAmortization ?? 0), 0);
}

/**
 * Revenus réellement transmis à F-006 (`revenusAssistant.totalRecettes`) en priorité —
 * même patron que `totalAnnualAmortization`. Repli sur l'extraction legacy
 * uniquement si l'assistant n'a pas encore tourné (dossier pas encore complété).
 */
function totalRentalIncome(draft: DeclarationDraft | undefined, fiscalYear: number): number {
  const fromF013 = draft?.revenusAssistant?.totalRecettes;
  if (typeof fromF013 === "number" && Number.isFinite(fromF013)) {
    return fromF013;
  }
  const revenus =
    (draft?.revenueGptSession
      ? sessionToExtractionData(draft.revenueGptSession, fiscalYear)
      : undefined) ?? revenusFromDraft(draft);
  return revenus?.summary.totalRevenue ?? 0;
}

/**
 * Charges réellement transmises à F-006 (`chargesAssistant.totalDeductible`) en
 * priorité — même patron que `totalAnnualAmortization`. Repli sur l'extraction
 * legacy uniquement si l'assistant n'a pas encore tourné.
 */
function totalDetectedCharges(draft: DeclarationDraft | undefined, properties: Property[]): number {
  const fromF012 = draft?.chargesAssistant?.totalDeductible;
  if (typeof fromF012 === "number" && Number.isFinite(fromF012)) {
    return fromF012;
  }
  const charges = chargesFromDraft(draft) ?? buildChargesExtraction(properties, draft);
  return charges.summary.totalCharges;
}

export function buildFiscalSummary(
  draft: DeclarationDraft | undefined,
  properties: Property[],
  fiscalYear = new Date().getFullYear() - 1,
): FiscalSummary {
  const rentalIncome = totalRentalIncome(draft, fiscalYear);
  const detectedCharges = totalDetectedCharges(draft, properties);
  const calculatedAmortization = totalAnnualAmortization(draft);
  const resultatAvantAmort = rentalIncome - detectedCharges;
  const amortInPreview = Math.min(calculatedAmortization, Math.max(0, resultatAvantAmort));
  const estimatedFiscalResult = resultatAvantAmort - amortInPreview;

  return {
    rentalIncome,
    detectedCharges,
    calculatedAmortization,
    estimatedFiscalResult,
  };
}

export type FiscalDisplayRow = {
  key: string;
  label: string;
  value: number;
  format: (value: number) => string;
};

export type ValidationFiscalDisplay = {
  /** true dès que les lignes proviennent du FiscalResult (F-006) réellement recalculé
   *  par la porte de génération — jamais d'une seconde formule. false uniquement en
   *  fallback, tant que le dossier est incomplet et qu'aucun FiscalResult n'existe. */
  exact: boolean;
  rows: FiscalDisplayRow[];
};

/**
 * Cycle 24 — Unifie l'affichage pré-paiement avec le FiscalResult (F-006).
 * Ne recalcule rien : si `fiscalResult` est fourni (le même objet que celui utilisé
 * pour générer la liasse), ses champs sont affichés tels quels. Le déficit et le
 * bénéfice ne sont jamais confondus dans un même nombre signé — resultatFiscal vaut
 * 0 en cas de déficit (cf. apply-amortissement-stocks.ts), donc la ligne "résultat"
 * bascule explicitement sur deficitNouveau dans ce cas.
 * `summary` (buildFiscalSummary) ne sert que de repli tant que le dossier est
 * incomplet et qu'aucun FiscalResult n'a encore pu être calculé.
 */
export function buildValidationFiscalDisplay(
  fiscalResult: FiscalEngineOutput | undefined,
  summary: FiscalSummary,
): ValidationFiscalDisplay {
  if (fiscalResult) {
    const isDeficit = fiscalResult.deficitNouveau > 0;
    return {
      exact: true,
      rows: [
        { key: "recettes", label: "Revenus locatifs", value: fiscalResult.totalRecettes, format: formatCurrency },
        { key: "charges", label: "Charges déductibles", value: fiscalResult.totalCharges, format: formatCurrency },
        {
          key: "amortDeduct",
          label: "Amortissement déduit",
          value: fiscalResult.amortDeduct,
          format: formatCurrency,
        },
        {
          key: "amortReporte",
          label: "Amortissement reporté (art. 39C)",
          value: fiscalResult.amortReporte,
          format: formatCurrency,
        },
        isDeficit
          ? { key: "resultat", label: "Déficit fiscal", value: fiscalResult.deficitNouveau, format: formatCurrency }
          : {
              key: "resultat",
              label: "Résultat fiscal",
              value: fiscalResult.resultatFiscal,
              format: formatCurrency,
            },
      ],
    };
  }

  return {
    exact: false,
    rows: [
      { key: "recettes", label: "Revenus locatifs", value: summary.rentalIncome, format: formatCurrency },
      { key: "charges", label: "Charges détectées", value: summary.detectedCharges, format: formatCurrency },
      {
        key: "amortissement",
        label: "Amortissements calculés",
        value: summary.calculatedAmortization,
        format: formatCurrency,
      },
      {
        key: "resultat",
        label: "Résultat fiscal estimé",
        value: summary.estimatedFiscalResult,
        format: formatEstimatedResult,
      },
    ],
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
