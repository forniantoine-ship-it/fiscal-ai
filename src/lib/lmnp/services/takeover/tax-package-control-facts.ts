/**
 * Lot 4D.1 / 4D.1b / 4D.1c — Tax Package Control Facts.
 *
 * Observations documentaires AGRÉGÉES issues d'une liasse N-1, destinées au
 * futur rapprochement Lot 4E. Une observation = UNE case de formulaire.
 *
 * 4D.1b — type SCELLÉ (brand Symbol) : literals hors factory non assignables.
 * 4D.1c — le brand N'EST PAS une preuve suffisante : `isTaxPackageControlFact`
 * revalide les invariants V1 sur l'état ACTUEL (spread / assign / mutation).
 * Les facts factory sont shallow-frozen.
 *
 * Ce module :
 * - ne parse aucun document source ;
 * - ne réconcilie pas ;
 * - ne crée pas d'état d'ouverture ni de candidats immobilisations ;
 * - ne porte ni déficits ni ARD (→ CandidateFiscalStocks) ;
 * - n'applique ni tolérance, ni arrondi, ni fusion, ni canonicalisation.
 *
 * documentRole typique : `prior_tax_package` (CandidateProvenance 4B).
 */

import {
  isCandidatePresent,
  type CandidateValue,
} from "./candidate-value";

/** Concepts V1 — totaux de contrôle uniquement. */
export type TaxPackageControlFactKind =
  | "total_gross"
  | "total_cumulative_depreciation"
  | "land_gross"
  | "furniture_gross";

/** Formulaires V1 — représentation contractuelle, pas d'extraction. */
export type TaxPackageControlFormType = "2033A" | "2033C";

/**
 * Position temporelle de la case sur le formulaire.
 * V1 n'admet que `closing` pour les cases supportées.
 * `opening` est réservé pour éviter une rupture future — aucune case
 * début d'exercice (490/570) n'est dans la matrice V1.
 */
export type TaxPackageControlPeriodPosition = "opening" | "closing";

/** Cases Cerfa V1 supportées (chaînes exactes). */
export type TaxPackageControlSourceCase =
  | "028"
  | "030"
  | "426"
  | "476"
  | "496"
  | "576";

/**
 * Sceau runtime + TypeScript — non énumérable via JSON.stringify (clé Symbol).
 * Non exporté comme valeur publique de construction : seul `sealFact` l'applique.
 * 4D.1c : présence du brand ≠ validité ; voir `isTaxPackageControlFact`.
 */
const TAX_PACKAGE_CONTROL_FACT_BRAND: unique symbol = Symbol(
  "fiscal-ai.TaxPackageControlFact",
);

type TaxPackageControlFactFields = {
  readonly kind: TaxPackageControlFactKind;
  readonly formType: TaxPackageControlFormType;
  /**
   * Millésime / version du formulaire Cerfa (ex. 2026).
   * Distinct de `fiscalYear` (exercice comptable/fiscal observé).
   */
  readonly formYear: number;
  /** Exercice auquel se rapporte l'observation (ex. 2025 pour liasse N-1). */
  readonly fiscalYear: number;
  readonly periodPosition: TaxPackageControlPeriodPosition;
  /** Case métier explicite — indépendante de provenance.sourceRef. */
  readonly sourceCase: TaxPackageControlSourceCase;
  readonly value: CandidateValue<number>;
};

/**
 * Observation atomique scellée : une case × un document × un exercice.
 * Jamais fusionnée avec une autre observation (même kind / même montant).
 *
 * Construction hors factory : non supportée (brand manquant → erreur TS).
 * Spread/assign incohérent : brand éventuellement copié mais
 * `isTaxPackageControlFact` → false (revalidation V1).
 */
export type TaxPackageControlFact = TaxPackageControlFactFields & {
  readonly [TAX_PACKAGE_CONTROL_FACT_BRAND]: true;
};

/**
 * Brouillon structurel — permet de rejeter 318/490/570 avant typage étroit.
 * Aucune extraction ; aucune fusion. Seule entrée publique de construction.
 */
export type TaxPackageControlFactDraft = {
  kind: string;
  formType: string;
  formYear: number;
  fiscalYear: number;
  periodPosition: string;
  sourceCase: string;
  value: CandidateValue<number>;
};

/**
 * Liste d'observations — jamais un map par case (écrasement interdit).
 * Package partiel et observations contradictoires autorisés.
 */
export type TaxPackageControlFacts = {
  packageId: string;
  facts: TaxPackageControlFact[];
};

export type TaxPackageControlFactIssue = {
  code: string;
  message: string;
};

export type ValidateTaxPackageControlFactResult =
  | { ok: true; fact: TaxPackageControlFact }
  | { ok: false; issues: TaxPackageControlFactIssue[] };

/** Matrice structurelle V1 — sémantique documentaire uniquement. */
export const TAX_PACKAGE_CONTROL_V1_MATRIX = [
  {
    formType: "2033A" as const,
    sourceCase: "028" as const,
    kind: "total_gross" as const,
    periodPosition: "closing" as const,
  },
  {
    formType: "2033A" as const,
    sourceCase: "030" as const,
    kind: "total_cumulative_depreciation" as const,
    periodPosition: "closing" as const,
  },
  {
    formType: "2033C" as const,
    sourceCase: "426" as const,
    kind: "land_gross" as const,
    periodPosition: "closing" as const,
  },
  {
    formType: "2033C" as const,
    sourceCase: "476" as const,
    kind: "furniture_gross" as const,
    periodPosition: "closing" as const,
  },
  {
    formType: "2033C" as const,
    sourceCase: "496" as const,
    kind: "total_gross" as const,
    periodPosition: "closing" as const,
  },
  {
    formType: "2033C" as const,
    sourceCase: "576" as const,
    kind: "total_cumulative_depreciation" as const,
    periodPosition: "closing" as const,
  },
] as const;

const V1_KEYS = new Set(
  TAX_PACKAGE_CONTROL_V1_MATRIX.map(
    (row) => `${row.formType}:${row.sourceCase}:${row.kind}:${row.periodPosition}`,
  ),
);

const V1_SOURCE_CASES = new Set<string>(
  TAX_PACKAGE_CONTROL_V1_MATRIX.map((row) => row.sourceCase),
);

const FORBIDDEN_CASES: Record<string, string> = {
  "570": "Case 570 (amortissements début d'exercice) refusée — pas un cumul de clôture V1.",
  "490": "Case 490 (brut début d'exercice) refusée — pas un brut de clôture V1.",
  "318": "Case 318 (mouvement annuel ARD) refusée — hors TaxPackageControlFact ; stocks ≠ control facts.",
  "572": "Case 572 (dotation de l'exercice) refusée — hors totaux de clôture V1.",
};

function issue(code: string, message: string): TaxPackageControlFactIssue {
  return { code, message };
}

function isFiniteYear(year: number): boolean {
  return Number.isInteger(year) && year >= 1900 && year <= 2100;
}

/**
 * Source de vérité structurelle unique — pure, sans scellement, sans garde.
 * Utilisée par validate (création) et isTaxPackageControlFact (revalidation).
 * Pas de recursion : ne appelle jamais isTaxPackageControlFact.
 */
function collectStructuralIssues(draft: TaxPackageControlFactDraft): TaxPackageControlFactIssue[] {
  const issues: TaxPackageControlFactIssue[] = [];

  if (!isFiniteYear(draft.fiscalYear)) {
    issues.push(issue("INVALID_FISCAL_YEAR", `fiscalYear invalide : ${draft.fiscalYear}`));
  }
  if (!isFiniteYear(draft.formYear)) {
    issues.push(issue("INVALID_FORM_YEAR", `formYear invalide : ${draft.formYear}`));
  }

  const forbidden = FORBIDDEN_CASES[draft.sourceCase];
  if (forbidden) {
    issues.push(issue("CASE_NOT_IN_V1", forbidden));
  } else if (!V1_SOURCE_CASES.has(draft.sourceCase)) {
    issues.push(
      issue(
        "CASE_NOT_IN_V1",
        `sourceCase « ${draft.sourceCase} » hors matrice V1 (028/030/426/476/496/576).`,
      ),
    );
  }

  const key = `${draft.formType}:${draft.sourceCase}:${draft.kind}:${draft.periodPosition}`;
  if (!V1_KEYS.has(key)) {
    issues.push(
      issue(
        "INCOHERENT_V1_TRIPLET",
        `Combinaison non autorisée V1 : ${draft.formType}/${draft.sourceCase}/${draft.kind}/${draft.periodPosition}.`,
      ),
    );
  }

  if (isCandidatePresent(draft.value)) {
    const v = draft.value.value;
    if (!Number.isFinite(v)) {
      issues.push(issue("NON_FINITE_VALUE", "Valeur présente non finie."));
    } else if (v < 0) {
      issues.push(issue("NEGATIVE_VALUE", "Valeur présente négative refusée structurellement."));
    }
  }

  return issues;
}

function hasBrand(value: object): boolean {
  return (value as Record<symbol | string, unknown>)[TAX_PACKAGE_CONTROL_FACT_BRAND] === true;
}

function draftFromUnknown(value: object): TaxPackageControlFactDraft | null {
  const o = value as Record<string, unknown>;
  if (typeof o.kind !== "string") return null;
  if (typeof o.formType !== "string") return null;
  if (typeof o.formYear !== "number") return null;
  if (typeof o.fiscalYear !== "number") return null;
  if (typeof o.periodPosition !== "string") return null;
  if (typeof o.sourceCase !== "string") return null;
  if (o.value === null || typeof o.value !== "object") return null;
  return {
    kind: o.kind,
    formType: o.formType,
    formYear: o.formYear,
    fiscalYear: o.fiscalYear,
    periodPosition: o.periodPosition,
    sourceCase: o.sourceCase,
    value: o.value as CandidateValue<number>,
  };
}

function sealFact(fields: TaxPackageControlFactFields): TaxPackageControlFact {
  // Shallow freeze : empêche mutation des champs du fact (sourceCase, kind, …).
  // CandidateValue n'est pas deep-frozen (hors scope 4D.1c).
  return Object.freeze({
    ...fields,
    [TAX_PACKAGE_CONTROL_FACT_BRAND]: true as const,
  });
}

/**
 * 4D.1c — brand ET invariants V1 sur l'état ACTUEL.
 * Spread / Object.assign incohérents → false même si le brand est recopié.
 * Ne passe pas par validateTaxPackageControlFact (évite scellement / récursion).
 */
export function isTaxPackageControlFact(value: unknown): value is TaxPackageControlFact {
  if (value === null || typeof value !== "object") return false;
  if (!hasBrand(value)) return false;
  const draft = draftFromUnknown(value);
  if (!draft) return false;
  return collectStructuralIssues(draft).length === 0;
}

/**
 * Validation structurelle pure — pas de réconciliation, pas de tolérance.
 * Refuse explicitement 318 / 490 / 570 / 572 et toute combinaison hors matrice V1.
 * Succès → fact scellé + frozen (seule voie de production du brand).
 */
export function validateTaxPackageControlFact(
  draft: TaxPackageControlFactDraft,
): ValidateTaxPackageControlFactResult {
  const issues = collectStructuralIssues(draft);
  if (issues.length > 0) return { ok: false, issues };

  return {
    ok: true,
    fact: sealFact({
      kind: draft.kind as TaxPackageControlFactKind,
      formType: draft.formType as TaxPackageControlFormType,
      formYear: draft.formYear,
      fiscalYear: draft.fiscalYear,
      periodPosition: draft.periodPosition as TaxPackageControlPeriodPosition,
      sourceCase: draft.sourceCase as TaxPackageControlSourceCase,
      value: draft.value,
    }),
  };
}

/** Helper de construction — n'extrait rien ; valide structurellement ; scelle. */
export function createTaxPackageControlFact(
  draft: TaxPackageControlFactDraft,
): { status: "created"; fact: TaxPackageControlFact } | { status: "rejected"; issues: TaxPackageControlFactIssue[] } {
  const result = validateTaxPackageControlFact(draft);
  if (!result.ok) return { status: "rejected", issues: result.issues };
  return { status: "created", fact: result.fact };
}

export function createTaxPackageControlFacts(
  packageId: string,
  drafts: readonly TaxPackageControlFactDraft[],
):
  | { status: "created"; package: TaxPackageControlFacts }
  | { status: "rejected"; issues: TaxPackageControlFactIssue[] } {
  const issues: TaxPackageControlFactIssue[] = [];
  const facts: TaxPackageControlFact[] = [];
  for (let i = 0; i < drafts.length; i += 1) {
    const result = validateTaxPackageControlFact(drafts[i]!);
    if (!result.ok) {
      for (const item of result.issues) {
        issues.push({
          code: item.code,
          message: `facts[${i}]: ${item.message}`,
        });
      }
    } else {
      facts.push(result.fact);
    }
  }
  if (issues.length > 0) return { status: "rejected", issues };
  return {
    status: "created",
    package: { packageId, facts },
  };
}

export function isV1TaxPackageControlCase(sourceCase: string): sourceCase is TaxPackageControlSourceCase {
  return V1_SOURCE_CASES.has(sourceCase);
}
