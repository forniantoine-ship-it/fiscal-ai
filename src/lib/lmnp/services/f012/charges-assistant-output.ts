import type { ChargesExerciceResult } from "@/runtime/capabilities/f012/types";
import type { FieldSource } from "@/runtime/contracts/FieldSource";
import type { ChargesAssistantOutput } from "../../types/domain";

/**
 * Sortie durable de F-012 (`draft.chargesAssistant`), construite à partir du résultat calculé — lue telle
 * quelle par F-006 puis la RFS. Extraite du panneau (aucun changement de comportement) pour que la
 * persistance de chaque champ, dont les ventilations par catégorie de A1 (`parCategoriePreExploitation`,
 * `parCategorieNonDeductible`), soit testable : un champ oublié ici n'atteindrait jamais la 2033-B.
 */
export function buildChargesAssistantOutput(
  charges: ChargesExerciceResult,
  fieldSources: Partial<Record<string, FieldSource>>,
  computedAt: string,
): ChargesAssistantOutput {
  return {
    exerciceFiscal: charges.exerciceFiscal,
    totalDeductible: charges.totalDeductible,
    totalNonDeductible: charges.totalNonDeductible,
    totalAmortissable: charges.totalAmortissable,
    totalPreExploitation: charges.totalPreExploitation,
    parCategoriePreExploitation: charges.parCategoriePreExploitation,
    parCategorieNonDeductible: charges.parCategorieNonDeductible,
    ...(charges.recouvrementAssuranceF011 ? { recouvrementAssuranceF011: charges.recouvrementAssuranceF011 } : {}),
    ...(charges.recouvrementFraisDossierF011 ? { recouvrementFraisDossierF011: charges.recouvrementFraisDossierF011 } : {}),
    parCategorie: charges.parCategorie,
    composantsNouveaux: charges.composantsNouveaux,
    fieldSources,
    computedAt,
  };
}
