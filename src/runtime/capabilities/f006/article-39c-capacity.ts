/**
 * Article 39 C — autorité de calcul PURE de la capacité d'amortissement (39C-FIX-1).
 *
 *   C = max(0, L − B)
 *
 * L = loyers acquis du périmètre 39 C ; B = autres charges, hors amortissements, afférentes aux biens loués
 * (SAV-030, SAV-031, AX-015). La capacité n'est PAS le résultat global avant amortissement : ce dernier contient aussi
 * ACTIVITY (charges de pure activité, BOI-BIC-AMT-20-40-10-20 § 70) et OTHER_PRODUCT (produits hors L).
 *
 * Module sans I/O : il ne connaît ni UI, ni documents, ni persistance, ni F013 v1/v2, ni bien actif, ni PDF, ni RFS.
 * Il reçoit des montants DÉJÀ QUALIFIÉS (classe + niveau + raison) par un qualificateur explicite
 * (`qualify-article-39c.ts`) et ne reclasse jamais à partir d'un libellé.
 *
 * Ordre approuvé (SAV-030) : C → dotation courante D = min(dotation, C) → ARD historique H = min(ARD, C − D)
 * → résultat après amortissements → déficits antérieurs (qui ne réduisent jamais C).
 *
 * Fail-closed (décision produit approuvée) : `UNKNOWN QUALIFICATION ≠ 0 ≠ B ≠ ACTIVITY`. Chaque branche plausible est
 * calculée ; si une divergence touche un résultat fiscal pertinent → `NEEDS_QUALIFICATION`, aucun résultat définitif.
 *
 * Multi-bien : le calcul est GLOBAL sur l'activité (SAV-031, § 100) — `propertyId` n'est qu'un champ de trace.
 */
import { fromCents, toCents } from "./cents";
import type { StockDeficit } from "./types";

export type Article39cClass =
  | "L"
  | "B"
  | "ACTIVITY"
  | "OTHER_PRODUCT"
  | "EXCLUDED"
  | "NEEDS_QUALIFICATION"
  | "OUT_OF_DOMAIN";

/** Classes sur lesquelles une qualification incertaine peut déboucher. */
export type Article39cResolvedClass = "L" | "B" | "ACTIVITY" | "OTHER_PRODUCT" | "EXCLUDED";

/** Niveaux de preuve du Knowledge (SAV-030) : une inférence n'est jamais présentée comme une règle citée. */
export type Article39cQualificationLevel = "DIRECT" | "INFERENCE" | "UNRESOLVED";

export type Article39cQualifiedAmount = {
  id: string;
  /** Absent = niveau activité. Champ de TRACE uniquement : aucun calcul ne s'y appuie. */
  propertyId?: string;
  category: string;
  /** Montant en euros, ≥ 0 (la nature produit/charge est portée par la classe). */
  amount: number;
  class: Article39cClass;
  /** Obligatoire si `class = NEEDS_QUALIFICATION` : au moins deux classes distinctes. */
  plausibleClasses?: readonly Article39cResolvedClass[];
  qualificationLevel: Article39cQualificationLevel;
  provenance: string;
  reason: string;
};

export type Article39cInput = {
  exercice: number;
  amounts: readonly Article39cQualifiedAmount[];
  /** Dotation de l'exercice (y compris dotation des dépenses capitalisées ; jamais soustraite de B). */
  currentDepreciation: number;
  /** Stock d'amortissements réputés différés d'ouverture. */
  historicalArdStock?: number;
  priorDeficits?: readonly StockDeficit[];
};

export type Article39cSequenceFigures = {
  /** C = max(0, L − B). */
  capacite: number;
  /** Résultat global avant amortissement (distinct de la capacité). */
  resultatAvantAmort: number;
  /** D — dotation courante déduite. */
  amortDeduit: number;
  /** H — ARD historique consommé. */
  ardConsomme: number;
  /** Dotation non déduite de l'exercice (mouvement annuel, source de la ligne 318). */
  ardNouvelle: number;
  /** Stock ARD final = historique − H + courante − D. */
  stockArdFinal: number;
  /** Peut être négatif : un amortissement admissible (D + H ≤ C) ne l'interdit pas. */
  resultatApresAmortissements: number;
  deficitsImputes: number;
  resultatFiscal: number;
  deficitNouveau: number;
  stockDeficits: StockDeficit[];
  deficitsExpires: StockDeficit[];
};

export type Article39cTraceEntry = {
  id: string;
  propertyId?: string;
  category: string;
  class: Article39cClass;
  plausibleClasses?: readonly Article39cResolvedClass[];
  amount: number;
  qualificationLevel: Article39cQualificationLevel;
  provenance: string;
  reason: string;
};

export type Article39cBranch = {
  /** Classe retenue pour chaque montant non résolu (id → classe). */
  assumptions: Readonly<Record<string, Article39cResolvedClass>>;
  figures: Article39cSequenceFigures;
};

export type Article39cBlockReason =
  | "unresolved_material"
  | "out_of_domain_amount"
  | "too_many_branches"
  | "invalid_input";

export type Article39cResult =
  | {
      status: "COMPUTED" | "COMPUTED_UNRESOLVED_IMMATERIAL";
      /** Toutes les valeurs sont celles de TOUTES les branches (identiques) ; `capacite` peut différer. */
      figures: Omit<Article39cSequenceFigures, "capacite"> & { capacite?: number };
      capaciteMin: number;
      capaciteMax: number;
      /** `UNRESOLVED_BUT_IMMATERIAL` lorsque des montants non résolus existent sans effet sur le résultat. */
      warnings: readonly "UNRESOLVED_BUT_IMMATERIAL"[];
      unresolvedIds: readonly string[];
      trace: readonly Article39cTraceEntry[];
    }
  | {
      status: "NEEDS_QUALIFICATION" | "OUT_OF_DOMAIN" | "INVALID_INPUT";
      /** Aucun résultat fiscal définitif. */
      figures?: undefined;
      reasons: readonly Article39cBlockReason[];
      detail: readonly string[];
      /** Sensibilité : branches calculées (vide si invalide). */
      branches: readonly Article39cBranch[];
      unresolvedIds: readonly string[];
      trace: readonly Article39cTraceEntry[];
    };

const DEFICIT_REPORT_YEARS = 10;
const MAX_BRANCHES = 4096;

function sortDeficitsOldestFirst(deficits: readonly StockDeficit[]): StockDeficit[] {
  return [...deficits].sort((a, b) => a.millesime - b.millesime);
}

function expireDeficits(
  exercice: number,
  deficits: readonly StockDeficit[],
): { actifs: StockDeficit[]; expires: StockDeficit[] } {
  const actifs: StockDeficit[] = [];
  const expires: StockDeficit[] = [];
  for (const row of deficits) {
    if (exercice - row.millesime > DEFICIT_REPORT_YEARS) expires.push(row);
    else if (row.montant > 0) actifs.push(row);
  }
  return { actifs, expires };
}

/**
 * Séquence approuvée SAV-030, à partir d'une capacité et d'un résultat global DÉJÀ déterminés (euros).
 * Source unique de l'ordre C → D → H → résultat → déficits antérieurs. Calcul en centimes entiers.
 */
export function applyArticle39cSequence(input: {
  exercice: number;
  capacite: number;
  resultatAvantAmort: number;
  currentDepreciation: number;
  historicalArdStock?: number;
  priorDeficits?: readonly StockDeficit[];
}): Article39cSequenceFigures {
  const capacity = Math.max(0, toCents(input.capacite));
  const before = toCents(input.resultatAvantAmort);
  const current = toCents(input.currentDepreciation);
  const ard = toCents(input.historicalArdStock ?? 0);

  const d = Math.min(current, capacity);
  const capacity2 = capacity - d;
  const h = Math.min(ard, capacity2);
  const stockArdFinal = ard - h + current - d;
  const after = before - d - h;

  const { actifs, expires } = expireDeficits(input.exercice, input.priorDeficits ?? []);
  let deficitsImputes = 0;
  let reste = Math.max(0, after);
  let deficitNouveau = 0;
  let stockDeficits: StockDeficit[];

  if (after < 0) {
    deficitNouveau = -after;
    stockDeficits = sortDeficitsOldestFirst([
      ...actifs,
      { millesime: input.exercice, montant: fromCents(deficitNouveau) },
    ]);
  } else {
    stockDeficits = [];
    for (const row of sortDeficitsOldestFirst(actifs)) {
      const rowCents = toCents(row.montant);
      if (reste <= 0) {
        if (rowCents > 0) stockDeficits.push(row);
        continue;
      }
      const impute = Math.min(rowCents, reste);
      deficitsImputes += impute;
      reste -= impute;
      const reliquat = rowCents - impute;
      if (reliquat > 0) stockDeficits.push({ millesime: row.millesime, montant: fromCents(reliquat) });
    }
  }

  return {
    capacite: fromCents(capacity),
    resultatAvantAmort: fromCents(before),
    amortDeduit: fromCents(d),
    ardConsomme: fromCents(h),
    ardNouvelle: fromCents(current - d),
    stockArdFinal: fromCents(stockArdFinal),
    resultatApresAmortissements: fromCents(after),
    deficitsImputes: fromCents(deficitsImputes),
    resultatFiscal: after < 0 ? 0 : fromCents(reste),
    deficitNouveau: fromCents(deficitNouveau),
    stockDeficits,
    deficitsExpires: expires,
  };
}

type Sums = { L: number; B: number; ACTIVITY: number; OTHER_PRODUCT: number };

function emptySums(): Sums {
  return { L: 0, B: 0, ACTIVITY: 0, OTHER_PRODUCT: 0 };
}

function addToSums(sums: Sums, klass: Article39cResolvedClass, cents: number): void {
  if (klass === "EXCLUDED") return;
  sums[klass] += cents;
}

function figuresFor(input: Article39cInput, sums: Sums): Article39cSequenceFigures {
  return applyArticle39cSequence({
    exercice: input.exercice,
    capacite: fromCents(Math.max(0, sums.L - sums.B)),
    resultatAvantAmort: fromCents(sums.L + sums.OTHER_PRODUCT - sums.B - sums.ACTIVITY),
    currentDepreciation: input.currentDepreciation,
    historicalArdStock: input.historicalArdStock,
    priorDeficits: input.priorDeficits,
  });
}

/** Tout ce qui est pertinent pour un résultat fiscal — la capacité seule n'est pas un résultat. */
function relevantSignature(f: Article39cSequenceFigures): string {
  return JSON.stringify({
    avant: f.resultatAvantAmort,
    d: f.amortDeduit,
    h: f.ardConsomme,
    nouvelle: f.ardNouvelle,
    stock: f.stockArdFinal,
    apres: f.resultatApresAmortissements,
    imputes: f.deficitsImputes,
    fiscal: f.resultatFiscal,
    deficit: f.deficitNouveau,
    stockDeficits: f.stockDeficits,
    expires: f.deficitsExpires,
  });
}

function traceOf(amounts: readonly Article39cQualifiedAmount[]): Article39cTraceEntry[] {
  return amounts.map((a) => ({
    id: a.id,
    ...(a.propertyId !== undefined ? { propertyId: a.propertyId } : {}),
    category: a.category,
    class: a.class,
    ...(a.plausibleClasses !== undefined ? { plausibleClasses: a.plausibleClasses } : {}),
    amount: a.amount,
    qualificationLevel: a.qualificationLevel,
    provenance: a.provenance,
    reason: a.reason,
  }));
}

function invalid(input: Article39cInput, detail: string[]): Article39cResult {
  return {
    status: "INVALID_INPUT",
    reasons: ["invalid_input"],
    detail,
    branches: [],
    unresolvedIds: [],
    trace: traceOf(input.amounts ?? []),
  };
}

function validate(input: Article39cInput): string[] {
  const problems: string[] = [];
  const ids = new Set<string>();
  const finiteNonNegative = (v: number | undefined) => v === undefined || (Number.isFinite(v) && v >= 0);
  if (!finiteNonNegative(input.currentDepreciation) || input.currentDepreciation === undefined) {
    problems.push("currentDepreciation");
  }
  if (!finiteNonNegative(input.historicalArdStock)) problems.push("historicalArdStock");
  for (const row of input.priorDeficits ?? []) {
    if (!Number.isFinite(row.montant) || row.montant < 0 || !Number.isInteger(row.millesime)) {
      problems.push(`priorDeficits:${row.millesime}`);
    }
  }
  for (const a of input.amounts) {
    if (ids.has(a.id)) problems.push(`duplicate_id:${a.id}`);
    ids.add(a.id);
    if (!Number.isFinite(a.amount) || a.amount < 0) problems.push(`amount:${a.id}`);
    if (a.class === "NEEDS_QUALIFICATION") {
      const plausible = new Set(a.plausibleClasses ?? []);
      if (plausible.size < 2 || a.qualificationLevel !== "UNRESOLVED") problems.push(`unresolved_shape:${a.id}`);
    } else if (a.class !== "OUT_OF_DOMAIN" && a.qualificationLevel === "UNRESOLVED") {
      problems.push(`resolved_marked_unresolved:${a.id}`);
    }
  }
  return problems;
}

/**
 * Capacité 39 C + application complète, avec politique fail-closed sur les qualifications non résolues.
 */
export function computeArticle39c(input: Article39cInput): Article39cResult {
  const problems = validate(input);
  if (problems.length > 0) return invalid(input, problems);

  const trace = traceOf(input.amounts);
  const base = emptySums();
  const unresolved: Article39cQualifiedAmount[] = [];
  const outOfDomain: Article39cQualifiedAmount[] = [];

  for (const a of input.amounts) {
    const cents = toCents(a.amount);
    if (a.class === "NEEDS_QUALIFICATION") {
      if (cents !== 0) unresolved.push(a);
    } else if (a.class === "OUT_OF_DOMAIN") {
      if (cents !== 0) outOfDomain.push(a);
    } else {
      addToSums(base, a.class, cents);
    }
  }

  if (outOfDomain.length > 0) {
    return {
      status: "OUT_OF_DOMAIN",
      reasons: ["out_of_domain_amount"],
      detail: outOfDomain.map((a) => a.id),
      branches: [],
      unresolvedIds: unresolved.map((a) => a.id),
      trace,
    };
  }

  const unresolvedIds = unresolved.map((a) => a.id);

  // Nombre de branches = produit des classes plausibles distinctes (borné : au-delà, fail-closed).
  const choices = unresolved.map((a) => [...new Set(a.plausibleClasses ?? [])].sort());
  const total = choices.reduce((n, c) => n * c.length, 1);
  if (total > MAX_BRANCHES) {
    return {
      status: "NEEDS_QUALIFICATION",
      reasons: ["too_many_branches"],
      detail: unresolvedIds,
      branches: [],
      unresolvedIds,
      trace,
    };
  }

  const branches: Article39cBranch[] = [];
  const walk = (index: number, sums: Sums, assumptions: Record<string, Article39cResolvedClass>): void => {
    if (index === unresolved.length) {
      branches.push({ assumptions: { ...assumptions }, figures: figuresFor(input, sums) });
      return;
    }
    const item = unresolved[index]!;
    const cents = toCents(item.amount);
    for (const klass of choices[index]!) {
      const next = { ...sums };
      addToSums(next, klass, cents);
      walk(index + 1, next, { ...assumptions, [item.id]: klass });
    }
  };
  walk(0, base, {});

  const first = branches[0]!;
  const signature = relevantSignature(first.figures);
  const immaterial = branches.every((b) => relevantSignature(b.figures) === signature);

  if (!immaterial) {
    return {
      status: "NEEDS_QUALIFICATION",
      reasons: ["unresolved_material"],
      detail: unresolvedIds,
      branches,
      unresolvedIds,
      trace,
    };
  }

  const capacities = branches.map((b) => b.figures.capacite);
  const capaciteMin = Math.min(...capacities);
  const capaciteMax = Math.max(...capacities);
  const { capacite, ...rest } = first.figures;
  return {
    status: unresolved.length > 0 ? "COMPUTED_UNRESOLVED_IMMATERIAL" : "COMPUTED",
    figures: capaciteMin === capaciteMax ? { ...rest, capacite } : rest,
    capaciteMin,
    capaciteMax,
    warnings: unresolved.length > 0 ? ["UNRESOLVED_BUT_IMMATERIAL"] : [],
    unresolvedIds,
    trace,
  };
}
