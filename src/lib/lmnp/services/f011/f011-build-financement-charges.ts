import type { ChargesFinancementExercice, F011LoanDraft, FieldSource } from "@/runtime";
import type { FinancementChargesOutput, LoanProfile } from "@/lib/lmnp/types/domain";

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

/**
 * Prêt F-011 confirmé → `LoanProfile` canonique de `creditFinancing.loans[]`. Extraite du panneau (mêmes champs, même
 * ordre) pour être testable sans React : transport pur des valeurs déjà résolues, jamais recalculées.
 */
export function buildCreditFinancingLoanFromF011(
  loan: F011LoanDraft,
  index: number,
  remainingCapital: number,
): LoanProfile {
  return {
    id: loan.pretId,
    bank: `Prêt ${index + 1}`,
    loanType: loan.typePret,
    borrowedAmount: loan.capitalInitial,
    rate: loan.tauxNominal * 100,
    durationMonths: loan.dureeMois,
    monthlyPayment: 0,
    insurance: loan.assuranceAnnuelle ?? 0,
    ...(loan.assuranceType ? { assuranceType: loan.assuranceType } : {}),
    ...(loan.capitalInitialOffre !== undefined ? { capitalInitialOffre: loan.capitalInitialOffre } : {}),
    fees: 0,
    // F011 fees/guarantee V1 fix — transport pur des mêmes valeurs déjà résolues et utilisées pour
    // `financementCharges` (assistant.ts:computeForLoans), vers le `creditFinancing` canonique. Sans ceci, une
    // reconfirmation ultérieure côté Tunnel A (`CreditDocumentStep.tsx`, qui recalcule toujours `financementCharges`
    // depuis `creditFinancing`) écrasait silencieusement une déduction correcte par 0 — le fait doit vivre dans un
    // seul champ canonique, jamais recalculé différemment par canal.
    loanApplicationFees: loan.fraisDossier,
    loanGuaranteeFees: loan.typeGarantie === "caution" ? loan.commissionCaution : undefined,
    souscritCetExercice: loan.souscritCetExercice,
    startDate: loan.datePremiereMensualite,
    firstPaymentDate: loan.datePremiereMensualite,
    remainingCapital,
    // Provenance par champ figée à `confirm_loan` : elle voyage avec le prêt, jamais indexée par identifiant.
    ...(loan.provenance ? { provenance: loan.provenance } : {}),
  };
}
