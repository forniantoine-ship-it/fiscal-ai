/**
 * Cycle 4 (F-011) §11 — corrige le trou identifié au Cycle 0 : le parcours
 * documentaire Crédit (Tunnel A) confirme un financement (`creditFinancing`)
 * sans jamais calculer `financementCharges`, alors que F-006 ne lit que ce
 * second champ. F-006 consomme déjà correctement `financementCharges`
 * (`aggregateFiscalInputs`) — le trou est dans l'écriture côté Tunnel A, pas
 * côté F-006, qui n'est donc pas modifié.
 *
 * Fonction pure : construit les `PretInput` du moteur F-011 déjà existant
 * (`computeFinancementExercice`) depuis les prêts confirmés par Tunnel A.
 * Mêmes règles de prudence que le pont documentaire (`credit-bridge.ts`) :
 * - jamais de date de mise en service inventée (précondition Cycle 1, appelant
 *   responsable de ne pas appeler cette fonction si elle est absente) ;
 * - assurance jamais classée bancaire/externe (Tunnel A ne demande pas cette
 *   distinction) — le montant confirmé n'est donc pas injecté dans le calcul,
 *   pour ne pas fabriquer une classification inconnue ;
 * - garantie/frais de dossier/IRA jamais déduits depuis `creditFinancing`
 *   (même raison que le pont documentaire — STOP Cycle 4 §7) ;
 * - un prêt sans date de première mensualité ne peut pas être daté dans le
 *   temps : il est exclu du calcul plutôt que daté arbitrairement.
 */
import { computeFinancementExercice } from "@/runtime";
import type { ComputeFinancementExerciceInput, PretInput, TypePret } from "@/runtime";
import type { CreditFinancingData } from "@/lib/lmnp/types";
import type { FinancementChargesOutput } from "@/lib/lmnp/types/domain";

function inferTypePretFromFreeText(loanType: string | undefined): TypePret {
  const normalized = loanType?.toLowerCase() ?? "";
  if (/in\s*[\s-]?fine/.test(normalized)) return "in_fine";
  // Amortissable est le cas nominal du KS (F-011) — défaut assumé, jamais
  // "in fine" par défaut (un in fine mal identifié comme amortissable
  // sous-estime les intérêts déductibles ; l'inverse les surestimerait).
  return "amortissable";
}

export type MapCreditFinancingParams = {
  financing: CreditFinancingData;
  exerciceFiscal: number;
  dateMiseEnService: string;
  prixRevient?: number;
};

export type MapCreditFinancingResult = {
  financementCharges: FinancementChargesOutput;
  /** Prêts exclus du calcul faute de date de première mensualité connue. */
  excludedLoanIds: string[];
};

/**
 * Convertit un `CreditFinancingData` confirmé (Tunnel A) en `FinancementChargesOutput`
 * — la forme exacte que F-011 écrit et que F-006 consomme. À appeler
 * uniquement quand `dateMiseEnService` est connue (précondition Cycle 1) ;
 * l'appelant décide quoi faire si elle est absente (aujourd'hui : ne pas
 * appeler cette fonction, `financementCharges` reste absent comme avant).
 */
export function mapCreditFinancingToFinancementCharges(
  params: MapCreditFinancingParams,
): MapCreditFinancingResult {
  const excludedLoanIds: string[] = [];

  const prets: PretInput[] = params.financing.loans
    .filter((loan) => {
      const hasDate = Boolean(loan.firstPaymentDate?.trim());
      if (!hasDate) excludedLoanIds.push(loan.id);
      return hasDate;
    })
    .map((loan) => ({
      pretId: loan.id,
      typePret: inferTypePretFromFreeText(loan.loanType),
      capitalInitial: loan.borrowedAmount,
      tauxNominal: loan.rate / 100,
      dureeMois: loan.durationMonths,
      datePremiereMensualite: loan.firstPaymentDate,
      // assuranceType, fraisDossier, garantieDeductible, iraDeductible,
      // anneeSouscription : volontairement absents (voir doc-comment ci-dessus).
    }));

  const input: ComputeFinancementExerciceInput = {
    exerciceFiscal: params.exerciceFiscal,
    dateMiseEnService: params.dateMiseEnService,
    prixRevient: params.prixRevient,
    prets,
  };

  const computed = computeFinancementExercice(input);
  const now = new Date().toISOString();

  return {
    financementCharges: {
      exerciceFiscal: computed.charges.exerciceFiscal,
      totalInteretsEmprunt: computed.charges.totalInteretsEmprunt,
      totalInteretsPreExploitation: computed.charges.totalInteretsPreExploitation,
      totalAssurance: computed.charges.totalAssurance,
      totalCapitalRembourse: computed.charges.totalCapitalRembourse,
      totalChargesFinancementExercice: computed.charges.totalChargesFinancementExercice,
      prets: computed.charges.prets,
      fieldSources: {},
      computedAt: now,
    },
    excludedLoanIds,
  };
}
