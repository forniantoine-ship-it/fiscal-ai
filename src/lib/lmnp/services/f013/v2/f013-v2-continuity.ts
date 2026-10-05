/**
 * F013 v2 — continuité des soldes locatifs N → N+1 (module pur).
 *
 *   CC(N) → CO(N+1)        AC(N) → AO(N+1)        (TRF-0036, SAV-034 : identité dérivée de BOI-BIC-DECLA-30-20-20 § 170)
 *
 * Règles (contrat approuvé) :
 * - la continuité part d'un état F013 N DÉFINITIF : moteur `SUPPORTED` ET confirmation fraîche (révision, empreinte et
 *   total concordants). Tout le reste refuse — jamais un zéro ;
 * - CC(N) ne devient PAS CC(N+1) : CC, AC, encaissements et couverture de N+1 restent `UNKNOWN`, rien n'est confirmé ;
 * - un `VALIDATED` source donne un CO/AO `VALIDATED` de provenance `prior_year_continuity` (distincte d'une validation
 *   utilisateur), qui porte sa chaîne de preuve ; `VALIDATED(0)` source donne `VALIDATED(0)` ; jamais `UNKNOWN → 0` ;
 * - les observations de N ne sont pas copiées : seule leur référence est conservée dans la provenance.
 * Aucune formule fiscale ici : le moteur V2.1 reste l'unique autorité de calcul.
 */
import {
  classifyF013Contract,
  F013_V2_CONTRACT_VERSION,
  type FactProvenance,
  type MoneyFact,
  type RentReconciliationV2,
} from "./f013-v2-contract";
import {
  evaluateRentReconciliation,
  factsDigest,
  parseRentReconciliationState,
  RENT_RECONCILIATION_V2_STATE_VERSION,
  type RentReconciliationV2State,
} from "./f013-v2-state";

export type ContinuityReasonCode =
  | "STATE_UNREADABLE"
  | "CONTEXT_MISSING"
  | "WRONG_FISCAL_YEAR"
  | "PROPERTY_MISMATCH"
  | "MIXED_FLAT_AND_SCOPED"
  | "DUPLICATE_PROPERTY"
  | "SOURCE_NOT_DEFINITIVE"
  | "CONFIRMATION_ABSENT"
  | "CONFIRMATION_STALE"
  | "REMOVED_PROPERTY_WITH_BALANCE"
  | "SOURCE_PAYLOAD_MISMATCH"
  | "NEXT_PAYLOAD_MISMATCH"
  | "SCHEMA_VERSION_TOO_LOW";

export interface ContinuityReason {
  code: ContinuityReasonCode;
  propertyId?: string;
  detail?: string;
  /** Codes du moteur V2.1 lorsque la source n'est pas définitive. */
  engineCodes?: readonly string[];
}

export interface RentContinuityDraftLike {
  rentReconciliationV2?: unknown;
  biens?: Record<string, { rentReconciliationV2?: unknown } | undefined>;
}

export interface RentContinuityInput {
  fiscalYear: { year: number; propertyIds: readonly string[] } | undefined;
  declarationDraft: RentContinuityDraftLike | undefined;
  /** Biens de l'exercice N+1 ; défaut : ceux de N (`createNextFiscalYear` les reprend à l'identique). */
  targetPropertyIds?: readonly string[];
}

export type RentContinuityPlan =
  | { ok: true; applicable: false; nextStates: Record<string, never>; droppedZeroBalanceProperties: readonly string[] }
  | {
      ok: true;
      applicable: true;
      fromYear: number;
      toYear: number;
      nextStates: Readonly<Record<string, RentReconciliationV2State>>;
      droppedZeroBalanceProperties: readonly string[];
    }
  | { ok: false; reasons: readonly ContinuityReason[] };

/** États F013 v2 d'un draft : à plat (mono) et par bien (scopé), bruts (non validés). */
export function collectRentStatesRaw(draft: RentContinuityDraftLike | undefined): {
  flat: unknown;
  scoped: Array<[string, unknown]>;
} {
  const scoped: Array<[string, unknown]> = [];
  for (const [propertyId, bien] of Object.entries(draft?.biens ?? {})) {
    if (bien?.rentReconciliationV2 !== undefined) scoped.push([propertyId, bien.rentReconciliationV2]);
  }
  return { flat: draft?.rentReconciliationV2, scoped };
}

const UNKNOWN: MoneyFact = { status: "UNKNOWN" };

function openingFact(source: MoneyFact, sourceState: RentReconciliationV2State, nature: "closing_receivable" | "closing_advance"): MoneyFact {
  // La source est garantie VALIDATED par l'admission ; un autre état ne produit jamais de montant.
  if (source.status !== "VALIDATED") return UNKNOWN;
  const provenance: FactProvenance = {
    kind: "prior_year_continuity",
    fromFiscalYear: sourceState.facts.fiscalYear,
    sourcePropertyId: sourceState.facts.propertyId,
    sourceNature: nature,
    sourceStatus: "VALIDATED",
    ...(source.provenance ? { sourceProvenance: source.provenance } : {}),
    sourceRevision: sourceState.facts.revision,
    sourceFactsDigest: factsDigest(sourceState.facts),
    ...(sourceState.facts.links?.observationIds?.length ? { observationIds: [...sourceState.facts.links.observationIds] } : {}),
  };
  return { status: "VALIDATED", amountCents: source.amountCents, provenance };
}

/** Construit l'état N+1 d'UN bien à partir d'un état N admis (définitif). Aucune validation, aucun calcul. */
export function buildNextYearRentState(source: RentReconciliationV2State): RentReconciliationV2State {
  const f = source.facts;
  const confirmation = source.confirmation!;
  const facts: RentReconciliationV2 = {
    contractVersion: F013_V2_CONTRACT_VERSION,
    propertyId: f.propertyId,
    fiscalYear: f.fiscalYear + 1,
    revision: 1,
    collections: UNKNOWN,
    collectionsCoverage: { completeness: "UNKNOWN" },
    openingReceivables: openingFact(f.closingReceivables, source, "closing_receivable"),
    closingReceivables: UNKNOWN,
    openingAdvances: openingFact(f.closingAdvances, source, "closing_advance"),
    closingAdvances: UNKNOWN,
    exceptionsReviewed: false,
  };
  return {
    stateVersion: RENT_RECONCILIATION_V2_STATE_VERSION,
    facts,
    openingContinuity: {
      fromFiscalYear: f.fiscalYear,
      sourcePropertyId: f.propertyId,
      sourceRevision: f.revision,
      sourceFactsDigest: factsDigest(f),
      sourceConfirmation: { revision: confirmation.revision, factsDigest: confirmation.factsDigest, confirmedAt: confirmation.confirmedAt },
    },
  };
}

/**
 * Admission et plan de continuité d'un workspace N. `applicable: false` : aucun état F013 v2, rien n'est modifié
 * (dossier v1 inchangé). Sinon : soit un plan complet, soit les raisons structurées du refus.
 */
export function planRentContinuity(input: RentContinuityInput): RentContinuityPlan {
  const { flat, scoped } = collectRentStatesRaw(input.declarationDraft);
  if (flat === undefined && scoped.length === 0) {
    return { ok: true, applicable: false, nextStates: {}, droppedZeroBalanceProperties: [] };
  }
  const reasons: ContinuityReason[] = [];
  const fy = input.fiscalYear;
  if (!fy || !Number.isInteger(fy.year)) {
    return { ok: false, reasons: [{ code: "CONTEXT_MISSING", detail: "exercice source absent ou invalide" }] };
  }
  if (flat !== undefined && scoped.length > 0) {
    return { ok: false, reasons: [{ code: "MIXED_FLAT_AND_SCOPED" }] };
  }

  const entries: Array<{ key: string | undefined; raw: unknown }> = flat !== undefined
    ? [{ key: undefined, raw: flat }]
    : scoped.map(([key, raw]) => ({ key, raw }));

  const target = input.targetPropertyIds ?? fy.propertyIds;
  if (new Set(target).size !== target.length) reasons.push({ code: "DUPLICATE_PROPERTY", detail: "biens cibles dupliqués" });
  if (new Set(fy.propertyIds).size !== fy.propertyIds.length) reasons.push({ code: "DUPLICATE_PROPERTY", detail: "biens sources dupliqués" });

  const nextStates: Record<string, RentReconciliationV2State> = {};
  const dropped: string[] = [];
  const seen = new Set<string>();

  for (const { key, raw } of entries) {
    const state = parseRentReconciliationState(raw);
    if (!state || classifyF013Contract(state.facts) !== F013_V2_CONTRACT_VERSION) {
      reasons.push({ code: "STATE_UNREADABLE", ...(key ? { propertyId: key } : {}) });
      continue;
    }
    const propertyId = state.facts.propertyId;
    // Mono : un seul bien d'exercice ; scopé : la clé du bien est son identité.
    const propertyOk = key === undefined
      ? fy.propertyIds.length === 1 && fy.propertyIds[0] === propertyId
      : key === propertyId && fy.propertyIds.includes(propertyId);
    if (!propertyOk) {
      reasons.push({ code: "PROPERTY_MISMATCH", propertyId, detail: key ? `clé « ${key} »` : "dossier mono" });
      continue;
    }
    if (seen.has(propertyId)) {
      reasons.push({ code: "DUPLICATE_PROPERTY", propertyId });
      continue;
    }
    seen.add(propertyId);
    if (state.facts.fiscalYear !== fy.year) {
      reasons.push({ code: "WRONG_FISCAL_YEAR", propertyId, detail: `état de ${state.facts.fiscalYear} pour l'exercice ${fy.year}` });
      continue;
    }
    const evaluation = evaluateRentReconciliation(state, { propertyId, fiscalYear: fy.year });
    if (evaluation.result.status !== "SUPPORTED") {
      reasons.push({ code: "SOURCE_NOT_DEFINITIVE", propertyId, engineCodes: evaluation.result.reasons.map((r) => r.code) });
      continue;
    }
    if (state.confirmation === undefined) {
      reasons.push({ code: "CONFIRMATION_ABSENT", propertyId });
      continue;
    }
    if (!evaluation.confirmationFresh) {
      reasons.push({ code: "CONFIRMATION_STALE", propertyId, detail: "révision, empreinte ou total ne concordent plus" });
      continue;
    }
    if (target.includes(propertyId)) {
      nextStates[propertyId] = buildNextYearRentState(state);
    } else {
      // Bien absent de N+1 : jamais de transfert vers un autre bien ; un solde non nul ne peut pas disparaître en silence.
      const inv = evaluation.result.inventory;
      if (inv.closingReceivablesCents !== 0 || inv.closingAdvancesCents !== 0) {
        reasons.push({ code: "REMOVED_PROPERTY_WITH_BALANCE", propertyId });
      } else {
        dropped.push(propertyId);
      }
    }
  }

  if (reasons.length > 0) return { ok: false, reasons };
  return {
    ok: true,
    applicable: true,
    fromYear: fy.year,
    toYear: fy.year + 1,
    nextStates,
    droppedZeroBalanceProperties: dropped,
  };
}

const stable = (value: unknown): string =>
  JSON.stringify(value, (_k, v) =>
    v && typeof v === "object" && !Array.isArray(v)
      ? Object.fromEntries(Object.entries(v as Record<string, unknown>).filter(([, x]) => x !== undefined).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))
      : v);

/** Les états F013 v2 d'un draft sont-ils EXACTEMENT ceux attendus (ni plus, ni moins, ni altérés) ? */
export function rentStatesEqualPlan(
  draft: RentContinuityDraftLike | undefined,
  expected: Readonly<Record<string, RentReconciliationV2State>>,
): boolean {
  const { flat, scoped } = collectRentStatesRaw(draft);
  const actual: Record<string, unknown> = {};
  if (flat !== undefined) {
    const parsed = parseRentReconciliationState(flat);
    if (!parsed) return false;
    actual[parsed.facts.propertyId] = flat;
  }
  for (const [key, raw] of scoped) actual[key] = raw;
  const expectedKeys = Object.keys(expected).sort();
  const actualKeys = Object.keys(actual).sort();
  if (stable(expectedKeys) !== stable(actualKeys)) return false;
  return expectedKeys.every((k) => stable(actual[k]) === stable(expected[k]));
}

/**
 * Vérifie, au rechargement, que l'ouverture d'un état N+1 provient bien de l'état N source (chaîne de preuve). Ne vérifie
 * que l'ouverture et la lignée ; les autres faits de N+1 évoluent librement.
 */
export function verifyOpeningContinuity(
  next: RentReconciliationV2State,
  source: RentReconciliationV2State,
): { ok: true } | { ok: false; reasons: readonly ContinuityReason[] } {
  const propertyId = next.facts.propertyId;
  const evaluation = evaluateRentReconciliation(source, { propertyId: source.facts.propertyId, fiscalYear: source.facts.fiscalYear });
  if (source.facts.propertyId !== propertyId || source.facts.fiscalYear + 1 !== next.facts.fiscalYear) {
    return { ok: false, reasons: [{ code: "PROPERTY_MISMATCH", propertyId }] };
  }
  if (evaluation.result.status !== "SUPPORTED" || !evaluation.confirmationFresh) {
    return { ok: false, reasons: [{ code: "CONFIRMATION_STALE", propertyId }] };
  }
  const expected = buildNextYearRentState(source);
  const same =
    stable(next.openingContinuity) === stable(expected.openingContinuity) &&
    stable(next.facts.openingReceivables) === stable(expected.facts.openingReceivables) &&
    stable(next.facts.openingAdvances) === stable(expected.facts.openingAdvances);
  return same ? { ok: true } : { ok: false, reasons: [{ code: "NEXT_PAYLOAD_MISMATCH", propertyId, detail: "ouverture divergente de la clôture source" }] };
}
