import type { Anomaly } from "../../contracts/Anomaly";
import type { DepreciationOpeningAnchor, PlanLigne } from "./types";
import { round2 } from "./types";

/**
 * Continuation d'une ligne de plan depuis un cumul comptable d'ouverture
 * attesté (Lot 2A).
 *
 * B = base amortissable, C0 = cumul ouverture, DN = dotation normale :
 *   D  = min(max(DN, 0), B − C0)
 *   C1 = C0 + D
 *   V1 = B − C1
 *
 * `cumul > base` BLOQUE (jamais masqué par le plafonnement).
 */
export type ContinuePlanLineInput = {
  label: string;
  baseAmortissable: number;
  dureeAnnees: number;
  /** Dotation normale théorique de l'exercice (avant plafond VNC). */
  normalDotation: number;
  openingAnchor: DepreciationOpeningAnchor;
  /** Exercice effectivement calculé — doit égaler l'ancre. */
  exerciceFiscal: number;
  /** Identité explicite obligatoire pour une ligne ancrée. */
  id: string;
  propertyId?: string;
};

export type ContinuePlanLineResult =
  | { ok: true; ligne: PlanLigne }
  | { ok: false; anomalies: Anomaly[] };

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export function continuePlanLine(input: ContinuePlanLineInput): ContinuePlanLineResult {
  const anomalies: Anomaly[] = [];
  const {
    label,
    baseAmortissable: B,
    dureeAnnees,
    normalDotation: DN,
    openingAnchor,
    exerciceFiscal,
    id,
    propertyId,
  } = input;
  const C0 = openingAnchor.cumulComptableOuverture;

  if (!id || id.trim() === "") {
    anomalies.push({
      severity: "fatal",
      message: "Identité explicite requise pour une ligne ancrée (id manquant).",
      field: "id",
    });
  }

  if (!isFiniteNumber(B) || !isFiniteNumber(C0) || !isFiniteNumber(DN)) {
    anomalies.push({
      severity: "fatal",
      message: "Valeurs non finies (base, cumul d'ouverture ou dotation normale).",
      field: label,
    });
  }

  if (!Number.isInteger(exerciceFiscal) || !Number.isInteger(openingAnchor.exerciceFiscal)) {
    anomalies.push({
      severity: "fatal",
      message: "Exercice fiscal non entier.",
      field: "exerciceFiscal",
    });
  }

  if (
    isFiniteNumber(exerciceFiscal) &&
    isFiniteNumber(openingAnchor.exerciceFiscal) &&
    openingAnchor.exerciceFiscal !== exerciceFiscal
  ) {
    anomalies.push({
      severity: "fatal",
      message: `Ancre d'exercice ${openingAnchor.exerciceFiscal} incompatible avec l'exercice calculé ${exerciceFiscal}.`,
      field: "openingAnchor.exerciceFiscal",
    });
  }

  if (!isFiniteNumber(dureeAnnees) || dureeAnnees <= 0 || !Number.isInteger(dureeAnnees)) {
    anomalies.push({
      severity: "fatal",
      message: "Paramètres de plan inexploitables (durée).",
      field: "dureeAnnees",
    });
  }

  if (isFiniteNumber(B) && B < 0) {
    anomalies.push({
      severity: "fatal",
      message: "Base amortissable négative.",
      field: "baseAmortissable",
    });
  }

  if (isFiniteNumber(C0) && C0 < 0) {
    anomalies.push({
      severity: "fatal",
      message: "Cumul comptable d'ouverture négatif.",
      field: "cumulComptableOuverture",
    });
  }

  // Garde stricte : cumul > base BLOQUE — ne jamais masquer via min(DN, B−C0).
  if (isFiniteNumber(B) && isFiniteNumber(C0) && C0 > B) {
    anomalies.push({
      severity: "fatal",
      message: `Cumul d'ouverture (${C0}) supérieur à la base amortissable (${B}).`,
      field: "cumulComptableOuverture",
    });
  }

  if (anomalies.length > 0) {
    return { ok: false, anomalies };
  }

  const remaining = round2(B - C0);
  const D = round2(Math.min(Math.max(DN, 0), remaining));
  const C1 = round2(C0 + D);
  const V1 = round2(B - C1);

  const ligne: PlanLigne = {
    label,
    montant: round2(B),
    dureeAnnees,
    dotationExercice: D,
    amortissementsCumules: C1,
    vnc: Math.max(0, V1),
    id,
    ...(propertyId !== undefined ? { propertyId } : {}),
  };

  return { ok: true, ligne };
}
