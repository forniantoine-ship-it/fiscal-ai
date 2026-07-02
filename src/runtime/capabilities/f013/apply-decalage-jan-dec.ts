import type { Anomaly } from "../../contracts/Anomaly";
import { round2 } from "./types";

/**
 * SAV-028 — Ajustement des recettes pour décalage janvier/décembre (F-013).
 */
export type ApplyDecalageJanDecInput = {
  montantDeclare: number;
  loyerMensuel: number;
  /** Loyer de décembre N-1 encaissé en janvier N — recette de N. */
  janvierEncaisseDecPrecedent?: boolean;
  /** Loyer de décembre N encaissé en janvier N+1 — recette de N+1, pas N. */
  decembreEncaisseJanvierSuivant?: boolean;
};

export type ApplyDecalageJanDecOutput = {
  montantAjuste: number;
  ajustement: number;
  anomalies: Anomaly[];
};

export function applyDecalageJanDec(input: ApplyDecalageJanDecInput): ApplyDecalageJanDecOutput {
  const anomalies: Anomaly[] = [];
  let ajustement = 0;

  if (input.janvierEncaisseDecPrecedent) {
    ajustement = round2(ajustement + input.loyerMensuel);
  }

  if (input.decembreEncaisseJanvierSuivant) {
    ajustement = round2(ajustement - input.loyerMensuel);
  }

  const montantAjuste = round2(input.montantDeclare + ajustement);

  if (montantAjuste < 0) {
    anomalies.push({
      severity: "warning",
      message: "L'ajustement janvier/décembre produit un montant négatif — vérifiez vos saisies.",
      field: "ajustement_jan_dec",
    });
  }

  return { montantAjuste: Math.max(0, montantAjuste), ajustement, anomalies };
}
