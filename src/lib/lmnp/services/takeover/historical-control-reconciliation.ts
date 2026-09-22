/**
 * Lot 4E.1 — contrat minimal de rapprochement historique (control facts).
 *
 * Frontière :
 * - faits historiques concordants ;
 * - faits insuffisants / non comparables ;
 * - contradiction nécessitant résolution explicite ultérieure.
 *
 * Ce module :
 * - ne construit pas d'Opening ;
 * - ne choisit jamais une « vraie » valeur ;
 * - n'applique ni tolérance, ni arrondi, ni moyenne, ni arbitrage confidence ;
 * - ne déduplique pas silencieusement ;
 * - ne rapproche pas encore liasse ↔ registre (4C1 non homogène V1 — voir audit).
 *
 * Moteur multi-faits sur TaxPackageControlFacts = lot suivant.
 */

import {
  isCandidatePresent,
  type CandidateValueAbsent,
} from "./candidate-value";
import {
  isTaxPackageControlFact,
  type TaxPackageControlFact,
  type TaxPackageControlFactKind,
  type TaxPackageControlFormType,
  type TaxPackageControlSourceCase,
} from "./tax-package-control-facts";

/** Statuts V1 — pas de valeur canonique associée. */
export type HistoricalControlReconciliationStatus =
  | "concordant"
  | "not_comparable"
  | "conflict";

/**
 * Rapprochements V1 supportés par le contrat.
 * C/D (liasse ↔ registre) exclus : 4C1 n'expose pas de total observé homogène.
 */
export type HistoricalControlReconciliationKind =
  | "total_gross"
  | "total_cumulative_depreciation";

export type HistoricalControlNotComparableReason =
  | "missing_observation"
  | "extraction_impossible"
  | "document_absent"
  | "divergent_duplicates"
  | "fiscal_year_mismatch"
  | "empty_side"
  | "incoherent_side";

export type HistoricalControlReconciliationSideSpec = {
  readonly formType: TaxPackageControlFormType;
  readonly sourceCase: TaxPackageControlSourceCase;
};

/** Matrice V1 — sémantique documentaire uniquement (pas d'exécution moteur). */
export const HISTORICAL_CONTROL_RECONCILIATION_V1_PAIRS = {
  total_gross: {
    kind: "total_gross" as const,
    controlKind: "total_gross" as TaxPackageControlFactKind,
    left: { formType: "2033A", sourceCase: "028" } as const,
    right: { formType: "2033C", sourceCase: "496" } as const,
  },
  total_cumulative_depreciation: {
    kind: "total_cumulative_depreciation" as const,
    controlKind: "total_cumulative_depreciation" as TaxPackageControlFactKind,
    left: { formType: "2033A", sourceCase: "030" } as const,
    right: { formType: "2033C", sourceCase: "576" } as const,
  },
} as const;

export type HistoricalControlReconciliationSide = {
  readonly formType: TaxPackageControlFormType;
  readonly sourceCase: TaxPackageControlSourceCase;
  /**
   * Toutes les observations du côté — y compris duplicates.
   * Jamais réduites à un seul montant nu.
   */
  readonly observations: readonly TaxPackageControlFact[];
};

/**
 * Résultat de rapprochement — preuves conservées, aucune valeur résolue.
 * Interdit conceptuellement : canonicalValue / resolvedValue / tolerance.
 */
export type HistoricalControlReconciliationResult = {
  readonly kind: HistoricalControlReconciliationKind;
  /**
   * Exercice de comparaison lorsque les côtés partagent un fiscalYear unique.
   * null si non comparable pour cause d'années incompatibles / côté vide.
   */
  readonly fiscalYear: number | null;
  readonly status: HistoricalControlReconciliationStatus;
  readonly left: HistoricalControlReconciliationSide;
  readonly right: HistoricalControlReconciliationSide;
  /** Présent uniquement si status = not_comparable. */
  readonly notComparableReason?: HistoricalControlNotComparableReason;
};

export type HistoricalControlReconciliationIssue = {
  code: string;
  message: string;
};

export type CreateHistoricalControlReconciliationInput = {
  kind: HistoricalControlReconciliationKind;
  left: readonly TaxPackageControlFact[];
  right: readonly TaxPackageControlFact[];
};

export type CreateHistoricalControlReconciliationResult =
  | { status: "created"; result: HistoricalControlReconciliationResult }
  | { status: "rejected"; issues: HistoricalControlReconciliationIssue[] };

type SideAmountReading =
  | { status: "univocal_present"; amount: number; fiscalYears: number[] }
  | {
      status: "absent";
      absence: CandidateValueAbsent["status"];
      fiscalYears: number[];
    }
  | { status: "divergent_duplicates"; fiscalYears: number[]; amounts: number[] }
  | { status: "empty" }
  | { status: "incoherent"; fiscalYears: number[] };

function issue(code: string, message: string): HistoricalControlReconciliationIssue {
  return { code, message };
}

function pairSpec(kind: HistoricalControlReconciliationKind) {
  return HISTORICAL_CONTROL_RECONCILIATION_V1_PAIRS[kind];
}

function collectFiscalYears(observations: readonly TaxPackageControlFact[]): number[] {
  return [...new Set(observations.map((o) => o.fiscalYear))];
}

function validateSideObservations(
  sideLabel: "left" | "right",
  expected: HistoricalControlReconciliationSideSpec,
  expectedKind: TaxPackageControlFactKind,
  observations: readonly TaxPackageControlFact[],
): HistoricalControlReconciliationIssue[] {
  const issues: HistoricalControlReconciliationIssue[] = [];
  for (let i = 0; i < observations.length; i += 1) {
    const fact = observations[i]!;
    if (!isTaxPackageControlFact(fact)) {
      issues.push(
        issue(
          "INVALID_FACT",
          `${sideLabel}[${i}]: observation non TaxPackageControlFact valide.`,
        ),
      );
      continue;
    }
    if (fact.formType !== expected.formType || fact.sourceCase !== expected.sourceCase) {
      issues.push(
        issue(
          "SIDE_CASE_MISMATCH",
          `${sideLabel}[${i}]: attendu ${expected.formType}/${expected.sourceCase}, reçu ${fact.formType}/${fact.sourceCase}.`,
        ),
      );
    }
    if (fact.kind !== expectedKind) {
      issues.push(
        issue(
          "SIDE_KIND_MISMATCH",
          `${sideLabel}[${i}]: kind ${fact.kind} incompatible avec le rapprochement.`,
        ),
      );
    }
  }
  return issues;
}

/**
 * Lecture univoque d'un côté — sans sélection first/last/confidence.
 * Duplicates identiques → montant univoque + preuves conservées.
 * Duplicates divergents → divergent_duplicates (pas de choix).
 */
function readSideAmount(
  observations: readonly TaxPackageControlFact[],
): SideAmountReading {
  if (observations.length === 0) return { status: "empty" };

  const fiscalYears = collectFiscalYears(observations);
  const presentAmounts: number[] = [];
  const absences: CandidateValueAbsent["status"][] = [];

  for (const fact of observations) {
    if (isCandidatePresent(fact.value)) {
      presentAmounts.push(fact.value.value);
    } else {
      absences.push(fact.value.status);
    }
  }

  if (presentAmounts.length > 0) {
    const unique = [...new Set(presentAmounts)];
    if (unique.length > 1) {
      return { status: "divergent_duplicates", fiscalYears, amounts: unique };
    }
    return {
      status: "univocal_present",
      amount: unique[0]!,
      fiscalYears,
    };
  }

  if (absences.length === 0) {
    return { status: "incoherent", fiscalYears };
  }

  const uniqueAbsences = [...new Set(absences)];
  if (uniqueAbsences.length === 1) {
    return {
      status: "absent",
      absence: uniqueAbsences[0]!,
      fiscalYears,
    };
  }

  // Plusieurs natures d'absence sur le même côté — toujours non comparable.
  return { status: "incoherent", fiscalYears };
}

function absenceToReason(
  absence: CandidateValueAbsent["status"],
): HistoricalControlNotComparableReason {
  switch (absence) {
    case "missing":
      return "missing_observation";
    case "extraction_impossible":
      return "extraction_impossible";
    case "document_absent":
      return "document_absent";
  }
}

function sharedFiscalYear(
  leftYears: number[],
  rightYears: number[],
): { ok: true; fiscalYear: number } | { ok: false } {
  const all = [...new Set([...leftYears, ...rightYears])];
  if (all.length !== 1) return { ok: false };
  return { ok: true, fiscalYear: all[0]! };
}

function buildNotComparable(
  kind: HistoricalControlReconciliationKind,
  left: HistoricalControlReconciliationSide,
  right: HistoricalControlReconciliationSide,
  fiscalYear: number | null,
  notComparableReason: HistoricalControlNotComparableReason,
): HistoricalControlReconciliationResult {
  return {
    kind,
    fiscalYear,
    status: "not_comparable",
    left,
    right,
    notComparableReason,
  };
}

/**
 * Factory V1 — classifie un couple de côtés déjà sélectionnés.
 * N'extrait rien. Ne résout rien. Égalité exacte uniquement.
 */
export function createHistoricalControlReconciliation(
  input: CreateHistoricalControlReconciliationInput,
): CreateHistoricalControlReconciliationResult {
  const spec = pairSpec(input.kind);
  const issues = [
    ...validateSideObservations("left", spec.left, spec.controlKind, input.left),
    ...validateSideObservations("right", spec.right, spec.controlKind, input.right),
  ];
  if (issues.length > 0) return { status: "rejected", issues };

  const left: HistoricalControlReconciliationSide = {
    formType: spec.left.formType,
    sourceCase: spec.left.sourceCase,
    observations: input.left,
  };
  const right: HistoricalControlReconciliationSide = {
    formType: spec.right.formType,
    sourceCase: spec.right.sourceCase,
    observations: input.right,
  };

  const leftReading = readSideAmount(input.left);
  const rightReading = readSideAmount(input.right);

  if (leftReading.status === "empty" || rightReading.status === "empty") {
    return {
      status: "created",
      result: buildNotComparable(input.kind, left, right, null, "empty_side"),
    };
  }

  const yearCheck = sharedFiscalYear(
    leftReading.fiscalYears,
    rightReading.fiscalYears,
  );
  if (!yearCheck.ok) {
    return {
      status: "created",
      result: buildNotComparable(
        input.kind,
        left,
        right,
        null,
        "fiscal_year_mismatch",
      ),
    };
  }

  if (
    leftReading.status === "divergent_duplicates" ||
    rightReading.status === "divergent_duplicates"
  ) {
    return {
      status: "created",
      result: buildNotComparable(
        input.kind,
        left,
        right,
        yearCheck.fiscalYear,
        "divergent_duplicates",
      ),
    };
  }

  if (leftReading.status === "incoherent" || rightReading.status === "incoherent") {
    return {
      status: "created",
      result: buildNotComparable(
        input.kind,
        left,
        right,
        yearCheck.fiscalYear,
        "incoherent_side",
      ),
    };
  }

  if (leftReading.status === "absent" || rightReading.status === "absent") {
    const absence =
      leftReading.status === "absent"
        ? leftReading.absence
        : (rightReading as Extract<SideAmountReading, { status: "absent" }>).absence;
    return {
      status: "created",
      result: buildNotComparable(
        input.kind,
        left,
        right,
        yearCheck.fiscalYear,
        absenceToReason(absence),
      ),
    };
  }

  // Deux montants univoques présents — comparaison exacte, zéro inclus.
  if (leftReading.amount === rightReading.amount) {
    return {
      status: "created",
      result: {
        kind: input.kind,
        fiscalYear: yearCheck.fiscalYear,
        status: "concordant",
        left,
        right,
      },
    };
  }

  return {
    status: "created",
    result: {
      kind: input.kind,
      fiscalYear: yearCheck.fiscalYear,
      status: "conflict",
      left,
      right,
    },
  };
}

/**
 * Revalidation structurelle — empêche les états incohérents
 * (ex. conflict sans deux côtés présents univoques, canonicalValue, etc.).
 */
export function isHistoricalControlReconciliationResult(
  value: unknown,
): value is HistoricalControlReconciliationResult {
  if (value === null || typeof value !== "object") return false;
  const o = value as Record<string, unknown>;

  if (o.kind !== "total_gross" && o.kind !== "total_cumulative_depreciation") {
    return false;
  }
  if (
    o.status !== "concordant" &&
    o.status !== "not_comparable" &&
    o.status !== "conflict"
  ) {
    return false;
  }
  if ("canonicalValue" in o && o.canonicalValue !== undefined) return false;
  if ("resolvedValue" in o && o.resolvedValue !== undefined) return false;
  if ("tolerance" in o && o.tolerance !== undefined) return false;

  if (typeof o.fiscalYear !== "number" && o.fiscalYear !== null) return false;

  const left = o.left;
  const right = o.right;
  if (left === null || typeof left !== "object") return false;
  if (right === null || typeof right !== "object") return false;

  const leftObj = left as Record<string, unknown>;
  const rightObj = right as Record<string, unknown>;
  if (!Array.isArray(leftObj.observations) || !Array.isArray(rightObj.observations)) {
    return false;
  }
  if (
    !leftObj.observations.every((f) => isTaxPackageControlFact(f)) ||
    !rightObj.observations.every((f) => isTaxPackageControlFact(f))
  ) {
    return false;
  }

  const rebuilt = createHistoricalControlReconciliation({
    kind: o.kind,
    left: leftObj.observations as TaxPackageControlFact[],
    right: rightObj.observations as TaxPackageControlFact[],
  });
  if (rebuilt.status !== "created") return false;

  const expected = rebuilt.result;
  if (expected.status !== o.status) return false;
  if (expected.fiscalYear !== o.fiscalYear) return false;
  if (expected.status === "not_comparable") {
    return expected.notComparableReason === o.notComparableReason;
  }
  return o.notComparableReason === undefined;
}
