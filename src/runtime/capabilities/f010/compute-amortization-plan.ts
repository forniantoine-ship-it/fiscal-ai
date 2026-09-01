import type { Anomaly } from "../../contracts/Anomaly";
import { amortizeMobilier } from "./amortize-mobilier";
import { assemblePlan } from "./assemble-plan";
import { computePrixRevient } from "./compute-prix-revient";
import { decomposeBati } from "./decompose-bati";
import { prorataPremiereAnnee } from "./prorata-premiere-annee";
import type { AmortissementPlan, ComposantAmorti, TypeBien } from "./types";
import { validatePlan } from "./validate-plan";
import { ventilationTerrainBati } from "./ventilation-terrain-bati";

/**
 * Composition explicite TRF-0001 → TRF-0014 (ADR-003).
 * Orchestre les Transformations métier sans registre ni lookup par ID.
 */
export type ComputeAmortizationPlanInput = {
  prixAcquisition: number;
  mobilierInclus: boolean;
  montantMobilier?: number;
  fraisNotaire: number;
  fraisAgence?: number;
  fraisAgenceCharge?: "acquereur" | "vendeur";
  choixTraitementFrais: "integration" | "deduction";
  typeBien: TypeBien;
  ratioTerrain: number;
  mobilierMode?: "lot" | "detaille";
  /** = date_mise_en_service (F-009). */
  dateMiseEnService: string;
  exerciceFiscal: number;
  methodeProrata?: "jours" | "mois";
};

export type ComputeAmortizationPlanOutput = {
  prixRevient: number;
  montantMobilierIsole: number;
  valeurTerrain: number;
  valeurBati: number;
  baseAmortissableBati: number;
  prorataRatio: number;
  plan: AmortissementPlan;
  planValide: boolean;
  composants: ComposantAmorti[];
  anomalies: Anomaly[];
};

export function computeAmortizationPlan(
  input: ComputeAmortizationPlanInput,
): ComputeAmortizationPlanOutput {
  const anomalies: Anomaly[] = [];

  const prix = computePrixRevient({
    prixAcquisition: input.prixAcquisition,
    mobilierInclus: input.mobilierInclus,
    montantMobilier: input.montantMobilier,
    fraisNotaire: input.fraisNotaire,
    fraisAgence: input.fraisAgence,
    fraisAgenceCharge: input.fraisAgenceCharge,
    choixTraitementFrais: input.choixTraitementFrais,
  });
  anomalies.push(...prix.anomalies);

  const ventilation = ventilationTerrainBati({
    prixRevient: prix.prixRevient,
    montantMobilierIsole: prix.montantMobilierIsole,
    ratioTerrain: input.ratioTerrain,
  });
  anomalies.push(...ventilation.anomalies);

  const decompose = decomposeBati({
    baseAmortissableBati: ventilation.baseAmortissableBati,
    typeBien: input.typeBien,
  });
  anomalies.push(...decompose.anomalies);

  const mobilier = amortizeMobilier({
    montantMobilierTotal: prix.montantMobilierIsole,
    mode: input.mobilierMode ?? "lot",
  });
  anomalies.push(...mobilier.anomalies);

  const premiereAnnee = new Date(input.dateMiseEnService).getFullYear();

  const prorata = prorataPremiereAnnee({
    composantsBati: decompose.composants,
    composantsMobilier: mobilier.composants,
    dateDebutAmortissement: input.dateMiseEnService,
    methodeProrata: input.methodeProrata ?? "jours",
    exerciceFiscal: input.exerciceFiscal,
  });
  anomalies.push(...prorata.anomalies);

  const assemble = assemblePlan({
    composantsBati: decompose.composants,
    composantsMobilier: mobilier.composants,
    dotationsAnnee1: prorata.dotationsAnnee1,
    premiereAnnee,
    exerciceFiscal: input.exerciceFiscal,
  });
  anomalies.push(...assemble.anomalies);

  const validate = validatePlan({
    plan: assemble.plan,
    baseAmortissableBati: ventilation.baseAmortissableBati,
    montantMobilierTotal: prix.montantMobilierIsole,
  });
  anomalies.push(...validate.anomalies);

  const composants = [...decompose.composants, ...mobilier.composants];

  return {
    prixRevient: prix.prixRevient,
    montantMobilierIsole: prix.montantMobilierIsole,
    valeurTerrain: ventilation.valeurTerrain,
    valeurBati: ventilation.valeurBati,
    baseAmortissableBati: ventilation.baseAmortissableBati,
    prorataRatio: prorata.ratio,
    plan: assemble.plan,
    planValide: validate.planValide,
    composants,
    anomalies,
  };
}
