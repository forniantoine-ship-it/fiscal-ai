import type { F011LoanDraft, F011Step } from "./types";

/** Ordre de priorité des champs cœur d'un prêt — type d'abord, puis les quatre termes. */
export const F011_CORE_LOAN_FIELD_ORDER = [
  "typePret",
  "capitalInitial",
  "tauxNominal",
  "dureeMois",
  "datePremiereMensualite",
] as const;

export type F011CoreLoanField = (typeof F011_CORE_LOAN_FIELD_ORDER)[number];

export type F011MissingFieldResolution = { field: F011CoreLoanField | null };

/**
 * Prochain champ cœur réellement manquant dans `pendingLoan`.
 * Pure : `undefined` = manquant ; toute autre valeur (y compris `0`) = connue.
 * Ne lit jamais `fieldSources`, ni un statut de confirmation, ni l'état React.
 */
export function resolveNextMissingF011Field(
  pendingLoan?: Partial<F011LoanDraft>,
): F011MissingFieldResolution {
  for (const field of F011_CORE_LOAN_FIELD_ORDER) {
    if (pendingLoan?.[field] === undefined) {
      return { field };
    }
  }
  return { field: null };
}

/** Première étape conversationnelle après revue documentaire ou saisie du type. */
export type F011LoanCollectionStep = "loan_type" | "loan_collect" | "loan_insurance";

/**
 * Détermine la prochaine étape après confirmation d'extraction ou définition du type.
 * - type manquant → loan_type
 * - champ cœur manquant → loan_collect
 * - tout connu → loan_insurance (premier complément obligatoire)
 */
export function resolveNextF011LoanStepAfterReview(
  pendingLoan?: Partial<F011LoanDraft>,
): F011LoanCollectionStep {
  const { field } = resolveNextMissingF011Field(pendingLoan);
  if (field === "typePret") return "loan_type";
  if (field !== null) return "loan_collect";
  return "loan_insurance";
}

/** Mappe un champ manquant vers l'étape qui le collecte (type → loan_type, reste → loan_collect). */
export function f011StepForMissingCoreField(field: F011CoreLoanField): Extract<F011Step, "loan_type" | "loan_collect"> {
  return field === "typePret" ? "loan_type" : "loan_collect";
}
