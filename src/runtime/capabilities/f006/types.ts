/**
 * Types de domaine F-006 — Fiscal Engine (TRF-0030 → TRF-0032).
 */

import type { Anomaly } from "../../contracts/Anomaly";

/** Sous-ensemble des sorties assistants — évite la dépendance circulaire domain ↔ runtime. */
export type ActiviteFiscalInput = {
  siret?: string;
  dateMiseEnService?: string;
  activityType?: "LMNP" | "LMP";
};

export type RevenusFiscalInput = {
  exerciceFiscal: number;
  totalRecettes: number;
  loyersEncaisses?: number;
  recettesPlateforme?: number;
  indemnitesAssurance?: number;
  ajustementsJanDec?: number;
  /** NEXT-1 (REV-P0-03) — anomalies F-013 non résolues, lues par `validateFiscalInputs`. */
  anomalies?: Anomaly[];
};

export type ChargesFiscalInput = {
  exerciceFiscal: number;
  totalDeductible: number;
  totalPreExploitation: number;
  /**
   * Cycle 32 — charges comptabilisées mais fiscalement non déductibles
   * (ex. avance de trésorerie/fonds de roulement de copropriété), déjà
   * calculées et classifiées par F-012 (`ChargeDeductibilite: "non_deductible"`).
   * Transport pur : F-006 ne recalcule jamais cette valeur.
   */
  totalNonDeductible?: number;
  parCategorie?: Partial<Record<string, number>>;
  /**
   * A1 — ventilations par catégorie de `totalPreExploitation` / `totalNonDeductible`
   * (F-012, transport pur, jamais recalculées ici). Optionnelles : absentes des
   * dossiers persistés avant A1.
   */
  parCategoriePreExploitation?: Partial<Record<string, number>>;
  parCategorieNonDeductible?: Partial<Record<string, number>>;
  /**
   * Recouvrement F-011 / F-012 de l'assurance emprunteur (F-012, voir assurance-recouvrement.ts) : `reference` = assurance
   * de l'année établie par F-011 AU MOMENT du calcul ; `recouvert` neutralisé dans F-012 ; `reliquat` traité normalement.
   * Persisté pour DÉTECTER une péremption (F-011 modifié depuis) — jamais pour recalculer.
   */
  recouvrementAssuranceF011?: {
    reference: number;
    periodeCompatible: boolean;
    recouvert: number;
    reliquat: number;
  };
  /**
   * Recouvrement F-011 / F-012 des frais de dossier (enveloppe séparée) — même contrat de péremption.
   */
  recouvrementFraisDossierF011?: {
    reference: number;
    periodeCompatible: boolean;
    recouvert: number;
    reliquat: number;
  };
};

export type FinancementFiscalInput = {
  exerciceFiscal: number;
  /** Assurance emprunteur de l'exercice après mise en service (F-011) — lue par la garde de péremption du recouvrement. */
  totalAssurance?: number;
  totalChargesFinancementExercice: number;
  totalInteretsPreExploitation: number;
  /**
   * P2 — transport pur depuis ChargesFinancementExercice.totalAssurancePreExploitation
   * (F-011), jamais recalculé ici. Optionnel : 0 si l'assistant n'a pas encore
   * produit cette donnée (voir aggregate-inputs.ts).
   */
  totalAssurancePreExploitation?: number;
  /**
   * Σ `prets[].fraisDossierDeductibles` (F-011) — lu par la garde de péremption du recouvrement frais de dossier.
   * Absent des deps historiques = 0.
   */
  totalFraisDossierDeductibles?: number;
  /** NEXT-2 (F011-CREDIT-SILENT-LOAN-EXCLUSION) — prêts exclus faute de date, lus par `validateFiscalInputs`. */
  excludedLoanIds?: string[];
  /** Prêts F-011 (détail) — source de `totalFraisDossierDeductibles` si le total n'est pas encore exposé. */
  prets?: Array<{ fraisDossierDeductibles?: number }>;
};

export type AmortissementFiscalInput = {
  exerciceFiscal: number;
  totalDotations: number;
  status: "validated" | "contested";
};

export function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export type StockDeficit = {
  millesime: number;
  montant: number;
};

export type FiscalJournalEntry = {
  trf: string;
  label: string;
  value: number | string;
};

/** Entrées consommées — sorties directes des assistants F-009 à F-014. */
export type FiscalEngineInputs = {
  exerciceFiscal: number;
  activite: ActiviteFiscalInput;
  logementAmortissement?: {
    computedAt: string;
    /**
     * Lot 4 — millésime de confirmation F-010. Optionnel (legacy) ; lu uniquement
     * par `validateFiscalInputs` pour year-safety, jamais par l'agrégation /
     * le moteur (transport pur de `fraisEnCharges` uniquement).
     */
    exerciceFiscal?: number;
    /**
     * JUG-001 : frais d'acquisition en déduction immédiate (TRF-0001, F-010).
     * Transport pur — jamais recalculé ici. Optionnel : 0 si l'assistant n'a
     * pas encore produit cette donnée ou si les frais sont intégrés au prix
     * de revient (à ne jamais confondre avec ce cas).
     */
    fraisEnCharges?: number;
  };
  financementCharges?: FinancementFiscalInput;
  chargesAssistant?: ChargesFiscalInput;
  revenusAssistant?: RevenusFiscalInput;
  amortissementAssistant?: AmortissementFiscalInput;
  /** Stocks N-1 — vides en première année. */
  stockDeficitsAnterieurs?: StockDeficit[];
  stockAmortissementsReportes?: number;
  /** TRF-0027 — perte exceptionnelle composant sorti (0 si non applicable). */
  perteExceptionnelle?: number;
};

export type AggregatedFiscalData = {
  exerciceFiscal: number;
  totalRecettes: number;
  chargesExploitation: number;
  chargesFinancement: number;
  chargesPreExploitation: number;
  totalChargesDeductibles: number;
  /** Cycle 32 — transport pur depuis ChargesFiscalInput.totalNonDeductible (F-012), jamais recalculé. */
  totalNonDeductible: number;
  amortCalcule: number;
  perteExceptionnelle: number;
};

/** Sortie TRF-0030. */
export type ResultatAvantAmortissement = {
  resultatAvantAmort: number;
};

/** Sortie TRF-0031. */
export type ApplicationAmortissementStocks = {
  resultatFiscal: number;
  amortDeduct: number;
  amortReporte: number;
  amortReportesUtilises: number;
  deficitNouveau: number;
  deficitsImputes: number;
  stockDeficitsMisAJour: StockDeficit[];
  stockAmortissementsReportesMisAJour: number;
  deficitsExpires: StockDeficit[];
};

/** Objet FiscalResult unique — TRF-0032. */
export type FiscalResult = {
  exercice: number;
  recettes: {
    total: number;
    loyersEncaisses?: number;
    recettesPlateforme?: number;
    indemnitesAssurance?: number;
    ajustementsJanDec?: number;
  };
  charges: {
    totalDeductible: number;
    chargesExploitation: number;
    chargesFinancement: number;
    chargesPreExploitation: number;
    /**
     * P0-3a.3 (mini-audit read-only) — composante A seule de
     * `chargesPreExploitation` (= A + B + C, TRF-0025/TRF-0030), soit
     * `ChargesFiscalInput.totalPreExploitation` (F-012, charges d'exploitation
     * pré-mise-en-service — taxe foncière, assurances, honoraires, frais
     * bancaires, divers). Transport pur, jamais recalculé : n'affecte ni
     * `chargesPreExploitation` ni `resultatAvantAmort`/`resultatFiscal`.
     * N'inclut JAMAIS B (`totalInteretsPreExploitation`) ni C
     * (`totalAssurancePreExploitation`), qui restent des composantes F-011
     * exclusivement portées par `rfs.emprunts[]` (P0-3a.2). Optionnel — comme
     * `totalNonDeductible`/`totalAssurancePreExploitation` avant lui — pour ne
     * pas casser les reconstructions manuelles historiques de `FiscalResult`
     * (ex. `fiscalResultFromDraft()`).
     */
    chargesExploitationPreExploitation?: number;
    /**
     * Cycle 32 — audit 2033-B : charges comptabilisées mais fiscalement non
     * déductibles (F-012). Transport pur, jamais recalculé par F-006. Permet
     * de reconstituer le résultat comptable (distinct du résultat fiscal)
     * pour la projection Cerfa 2033-B, cases 264/270/310/312/314.
     */
    totalNonDeductible: number;
    detailParCategorie?: Partial<Record<string, number>>;
    /**
     * A1 — ventilation par catégorie de `chargesExploitationPreExploitation` (composante A,
     * F-012 `parCategoriePreExploitation`). Transport pur : n'entre dans aucune formule
     * F-006. Absent ⇒ ventilation inconnue (dossier antérieur à A1), jamais « aucune ».
     */
    detailPreExploitationParCategorie?: Partial<Record<string, number>>;
    /**
     * A1 — ventilation par catégorie de `totalNonDeductible` (F-012 `parCategorieNonDeductible`).
     * Transport pur. Absent ⇒ ventilation inconnue.
     */
    detailNonDeductibleParCategorie?: Partial<Record<string, number>>;
    /**
     * A1 — frais d'acquisition (F-010, JUG-001) déduits immédiatement : composante de
     * `chargesExploitation` (= `totalDeductible` F-012 + ce montant) qui n'appartient à
     * aucune catégorie F-012. Transport pur (`logementAmortissement.fraisEnCharges`),
     * exposé pour que la projection 2033-B puisse expliquer `chargesExploitation` sans
     * résiduel silencieux.
     */
    fraisAcquisitionEnCharges?: number;
  };
  resultatAvantAmort: number;
  amortCalcule: number;
  amortDeduct: number;
  /**
   * STOCK FINAL d'amortissements fiscalement non déduits (TRF-0031).
   * Inclut le stock d'ouverture net de consommation + le mouvement annuel.
   * Ne pas confondre avec `amortNonDeduitExercice` (mouvement annuel seul).
   */
  amortReporte: number;
  /**
   * MOUVEMENT ANNUEL — amortissements comptabilisés au titre de N mais non
   * déduits au titre de N : `round2(amortCalcule − amortDeduct)`.
   * Indépendant de `amortReportesUtilises` (consommation du stock historique).
   * Source de la case 2033-B 318. Distinct de `amortReporte` (stock final).
   */
  amortNonDeduitExercice: number;
  amortReportesUtilises: number;
  resultatFiscal: number;
  deficitNouveau: number;
  deficitsImputes: number;
  perteExceptionnelle: number;
  stocks: {
    deficits: StockDeficit[];
    amortissementsReportes: number;
    deficitsExpires: StockDeficit[];
  };
  trace: {
    ksArtifacts: string[];
    computedAt: string;
    journal: FiscalJournalEntry[];
  };
  status: "computed" | "blocked";
  anomalies: Anomaly[];
};

export type ValidateFiscalInputsOutput = {
  ready: boolean;
  anomalies: Anomaly[];
};

export type ComputeFiscalResultOutput = {
  result?: FiscalResult;
  anomalies: Anomaly[];
};
