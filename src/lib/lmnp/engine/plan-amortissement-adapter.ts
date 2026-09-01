/**
 * LMNP Business Engine — F-014 Input Contract Adapter
 *
 * Reformats the existing Calculation Engine output (BusinessAsset[] +
 * buildAmortizationSchedule / getAnnualAmortizationForYear) into the
 * PlanAmortissement contract expected by F-014 (Vault: 03 - Produit/Features/
 * F-014 — Assistant Amortissements.md, section 7).
 *
 * This file performs NO fiscal calculation of its own. It only reshapes
 * values already produced by business-asset-engine.ts.
 */

import type { BusinessAsset } from "./business-engine.types";
import {
  buildAmortizationSchedule,
  getAnnualAmortizationForYear,
  CATEGORY_LABELS_FR,
} from "./business-asset-engine";

export interface LignePlan {
  annee: number;
  dotation: number;
  cumul_amortissements: number;
  valeur_nette_comptable: number;
}

export interface ComposantAmortissement {
  id: string;
  nom_courant: string;
  nom_technique: string;
  base_amortissable: number;
  duree_ans: number;
  dotation_annuelle_pleine: number;
  dotation_exercice: number;
  est_proratisee: boolean;
  ks_artifacts: string[];
  plan_pluriannuel: LignePlan[];
}

export interface PlanAmortissement {
  exercice: number;
  premiere_annee: boolean;
  mois_exploitation: number | null;
  total_dotations_exercice: number;
  composants: ComposantAmortissement[];
  nouveaux_elements: ComposantAmortissement[];
  plan_validé_precedemment: boolean;
  annee_validation_initiale: number | null;
}

function toComposantAmortissement(
  asset: BusinessAsset,
  fiscalYear: number,
): ComposantAmortissement {
  const schedule = buildAmortizationSchedule(asset);

  let cumul = 0;
  const plan_pluriannuel: LignePlan[] = schedule.rows.map((row) => {
    cumul += row.annualAmortization;
    return {
      annee: row.year,
      dotation: row.annualAmortization,
      cumul_amortissements: cumul,
      valeur_nette_comptable: row.closingVNC,
    };
  });

  return {
    id: asset.id,
    nom_courant: asset.label,
    nom_technique: CATEGORY_LABELS_FR[asset.category],
    base_amortissable: asset.amount,
    duree_ans: asset.amortizationYears,
    dotation_annuelle_pleine: schedule.annualAmortization,
    dotation_exercice: getAnnualAmortizationForYear(asset, fiscalYear),
    // Le moteur actuel (buildAmortizationSchedule) ne calcule pas de prorata
    // mensuel — cf. signal transmis avec cette implémentation.
    est_proratisee: false,
    ks_artifacts: ["TRF-0006"],
    plan_pluriannuel,
  };
}

/**
 * Builds the F-014 Input Contract from confirmed, immobilized BusinessAssets.
 * Wraps the existing engine — no new fiscal logic.
 */
export function buildPlanAmortissement(
  assets: BusinessAsset[],
  fiscalYear: number,
): PlanAmortissement {
  const immobilized = assets.filter((a) => a.fiscalTreatment === "immobilisation");
  const composants = immobilized.map((asset) => toComposantAmortissement(asset, fiscalYear));

  const startYears = immobilized.map((a) => new Date(a.amortizationStartDate).getFullYear());
  const premiere_annee = startYears.length > 0 && Math.min(...startYears) === fiscalYear;

  const total_dotations_exercice = composants.reduce((sum, c) => sum + c.dotation_exercice, 0);

  return {
    exercice: fiscalYear,
    premiere_annee,
    // Non calculé — cf. est_proratisee ci-dessus.
    mois_exploitation: null,
    total_dotations_exercice,
    composants,
    // Aucune source de suivi de version de plan n'existe encore (F-012 →
    // F-014). Laissé vide par défaut — cf. signal transmis.
    nouveaux_elements: [],
    plan_validé_precedemment: false,
    annee_validation_initiale: null,
  };
}
