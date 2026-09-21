import { LMNP_ROUTES } from "../routes";
import type { DeclarationDraft, FiscalEngineOutput, Property } from "../types";
import { buildChargesExtraction, chargesFromDraft } from "./charges-profile";
import { ventilationFromDraft } from "./amortissement-profile";
import { revenusFromDraft } from "./revenus-profile";
import { sessionToExtractionData } from "./revenue-gpt-ui-prefill";
import { excludedLoanIdsFromFinancing } from "./f011/credit-financing-to-financement-charges";
import { effectiveFinancementCharges } from "./declaration/credit-state";
import { aggregateFinancementTerms } from "@/runtime/capabilities/f006/aggregate-inputs";
import { round2 } from "@/runtime/capabilities/f006/types";
import { isAnnualOutputForActiveYear } from "./dossier/annual-output-year-safety";

// Source unique du prix (aussi lue par le serveur pour le montant Stripe).
export { GENERATION_PRICE_TTC } from "./payment/price";

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
  /** Charges déductibles de l'exercice : F-012 + frais d'acquisition en charges (F-010) + financement de l'exercice (F-011). */
  detectedCharges: number;
  /**
   * A3 — charges engagées avant la mise en location (AX-011 / TRF-0030 :
   * déductibles, retranchées du résultat avant amortissement par F-006).
   * Portées à part de `detectedCharges` — comme `FiscalEngineOutput.chargesPreExploitation`
   * — pour que l'estimation reste additive ligne à ligne.
   */
  preExploitationCharges: number;
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
  // Lot 4 — SIREN/identité durable ≠ confirmation annuelle F009.
  // Seul `inpiConfirmedAt` (posé après review explicite) prouve la complétude.
  return Boolean(draft?.inpiConfirmedAt);
}

/**
 * V1 Bucket-1 fix (audit "readiness globale") — même défaut que P0-2b
 * (`isChargesComplete`)/NEXT-4 (`isAmortissementComplete`) : le chemin legacy
 * (`LogementDocumentStep.tsx` / `CONFIRM_LOGEMENT_PROFILE`) peut poser
 * `logementConfirmedAt` sans jamais renseigner `logementAmortissement` — le
 * seul champ que F-010/F-014 dérivent réellement. `logementConfirmedAt`
 * n'est volontairement pas supprimé du modèle (donnée legacy conservée
 * telle quelle) ; seule cette vérification de complétude change, pour
 * refléter l'état canonique réel plutôt qu'un horodatage qui peut mentir.
 */
function isLogementComplete(draft?: DeclarationDraft, fiscalYear?: number): boolean {
  if (!draft?.logementAmortissement) return false;
  if (fiscalYear === undefined) return true;
  return isAnnualOutputForActiveYear(draft.logementAmortissement, fiscalYear);
}

/**
 * NEXT-2 (F011-CREDIT-SILENT-LOAN-EXCLUSION) — un `creditConfirmedAt` seul ne
 * suffit plus si un prêt confirmé reste exclu du calcul fiscal faute de date
 * de première échéance. Dérivé en direct depuis `creditFinancing.loans`
 * (donnée source canonique, toujours persistée) plutôt que depuis un champ
 * calculé au moment de la confirmation : protège aussi rétroactivement les
 * dossiers confirmés avant ce correctif UI, sans exiger une nouvelle
 * confirmation. Même logique que `isRevenusComplete` (NEXT-1) pour refléter
 * exactement ce que `validateFiscalInputs` (F-006) bloquerait.
 */
function isCreditComplete(draft?: DeclarationDraft, fiscalYear?: number): boolean {
  if (!draft?.creditConfirmedAt && !draft?.creditDeclaredNoneAt) return false;
  if (excludedLoanIdsFromFinancing(draft?.creditFinancing).length > 0) return false;
  if (draft?.financementCharges && fiscalYear !== undefined) {
    return isAnnualOutputForActiveYear(draft.financementCharges, fiscalYear);
  }
  return true;
}

/**
 * NEXT-4 — un `amortissementConfirmedAt` seul ne prouve plus que F-006
 * dispose de quoi calculer : il peut être posé par le chemin legacy
 * (`AmortissementDocumentStep.tsx` / `CONFIRM_AMORTISSEMENT`) sans que
 * `amortissementAssistant` — le seul champ lu par `produceFiscalResult()`
 * — ne soit jamais renseigné, exactement le même défaut que P0-2b pour
 * `isChargesComplete`. `amortissementAssistant.status !== "validated"`
 * (ex. "contested") est également fatal pour `validateFiscalInputs()` (F-006)
 * et doit donc garder l'étape incomplète. `amortissementConfirmedAt`
 * n'est volontairement pas supprimé du modèle (donnée legacy conservée
 * telle quelle) ; seule cette vérification de complétude change, pour
 * refléter exactement la même condition que `validateFiscalInputs()`.
 */
function isAmortissementComplete(draft?: DeclarationDraft, fiscalYear?: number): boolean {
  if (draft?.amortissementAssistant?.status !== "validated") return false;
  if (fiscalYear === undefined) return true;
  return isAnnualOutputForActiveYear(draft.amortissementAssistant, fiscalYear);
}

/**
 * NEXT-1 (REV-P0-03) — un `revenusConfirmedAt` seul ne suffit plus : si une
 * anomalie `error`/`fatal` non résolue accompagne `revenusAssistant` (ex.
 * indemnité GLI signalée sans montant, revenu nul non justifié), l'étape
 * Revenus doit rester "incomplète" pour le dossier — même logique que
 * `isChargesComplete` ci-dessus (refléter exactement ce que F-006 bloquerait).
 */
function isRevenusComplete(draft?: DeclarationDraft, fiscalYear?: number): boolean {
  if (!draft?.revenusConfirmedAt) return false;
  const blocking = draft.revenusAssistant?.anomalies?.some(
    (a) => a.severity === "fatal" || a.severity === "error",
  );
  if (blocking) return false;
  if (draft.revenusAssistant && fiscalYear !== undefined) {
    return isAnnualOutputForActiveYear(draft.revenusAssistant, fiscalYear);
  }
  return Boolean(draft.revenusAssistant);
}

/**
 * P0-2b (audit "périmètre fiscal / documentaire", défaut D2) — `chargesConfirmedAt`
 * seul ne prouve plus que F-006 dispose de quoi calculer : il peut être posé par
 * le chemin legacy (`ChargesDocumentStep.tsx` / `CONFIRM_CHARGES`,
 * `declarationDraft.chargesExtraction`) sans que `chargesAssistant` — le SEUL champ
 * lu par `produceFiscalResult()` — ne soit jamais renseigné. `chargesConfirmedAt`
 * n'est volontairement pas supprimé du modèle (donnée legacy conservée telle
 * quelle) ; seule cette vérification de complétude change, pour refléter
 * exactement la même condition que `validateFiscalInputs()` (F-006).
 */
function isChargesComplete(draft?: DeclarationDraft, fiscalYear?: number): boolean {
  if (!draft?.chargesAssistant) return false;
  if (fiscalYear === undefined) return true;
  return isAnnualOutputForActiveYear(draft.chargesAssistant, fiscalYear);
}

export function buildDossierSteps(
  draft?: DeclarationDraft,
  fiscalYear?: number,
): DossierStepItem[] {
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
      complete: isLogementComplete(draft, fiscalYear),
    },
    {
      id: "credit",
      completeLabel: "Crédit analysé",
      incompleteLabel: "Crédit à compléter",
      complete: isCreditComplete(draft, fiscalYear),
    },
    {
      id: "amortissement",
      completeLabel: "Amortissements calculés",
      incompleteLabel: "Amortissements à compléter",
      complete: isAmortissementComplete(draft, fiscalYear),
    },
    {
      id: "revenus",
      completeLabel: "Revenus détectés",
      incompleteLabel: "Revenus à compléter",
      complete: isRevenusComplete(draft, fiscalYear),
    },
    {
      id: "charges",
      completeLabel: "Charges classées",
      incompleteLabel: "Charges à compléter",
      complete: isChargesComplete(draft, fiscalYear),
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

/**
 * A3 — pré-exploitation transportée telle quelle depuis F-012 et F-011, avec exactement l'agrégation de
 * `aggregateFiscalInputs()` (F-006, TRF-0030) : taxe foncière/assurances/copropriété prorata (F-012) + intérêts +
 * assurance emprunteur (F-011). Jamais recalculée ici : 0 tant que les assistants n'ont pas produit ces totaux.
 */
function totalPreExploitationCharges(draft: DeclarationDraft | undefined): number {
  const finite = (value: number | undefined) => (typeof value === "number" && Number.isFinite(value) ? value : 0);
  const { preExploitationFinancement } = aggregateFinancementTerms({ financementCharges: effectiveFinancementCharges(draft) });
  return Math.round((finite(draft?.chargesAssistant?.totalPreExploitation) + finite(preExploitationFinancement)) * 100) / 100;
}

export function buildFiscalSummary(
  draft: DeclarationDraft | undefined,
  properties: Property[],
  fiscalYear = new Date().getFullYear() - 1,
): FiscalSummary {
  const rentalIncome = totalRentalIncome(draft, fiscalYear);
  const preExploitationCharges = totalPreExploitationCharges(draft);
  // Point 3 (lot 2) — même lecture que F-006 (`aggregateFinancementTerms`) des deux autres charges déjà
  // persistées : frais d'acquisition déduits immédiatement (F-010) et charges de financement de l'exercice
  // (F-011). Aucun calcul : transport de totaux existants. Le repli reste une ESTIMATION (39C simplifié, sans
  // stocks de déficits/amortissements antérieurs, voir `amortInPreview`) — jamais un second moteur fiscal.
  const { fraisEnCharges, chargesFinancement } = aggregateFinancementTerms({
    financementCharges: effectiveFinancementCharges(draft),
    logementAmortissement: draft?.logementAmortissement,
  });
  // `detectedCharges` = même définition que `FiscalEngineOutput.totalCharges` (affichage exact) : charges F-012
  // + frais d'acquisition en charges + financement de l'exercice — la ligne affichée reste additive.
  const detectedCharges = round2(totalDetectedCharges(draft, properties) + fraisEnCharges + chargesFinancement);
  const calculatedAmortization = totalAnnualAmortization(draft);
  const resultatAvantAmort = rentalIncome - detectedCharges - preExploitationCharges;
  const amortInPreview = Math.min(calculatedAmortization, Math.max(0, resultatAvantAmort));
  const estimatedFiscalResult = resultatAvantAmort - amortInPreview;

  return {
    rentalIncome,
    detectedCharges,
    preExploitationCharges,
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
    const chargesPreExploitation = fiscalResult.chargesPreExploitation ?? 0;
    return {
      exact: true,
      rows: [
        { key: "recettes", label: "Revenus locatifs", value: fiscalResult.totalRecettes, format: formatCurrency },
        {
          key: "charges",
          label: "Charges déductibles de l'exercice",
          value: fiscalResult.totalCharges,
          format: formatCurrency,
        },
        // P0-3b — sans cette ligne, "Charges déductibles" (exercice seul)
        // suivie de l'amortissement puis du résultat final laissait croire
        // que Recettes − charges exercice reconstituait le résultat, alors
        // que fiscalResult.resultatAvantAmort (TRF-0030) déduit aussi ce
        // montant (A+B+C, transport pur depuis FiscalResult.charges.
        // chargesPreExploitation — jamais recalculé ici). Masquée à 0, comme
        // amortReporte ci-dessous.
        ...(chargesPreExploitation > 0
          ? [
              {
                key: "chargesPreExploitation",
                label: "Charges déductibles de pré-exploitation",
                value: chargesPreExploitation,
                format: formatCurrency,
              },
            ]
          : []),
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
      // A3 — même ligne, même libellé et même masquage à 0 que l'affichage exact
      // (voir plus haut) : l'estimation reste additive, comme le résultat final.
      ...(summary.preExploitationCharges > 0
        ? [
            {
              key: "chargesPreExploitation",
              label: "Charges déductibles de pré-exploitation",
              value: summary.preExploitationCharges,
              format: formatCurrency,
            },
          ]
        : []),
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
  const steps = buildDossierSteps(draft, fiscalYear);
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
