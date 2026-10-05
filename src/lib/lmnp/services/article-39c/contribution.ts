/**
 * INT-1 — contrat PUR des contributions article 39 C (faits → `Article39cContribution[]`).
 *
 * Frontière (SAV-030, SAV-031, INT-0) : ce module prépare uniquement les FAITS D'ENTRÉE du moteur exact
 * (`computeArticle39c`). Il ne contient aucune formule `L − B`, aucune matérialité, aucun ordre amortissement / ARD /
 * déficits : tout cela reste dans `runtime/capabilities/f006/article-39c-capacity.ts`.
 *
 * NON BRANCHÉ : aucun module productif (F006, `buildFiscalEngineInputs`, consolidation, RFS, PDF) n'importe ce dossier.
 * `ContributionLedger ≠ grand livre` ; FEC NOT STARTED.
 *
 * Invariants : `UNKNOWN ≠ 0`, `PROPOSED ≠ VALIDATED`, une qualification périmée n'est jamais silencieusement validée,
 * aucun `propertyId` fictif, aucune allocation entre biens.
 */
import { fromCents } from "@/runtime/capabilities/f006/cents";
import type {
  Article39cClass,
  Article39cQualifiedAmount,
  Article39cQualificationLevel,
  Article39cResolvedClass,
} from "@/runtime/capabilities/f006/article-39c-capacity";

/** Le type de classe existe déjà dans le moteur : réutilisé, jamais dupliqué. */
export type Article39cContributionClass = Article39cClass;
export type { Article39cResolvedClass };

/**
 * Niveaux de preuve du Knowledge (SAV-030/031). Le moteur n'en connaît que trois : `STRONG_INFERENCE` → `INFERENCE`,
 * `AMBIGUOUS` → `UNRESOLVED` à la frontière du moteur (`toArticle39cQualifiedAmounts`).
 */
export type Article39cProofLevel = "DIRECT" | "STRONG_INFERENCE" | "INFERENCE" | "AMBIGUOUS" | "UNRESOLVED";

export type Article39cContributionSource =
  | "F013_V2_RENT_RECONCILIATION"
  | "F012_CHARGE"
  | "F011_LOAN"
  | "CFE_NOTICE"
  | "ACQUISITION_COST"
  | "OTHER_PRODUCT_FACT";

/**
 * VALIDATED : la classe découle d'une règle établie + de faits frais. UNRESOLVED : non tranchée (fail-closed).
 * STALE : une qualification fournie ne correspond plus à l'état source (jamais conservée comme VALIDATED).
 * BLOCKED : état source non définitif (aucune valeur fiscale produite).
 */
export type Article39cQualificationStatus = "VALIDATED" | "UNRESOLVED" | "STALE" | "BLOCKED";

/** `propertyId` n'existe QUE pour un niveau bien : aucune valeur fictive pour le niveau activité. */
export type Article39cScope = { readonly level: "PROPERTY"; readonly propertyId: string } | { readonly level: "ACTIVITY" };

export type Article39cContribution = {
  /** Identité déterministe : `${source}|${sourceId}|${part}`. */
  readonly contributionId: string;
  readonly source: Article39cContributionSource;
  readonly sourceId: string;
  readonly fiscalYear: number;
  /** Centimes entiers ≥ 0 : la nature produit / charge est portée par la classe. */
  readonly amountCents: number;
  readonly class: Article39cContributionClass;
  /** Obligatoire pour `NEEDS_QUALIFICATION` (au moins deux classes distinctes). */
  readonly plausibleClasses?: readonly Article39cResolvedClass[];
  readonly proofLevel: Article39cProofLevel;
  readonly provenance: string;
  /** Règle (Knowledge) ou garde ayant produit la classe. */
  readonly ruleId: string;
  readonly reason: string;
  readonly scope: Article39cScope;
  readonly qualificationStatus: Article39cQualificationStatus;
  /** Empreinte de l'état source ayant fondé la contribution (stale detection). */
  readonly sourceFingerprint?: string;
  /** Révision de la source (F013 v2). */
  readonly sourceRevision?: number;
  /** Identité de rapprochement inter-sources : deux contributions actives ne partagent jamais la même clé. */
  readonly dedupeKey?: string;
  /** Prêt rattaché (F011 / frais de financement). */
  readonly loanId?: string;
};

export type Article39cBlockerCode =
  | "F013_V2_NOT_PRESENT"
  | "F013_V2_NOT_DEFINITIVE"
  | "F013_V2_OUT_OF_DOMAIN"
  | "F013_V2_CONFIRMATION_MISSING"
  | "F013_V2_CONFIRMATION_STALE"
  | "F013_V2_SCOPE_MISMATCH"
  | "F013_V2_LEGACY_CONTRACT"
  | "DOSSIER_MISMATCH"
  | "FISCAL_YEAR_MISMATCH"
  | "INVALID_AMOUNT"
  | "LOAN_EXCLUDED_FROM_F011"
  | "SHARED_LOAN_OUT_OF_DOMAIN"
  | "COMMON_CHARGE_NOT_SUPPORTED"
  | "SOURCE_QUALIFICATION_MISSING";

export type Article39cAdapterBlocker = {
  readonly code: Article39cBlockerCode;
  readonly sourceId?: string;
  readonly message: string;
};

/** Résultat commun des adapters de charges : toujours explicite, jamais un silence. */
export type Article39cAdapterResult = {
  readonly contributions: readonly Article39cContribution[];
  readonly blockers: readonly Article39cAdapterBlocker[];
};

// ---------------------------------------------------------------------------
// Empreinte de source (même famille que F013 : FNV-1a 32 bits d'une forme canonique)
// ---------------------------------------------------------------------------

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

/** Empreinte déterministe d'un état source. Détecte une altération (montant, nature, source, exercice), pas un adversaire. */
export function article39cSourceFingerprint(parts: Readonly<Record<string, unknown>>): string {
  const text = canonical(parts);
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

/** Empreinte de la source d'une ligne de charge F012 : montant, exercice, catégorie. Toute dérive périme la qualification. */
export function fingerprintChargeLineSource(input: {
  lineId: string;
  fiscalYear: number;
  amountCents: number;
  category: string;
}): string {
  return article39cSourceFingerprint({ kind: "f012_line", ...input });
}

// ---------------------------------------------------------------------------
// Construction
// ---------------------------------------------------------------------------

export const NEEDS_QUALIFICATION_DEFAULT_PLAUSIBLE: readonly Article39cResolvedClass[] = ["B", "ACTIVITY"];

export function contributionId(source: Article39cContributionSource, sourceId: string, part: string): string {
  return `${source}|${sourceId}|${part}`;
}

/** Tri déterministe : le résultat ne dépend jamais de l'ordre d'entrée des documents. */
export function sortContributions(items: readonly Article39cContribution[]): Article39cContribution[] {
  return [...items].sort((a, b) => (a.contributionId < b.contributionId ? -1 : a.contributionId > b.contributionId ? 1 : 0));
}

// ---------------------------------------------------------------------------
// Frontière du moteur exact
// ---------------------------------------------------------------------------

function engineLevel(level: Article39cProofLevel): Article39cQualificationLevel {
  switch (level) {
    case "DIRECT":
      return "DIRECT";
    case "STRONG_INFERENCE":
    case "INFERENCE":
      return "INFERENCE";
    default:
      return "UNRESOLVED";
  }
}

/**
 * Projette les contributions vers l'entrée EXISTANTE du moteur (`Article39cQualifiedAmount`). Aucune règle : une
 * conversion de forme (centimes → euros, niveau de preuve), jamais une reclassification. Un `propertyId` n'est posé que
 * pour un niveau bien. Le moteur reste l'unique autorité de calcul.
 */
export function toArticle39cQualifiedAmounts(items: readonly Article39cContribution[]): Article39cQualifiedAmount[] {
  return sortContributions(items).map((c): Article39cQualifiedAmount => {
    const unresolved = c.class === "NEEDS_QUALIFICATION";
    return {
      id: c.contributionId,
      ...(c.scope.level === "PROPERTY" ? { propertyId: c.scope.propertyId } : {}),
      category: `${c.source}:${c.sourceId}`,
      amount: fromCents(c.amountCents),
      class: c.class,
      ...(c.plausibleClasses !== undefined ? { plausibleClasses: c.plausibleClasses } : {}),
      qualificationLevel: unresolved || c.class === "OUT_OF_DOMAIN" ? "UNRESOLVED" : engineLevel(c.proofLevel),
      provenance: c.provenance,
      reason: c.reason,
    };
  });
}

// ---------------------------------------------------------------------------
// Invariants de l'ensemble (anti-double-comptage, portée, cohérence)
// ---------------------------------------------------------------------------

export type Article39cViolationCode =
  | "DUPLICATE_CONTRIBUTION_ID"
  | "DUPLICATE_DEDUPE_KEY"
  | "DUPLICATE_RENT_FOR_PROPERTY"
  | "RENT_NOT_FROM_F013_V2"
  | "RENT_WITHOUT_PROPERTY"
  | "ACTIVITY_LEVEL_FORBIDDEN_CLASS"
  | "NEGATIVE_OR_NON_INTEGER_AMOUNT"
  | "UNRESOLVED_SHAPE"
  | "OTHER_PRODUCT_IN_RENT"
  | "STALE_PRESENTED_AS_VALIDATED";

export type Article39cViolation = { code: Article39cViolationCode; contributionId: string; detail: string };

/**
 * Valide un ensemble de contributions avant toute projection vers le moteur. Retourne des violations, jamais une
 * correction silencieuse.
 */
export function validateArticle39cContributions(items: readonly Article39cContribution[]): Article39cViolation[] {
  const violations: Article39cViolation[] = [];
  const add = (code: Article39cViolationCode, c: Article39cContribution, detail: string) =>
    violations.push({ code, contributionId: c.contributionId, detail });

  const ids = new Set<string>();
  const dedupe = new Map<string, string>();
  const rentByProperty = new Map<string, string>();

  for (const c of sortContributions(items)) {
    if (ids.has(c.contributionId)) add("DUPLICATE_CONTRIBUTION_ID", c, c.contributionId);
    ids.add(c.contributionId);

    if (!Number.isSafeInteger(c.amountCents) || c.amountCents < 0) add("NEGATIVE_OR_NON_INTEGER_AMOUNT", c, String(c.amountCents));

    if (c.class === "NEEDS_QUALIFICATION") {
      const plausible = new Set(c.plausibleClasses ?? []);
      if (plausible.size < 2) add("UNRESOLVED_SHAPE", c, "au moins deux classes plausibles distinctes");
    }

    // Un fait EXCLUDED / non résolu n'est pas une contribution active : il ne partage pas de clé de rapprochement.
    const active = c.class === "L" || c.class === "B" || c.class === "ACTIVITY" || c.class === "OTHER_PRODUCT";
    if (c.dedupeKey !== undefined && active && c.amountCents !== 0) {
      const prior = dedupe.get(c.dedupeKey);
      if (prior !== undefined) add("DUPLICATE_DEDUPE_KEY", c, `${c.dedupeKey} déjà portée par ${prior}`);
      else dedupe.set(c.dedupeKey, c.contributionId);
    }

    if (c.class === "L") {
      if (c.source !== "F013_V2_RENT_RECONCILIATION") add("RENT_NOT_FROM_F013_V2", c, c.source);
      if (c.scope.level !== "PROPERTY") add("RENT_WITHOUT_PROPERTY", c, "L appartient toujours à un bien");
      else {
        const key = JSON.stringify([c.scope.propertyId, c.fiscalYear]);
        if (rentByProperty.has(key)) add("DUPLICATE_RENT_FOR_PROPERTY", c, key);
        rentByProperty.set(key, c.contributionId);
      }
    }
    if (c.class === "OTHER_PRODUCT" && c.source === "F013_V2_RENT_RECONCILIATION") {
      add("OTHER_PRODUCT_IN_RENT", c, "un autre produit ne naît jamais du rapprochement des loyers");
    }
    // Niveau activité : jamais L ni B (SAV-031 : pas d'allocation, pas de fausse attribution à un bien).
    if (c.scope.level === "ACTIVITY" && (c.class === "L" || c.class === "B")) {
      add("ACTIVITY_LEVEL_FORBIDDEN_CLASS", c, c.class);
    }
    if (c.qualificationStatus === "STALE" && c.class !== "NEEDS_QUALIFICATION") {
      add("STALE_PRESENTED_AS_VALIDATED", c, c.class);
    }
  }
  return violations;
}

export type Article39cContributionSummary = {
  readonly byClassCents: Readonly<Record<Article39cContributionClass, number>>;
  readonly hasUnresolved: boolean;
  readonly hasOutOfDomain: boolean;
  readonly violations: readonly Article39cViolation[];
};

/**
 * Lecture de contrôle (état explicite pour un futur readiness gate). Ce n'est PAS un calcul fiscal : les sommes par
 * classe servent à l'affichage / au contrôle ; la capacité est calculée par le seul moteur.
 */
export function summarizeArticle39cContributions(items: readonly Article39cContribution[]): Article39cContributionSummary {
  const byClassCents: Record<Article39cContributionClass, number> = {
    L: 0,
    B: 0,
    ACTIVITY: 0,
    OTHER_PRODUCT: 0,
    EXCLUDED: 0,
    NEEDS_QUALIFICATION: 0,
    OUT_OF_DOMAIN: 0,
  };
  for (const c of items) byClassCents[c.class] += c.amountCents;
  return {
    byClassCents,
    hasUnresolved: items.some((c) => c.class === "NEEDS_QUALIFICATION" && c.amountCents !== 0),
    hasOutOfDomain: items.some((c) => c.class === "OUT_OF_DOMAIN" && c.amountCents !== 0),
    violations: validateArticle39cContributions(items),
  };
}
