/**
 * R1 — rattachement de l'échéancier documentaire à un prêt, partagé par les deux canaux (Tunnel A
 * `CreditDocumentStep` et assistant F-011) pour qu'ils appliquent le même contrat.
 *
 * `CreditFinancingData.installments` est UNE liste, sans identifiant de prêt (BKS-003 — identité du
 * prêt). Elle n'est attribuable sans deviner que si le financement ne compte qu'un prêt. Avec
 * plusieurs prêts, aucun ne la reçoit (ni le premier, ni tous) : `non_exploitable`, bloquant.
 */
import { resolveDocumentaryEcheances, type DocumentaryEcheancesResolution, type F011LoanDraft } from "@/runtime";
import type { CreditFinancingData, LoanInstallment } from "@/lib/lmnp/types";

export function resolveCreditFinancingLoanEcheances(
  financing: Pick<CreditFinancingData, "loans" | "installments">,
  loan: Pick<CreditFinancingData["loans"][number], "firstPaymentDate" | "assuranceType">,
  exerciceFiscal: number,
): DocumentaryEcheancesResolution {
  const rows = financing.installments ?? [];
  if (rows.length === 0) return { status: "absent" };
  if (financing.loans.length !== 1) {
    return { status: "non_exploitable", reason: "échéancier non attribuable : un seul tableau pour plusieurs prêts" };
  }
  return resolveDocumentaryEcheances({
    rows,
    exerciceFiscal,
    datePremiereMensualite: loan.firstPaymentDate,
    assuranceExterneDeclaree: loan.assuranceType === "externe",
  });
}

/**
 * Assistant F-011 → `creditFinancing.installments` canonique : l'échéancier importé pour un prêt est
 * transporté, jamais effacé (`[]` codé en dur faisait reconstruire silencieusement toute reconfirmation
 * Tunnel A). Plusieurs prêts avec tableau(x) : la liste reste présente et devient non attribuable —
 * bloquante plutôt qu'oubliée.
 */
export function documentaryInstallmentsForCreditFinancing(
  loans: readonly Pick<F011LoanDraft, "echeancesDocument">[],
): LoanInstallment[] {
  return loans.flatMap((loan) => loan.echeancesDocument ?? []);
}
