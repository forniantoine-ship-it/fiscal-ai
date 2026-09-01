import type { NatureIntervention } from "./types";
import { round2 } from "./types";

export type TravauxQualificationChoix =
  | "reparation_identique"
  | "amelioration"
  | "mixte"
  | "incertain";

/**
 * TRF-0026 — Qualification d'un travail.
 * Paramètre JUG-008 ; fonde AX-013, AX-014 ; requiert SAV-022, SAV-025, SAV-015.
 */
export type QualifyTravailInput = {
  description: string;
  montant: number;
  natureIntervention: NatureIntervention;
  /** Seuil tolérance SAV-015 (€ HT) — utilisé uniquement en cas d'ambiguïté. */
  seuilTolerance?: number;
};

export type QualifyTravailOutput = {
  qualification: "charge" | "immobilisation";
  destinationFlux: "charges" | "amortissements";
  natureTravail: string;
  regleAppliquee: string;
};

const SEUIL_SAV_015 = 500;

/**
 * Arbre JUG-008 simplifié : la nature d'intervention est collectée par l'Assistant
 * (guidance contextuelle) puis appliquée ici. La nature prime sur le montant (SAV-025).
 */
export function qualifyTravail(input: QualifyTravailInput): QualifyTravailOutput {
  const seuil = input.seuilTolerance ?? SEUIL_SAV_015;

  switch (input.natureIntervention) {
    case "entretien":
      return {
        qualification: "charge",
        destinationFlux: "charges",
        natureTravail: input.description,
        regleAppliquee: "AX-013 — entretien/réparation déductible en charge",
      };
    case "amélioration":
      return {
        qualification: "immobilisation",
        destinationFlux: "amortissements",
        natureTravail: input.description,
        regleAppliquee: "AX-014 — amélioration à amortir",
      };
    case "construction":
      return {
        qualification: "immobilisation",
        destinationFlux: "amortissements",
        natureTravail: input.description,
        regleAppliquee: "AX-014 — construction/agrandissement à amortir",
      };
    case "renouvellement":
      return {
        qualification: "immobilisation",
        destinationFlux: "amortissements",
        natureTravail: input.description,
        regleAppliquee: "SAV-023 — renouvellement de composant à immobiliser",
      };
    default: {
      if (input.montant < seuil) {
        return {
          qualification: "charge",
          destinationFlux: "charges",
          natureTravail: input.description,
          regleAppliquee: `SAV-015 — tolérance ${seuil} € pour cas ambigu`,
        };
      }
      return {
        qualification: "immobilisation",
        destinationFlux: "amortissements",
        natureTravail: input.description,
        regleAppliquee: "JUG-008 — immobilisation par prudence (montant ≥ seuil)",
      };
    }
  }
}

export function mapChoixToNature(choix: TravauxQualificationChoix): NatureIntervention | "mixte" | null {
  switch (choix) {
    case "reparation_identique":
      return "entretien";
    case "amelioration":
      return "amélioration";
    case "mixte":
      return "mixte";
    case "incertain":
      return null;
    default:
      return null;
  }
}

export function splitMixteTravaux(
  montantTotal: number,
  montantReparation: number,
): { charge: number; immobilisation: number } {
  const charge = round2(Math.min(montantReparation, montantTotal));
  const immobilisation = round2(Math.max(0, montantTotal - charge));
  return { charge, immobilisation };
}
