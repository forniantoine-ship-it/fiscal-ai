/**
 * R2C.1 — contribution fiscale par bien + consolidation PURE (dormante : aucun appelant de production).
 *
 *   BienDraft[A], BienDraft[B] → adaptateur par bien (`buildFiscalEngineInputs`, le même que le mono)
 *     → PropertyFiscalContribution → validations locales (AVANT toute somme : une erreur de A n'est jamais masquée par B)
 *     → consolidation en centimes entiers → ConsolidatedFiscalInputs + ledger + raisons de blocage.
 *
 * Le bien est l'unité de calcul, l'activité l'unité déclarée : F-006 ne sera appelé qu'UNE fois, sur l'activité, à partir
 * de ces entrées (R2C.3). `ConsolidatedFiscalInputs` n'est volontairement PAS assignable à `FiscalEngineInputs` : il ne
 * porte aucune date de mise en service unique (une par bien), et n'est jamais persisté ni recopié dans un brouillon.
 *
 * Hors périmètre (non établi ou lots suivants) : allocation 39 C / TRF-0035, consommation des amortissements différés par
 * bien, charges communes (bloquantes tant que leur modèle n'existe pas), prêt partagé (bloquant), 2033-C mixte (R2C.2).
 */
import type { PersistedWorkspace } from "../store/persistence";
import type { DeclarationDraft } from "../types";
import type { Anomaly } from "@/runtime/contracts/Anomaly";
import type { PretFinancementExercice } from "@/runtime/capabilities/f011/types";
import type { AmortissementPlan } from "@/runtime/capabilities/f010/types";
import type { ComposantNouveau } from "@/runtime/capabilities/f012/types";
import type {
  AmortissementFiscalInput,
  ChargesFiscalInput,
  FinancementFiscalInput,
  FiscalEngineInputs,
  RevenusFiscalInput,
  StockDeficit,
} from "@/runtime/capabilities/f006/types";
import { validateFiscalInputs } from "@/runtime/capabilities/f006/validate-fiscal-inputs";
import { sumEuros } from "@/runtime/capabilities/f006/cents";
import { validateActiviteDates } from "@/runtime/capabilities/f009/validate-activite-dates";
import { isIsoCalendarDate } from "@/runtime/capabilities/f009/validate-service-date";
import { resolveCreditState, type CreditState } from "../services/declaration/credit-state";
import { resolveEmpruntsForRfs } from "../services/declaration/resolve-emprunts-for-rfs";
import { buildFiscalEngineInputs, draftAmortissementForGeneration } from "../services/declaration/generation-inputs";
import { resolveTaxeFonciereLegacyIntegrityGenerationBlock } from "../services/declaration/run-declaration-generation";
import { readBienDrafts, scopedBienView, type BienDraftFailure, type ChargesNatureReview } from "./bien-draft";
import { resolveDocumentScope } from "./property-scope";
import { loanKey } from "./property-keys";

// ---------------------------------------------------------------------------
// Contribution d'un bien
// ---------------------------------------------------------------------------

/** Acquisition du bien déjà traitée historiquement (reprise) ou dans le parcours natif — décidé PAR BIEN, jamais global. */
export type PropertyEntryMode = "native" | "takeover";

/** Position du bien pour les mouvements d'immobilisations (2033-C, R2C.2) — métadonnée par bien, jamais un booléen global. */
export type ImmobilisationMovement = "first_service_year" | "continuation" | "unknown";

/** Entrées F-006 propres au bien : celles du mono, SANS stocks (déficits, amortissements reportés = activité). */
export type PropertyEngineInputs = Omit<
  FiscalEngineInputs,
  "stockDeficitsAnterieurs" | "stockAmortissementsReportes" | "perteExceptionnelle"
>;

/** Objet fiscal TRANSITOIRE d'un bien — pas une copie de son BienDraft, jamais persisté. */
export type PropertyFiscalContribution = {
  readonly propertyId: string;
  readonly exerciceFiscal: number;
  readonly entryMode: PropertyEntryMode;
  readonly dateMiseEnService?: string;
  readonly immobilisationMovement: ImmobilisationMovement;
  readonly engine: PropertyEngineInputs;
  readonly creditState: CreditState;
  /** Prêts du bien (transport RFS futur) : identité = (propertyId, pretId), jamais `pretId` seul. */
  readonly emprunts: readonly PretFinancementExercice[];
  readonly creditDocumentId?: string;
  /** Inventaire brut du bien, transporté pour R2C.2 (2033-C) — aucun calcul ici. */
  readonly immobilisations: {
    readonly plan?: AmortissementPlan;
    readonly valeurTerrain?: number;
    readonly montantMobilier?: number;
    readonly composantsNouveaux?: readonly ComposantNouveau[];
  };
  readonly localChecks: {
    readonly taxeFonciereIntegrity?: Anomaly;
    readonly chargesNatureReview?: ChargesNatureReview;
  };
};

function propertyEngineInputs(inputs: FiscalEngineInputs): PropertyEngineInputs {
  const engine: Partial<FiscalEngineInputs> = { ...inputs };
  delete engine.stockDeficitsAnterieurs;
  delete engine.stockAmortissementsReportes;
  delete engine.perteExceptionnelle;
  return engine as PropertyEngineInputs;
}

function immobilisationMovementOf(entryMode: PropertyEntryMode, date: string | undefined, exercice: number): ImmobilisationMovement {
  if (entryMode === "takeover") return "continuation";
  if (!isIsoCalendarDate(date)) return "unknown";
  const year = Number(date!.slice(0, 4));
  if (year === exercice) return "first_service_year";
  return year < exercice ? "continuation" : "unknown";
}

/** Adaptateur pur : vue « exercice + bien » (ou brouillon mono) → contribution fiscale du bien. Aucune écriture. */
export function buildPropertyFiscalContribution(input: {
  propertyId: string;
  view: DeclarationDraft;
  fiscalYear: number;
  entryMode: PropertyEntryMode;
  chargesNatureReview?: ChargesNatureReview;
}): PropertyFiscalContribution {
  const { view, fiscalYear, entryMode } = input;
  const engine = propertyEngineInputs(
    buildFiscalEngineInputs({
      draft: view,
      fiscalYear,
      amortissementAssistant: draftAmortissementForGeneration(view),
      usesTakeoverHistory: entryMode === "takeover",
    }),
  );
  const taxeFonciereIntegrity = resolveTaxeFonciereLegacyIntegrityGenerationBlock(view);
  return {
    propertyId: input.propertyId,
    exerciceFiscal: fiscalYear,
    entryMode,
    ...(view.dateMiseEnService !== undefined ? { dateMiseEnService: view.dateMiseEnService } : {}),
    immobilisationMovement: immobilisationMovementOf(entryMode, view.dateMiseEnService, fiscalYear),
    engine,
    creditState: resolveCreditState(view).etat,
    emprunts: resolveEmpruntsForRfs(view) ?? [],
    ...(view.creditDocumentId !== undefined ? { creditDocumentId: view.creditDocumentId } : {}),
    immobilisations: {
      plan: view.logementAmortissement?.plan,
      valeurTerrain: view.logementAmortissement?.valeurTerrain,
      montantMobilier: view.logementAmortissement?.montantMobilier,
      composantsNouveaux: view.chargesAssistant?.composantsNouveaux,
    },
    localChecks: {
      ...(taxeFonciereIntegrity ? { taxeFonciereIntegrity } : {}),
      ...(input.chargesNatureReview ? { chargesNatureReview: input.chargesNatureReview } : {}),
    },
  };
}

// ---------------------------------------------------------------------------
// Validations locales (par bien, AVANT toute somme)
// ---------------------------------------------------------------------------

export type FiscalConsolidationBlockCode =
  | "no_property"
  | "duplicate_property"
  | "missing_bien"
  | "unattributed_documents"
  | "entry_mode_unknown"
  | "exercise_opening_not_attributable"
  | "exercise_mismatch"
  | "service_date_missing"
  | "service_date_before_activity_start"
  | "credit_state_unknown"
  | "credit_state_ambiguous"
  | "taxe_fonciere_integrity_unresolved"
  | "charges_nature_needs_review"
  | "property_input_invalid"
  | "non_finite_amount"
  | "common_charges_not_supported"
  | "duplicate_loan_key"
  | "unsupported_shared_loan"
  | BienDraftFailure;

export type FiscalConsolidationBlock = {
  code: FiscalConsolidationBlockCode;
  propertyId?: string;
  field?: string;
  message?: string;
};

/** Données de l'ACTIVITÉ, reçues une seule fois quel que soit le nombre de biens. */
export type ConsolidationActivityInput = {
  exerciceFiscal: number;
  activite: { siret?: string; activityType?: "LMNP" | "LMP" };
  dateDebutActivite?: string;
  stocksOuverture?: { deficits?: StockDeficit[]; amortissementsReportes?: number };
  /**
   * Seam : charges communes explicites. Leur modèle (catégories, pré-exploitation) n'est pas établi : toute charge
   * fournie bloque (`common_charges_not_supported`) — jamais ventilée, jamais déduite d'une charge de bien.
   */
  commonCharges?: readonly unknown[];
};

/** Montants additionnés par la consolidation (et `undefined` = absent, jamais 0 inventé). */
function summedAmounts(contribution: PropertyFiscalContribution): Array<number | undefined> {
  const { revenusAssistant: revenus, chargesAssistant: charges, financementCharges: financement } = contribution.engine;
  return [
    revenus?.totalRecettes, revenus?.loyersEncaisses, revenus?.recettesPlateforme, revenus?.indemnitesAssurance, revenus?.ajustementsJanDec,
    charges?.totalDeductible, charges?.totalPreExploitation, charges?.totalNonDeductible,
    ...Object.values(charges?.parCategorie ?? {}), ...Object.values(charges?.parCategoriePreExploitation ?? {}),
    ...Object.values(charges?.parCategorieNonDeductible ?? {}),
    financement?.totalChargesFinancementExercice, financement?.totalInteretsPreExploitation, financement?.totalAssurancePreExploitation,
    financement?.totalAssurance, financement?.totalFraisDossierDeductibles,
    contribution.engine.amortissementAssistant?.totalDotations, contribution.engine.logementAmortissement?.fraisEnCharges,
  ];
}

export function validatePropertyFiscalContribution(
  contribution: PropertyFiscalContribution,
  activity: ConsolidationActivityInput,
): FiscalConsolidationBlock[] {
  const propertyId = contribution.propertyId;
  const reasons: FiscalConsolidationBlock[] = [];
  if (contribution.exerciceFiscal !== activity.exerciceFiscal) reasons.push({ code: "exercise_mismatch", propertyId });

  const date = contribution.dateMiseEnService;
  if (!isIsoCalendarDate(date)) {
    reasons.push({ code: "service_date_missing", propertyId });
  } else if (
    isIsoCalendarDate(activity.dateDebutActivite) &&
    !validateActiviteDates({ dateDebutActivite: activity.dateDebutActivite!, dateMiseEnService: date! }).valid
  ) {
    reasons.push({ code: "service_date_before_activity_start", propertyId });
  }

  if (contribution.creditState === "INCONNU") reasons.push({ code: "credit_state_unknown", propertyId });
  if (contribution.creditState === "AMBIGU") reasons.push({ code: "credit_state_ambiguous", propertyId });
  if (contribution.localChecks.taxeFonciereIntegrity) reasons.push({ code: "taxe_fonciere_integrity_unresolved", propertyId });
  if (contribution.localChecks.chargesNatureReview) reasons.push({ code: "charges_nature_needs_review", propertyId });

  // Règles F-006 existantes, appliquées au SEUL bien (aucune duplication) : recettes, anomalies revenus, contrôle
  // F-011 ↔ F-012, prêts exclus, cohérence d'exercice, statut F-014. Validation uniquement : aucun calcul fiscal par bien.
  const local = validateFiscalInputs({ ...contribution.engine, exerciceFiscal: activity.exerciceFiscal });
  for (const anomaly of local.anomalies) {
    if (anomaly.severity !== "fatal" && anomaly.severity !== "error") continue;
    if (anomaly.field === "dateMiseEnService") continue; // déjà porté par `service_date_missing`
    reasons.push({ code: "property_input_invalid", propertyId, field: anomaly.field, message: anomaly.message });
  }

  if (summedAmounts(contribution).some((amount) => amount !== undefined && !Number.isFinite(amount))) {
    reasons.push({ code: "non_finite_amount", propertyId });
  }
  return reasons;
}

// ---------------------------------------------------------------------------
// Consolidation
// ---------------------------------------------------------------------------

/** Identité d'un prêt : (propertyId, pretId) — définie dans `property-keys` (module sans dépendance), ré-exportée ici. */
export { loanKey } from "./property-keys";

export type ConsolidatedLoan = { readonly key: string; readonly propertyId: string; readonly pret: PretFinancementExercice };

export type ConsolidatedFiscalInputs = {
  readonly kind: "consolidated_fiscal_inputs";
  readonly exerciceFiscal: number;
  readonly activity: ConsolidationActivityInput["activite"];
  /** Une date par bien — aucune date unique choisie pour l'activité (seam F-006 : R2C.3). */
  readonly datesMiseEnService: ReadonlyArray<{ propertyId: string; dateMiseEnService: string }>;
  readonly revenus: RevenusFiscalInput;
  readonly charges: Omit<ChargesFiscalInput, "recouvrementAssuranceF011" | "recouvrementFraisDossierF011">;
  readonly financement?: Omit<FinancementFiscalInput, "excludedLoanIds" | "prets">;
  readonly amortissement: AmortissementFiscalInput;
  /** JUG-001 — frais d'acquisition déduits, après neutralisation PAR BIEN en reprise. */
  readonly fraisAcquisitionEnCharges: number;
  readonly emprunts: readonly ConsolidatedLoan[];
  readonly stockDeficitsAnterieurs?: StockDeficit[];
  readonly stockAmortissementsReportes?: number;
};

/**
 * Contributions brutes par bien, pour la traçabilité (et, plus tard, TRF-0035). Ce ne sont PAS des bases 39 C : aucune
 * formule d'allocation n'est établie ici.
 */
export type ContributionLedgerEntry = {
  readonly propertyId: string;
  readonly entryMode: PropertyEntryMode;
  readonly immobilisationMovement: ImmobilisationMovement;
  readonly dateMiseEnService?: string;
  readonly recettes?: number;
  readonly chargesDeductibles?: number;
  readonly chargesPreExploitation?: number;
  readonly chargesNonDeductibles?: number;
  readonly chargesFinancementExercice?: number;
  readonly fraisAcquisitionEnCharges: number;
  readonly dotationsExercice?: number;
  readonly loans: readonly ConsolidatedLoan[];
  readonly revenusAnomalies: readonly Anomaly[];
};

export type ContributionLedger = {
  readonly entries: readonly ContributionLedgerEntry[];
  /** `mixed` : un bien en continuation et un autre en première année — supporté en 2033-C seulement à partir de R2C.2. */
  readonly immobilisationMovements: "uniform" | "mixed" | "unknown";
};

export type FiscalConsolidation =
  | { status: "ready"; inputs: ConsolidatedFiscalInputs; ledger: ContributionLedger; blockingReasons: [] }
  | { status: "blocked"; inputs?: undefined; ledger: ContributionLedger; blockingReasons: FiscalConsolidationBlock[] };

/** Somme d'un montant présent sur chaque bien. */
const sumAll = (values: readonly number[]) => sumEuros(values);

/** Montant lu par F-006 avec `?? 0` : absent partout → absent ; sinon absent = 0 (même sémantique que le moteur). */
function sumZeroDefault(values: ReadonlyArray<number | undefined>): number | undefined {
  return values.every((value) => value === undefined) ? undefined : sumEuros(values.map((value) => value ?? 0));
}

/** Détail transporté (jamais dans une formule) : connu seulement s'il l'est pour TOUS les biens — jamais partiel. */
function sumDetail(values: ReadonlyArray<number | undefined>): number | undefined {
  return values.every((value) => value !== undefined) ? sumEuros(values as number[]) : undefined;
}

function sumCategories(maps: ReadonlyArray<Partial<Record<string, number>> | undefined>): Partial<Record<string, number>> | undefined {
  if (!maps.every((map) => map !== undefined)) return undefined;
  const keys = [...new Set(maps.flatMap((map) => Object.keys(map!)))];
  return Object.fromEntries(keys.map((key) => [key, sumEuros(maps.map((map) => map![key] ?? 0))]));
}

function loansOf(contribution: PropertyFiscalContribution): ConsolidatedLoan[] {
  return contribution.emprunts.map((pret) => ({ key: loanKey(contribution.propertyId, pret.pretId), propertyId: contribution.propertyId, pret }));
}

function buildLedger(contributions: readonly PropertyFiscalContribution[]): ContributionLedger {
  const entries = contributions.map((contribution): ContributionLedgerEntry => {
    const { revenusAssistant: revenus, chargesAssistant: charges, financementCharges: financement } = contribution.engine;
    return {
      propertyId: contribution.propertyId,
      entryMode: contribution.entryMode,
      immobilisationMovement: contribution.immobilisationMovement,
      ...(contribution.dateMiseEnService !== undefined ? { dateMiseEnService: contribution.dateMiseEnService } : {}),
      recettes: revenus?.totalRecettes,
      chargesDeductibles: charges?.totalDeductible,
      chargesPreExploitation: charges?.totalPreExploitation,
      chargesNonDeductibles: charges?.totalNonDeductible,
      chargesFinancementExercice: financement?.totalChargesFinancementExercice,
      fraisAcquisitionEnCharges: contribution.engine.logementAmortissement?.fraisEnCharges ?? 0,
      dotationsExercice: contribution.engine.amortissementAssistant?.totalDotations,
      loans: loansOf(contribution),
      revenusAnomalies: revenus?.anomalies ?? [],
    };
  });
  const movements = new Set(contributions.map((contribution) => contribution.immobilisationMovement));
  return {
    entries,
    immobilisationMovements: movements.has("unknown") ? "unknown" : movements.size > 1 ? "mixed" : "uniform",
  };
}

function consolidatedInputs(
  activity: ConsolidationActivityInput,
  contributions: readonly PropertyFiscalContribution[],
): ConsolidatedFiscalInputs {
  const revenus = contributions.map((contribution) => contribution.engine.revenusAssistant!);
  const charges = contributions.map((contribution) => contribution.engine.chargesAssistant!);
  const financements = contributions
    .map((contribution) => contribution.engine.financementCharges)
    .filter((financement): financement is FinancementFiscalInput => financement !== undefined);
  const anomalies = revenus.flatMap((item) => item.anomalies ?? []);
  const exerciceFiscal = activity.exerciceFiscal;
  return {
    kind: "consolidated_fiscal_inputs",
    exerciceFiscal,
    activity: { ...activity.activite },
    datesMiseEnService: contributions.map((contribution) => ({ propertyId: contribution.propertyId, dateMiseEnService: contribution.dateMiseEnService! })),
    revenus: {
      exerciceFiscal,
      totalRecettes: sumAll(revenus.map((item) => item.totalRecettes)),
      loyersEncaisses: sumDetail(revenus.map((item) => item.loyersEncaisses)),
      recettesPlateforme: sumDetail(revenus.map((item) => item.recettesPlateforme)),
      indemnitesAssurance: sumDetail(revenus.map((item) => item.indemnitesAssurance)),
      ajustementsJanDec: sumDetail(revenus.map((item) => item.ajustementsJanDec)),
      ...(revenus.some((item) => item.anomalies !== undefined) ? { anomalies } : {}),
    },
    charges: {
      exerciceFiscal,
      totalDeductible: sumAll(charges.map((item) => item.totalDeductible)),
      totalPreExploitation: sumAll(charges.map((item) => item.totalPreExploitation)),
      totalNonDeductible: sumZeroDefault(charges.map((item) => item.totalNonDeductible)),
      parCategorie: sumCategories(charges.map((item) => item.parCategorie)),
      parCategoriePreExploitation: sumCategories(charges.map((item) => item.parCategoriePreExploitation)),
      parCategorieNonDeductible: sumCategories(charges.map((item) => item.parCategorieNonDeductible)),
    },
    ...(financements.length > 0
      ? {
          financement: {
            exerciceFiscal,
            totalChargesFinancementExercice: sumAll(financements.map((item) => item.totalChargesFinancementExercice)),
            totalInteretsPreExploitation: sumAll(financements.map((item) => item.totalInteretsPreExploitation)),
            totalAssurancePreExploitation: sumZeroDefault(financements.map((item) => item.totalAssurancePreExploitation)),
            totalAssurance: sumZeroDefault(financements.map((item) => item.totalAssurance)),
            totalFraisDossierDeductibles: sumZeroDefault(financements.map((item) => item.totalFraisDossierDeductibles)),
          },
        }
      : {}),
    amortissement: {
      exerciceFiscal,
      totalDotations: sumAll(contributions.map((contribution) => contribution.engine.amortissementAssistant!.totalDotations)),
      status: "validated",
    },
    fraisAcquisitionEnCharges: sumAll(contributions.map((contribution) => contribution.engine.logementAmortissement?.fraisEnCharges ?? 0)),
    emprunts: contributions.flatMap(loansOf),
    stockDeficitsAnterieurs: activity.stocksOuverture?.deficits,
    stockAmortissementsReportes: activity.stocksOuverture?.amortissementsReportes,
  };
}

/**
 * R2C.3b — adaptateur minimal : entrées consolidées de l'activité → `FiscalEngineInputs` du SEUL appel F-006 (jamais un
 * brouillon à plat synthétique). Pas de date de mise en service globale : une date PAR BIEN (`datesMiseEnService`), lue par
 * la validation F-006 uniquement. Les stocks (déficits, amortissements reportés) sont ceux de l'activité, transportés UNE
 * fois. Les garde-fous par bien (prêts exclus, péremption des recouvrements F-011/F-012) ont déjà été appliqués à chaque
 * bien avant la somme (`validatePropertyFiscalContribution`) : ils ne sont donc pas re-transportés ici.
 */
export function buildFiscalEngineInputsFromConsolidation(inputs: ConsolidatedFiscalInputs): FiscalEngineInputs {
  return {
    exerciceFiscal: inputs.exerciceFiscal,
    activite: {
      siret: inputs.activity.siret,
      datesMiseEnService: inputs.datesMiseEnService.map(({ propertyId, dateMiseEnService }) => ({ propertyId, date: dateMiseEnService })),
      activityType: inputs.activity.activityType,
    },
    logementAmortissement: { exerciceFiscal: inputs.exerciceFiscal, fraisEnCharges: inputs.fraisAcquisitionEnCharges },
    ...(inputs.financement ? { financementCharges: inputs.financement } : {}),
    chargesAssistant: inputs.charges,
    revenusAssistant: inputs.revenus,
    amortissementAssistant: inputs.amortissement,
    stockDeficitsAnterieurs: inputs.stockDeficitsAnterieurs,
    stockAmortissementsReportes: inputs.stockAmortissementsReportes,
  };
}

/** Consolidation PURE : aucune mutation, aucune persistance, aucune donnée inventée. Une activité → UNE entrée F-006 future. */
export function consolidateFiscalContributions(
  activity: ConsolidationActivityInput,
  contributions: readonly PropertyFiscalContribution[],
): FiscalConsolidation {
  const reasons: FiscalConsolidationBlock[] = [];
  if (contributions.length === 0) reasons.push({ code: "no_property" });
  const ids = contributions.map((contribution) => contribution.propertyId);
  for (const propertyId of new Set(ids.filter((id, index) => ids.indexOf(id) !== index))) {
    reasons.push({ code: "duplicate_property", propertyId });
  }
  if ((activity.commonCharges?.length ?? 0) > 0) reasons.push({ code: "common_charges_not_supported" });
  for (const contribution of contributions) reasons.push(...validatePropertyFiscalContribution(contribution, activity));

  const seenLoans = new Set<string>();
  for (const loan of contributions.flatMap(loansOf)) {
    if (seenLoans.has(loan.key)) reasons.push({ code: "duplicate_loan_key", propertyId: loan.propertyId, field: loan.pret.pretId });
    seenLoans.add(loan.key);
  }
  // Prêt explicitement partagé : le MÊME document de prêt déclaré sur plusieurs biens. Jamais d'heuristique, jamais
  // d'allocation : non supporté en V1.
  const byDocument = new Map<string, string[]>();
  for (const contribution of contributions) {
    if (contribution.creditDocumentId === undefined) continue;
    byDocument.set(contribution.creditDocumentId, [...(byDocument.get(contribution.creditDocumentId) ?? []), contribution.propertyId]);
  }
  for (const [documentId, owners] of byDocument) {
    if (owners.length > 1) reasons.push({ code: "unsupported_shared_loan", field: documentId });
  }

  const ledger = buildLedger(contributions);
  if (reasons.length > 0) return { status: "blocked", ledger, blockingReasons: reasons };
  return { status: "ready", inputs: consolidatedInputs(activity, contributions), ledger, blockingReasons: [] };
}

// ---------------------------------------------------------------------------
// Collecte depuis un workspace (portée de bien fail-closed)
// ---------------------------------------------------------------------------

type CollectWorkspace = Pick<PersistedWorkspace, "properties" | "fiscalYear" | "documents" | "declarationDraft">;

export type PropertyFiscalCollection =
  | { status: "collected"; activity: ConsolidationActivityInput; contributions: PropertyFiscalContribution[] }
  | { status: "blocked"; reasons: FiscalConsolidationBlock[] };

/**
 * Une contribution par bien de l'exercice, dans l'ordre de `fiscalYear.propertyIds`, chacune lue dans SA vue. Le mode
 * d'entrée de chaque bien est explicite (jamais supposé) ; une ouverture d'exercice (reprise, continuité) n'est pas
 * attribuable à un bien en multi-bien : bloqué.
 */
export function collectPropertyFiscalContributions(
  workspace: CollectWorkspace,
  options: { entryModes: Readonly<Record<string, PropertyEntryMode>> },
): PropertyFiscalCollection {
  const reasons: FiscalConsolidationBlock[] = [];
  if (workspace.documents.some((document) => resolveDocumentScope(workspace, document).kind === "unresolved")) {
    reasons.push({ code: "unattributed_documents" });
  }
  const root = workspace.declarationDraft ?? { completedSteps: [] };
  const read = readBienDrafts(workspace);
  const biens: Array<{ propertyId: string; view: DeclarationDraft; chargesNatureReview?: ChargesNatureReview }> = [];
  if (read.mode === "unresolved") {
    reasons.push({ code: read.reason });
  } else if (read.mode === "none") {
    reasons.push({ code: "no_property" });
  } else if (read.mode === "legacy_mono") {
    for (const propertyId of Object.keys(read.biens)) biens.push({ propertyId, view: root });
  } else {
    if (Object.keys(read.biens).length !== workspace.fiscalYear.propertyIds.length) reasons.push({ code: "missing_bien" });
    for (const propertyId of workspace.fiscalYear.propertyIds) {
      const bien = read.biens[propertyId];
      const view = bien ? scopedBienView(root, propertyId) : undefined;
      if (!bien || !view) {
        reasons.push({ code: "missing_bien", propertyId });
        continue;
      }
      biens.push({ propertyId, view, ...(bien.chargesNatureReview ? { chargesNatureReview: bien.chargesNatureReview } : {}) });
    }
  }
  if (biens.length === 0 && reasons.length === 0) reasons.push({ code: "no_property" });

  const fiscalYear = workspace.fiscalYear;
  if (biens.length > 1 && (fiscalYear.externalTakeoverOpening || fiscalYear.immobilisationsOuverture || fiscalYear.repriseHistoriqueEnContinuite)) {
    reasons.push({ code: "exercise_opening_not_attributable" });
  }
  for (const { propertyId } of biens) {
    if (options.entryModes[propertyId] === undefined) reasons.push({ code: "entry_mode_unknown", propertyId });
  }
  if (reasons.length > 0) return { status: "blocked", reasons };

  const stocks = fiscalYear.stocksOuverture?.stocks;
  return {
    status: "collected",
    activity: {
      exerciceFiscal: fiscalYear.year,
      activite: { siret: root.siret, activityType: root.activityType },
      ...(root.activityStartDate !== undefined ? { dateDebutActivite: root.activityStartDate } : {}),
      ...(stocks ? { stocksOuverture: { deficits: stocks.deficits, amortissementsReportes: stocks.amortissementsReportes } } : {}),
    },
    contributions: biens.map(({ propertyId, view, chargesNatureReview }) =>
      buildPropertyFiscalContribution({
        propertyId,
        view,
        fiscalYear: fiscalYear.year,
        entryMode: options.entryModes[propertyId]!,
        ...(chargesNatureReview ? { chargesNatureReview } : {}),
      })),
  };
}
