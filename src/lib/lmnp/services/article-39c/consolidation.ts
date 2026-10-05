/**
 * INT-3 — consolidation EXACTE (dormante) des contributions article 39 C : biens A…N + activité → faits consolidés.
 *
 *   PropertyArticle39cContribution[A…N] + ActivityArticle39cContribution
 *     → `ConsolidatedArticle39cFacts` (L, B, ACTIVITY, OTHER_PRODUCT, non résolu, hors domaine, traces)
 *     → `evaluateArticle39cReadiness` : UN SEUL appel du moteur exact (`computeArticle39c`) pour l'activité.
 *
 * ONE F006 : une activité = une consolidation = un futur appel F006. Aucune capacité par bien, aucun résultat fiscal par
 * bien, aucune allocation : les biens fournissent des contributions, la capacité C reste GLOBALE (SAV-031, § 100). Une
 * charge ACTIVITY globale n'est jamais rattachée à un bien ni répartie.
 *
 * Ce module ne contient aucune formule `L − B` : les sommes par classe sont des contrôles d'affichage ; la capacité, la
 * matérialité et l'ordre amortissement / ARD / déficits sont ceux du moteur exact existant, appelé tel quel.
 *
 * NON CONSOMMÉ par F006, `buildFiscalEngineInputs`, la consolidation productive, la RFS, la 2033-B / 2031 ou le PDF.
 */
import { computeArticle39c, type Article39cResult } from "@/runtime/capabilities/f006/article-39c-capacity";
import { fromCents } from "@/runtime/capabilities/f006/cents";
import type { PersistedWorkspace } from "@/lib/lmnp/store/persistence";
import { createBienDraft } from "@/lib/lmnp/dossier/bien-draft";
import { resolveArticle39cOpeningStocks, type Article39cOpeningStocks } from "./opening-stocks";
import { parseQualificationStore, selectQualifications } from "./qualification-store";
import {
  sortContributions,
  summarizeArticle39cContributions,
  toArticle39cQualifiedAmounts,
  validateArticle39cContributions,
  type Article39cBlockerCode,
  type Article39cContribution,
  type Article39cContributionClass,
  type Article39cViolation,
} from "./contribution";
import {
  buildActivityArticle39cContribution,
  buildPropertyArticle39cContribution,
  deriveSharedLoanIdsByProperty,
  resolveWorkspaceIdentity,
  type ActivityArticle39cContribution,
  type Article39cWorkspaceBlocker,
  type PropertyArticle39cContribution,
} from "./workspace-sources";
import type { LigneCharge } from "@/runtime/capabilities/f012/types";

export type { Article39cOpeningStocks } from "./opening-stocks";

export type ConsolidatedArticle39cFacts = {
  readonly kind: "consolidated_article_39c_facts";
  readonly dossierId?: string;
  readonly fiscalYear: number;
  readonly propertyIds: readonly string[];
  /** Toutes les contributions (biens + activité), triées de façon déterministe. */
  readonly contributions: readonly Article39cContribution[];
  /** Sommes par classe (contrôle / affichage — pas la capacité). */
  readonly byClassCents: Readonly<Record<Article39cContributionClass, number>>;
  /** Répartition par bien des classes de bien (traces) ; l'activité reste séparée. */
  readonly byPropertyCents: Readonly<Record<string, Readonly<Record<Article39cContributionClass, number>>>>;
  readonly activityCents: Readonly<Record<Article39cContributionClass, number>>;
  readonly currentDepreciationCents?: number;
  readonly openingStocks?: Article39cOpeningStocks;
  readonly blockers: readonly Article39cWorkspaceBlocker[];
  readonly violations: readonly Article39cViolation[];
  /** ONE F006 : une seule capacité globale, jamais par bien. */
  readonly architecture: { readonly capacityScope: "ACTIVITY"; readonly engineCalls: 1 };
};

function zeroClasses(): Record<Article39cContributionClass, number> {
  return { L: 0, B: 0, ACTIVITY: 0, OTHER_PRODUCT: 0, EXCLUDED: 0, NEEDS_QUALIFICATION: 0, OUT_OF_DOMAIN: 0 };
}

function blockerOf(code: Article39cBlockerCode, message: string, propertyId?: string): Article39cWorkspaceBlocker {
  return { code, message, ...(propertyId !== undefined ? { scope: { level: "PROPERTY", propertyId } as const } : {}) };
}

export function consolidateArticle39cFacts(input: {
  dossierId?: string;
  fiscalYear: number;
  properties: readonly PropertyArticle39cContribution[];
  activity: ActivityArticle39cContribution;
  openingStocks?: Article39cOpeningStocks;
}): ConsolidatedArticle39cFacts {
  const blockers: Article39cWorkspaceBlocker[] = [];
  const all: Article39cContribution[] = [];
  const byProperty: Record<string, Record<Article39cContributionClass, number>> = {};
  const seen = new Set<string>();

  for (const part of input.properties) {
    if (seen.has(part.propertyId)) {
      blockers.push(blockerOf("DUPLICATE_PROPERTY", `Bien « ${part.propertyId} » consolidé deux fois.`, part.propertyId));
      continue;
    }
    seen.add(part.propertyId);
    if (part.fiscalYear !== input.fiscalYear) blockers.push(blockerOf("FISCAL_YEAR_INCONSISTENT", `Bien « ${part.propertyId} » de l'exercice ${part.fiscalYear}.`, part.propertyId));
    blockers.push(...part.blockers);
    const totals = zeroClasses();
    for (const c of part.contributions) {
      // Un bien ne porte que ses propres faits : jamais ceux d'un autre bien, jamais un niveau activité.
      if (c.scope.level !== "PROPERTY" || c.scope.propertyId !== part.propertyId) {
        blockers.push(blockerOf("CONSOLIDATION_SCOPE_VIOLATION", `Contribution « ${c.contributionId} » étrangère au bien « ${part.propertyId} ».`, part.propertyId));
        continue;
      }
      totals[c.class] += c.amountCents;
      all.push(c);
    }
    byProperty[part.propertyId] = totals;
  }

  blockers.push(...input.activity.blockers);
  const activityTotals = zeroClasses();
  for (const c of input.activity.contributions) {
    // Niveau activité : aucun propertyId, jamais L ni B (aucune allocation).
    if (c.scope.level !== "ACTIVITY" || c.class === "L" || c.class === "B") {
      blockers.push(blockerOf("CONSOLIDATION_SCOPE_VIOLATION", `Contribution « ${c.contributionId} » invalide au niveau activité.`));
      continue;
    }
    activityTotals[c.class] += c.amountCents;
    all.push(c);
  }

  const dotations = input.properties.map((p) => p.dotationCents);
  const currentDepreciationCents = dotations.length > 0 && dotations.every((d) => d !== undefined) ? dotations.reduce((n, d) => n + d!, 0) : undefined;
  if (input.openingStocks === undefined) {
    blockers.push(blockerOf("OPENING_STOCKS_NOT_PROVIDED", "Stocks d'ouverture (ARD, déficits antérieurs) non fournis : jamais présumés nuls."));
  }

  const sorted = sortContributions(all);
  const summary = summarizeArticle39cContributions(sorted);
  const violations = validateArticle39cContributions(sorted);
  return {
    kind: "consolidated_article_39c_facts",
    ...(input.dossierId !== undefined ? { dossierId: input.dossierId } : {}),
    fiscalYear: input.fiscalYear,
    propertyIds: input.properties.map((p) => p.propertyId).sort(),
    contributions: sorted,
    byClassCents: summary.byClassCents,
    byPropertyCents: byProperty,
    activityCents: activityTotals,
    ...(currentDepreciationCents !== undefined ? { currentDepreciationCents } : {}),
    ...(input.openingStocks !== undefined ? { openingStocks: input.openingStocks } : {}),
    blockers,
    violations,
    architecture: { capacityScope: "ACTIVITY", engineCalls: 1 },
  };
}

/** Depuis un workspace rechargé : identité fail-closed, une contribution par bien, une contribution d'activité. */
export function buildConsolidatedArticle39cFromWorkspace(input: {
  workspace: PersistedWorkspace;
  expectedDossierId: string;
  openingStocks?: Article39cOpeningStocks;
  /** Charges d'activité globales (structure dormante, ADR-011 §11) : jamais allouées à un bien. */
  activityLines?: readonly LigneCharge[];
  /** Prêts partagés supplémentaires (union avec le fait existant `creditDocumentId` partagé). */
  sharedLoanIdsByProperty?: Readonly<Record<string, readonly string[]>>;
}): ConsolidatedArticle39cFacts {
  const fiscalYear = input.workspace.fiscalYear.year;
  // INT-4 — stocks d'ouverture : fournis explicitement (tests / appelant) sinon LUS par l'autorité d'ouverture existante.
  // Jamais zéro implicite : sans preuve, `UNKNOWN` → blocage `OPENING_STOCKS_UNKNOWN`.
  const derivedStocks = input.openingStocks === undefined ? resolveArticle39cOpeningStocks({ fiscalYear: input.workspace.fiscalYear, expectedDossierId: input.expectedDossierId }) : undefined;
  const openingStocks: Article39cOpeningStocks | undefined = input.openingStocks ?? (derivedStocks?.status === "RESOLVED" ? derivedStocks.stocks : undefined);
  const identity = resolveWorkspaceIdentity(input.workspace, input.expectedDossierId);
  const withStocksDiagnosis = (facts: ConsolidatedArticle39cFacts): ConsolidatedArticle39cFacts => {
    if (derivedStocks?.status !== "UNKNOWN") return facts;
    return {
      ...facts,
      blockers: [
        ...facts.blockers.filter((b) => b.code !== "OPENING_STOCKS_NOT_PROVIDED"),
        blockerOf("OPENING_STOCKS_UNKNOWN", `Stocks d'ouverture (ARD historique, déficits antérieurs) non démontrés (${derivedStocks.reasons.join(", ")}) : jamais présumés nuls.`),
      ],
    };
  };
  if (!identity.ok) {
    const failed = consolidateArticle39cFacts({
      fiscalYear,
      properties: [],
      activity: { fiscalYear, contributions: [], blockers: [] },
      ...(openingStocks !== undefined ? { openingStocks } : {}),
    });
    return withStocksDiagnosis({ ...failed, blockers: [...identity.blockers, ...failed.blockers] });
  }
  const derivedShared = deriveSharedLoanIdsByProperty(identity.biens);
  const activityCfeRecords = selectQualifications(
    parseQualificationStore(input.workspace.declarationDraft?.article39cActivityQualifications),
    { level: "ACTIVITY" },
    fiscalYear,
  ).cfe;
  const properties = identity.propertyIds.map((propertyId) =>
    buildPropertyArticle39cContribution({
      bien: identity.biens[propertyId] ?? createBienDraft(propertyId),
      propertyId,
      fiscalYear,
      expectedDossierId: input.expectedDossierId,
      stateDossierId: identity.dossierId,
      sharedLoanIds: [...new Set([...(derivedShared[propertyId] ?? []), ...(input.sharedLoanIdsByProperty?.[propertyId] ?? [])])],
      exactSources: true,
      activityCfeRecords,
    }),
  );
  const activity = buildActivityArticle39cContribution({
    fiscalYear,
    store: input.workspace.declarationDraft?.article39cActivityQualifications,
    ...(input.activityLines !== undefined ? { activityLines: input.activityLines } : {}),
  });
  // INT-4 — une charge globale (comptabilité) de même montant qu'une charge comptable déjà saisie dans un bien : même dépense ?
  // Jamais comptée deux fois en silence : conflit explicite tant que le client n'a pas déclaré les deux dépenses distinctes.
  const duplicateBlockers: Article39cWorkspaceBlocker[] = [];
  for (const record of selectQualifications(parseQualificationStore(input.workspace.declarationDraft?.article39cActivityQualifications), { level: "ACTIVITY" }, fiscalYear).activityCharges) {
    if (record.charge.nature === "OTHER" || record.charge.distinctFromPropertyCharges === true) continue;
    const twin = properties.some((p) => p.contributions.some((c) => c.source === "F012_CHARGE" && c.ruleId === "SAV-031:accounting" && c.amountCents === record.charge.amountCents));
    if (twin) {
      duplicateBlockers.push({
        code: "ACTIVITY_CHARGE_DUPLICATE_SUSPECTED",
        message: "Une charge comptable de même montant est déjà saisie dans un logement : même dépense ? Conflit explicite (jamais comptée deux fois).",
        scope: { level: "ACTIVITY" },
        sourceId: record.charge.sourceId,
      });
    }
  }
  const consolidated = consolidateArticle39cFacts({
    dossierId: identity.dossierId,
    fiscalYear,
    properties,
    activity: { ...activity, blockers: [...activity.blockers, ...duplicateBlockers] },
    ...(openingStocks !== undefined ? { openingStocks } : {}),
  });
  return withStocksDiagnosis(consolidated);
}

// ---------------------------------------------------------------------------
// Readiness exact dormant
// ---------------------------------------------------------------------------

export type Article39cReadinessStatus = "READY" | "NEEDS_QUALIFICATION" | "OUT_OF_DOMAIN" | "INVALID" | "RECONCILIATION_FAILURE";

export type Article39cReadiness = {
  readonly status: Article39cReadinessStatus;
  /** Raisons structurées (codes de blocage, violations, statut du moteur). */
  readonly reasons: readonly string[];
  /** Résultat du moteur exact (présent seulement si les faits sont complets). Matérialité = celle du moteur. */
  readonly engine?: Article39cResult;
  readonly warnings: readonly string[];
  /** Aucun consommateur productif : le contrat est construit mais non consommé. */
  readonly consumption: "DORMANT";
  readonly consolidated: ConsolidatedArticle39cFacts;
};

const RECONCILIATION_CODES: ReadonlySet<Article39cBlockerCode> = new Set(["F012_RECONCILIATION_MISMATCH"]);
const OUT_OF_DOMAIN_CODES: ReadonlySet<Article39cBlockerCode> = new Set(["F013_V2_OUT_OF_DOMAIN", "SHARED_LOAN_OUT_OF_DOMAIN", "COMMON_CHARGE_NOT_SUPPORTED"]);
/** Conflits que le client peut lever par une réponse : aucun résultat définitif, mais pas une donnée invalide. */
const NEEDS_QUALIFICATION_CODES: ReadonlySet<Article39cBlockerCode> = new Set(["CFE_DIVERS_CONFLICT", "CHARGES_NATURE_NEEDS_REVIEW", "ACTIVITY_CHARGE_DUPLICATE_SUSPECTED"]);

/**
 * READY seulement si : F013 v2 définitif, F012 réconcilié, F011 valide, F010 compatible, F014 validé, stocks fournis,
 * qualifications fraîches, aucun conflit, scope et consolidation cohérents, et si le moteur exact conclut `COMPUTED` ou
 * `COMPUTED_UNRESOLVED_IMMATERIAL` (une incertitude fiscalement immatérielle ne bloque pas). Un dossier F013 v1 n'est
 * JAMAIS READY (aucune migration silencieuse : le proxy productif continue).
 */
export function evaluateArticle39cReadiness(consolidated: ConsolidatedArticle39cFacts): Article39cReadiness {
  const reasons: string[] = [];
  const base = { consumption: "DORMANT" as const, consolidated, warnings: [] as string[] };
  const codes = consolidated.blockers.map((b) => b.code);

  const invalid = consolidated.violations.length > 0 || codes.some((c) => !RECONCILIATION_CODES.has(c) && !OUT_OF_DOMAIN_CODES.has(c) && !NEEDS_QUALIFICATION_CODES.has(c));
  if (invalid) {
    reasons.push(...codes.filter((c) => !RECONCILIATION_CODES.has(c) && !OUT_OF_DOMAIN_CODES.has(c) && !NEEDS_QUALIFICATION_CODES.has(c)), ...consolidated.violations.map((v) => v.code));
    return { ...base, status: "INVALID", reasons: [...new Set(reasons)] };
  }
  if (codes.some((c) => RECONCILIATION_CODES.has(c))) {
    return { ...base, status: "RECONCILIATION_FAILURE", reasons: [...new Set(codes.filter((c) => RECONCILIATION_CODES.has(c)))] };
  }
  if (codes.some((c) => OUT_OF_DOMAIN_CODES.has(c))) {
    return { ...base, status: "OUT_OF_DOMAIN", reasons: [...new Set(codes.filter((c) => OUT_OF_DOMAIN_CODES.has(c)))] };
  }
  if (codes.some((c) => NEEDS_QUALIFICATION_CODES.has(c))) {
    return { ...base, status: "NEEDS_QUALIFICATION", reasons: [...new Set(codes.filter((c) => NEEDS_QUALIFICATION_CODES.has(c)))] };
  }
  if (consolidated.currentDepreciationCents === undefined || consolidated.openingStocks === undefined) {
    return { ...base, status: "INVALID", reasons: ["MISSING_ENGINE_FACTS"] };
  }

  // UN SEUL appel du moteur exact pour l'activité (dormant).
  const stocks = consolidated.openingStocks;
  const engine = computeArticle39c({
    exercice: consolidated.fiscalYear,
    amounts: toArticle39cQualifiedAmounts(consolidated.contributions),
    currentDepreciation: fromCents(consolidated.currentDepreciationCents),
    ...(stocks.kind === "PROVIDED" ? { historicalArdStock: stocks.historicalArdStock, priorDeficits: stocks.priorDeficits } : {}),
  });
  switch (engine.status) {
    case "COMPUTED":
      return { ...base, status: "READY", reasons: [], engine };
    case "COMPUTED_UNRESOLVED_IMMATERIAL":
      return { ...base, status: "READY", reasons: [], engine, warnings: [...engine.warnings] };
    case "NEEDS_QUALIFICATION":
      return { ...base, status: "NEEDS_QUALIFICATION", reasons: [...engine.reasons], engine };
    case "OUT_OF_DOMAIN":
      return { ...base, status: "OUT_OF_DOMAIN", reasons: [...engine.reasons], engine };
    default:
      return { ...base, status: "INVALID", reasons: [...engine.reasons, ...engine.detail], engine };
  }
}
