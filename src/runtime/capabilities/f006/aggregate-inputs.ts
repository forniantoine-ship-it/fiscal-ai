import type { Anomaly } from "../../contracts/Anomaly";
import type { AggregatedFiscalData, FiscalEngineInputs } from "./types";
import { round2 } from "./types";

/**
 * Agrège les sorties F-011 et F-012 sans recalculer leurs transformations internes.
 * TRF-0020 (charges) + TRF-0016 (financement) → entrées TRF-0030.
 */
export function aggregateFiscalInputs(
  input: FiscalEngineInputs,
): { data?: AggregatedFiscalData; anomalies: Anomaly[] } {
  const anomalies: Anomaly[] = [];

  if (!input.revenusAssistant || !input.chargesAssistant || !input.amortissementAssistant) {
    return { anomalies };
  }

  // F-010 (TRF-0001, JUG-001) : frais d'acquisition en déduction immédiate,
  // transportés une seule fois jusqu'ici — jamais dupliqués dans F-012, jamais
  // confondus avec les frais intégrés au prix de revient (fraisEnCharges = 0
  // dans ce cas).
  const chargesExploitation = round2(
    input.chargesAssistant.totalDeductible + (input.logementAmortissement?.fraisEnCharges ?? 0),
  );
  // Cycle 32 — transport pur depuis F-012 (ChargesAssistantOutput.totalNonDeductible),
  // jamais recalculé ici. 0 si l'assistant n'a pas encore produit cette donnée.
  const totalNonDeductible = round2(input.chargesAssistant.totalNonDeductible ?? 0);
  const chargesFinancement = round2(input.financementCharges?.totalChargesFinancementExercice ?? 0);
  const chargesPreExploitation = round2(
    input.chargesAssistant.totalPreExploitation +
      (input.financementCharges?.totalInteretsPreExploitation ?? 0) +
      // P2 — transport pur depuis FinancementFiscalInput.totalAssurancePreExploitation
      // (F-011), jamais recalculé ici. Symétrique au terme intérêts ci-dessus.
      (input.financementCharges?.totalAssurancePreExploitation ?? 0),
  );

  const totalChargesDeductibles = round2(chargesExploitation + chargesFinancement);

  if (
    input.financementCharges &&
    input.financementCharges.exerciceFiscal !== input.exerciceFiscal
  ) {
    anomalies.push({
      severity: "error",
      message: "Exercice fiscal du financement incohérent avec le dossier.",
      field: "financementCharges.exerciceFiscal",
    });
  }

  if (input.chargesAssistant.exerciceFiscal !== input.exerciceFiscal) {
    anomalies.push({
      severity: "error",
      message: "Exercice fiscal des charges incohérent avec le dossier.",
      field: "chargesAssistant.exerciceFiscal",
    });
  }

  return {
    data: {
      exerciceFiscal: input.exerciceFiscal,
      totalRecettes: round2(input.revenusAssistant.totalRecettes),
      chargesExploitation,
      chargesFinancement,
      chargesPreExploitation,
      totalChargesDeductibles,
      totalNonDeductible,
      amortCalcule: round2(input.amortissementAssistant.totalDotations),
      perteExceptionnelle: round2(input.perteExceptionnelle ?? 0),
    },
    anomalies,
  };
}
