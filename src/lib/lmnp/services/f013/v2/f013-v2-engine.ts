/**
 * F013 v2 — moteur pur de rapprochement des loyers ordinaires (un bien, un exercice).
 *
 *   Loyers acquis N = encaissements N + créances clôture − créances ouverture + avances ouverture − avances clôture
 *
 * Appliqué UNE seule fois, en centimes entiers. Fail-closed : sans les cinq termes VALIDÉS et une couverture
 * COMPLÈTE VALIDÉE, aucun montant fiscal n'est produit (jamais `UNKNOWN => 0`, jamais de clamp à zéro).
 *
 * Statuts :
 * - SUPPORTED : calcul défendable ;
 * - NEEDS_CONFIRMATION : un fait manquant/proposé/incohérent peut être résolu dans le domaine supporté ;
 * - OUT_OF_DOMAIN : une règle fiscale distincte serait nécessaire (provision, perte, GLI, litige, annulation).
 * Une entrée invalide (montant non entier, scope incohérent, legacy présenté comme v2) est un diagnostic bloquant de
 * catégorie INVALID_INPUT, jamais OUT_OF_DOMAIN.
 */
import {
  classifyF013Contract,
  F013_V2_CALCULATION_VERSION,
  F013_V2_CONTRACT_VERSION,
  type FactProvenance,
  type MoneyFact,
  type OutOfDomainTreatment,
  type RentReconciliationV2,
  type RentTermKey,
} from "./f013-v2-contract";

export type ReconciliationStatus = "SUPPORTED" | "NEEDS_CONFIRMATION" | "OUT_OF_DOMAIN";

export type ReconciliationReasonCode =
  | "TERM_UNKNOWN"
  | "TERM_PROPOSED_NOT_VALIDATED"
  | "COVERAGE_UNKNOWN"
  | "COVERAGE_PARTIAL"
  | "COVERAGE_NOT_VALIDATED"
  | "INVALID_AMOUNT"
  | "INVALID_REVISION"
  | "INVALID_IDENTITY"
  | "PROPERTY_SCOPE_MISMATCH"
  | "FISCAL_YEAR_MISMATCH"
  | "LEGACY_CONTRACT_NOT_V2"
  | "NEGATIVE_RENT_INCOHERENT"
  | "OUT_OF_DOMAIN_TREATMENT";

export interface ReconciliationReason {
  code: ReconciliationReasonCode;
  category: "MISSING_FACT" | "INVALID_INPUT" | "INCOHERENT" | "OUT_OF_DOMAIN";
  blocking: true;
  term?: RentTermKey | "coverage";
  treatment?: OutOfDomainTreatment;
  message: string;
}

export interface TraceTerm {
  term: RentTermKey;
  status: MoneyFact["status"];
  /** Présent seulement si l'état porte un montant (jamais pour UNKNOWN). */
  amountCents?: number;
  provenance?: FactProvenance;
}

export interface ReconciliationControl {
  id: string;
  outcome: "PASSED" | "FAILED" | "SKIPPED";
}

/** Trace métier déterministe : aucune horloge, aucun identifiant aléatoire. */
export interface ReconciliationTrace {
  calculationVersion: typeof F013_V2_CALCULATION_VERSION;
  contractVersion: string;
  propertyId: string;
  fiscalYear: number;
  revision: number;
  terms: readonly TraceTerm[];
  coverage: { completeness: string; validation?: string };
  controls: readonly ReconciliationControl[];
  blockers: readonly ReconciliationReason[];
  formula: "collections + closingReceivables - openingReceivables + openingAdvances - closingAdvances";
}

export interface InventoryBalancesCents {
  openingReceivablesCents: number;
  closingReceivablesCents: number;
  openingAdvancesCents: number;
  closingAdvancesCents: number;
}

export interface ReconciliationScope {
  propertyId: string;
  fiscalYear: number;
}

interface ResultBase {
  propertyId: string;
  fiscalYear: number;
  revision: number;
  trace: ReconciliationTrace;
}

export type ReconciliationResult =
  | (ResultBase & {
      status: "SUPPORTED";
      loyersAcquisCents: number;
      inventory: InventoryBalancesCents;
      reasons: readonly [];
    })
  | (ResultBase & {
      /** Aucun `loyersAcquisCents` : résultat fiscal définitif non disponible. */
      status: "NEEDS_CONFIRMATION" | "OUT_OF_DOMAIN";
      reasons: readonly ReconciliationReason[];
    });

const TERMS: ReadonlyArray<{ key: RentTermKey; field: keyof RentReconciliationV2 }> = [
  { key: "collectionsCents", field: "collections" },
  { key: "openingReceivablesCents", field: "openingReceivables" },
  { key: "closingReceivablesCents", field: "closingReceivables" },
  { key: "openingAdvancesCents", field: "openingAdvances" },
  { key: "closingAdvancesCents", field: "closingAdvances" },
];

const isCents = (n: unknown): n is number => typeof n === "number" && Number.isSafeInteger(n) && n >= 0;

function describeFact(fact: unknown): { status: MoneyFact["status"] | "INVALID"; amountCents?: number; provenance?: FactProvenance } {
  if (typeof fact !== "object" || fact === null) return { status: "INVALID" };
  const f = fact as Record<string, unknown>;
  if (f.status === "UNKNOWN") return { status: "UNKNOWN" };
  if (f.status === "PROPOSED" || f.status === "VALIDATED") {
    return {
      status: f.status,
      amountCents: f.amountCents as number,
      provenance: f.provenance as FactProvenance | undefined,
    };
  }
  return { status: "INVALID" };
}

/**
 * Rapproche les loyers ordinaires d'un bien. `scope` est l'identité attendue par l'appelant : les faits d'un bien ne
 * sont jamais utilisés implicitement pour un autre.
 */
export function reconcileRentV2(input: RentReconciliationV2, scope: ReconciliationScope): ReconciliationResult {
  const controls: ReconciliationControl[] = [];
  const reasons: ReconciliationReason[] = [];
  const control = (id: string, ok: boolean) => controls.push({ id, outcome: ok ? "PASSED" : "FAILED" });
  const block = (r: Omit<ReconciliationReason, "blocking">) => reasons.push({ ...r, blocking: true });

  const raw = input as unknown as Record<string, unknown>;

  // 1. Version de contrat : legacy / inconnu jamais accepté comme v2.
  const versionOk = classifyF013Contract(raw) === F013_V2_CONTRACT_VERSION;
  control("contract_version_is_f013_v2", versionOk);
  if (!versionOk) {
    block({
      code: "LEGACY_CONTRACT_NOT_V2",
      category: "INVALID_INPUT",
      message: `Contrat « ${String(raw?.contractVersion ?? classifyF013Contract(raw))} » : pas un rapprochement F013 v2.`,
    });
  }

  // 2. Identité et scope.
  const propertyId = typeof raw?.propertyId === "string" ? raw.propertyId : "";
  const fiscalYear = typeof raw?.fiscalYear === "number" ? raw.fiscalYear : NaN;
  const identityOk = propertyId !== "" && Number.isInteger(fiscalYear);
  control("identity_present", identityOk);
  if (!identityOk) {
    block({ code: "INVALID_IDENTITY", category: "INVALID_INPUT", message: "propertyId ou exercice absent/invalide." });
  }
  const propertyOk = identityOk && propertyId === scope.propertyId;
  control("property_scope_matches", propertyOk);
  if (identityOk && !propertyOk) {
    block({
      code: "PROPERTY_SCOPE_MISMATCH",
      category: "INVALID_INPUT",
      message: `Faits du bien « ${propertyId} » présentés pour le bien « ${scope.propertyId} ».`,
    });
  }
  const yearOk = identityOk && fiscalYear === scope.fiscalYear;
  control("fiscal_year_matches", yearOk);
  if (identityOk && !yearOk) {
    block({
      code: "FISCAL_YEAR_MISMATCH",
      category: "INVALID_INPUT",
      message: `Exercice ${fiscalYear} présenté pour l'exercice ${scope.fiscalYear}.`,
    });
  }

  const revision = raw?.revision;
  const revisionOk = typeof revision === "number" && Number.isSafeInteger(revision) && revision >= 0;
  control("revision_valid", revisionOk);
  if (!revisionOk) {
    block({ code: "INVALID_REVISION", category: "INVALID_INPUT", message: "Révision absente ou invalide." });
  }

  // 3. Les cinq termes.
  const traceTerms: TraceTerm[] = [];
  const validated: Partial<Record<RentTermKey, number>> = {};
  for (const { key, field } of TERMS) {
    const fact = describeFact(raw?.[field]);
    const term: TraceTerm = { term: key, status: fact.status === "INVALID" ? "UNKNOWN" : fact.status };
    if (fact.status === "PROPOSED" || fact.status === "VALIDATED") {
      if (isCents(fact.amountCents)) {
        term.amountCents = fact.amountCents;
        if (fact.provenance) term.provenance = fact.provenance;
      }
    }
    traceTerms.push(term);

    if (fact.status === "INVALID") {
      control(`term_${key}_well_formed`, false);
      block({ code: "INVALID_AMOUNT", category: "INVALID_INPUT", term: key, message: `Fait « ${key} » mal formé.` });
    } else if (fact.status === "UNKNOWN") {
      control(`term_${key}_validated`, false);
      block({ code: "TERM_UNKNOWN", category: "MISSING_FACT", term: key, message: `« ${key} » inconnu : jamais assimilé à zéro.` });
    } else if (!isCents(fact.amountCents)) {
      control(`term_${key}_amount_valid`, false);
      block({ code: "INVALID_AMOUNT", category: "INVALID_INPUT", term: key, message: `« ${key} » doit être un entier de centimes ≥ 0.` });
    } else if (fact.status === "PROPOSED") {
      control(`term_${key}_validated`, false);
      block({ code: "TERM_PROPOSED_NOT_VALIDATED", category: "MISSING_FACT", term: key, message: `« ${key} » proposé, non validé.` });
    } else {
      control(`term_${key}_validated`, true);
      validated[key] = fact.amountCents;
    }
  }

  // 4. Couverture des encaissements.
  const coverage = (raw?.collectionsCoverage ?? { completeness: "UNKNOWN" }) as Record<string, unknown>;
  const coverageTrace: ReconciliationTrace["coverage"] = {
    completeness: String(coverage.completeness ?? "UNKNOWN"),
    ...(coverage.validation ? { validation: String(coverage.validation) } : {}),
  };
  let coverageOk = false;
  if (coverage.completeness === "COMPLETE" && coverage.validation === "VALIDATED") {
    coverageOk = true;
  } else if (coverage.completeness === "PARTIAL") {
    block({ code: "COVERAGE_PARTIAL", category: "MISSING_FACT", term: "coverage", message: "Encaissements partiels pour le bien et l'exercice." });
  } else if (coverage.completeness === "COMPLETE") {
    block({ code: "COVERAGE_NOT_VALIDATED", category: "MISSING_FACT", term: "coverage", message: "Couverture complète seulement proposée." });
  } else {
    block({ code: "COVERAGE_UNKNOWN", category: "MISSING_FACT", term: "coverage", message: "Couverture des encaissements non établie." });
  }
  control("collections_coverage_complete_validated", coverageOk);

  // 5. Traitements hors domaine déclarés.
  const oodList = Array.isArray(raw?.outOfDomain) ? (raw.outOfDomain as OutOfDomainTreatment[]) : [];
  control("no_out_of_domain_treatment", oodList.length === 0);
  for (const treatment of oodList) {
    block({
      code: "OUT_OF_DOMAIN_TREATMENT",
      category: "OUT_OF_DOMAIN",
      treatment,
      message: `Traitement « ${treatment} » : règle fiscale distincte requise.`,
    });
  }

  // 6. Calcul — uniquement si les cinq termes sont validés (sinon SKIPPED, jamais un zéro substitué).
  const all = TERMS.every(({ key }) => validated[key] !== undefined);
  let loyers: number | undefined;
  if (all) {
    loyers =
      validated.collectionsCents! +
      validated.closingReceivablesCents! -
      validated.openingReceivablesCents! +
      validated.openingAdvancesCents! -
      validated.closingAdvancesCents!;
    const finite = Number.isSafeInteger(loyers);
    const nonNegative = finite && loyers >= 0;
    control("rent_non_negative", nonNegative);
    if (!nonNegative) {
      block({
        code: "NEGATIVE_RENT_INCOHERENT",
        category: "INCOHERENT",
        message: "Loyers acquis négatifs : incohérence des faits, aucun clamp à zéro.",
      });
    }
  } else {
    controls.push({ id: "rent_non_negative", outcome: "SKIPPED" });
  }

  const hasOod = reasons.some((r) => r.category === "OUT_OF_DOMAIN");
  const status: ReconciliationStatus =
    reasons.length === 0 ? "SUPPORTED" : hasOod ? "OUT_OF_DOMAIN" : "NEEDS_CONFIRMATION";

  const trace: ReconciliationTrace = {
    calculationVersion: F013_V2_CALCULATION_VERSION,
    contractVersion: String(raw?.contractVersion ?? "absent"),
    propertyId,
    fiscalYear: Number.isNaN(fiscalYear) ? -1 : fiscalYear,
    revision: revisionOk ? (revision as number) : -1,
    terms: traceTerms,
    coverage: coverageTrace,
    controls,
    blockers: reasons,
    formula: "collections + closingReceivables - openingReceivables + openingAdvances - closingAdvances",
  };
  const base = { propertyId, fiscalYear: trace.fiscalYear, revision: trace.revision, trace };

  if (status === "SUPPORTED") {
    return {
      ...base,
      status,
      loyersAcquisCents: loyers!,
      inventory: {
        openingReceivablesCents: validated.openingReceivablesCents!,
        closingReceivablesCents: validated.closingReceivablesCents!,
        openingAdvancesCents: validated.openingAdvancesCents!,
        closingAdvancesCents: validated.closingAdvancesCents!,
      },
      reasons: [],
    };
  }
  return { ...base, status, reasons };
}

export type RentConsolidation =
  | { status: "SUPPORTED"; totalCents: number; contributions: ReadonlyArray<{ propertyId: string; loyersAcquisCents: number }> }
  | { status: "BLOCKED"; reason: "EMPTY" | "NOT_ALL_SUPPORTED" | "DUPLICATE_PROPERTY" | "FISCAL_YEAR_MISMATCH" };

/**
 * Consolidation triviale des contributions par bien : somme des loyers acquis déjà calculés. Ne ré-applique JAMAIS
 * les variations créances/avances et ne constitue pas un moteur fiscal multi-bien (ONE F006 reste en aval).
 */
export function consolidateRentContributions(results: readonly ReconciliationResult[]): RentConsolidation {
  if (results.length === 0) return { status: "BLOCKED", reason: "EMPTY" };
  const supported = results.filter((r): r is Extract<ReconciliationResult, { status: "SUPPORTED" }> => r.status === "SUPPORTED");
  if (supported.length !== results.length) return { status: "BLOCKED", reason: "NOT_ALL_SUPPORTED" };
  if (new Set(supported.map((r) => r.propertyId)).size !== supported.length) return { status: "BLOCKED", reason: "DUPLICATE_PROPERTY" };
  if (new Set(supported.map((r) => r.fiscalYear)).size !== 1) return { status: "BLOCKED", reason: "FISCAL_YEAR_MISMATCH" };
  return {
    status: "SUPPORTED",
    totalCents: supported.reduce((sum, r) => sum + r.loyersAcquisCents, 0),
    contributions: supported.map((r) => ({ propertyId: r.propertyId, loyersAcquisCents: r.loyersAcquisCents })),
  };
}
