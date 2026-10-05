/**
 * F013 v2 — pont documentaire : observations → PROPOSITIONS de faits F013 v2.
 *
 * Ce module ne calcule AUCUN loyer acquis, ne valide rien et ne contourne pas le moteur V2.1 : il produit des
 * propositions (lower bounds documentés), les applique comme faits `PROPOSED` (jamais `VALIDATED`), et laisse
 * `reconcileRentV2` décider. Une source n'est jamais additionnée à une autre : un fait a UNE valeur ; un document qui
 * retrouve le même montant la corrobore, un écart est un conflit signalé, jamais une somme.
 *
 * Sélection de source par `propertyId` : jamais « une grille existe quelque part → toutes les grilles ».
 */
import type { RevenuePropertySession, RevenueGptSession } from "../../../types";
import type { FactProvenance, MoneyFact, OutOfDomainTreatment } from "./f013-v2-contract";
import type { ReconciliationScope } from "./f013-v2-engine";
import {
  observationFromRevenueTransaction,
  type ObservationPropertyAttribution,
  type RentObservation,
} from "./f013-v2-observation";
import { applyFactsChange, type RentFactsChange, type RentReconciliationV2State } from "./f013-v2-state";

export type ProposedFactKey =
  | "collections"
  | "openingReceivables"
  | "closingReceivables"
  | "openingAdvances"
  | "closingAdvances";

export type WithheldReason =
  | "payment_date_unknown"
  | "nature_unknown"
  | "platform_payout_insufficient"
  | "outgoing_movement_needs_qualification"
  | "possible_duplicate_across_documents"
  | "allocation_unknown";

export type ExcludedReason = "property_unknown" | "other_property" | "security_deposit" | "other_nature" | "outgoing" | "reimbursement_or_indemnity";

export interface RentFactProposal {
  amountCents: number;
  observationIds: readonly string[];
  /** Seuls les mouvements documentés sont comptés : une absence de document n'est jamais un zéro. */
  lowerBound: boolean;
  basis: "validated_period" | "proposed_period" | "payment_dates";
}

/** Étendue couverte par un document (ex. relevé du 01/01 au 31/03). Non extraite aujourd'hui : fournie ou inconnue. */
export interface DocumentSpan {
  documentId: string;
  coveredFrom: string;
  coveredTo: string;
}

export interface DocumentCoverageProposal {
  completeness: "COMPLETE" | "PARTIAL";
  coveredMonths: readonly string[];
  basis: "document_spans";
}

export interface DocumentaryProposals {
  scope: ReconciliationScope;
  collections?: RentFactProposal;
  openingReceivables?: RentFactProposal;
  closingReceivables?: RentFactProposal;
  openingAdvances?: RentFactProposal;
  closingAdvances?: RentFactProposal;
  coverage?: DocumentCoverageProposal;
  withheld: ReadonlyArray<{ fact: ProposedFactKey; reason: WithheldReason; observationIds: readonly string[] }>;
  excluded: ReadonlyArray<{ observationId: string; reason: ExcludedReason }>;
  /** Exceptions à faire déclarer par l'utilisateur (non appliquées) : indemnité, remboursement. */
  suggestedExceptions: readonly OutOfDomainTreatment[];
}

const yearOf = (iso: string) => Number(iso.slice(0, 4));

function monthsOfYear(year: number): string[] {
  return Array.from({ length: 12 }, (_, i) => `${year}-${String(i + 1).padStart(2, "0")}`);
}

export function proposeDocumentCoverage(fiscalYear: number, spans: readonly DocumentSpan[]): DocumentCoverageProposal | undefined {
  const covered = new Set<string>();
  for (const span of spans) {
    const from = span.coveredFrom.slice(0, 7);
    const to = span.coveredTo.slice(0, 7);
    for (const month of monthsOfYear(fiscalYear)) if (month >= from && month <= to) covered.add(month);
  }
  if (covered.size === 0) return undefined;
  return {
    completeness: covered.size === 12 ? "COMPLETE" : "PARTIAL",
    coveredMonths: [...covered].sort(),
    basis: "document_spans",
  };
}

/** Pièces mensuelles `(mois, montant)` d'une observation : un mois, ou une ventilation EXPLICITE ; sinon indéterminé. */
function pieces(o: RentObservation): { pieces: Array<{ month: string; amountCents: number }>; unallocated: string[] } {
  if (o.rentalPeriod.status === "UNKNOWN") return { pieces: [], unallocated: [] };
  const months = o.rentalPeriod.value.months;
  if (o.allocations) return { pieces: o.allocations.map((a) => ({ ...a })), unallocated: [] };
  if (months.length === 1) return { pieces: [{ month: months[0]!, amountCents: o.amountCents }], unallocated: [] };
  return { pieces: [], unallocated: [...months] };
}

export function proposeFactsFromObservations(input: {
  scope: ReconciliationScope;
  observations: readonly RentObservation[];
  documentSpans?: readonly DocumentSpan[];
}): DocumentaryProposals {
  const { scope } = input;
  const N = scope.fiscalYear;
  const excluded: Array<{ observationId: string; reason: ExcludedReason }> = [];
  const withheld: Array<{ fact: ProposedFactKey; reason: WithheldReason; observationIds: string[] }> = [];
  const suggested = new Set<OutOfDomainTreatment>();
  const hold = (fact: ProposedFactKey, reason: WithheldReason, ids: string[]) => withheld.push({ fact, reason, observationIds: ids });

  // 1. Dédoublonnage d'identité (ré-import idempotent), puis périmètre bien.
  const seen = new Set<string>();
  const forProperty: RentObservation[] = [];
  for (const o of input.observations) {
    if (seen.has(o.observationId)) continue;
    seen.add(o.observationId);
    if (o.propertyId.status === "UNKNOWN" || o.propertyId.status === "PROPOSED") {
      excluded.push({ observationId: o.observationId, reason: "property_unknown" });
    } else if (o.propertyId.value !== scope.propertyId) {
      excluded.push({ observationId: o.observationId, reason: "other_property" });
    } else {
      forProperty.push(o);
    }
  }

  // 2. Qualification de nature / sens.
  const candidates: RentObservation[] = [];
  for (const o of forProperty) {
    if (o.nature.status === "UNKNOWN") {
      if (o.direction === "incoming") hold("collections", "nature_unknown", [o.observationId]);
      continue;
    }
    switch (o.nature.value) {
      case "deposit":
        excluded.push({ observationId: o.observationId, reason: "security_deposit" });
        break;
      case "platform_payout":
        hold("collections", "platform_payout_insufficient", [o.observationId]);
        break;
      case "reimbursement":
      case "indemnity":
        excluded.push({ observationId: o.observationId, reason: "reimbursement_or_indemnity" });
        suggested.add(o.nature.value === "indemnity" ? "insurance_indemnity" : "refund");
        break;
      case "other":
        excluded.push({ observationId: o.observationId, reason: "other_nature" });
        break;
      case "rent":
        if (o.direction === "outgoing") hold("collections", "outgoing_movement_needs_qualification", [o.observationId]);
        else candidates.push(o);
        break;
    }
  }

  // 3. Dates de paiement indispensables ; doublons inter-documents non prouvables.
  const dated: RentObservation[] = [];
  for (const o of candidates) {
    if (o.paymentDate.status === "UNKNOWN") hold("collections", "payment_date_unknown", [o.observationId]);
    else dated.push(o);
  }
  for (let i = 0; i < dated.length; i += 1) {
    for (let j = i + 1; j < dated.length; j += 1) {
      const a = dated[i]!;
      const b = dated[j]!;
      if (a.evidence.documentId !== b.evidence.documentId && a.amountCents === b.amountCents &&
        a.paymentDate.status !== "UNKNOWN" && b.paymentDate.status !== "UNKNOWN" && a.paymentDate.value === b.paymentDate.value) {
        hold("collections", "possible_duplicate_across_documents", [a.observationId, b.observationId]);
      }
    }
  }

  const proposals: DocumentaryProposals = { scope, withheld, excluded, suggestedExceptions: [...suggested].sort(), };
  const blockedCollections = withheld.some((w) => w.fact === "collections");

  // 4. Encaissements N : somme des seuls paiements datés de N (une source documentaire, jamais cumulée à une autre).
  const paidInN = dated.filter((o) => o.paymentDate.status !== "UNKNOWN" && yearOf(o.paymentDate.value) === N);
  if (!blockedCollections && paidInN.length > 0) {
    proposals.collections = {
      amountCents: paidInN.reduce((s, o) => s + o.amountCents, 0),
      observationIds: paidInN.map((o) => o.observationId).sort(),
      lowerBound: true,
      basis: "payment_dates",
    };
  }

  // 5. Soldes d'inventaire : lower bounds issus de (date de paiement, période économique).
  type Bucket = Exclude<ProposedFactKey, "collections">;
  const predicates: Record<Bucket, (payYear: number, periodYear: number) => boolean> = {
    closingReceivables: (pay, per) => pay > N && per <= N,
    openingReceivables: (pay, per) => pay >= N && per < N,
    closingAdvances: (pay, per) => pay <= N && per > N,
    openingAdvances: (pay, per) => pay < N && per >= N,
  };
  for (const bucket of Object.keys(predicates) as Bucket[]) {
    const test = predicates[bucket];
    let total = 0;
    const ids = new Set<string>();
    let usesProposedPeriod = false;
    for (const o of dated) {
      if (o.paymentDate.status === "UNKNOWN") continue;
      const payYear = yearOf(o.paymentDate.value);
      const split = pieces(o);
      for (const piece of split.pieces) {
        if (test(payYear, yearOf(piece.month))) {
          total += piece.amountCents;
          ids.add(o.observationId);
          if (o.rentalPeriod.status === "PROPOSED") usesProposedPeriod = true;
        }
      }
      if (split.unallocated.some((m) => test(payYear, yearOf(m)))) hold(bucket, "allocation_unknown", [o.observationId]);
    }
    if (total > 0 && !withheld.some((w) => w.fact === bucket)) {
      proposals[bucket] = {
        amountCents: total,
        observationIds: [...ids].sort(),
        lowerBound: true,
        basis: usesProposedPeriod ? "proposed_period" : "validated_period",
      };
    }
  }

  const coverage = proposeDocumentCoverage(N, input.documentSpans ?? []);
  if (coverage) proposals.coverage = coverage;
  return proposals;
}

// ---------------------------------------------------------------------------------------------------------------
// Application : PROPOSED seulement, jamais d'écrasement d'un fait validé, jamais de cumul de sources
// ---------------------------------------------------------------------------------------------------------------

export interface ApplyProposalsReport {
  applied: ProposedFactKey[];
  /** Fait déjà validé et cohérent avec les documents (même valeur, ou lower bound ≤ valeur validée). */
  corroborated: ProposedFactKey[];
  /** Fait validé en désaccord avec les documents : conservé tel quel, jamais écrasé ni additionné. */
  conflicts: Array<{ fact: ProposedFactKey; validatedCents: number; documentaryCents: number }>;
  coverageApplied: boolean;
}

const EXTRACTION: FactProvenance = { kind: "extraction", ref: "documentary_observations" };
const FACT_KEYS: readonly ProposedFactKey[] = ["collections", "openingReceivables", "closingReceivables", "openingAdvances", "closingAdvances"];

export function applyDocumentaryProposals(
  state: RentReconciliationV2State,
  proposals: DocumentaryProposals,
  observations: readonly RentObservation[],
): { state: RentReconciliationV2State; report: ApplyProposalsReport } {
  const report: ApplyProposalsReport = { applied: [], corroborated: [], conflicts: [], coverageApplied: false };
  const change: RentFactsChange = {};
  const usedIds = new Set<string>(state.facts.links?.observationIds ?? []);

  for (const key of FACT_KEYS) {
    const proposal = proposals[key];
    if (!proposal) continue;
    const current: MoneyFact = state.facts[key];
    if (current.status === "VALIDATED") {
      const consistent = key === "collections" ? current.amountCents === proposal.amountCents : proposal.amountCents <= current.amountCents;
      if (consistent) report.corroborated.push(key);
      else report.conflicts.push({ fact: key, validatedCents: current.amountCents, documentaryCents: proposal.amountCents });
      continue;
    }
    change[key] = { status: "PROPOSED", amountCents: proposal.amountCents, provenance: EXTRACTION };
    proposal.observationIds.forEach((id) => usedIds.add(id));
    report.applied.push(key);
  }

  const coverage = proposals.coverage;
  const currentCoverage = state.facts.collectionsCoverage;
  if (coverage && !(currentCoverage.completeness !== "UNKNOWN" && currentCoverage.validation === "VALIDATED")) {
    change.collectionsCoverage = { completeness: coverage.completeness, validation: "PROPOSED", provenance: EXTRACTION };
    report.coverageApplied = true;
  }

  let next = applyFactsChange(state, {
    ...change,
    ...(usedIds.size > 0 ? {} : {}),
  });
  if (usedIds.size > 0) {
    next = applyFactsChange(next, { links: { ...(next.facts.links ?? {}), observationIds: [...usedIds].sort() } });
  }
  // Observations conservées (preuves, corrections, états) : additives, sans effet sur la révision des faits.
  const stored = new Map((next.observations ?? []).map((o) => [o.observationId, o]));
  for (const o of observations) if (!stored.has(o.observationId)) stored.set(o.observationId, o);
  return {
    state: { ...next, observations: [...stored.values()], ...(proposals.coverage ? { documentCoverage: proposals.coverage } : {}) },
    report,
  };
}

export type AcceptableFact = ProposedFactKey | "collectionsCoverage";

/** Geste explicite de l'utilisateur : PROPOSED → VALIDATED (révision +1, confirmation supprimée). Jamais automatique. */
export function acceptProposedFact(state: RentReconciliationV2State, key: AcceptableFact): RentReconciliationV2State {
  const provenance: FactProvenance = { kind: "user_declaration", ref: "accepted_documentary_proposal" };
  if (key === "collectionsCoverage") {
    const c = state.facts.collectionsCoverage;
    if (c.completeness === "UNKNOWN" || c.validation !== "PROPOSED") return state;
    return applyFactsChange(state, { collectionsCoverage: { ...c, validation: "VALIDATED", provenance } });
  }
  const fact = state.facts[key];
  if (fact.status !== "PROPOSED") return state;
  return applyFactsChange(state, { [key]: { status: "VALIDATED", amountCents: fact.amountCents, provenance } });
}

// ---------------------------------------------------------------------------------------------------------------
// Source par bien
// ---------------------------------------------------------------------------------------------------------------

export type SourceChoice =
  | { source: "manual_validated"; sessions: readonly RevenuePropertySession[] }
  | { source: "documentary"; sessions: readonly RevenuePropertySession[] }
  | { source: "none"; sessions: readonly [] };

/**
 * Sessions de revenus applicables à UN bien : celles dont `propertyId` est ce bien ; une session sans `propertyId`
 * n'est attribuable que si le dossier est mono sur ce bien (`monoPropertyId`). Jamais « toutes les sessions ».
 */
export function selectPropertySessions(
  session: RevenueGptSession | undefined,
  scope: ReconciliationScope,
  options: { monoPropertyId?: string } = {},
): RevenuePropertySession[] {
  return (session?.properties ?? []).filter((p) =>
    p.propertyId !== undefined ? p.propertyId === scope.propertyId : options.monoPropertyId === scope.propertyId);
}

export function chooseSourceForProperty(input: {
  scope: ReconciliationScope;
  state: RentReconciliationV2State | undefined;
  session: RevenueGptSession | undefined;
  monoPropertyId?: string;
}): SourceChoice {
  const sessions = selectPropertySessions(input.session, input.scope, { monoPropertyId: input.monoPropertyId });
  if (input.state?.facts.collections.status === "VALIDATED") return { source: "manual_validated", sessions };
  if (sessions.some((s) => (s.transactions?.length ?? 0) > 0)) return { source: "documentary", sessions };
  return { source: "none", sessions: [] };
}

/**
 * Observations d'UN bien depuis ses seules transactions (jamais les lignes de grille, qui sont des projections ou des
 * déclarations agrégées et non des mouvements). `attributionOf` : attribution documentaire explicite par document.
 */
export function observationsForProperty(input: {
  sessions: readonly RevenuePropertySession[];
  scope: ReconciliationScope;
  attributionOf: (documentId: string | undefined, session: RevenuePropertySession) => ObservationPropertyAttribution;
}): RentObservation[] {
  const out: RentObservation[] = [];
  const ordinals = new Map<string, number>();
  for (const session of input.sessions) {
    for (const tx of session.transactions ?? []) {
      const key = `${tx.sourceDocumentId}|${tx.label ?? tx.description}|${tx.amount}|${tx.date}`;
      const ordinal = ordinals.get(key) ?? 0;
      ordinals.set(key, ordinal + 1);
      const built = observationFromRevenueTransaction(tx, {
        fiscalYear: input.scope.fiscalYear,
        attribution: input.attributionOf(tx.sourceDocumentId, session),
        ordinal,
      });
      if (built.ok) out.push(built.observation);
    }
  }
  return out;
}
