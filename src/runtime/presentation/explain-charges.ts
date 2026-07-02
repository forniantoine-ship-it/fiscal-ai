import type { ChargesExerciceResult } from "../capabilities/f012/types";

/**
 * Couche présentation — synthèse F-012 (Explanation Engine).
 */
export type ExplainChargesInput = {
  charges: ChargesExerciceResult;
};

export type ExplainChargesOutput = {
  explanation: string;
  immobilisationNotes: string[];
};

function fmtEur(value: number): string {
  return `${Math.round(value).toLocaleString("fr-FR")} €`;
}

export function explainCharges(input: ExplainChargesInput): ExplainChargesOutput {
  const { charges } = input;
  const immobilisationNotes: string[] = [];

  const detailParts: string[] = [];
  if (charges.parCategorie.taxe_fonciere) {
    detailParts.push(`${fmtEur(charges.parCategorie.taxe_fonciere)} de taxes`);
  }
  if (charges.parCategorie.assurance_pno || charges.parCategorie.assurance_gli) {
    detailParts.push(
      `${fmtEur(round(charges.parCategorie.assurance_pno) + round(charges.parCategorie.assurance_gli))} d'assurances`,
    );
  }
  if (charges.parCategorie.honoraires_gestion) {
    detailParts.push(`${fmtEur(charges.parCategorie.honoraires_gestion)} de gestion`);
  }
  if (charges.parCategorie.copropriete) {
    detailParts.push(`${fmtEur(charges.parCategorie.copropriete)} de charges copropriété`);
  }
  if (charges.parCategorie.travaux) {
    detailParts.push(`${fmtEur(charges.parCategorie.travaux)} de réparations déductibles`);
  }

  const detail = detailParts.length ? ` Détail : ${detailParts.join(", ")}.` : "";
  const lines = [
    `Vos charges déductibles pour ${charges.exerciceFiscal} s'élèvent à ${fmtEur(charges.totalDeductible)}.${detail}`,
  ];

  if (charges.totalPreExploitation > 0) {
    lines.push(
      `${fmtEur(charges.totalPreExploitation)} correspondent à la période avant votre mise en location ` +
        "et ne sont pas déductibles cette année.",
    );
  }

  if (charges.totalNonDeductible > 0) {
    lines.push(
      `${fmtEur(charges.totalNonDeductible)} de charges ont été identifiées comme non déductibles ` +
        "(ex. fonds de travaux ALUR).",
    );
  }

  for (const composant of charges.composantsNouveaux) {
    const note =
      `Votre « ${composant.label} » a été qualifiée comme une amélioration. ` +
      `Elle sera amortie sur ${composant.dureeAnnees} ans pour ${fmtEur(composant.dotationAnnuelle)}/an. ` +
      "Ce n'est pas une mauvaise nouvelle — c'est de la déductibilité étalée.";
    immobilisationNotes.push(note);
  }

  if (immobilisationNotes.length) {
    lines.push(immobilisationNotes.join("\n\n"));
  }

  return {
    explanation: lines.join("\n\n"),
    immobilisationNotes,
  };
}

function round(value: number | undefined): number {
  return value ?? 0;
}
