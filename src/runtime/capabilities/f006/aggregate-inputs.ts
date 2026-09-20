import type { Anomaly } from "../../contracts/Anomaly";
import type { AggregatedFiscalData, FiscalEngineInputs } from "./types";
import { round2 } from "./types";

/**
 * Termes « financement » et « frais d'acquisition en charges » de l'agrégation TRF-0030 — extraits pour être
 * partagés à l'identique avec le repli d'estimation avant génération (`buildFiscalSummary`), qui ne doit
 * jamais réimplémenter cette lecture : transport pur de totaux déjà calculés par F-011 / F-010.
 */
export function aggregateFinancementTerms(input: {
  financementCharges?: FiscalEngineInputs["financementCharges"];
  logementAmortissement?: FiscalEngineInputs["logementAmortissement"];
}): {
  /** F-010 (TRF-0001, JUG-001) : frais d'acquisition déduits immédiatement — composante de `chargesExploitation`. */
  fraisEnCharges: number;
  /** F-011 : charges de financement de l'exercice (intérêts, IRA, assurance, frais de dossier, garantie). */
  chargesFinancement: number;
  /** F-011 : intérêts (B) + assurance emprunteur (C) de pré-exploitation. */
  preExploitationFinancement: number;
} {
  return {
    fraisEnCharges: input.logementAmortissement?.fraisEnCharges ?? 0,
    chargesFinancement: round2(input.financementCharges?.totalChargesFinancementExercice ?? 0),
    preExploitationFinancement: round2(
      (input.financementCharges?.totalInteretsPreExploitation ?? 0) +
        // P2 — transport pur depuis FinancementFiscalInput.totalAssurancePreExploitation (F-011).
        (input.financementCharges?.totalAssurancePreExploitation ?? 0),
    ),
  };
}

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
  const financementTerms = aggregateFinancementTerms(input);
  const chargesExploitation = round2(input.chargesAssistant.totalDeductible + financementTerms.fraisEnCharges);
  // Cycle 32 — transport pur depuis F-012 (ChargesAssistantOutput.totalNonDeductible),
  // jamais recalculé ici. 0 si l'assistant n'a pas encore produit cette donnée.
  const totalNonDeductible = round2(input.chargesAssistant.totalNonDeductible ?? 0);
  const chargesFinancement = financementTerms.chargesFinancement;
  const chargesPreExploitation = round2(input.chargesAssistant.totalPreExploitation + financementTerms.preExploitationFinancement);

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
