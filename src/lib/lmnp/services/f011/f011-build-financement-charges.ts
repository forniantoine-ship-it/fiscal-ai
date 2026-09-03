import type { ChargesFinancementExercice, FieldSource } from "@/runtime";
import type { FinancementChargesOutput } from "@/lib/lmnp/types/domain";

/**
 * P0-A — reconstruction de `financementCharges` extraite en fonction pure,
 * indépendante du composant (pas d'import supabase/React), testable en
 * isolation. Transporte `totalAssurancePreExploitation` (déjà calculé par
 * computeFinancementExercice, F-011), auparavant perdu à cette frontière.
 */
export function buildFinancementCharges(
  charges: ChargesFinancementExercice,
  fieldSources: Partial<Record<string, FieldSource>>,
  computedAt: string,
): FinancementChargesOutput {
  return {
    exerciceFiscal: charges.exerciceFiscal,
    totalInteretsEmprunt: charges.totalInteretsEmprunt,
    totalInteretsPreExploitation: charges.totalInteretsPreExploitation,
    totalAssurance: charges.totalAssurance,
    totalAssurancePreExploitation: charges.totalAssurancePreExploitation,
    totalCapitalRembourse: charges.totalCapitalRembourse,
    totalChargesFinancementExercice: charges.totalChargesFinancementExercice,
    prets: charges.prets,
    fieldSources,
    computedAt,
  };
}
