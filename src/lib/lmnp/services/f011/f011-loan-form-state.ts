import type { F011LoanDraft } from "@/runtime";

/**
 * Correctif Cycle 10 (F-011) — le formulaire manuel capital/taux/durée/date
 * du panel (`useState` locaux, jamais dérivés de `pendingLoan` au rendu)
 * réaffichait silencieusement les valeurs du prêt précédent à l'entrée d'un
 * second prêt manuel vide. Cause : le seul point de mise à jour de ces
 * champs (`seedLoanFormFrom`, appelé à chaque entrée sur `loan_collect`) ne
 * faisait rien quand `pendingLoan.capitalInitial` était `undefined` — au lieu
 * de distinguer "nouveau prêt vide" (doit réinitialiser) de "retour en
 * arrière sur ce même prêt, pas encore soumis" (doit conserver).
 */
export type LoanFormValues = {
  capital: string;
  rate: string;
  duration: string;
  firstPayment: string;
};

/**
 * F011-2 — un nouveau prêt manuel part toujours vide : aucune valeur
 * fictive (montant/taux/durée/date d'un prêt inventé) ne doit jamais devenir
 * une donnée métier sans saisie explicite de l'utilisateur.
 */
export const DEFAULT_LOAN_FORM_VALUES: LoanFormValues = {
  capital: "",
  rate: "",
  duration: "",
  firstPayment: "",
};

/**
 * F011-2 — précondition du bouton Continuer : les quatre champs obligatoires
 * du prêt manuel doivent être renseignés et numériquement valides avant de
 * pouvoir créer un `F011LoanDraft`. Pure, testable hors React.
 */
export function isLoanFormComplete(values: LoanFormValues): boolean {
  const capital = Number(values.capital);
  const rate = Number(values.rate);
  const duration = Number(values.duration);
  return (
    values.capital.trim() !== "" &&
    values.rate.trim() !== "" &&
    values.duration.trim() !== "" &&
    values.firstPayment.trim() !== "" &&
    Number.isFinite(capital) &&
    capital > 0 &&
    Number.isFinite(rate) &&
    rate >= 0 &&
    Number.isFinite(duration) &&
    duration > 0
  );
}

export type LoanFormAction =
  /** Un prêt déjà partiellement ou totalement connu (édition, extraction partielle) — préremplir depuis ces valeurs. */
  | { kind: "seed"; values: LoanFormValues }
  /** Un nouveau prêt réellement vide — jamais laisser filtrer les valeurs du prêt précédent. */
  | { kind: "reset"; values: LoanFormValues }
  /** Retour sur le même prêt, pas encore soumis — ne jamais écraser ce que l'utilisateur a déjà tapé localement. */
  | { kind: "keep" };

/**
 * Correctif Cycle 10 — identité de "session de prêt" utilisée pour la
 * comparaison. `loanIndex` seul (`currentLoanIndex`) ne suffit pas : il est
 * remis à 0 par `set_nombre_prets`, donc un retour en arrière jusqu'à
 * "Combien de prêts" suivi d'un nouveau choix retombe sur le même index
 * qu'une tentative de prêt 1 déjà abandonnée. `generation` (incrémenté
 * uniquement par `set_nombre_prets`, jamais par GO_BACK) lève cette
 * ambiguïté : deux identités ne sont "le même prêt" que si l'index ET la
 * génération correspondent.
 */
export type LoanIdentity = {
  loanIndex: number;
  generation: number;
};

/**
 * Décide quoi faire du formulaire local à l'entrée de `loan_collect` — pure,
 * sans React, testable indépendamment du composant. Ne lit et ne modifie
 * jamais `pendingLoan`/`fieldSources` eux-mêmes (aucun impact métier) :
 * produit uniquement l'instruction d'affichage.
 */
export function resolveLoanFormAction(
  pending: Partial<F011LoanDraft> | undefined,
  current: LoanIdentity,
  lastSeeded: LoanIdentity,
): LoanFormAction {
  if (pending?.capitalInitial !== undefined) {
    return {
      kind: "seed",
      values: {
        capital: String(pending.capitalInitial),
        rate: String((pending.tauxNominal ?? 0) * 100),
        duration: String(pending.dureeMois ?? ""),
        firstPayment: pending.datePremiereMensualite ?? "",
      },
    };
  }

  const sameLoan = current.loanIndex === lastSeeded.loanIndex && current.generation === lastSeeded.generation;
  if (!sameLoan) {
    return { kind: "reset", values: DEFAULT_LOAN_FORM_VALUES };
  }

  return { kind: "keep" };
}
