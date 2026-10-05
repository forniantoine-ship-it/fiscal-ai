/**
 * F013 v2 — état durable par bien et exercice : faits + révision + confirmation.
 *
 * Source de vérité UNIQUE = les faits (`facts`). Aucun total n'est persisté comme autorité : le résultat est toujours
 * dérivé du moteur (`reconcileRentV2`). La confirmation ne porte que (révision, empreinte des faits, total confirmé)
 * à titre d'audit ; elle n'est « fraîche » que si la révision, l'empreinte ET le total recalculé concordent encore.
 *
 * Module pur, sans dépendance runtime : un fait modifié supprime la confirmation, même si le total reste identique.
 */
import {
  classifyF013Contract,
  F013_V2_CONTRACT_VERSION,
  type MoneyFact,
  type RentReconciliationV2,
} from "./f013-v2-contract";
import { parseRentObservation, type RentObservation } from "./f013-v2-observation";
import { reconcileRentV2, type ReconciliationReason, type ReconciliationResult, type ReconciliationScope } from "./f013-v2-engine";

export const RENT_RECONCILIATION_V2_STATE_VERSION = 1 as const;

export interface RentReconciliationConfirmation {
  /** Révision précise des faits confirmés. */
  revision: number;
  /** Empreinte canonique des faits confirmés (hors révision). */
  factsDigest: string;
  /** Total confirmé, en centimes : audit seulement, jamais lu comme valeur fiscale. */
  confirmedLoyersAcquisCents: number;
  confirmedAt: string;
}

export interface RentOpeningContinuity {
  fromFiscalYear: number;
  sourcePropertyId: string;
  sourceRevision: number;
  sourceFactsDigest: string;
  /**
   * Confirmation de N d'où provient la continuité : révision et empreinte seulement. Le total des loyers acquis de N
   * n'est volontairement PAS copié dans N+1 (il se retrouve en rechargeant l'état source).
   */
  sourceConfirmation: Pick<RentReconciliationConfirmation, "revision" | "factsDigest" | "confirmedAt">;
}

export interface RentReconciliationV2State {
  stateVersion: typeof RENT_RECONCILIATION_V2_STATE_VERSION;
  facts: RentReconciliationV2;
  confirmation?: RentReconciliationConfirmation;
  /**
   * V2.3 — observations documentaires (preuves, corrections, états) : additif, hors empreinte des faits. Ne porte aucune
   * autorité fiscale ; sa modification seule ne change ni la révision ni la confirmation. Restent dans le contrat v3.
   */
  observations?: RentObservation[];
  /**
   * V2.6 — lignée de l'ouverture : état F013 de l'exercice précédent (révision, empreinte, confirmation) dont CO/AO
   * sont issus. Absent pour une première année ou une saisie manuelle. Additif, hors empreinte des faits.
   */
  openingContinuity?: RentOpeningContinuity;
  /** V2.3 — couverture PROPOSÉE par les documents (la couverture retenue vit dans `facts.collectionsCoverage`). */
  documentCoverage?: { completeness: "COMPLETE" | "PARTIAL"; coveredMonths: readonly string[]; basis: "document_spans" };
}

const UNKNOWN_FACT: MoneyFact = { status: "UNKNOWN" };

/** Rapprochement vierge : tout est inconnu, rien n'est assimilé à zéro. */
export function createRentReconciliationState(scope: ReconciliationScope): RentReconciliationV2State {
  return {
    stateVersion: RENT_RECONCILIATION_V2_STATE_VERSION,
    facts: {
      contractVersion: F013_V2_CONTRACT_VERSION,
      propertyId: scope.propertyId,
      fiscalYear: scope.fiscalYear,
      revision: 0,
      collections: UNKNOWN_FACT,
      collectionsCoverage: { completeness: "UNKNOWN" },
      openingReceivables: UNKNOWN_FACT,
      closingReceivables: UNKNOWN_FACT,
      openingAdvances: UNKNOWN_FACT,
      closingAdvances: UNKNOWN_FACT,
      exceptionsReviewed: false,
    },
  };
}

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

/** Empreinte déterministe (FNV-1a 32 bits) des faits, hors révision. Détecte une altération, pas un adversaire. */
export function factsDigest(facts: RentReconciliationV2): string {
  const { revision: _revision, ...content } = facts;
  void _revision;
  const text = canonical(content);
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

export type RentFactsChange = Partial<
  Pick<
    RentReconciliationV2,
    | "collections"
    | "collectionsCoverage"
    | "openingReceivables"
    | "closingReceivables"
    | "openingAdvances"
    | "closingAdvances"
    | "exceptionsReviewed"
    | "outOfDomain"
    | "links"
  >
>;

/**
 * Applique une modification de faits. Si le contenu change : révision +1 et confirmation supprimée. Un contenu
 * identique est un no-op (même objet). L'égalité de total n'est jamais un critère de fraîcheur.
 */
export function applyFactsChange(state: RentReconciliationV2State, change: RentFactsChange): RentReconciliationV2State {
  const nextFacts: RentReconciliationV2 = { ...state.facts, ...change };
  // État canonique : une clé `undefined` n'est jamais conservée (elle ne survivrait pas à un aller-retour JSON).
  for (const key of Object.keys(nextFacts) as (keyof RentReconciliationV2)[]) {
    if (nextFacts[key] === undefined) delete nextFacts[key];
  }
  if (factsDigest(nextFacts) === factsDigest(state.facts)) return state;
  // Les données additives (observations, couverture documentaire) sont conservées ; la confirmation, jamais.
  const { confirmation: _dropped, ...rest } = state;
  void _dropped;
  return { ...rest, facts: { ...nextFacts, revision: state.facts.revision + 1 } };
}

export interface RentReconciliationEvaluation {
  result: ReconciliationResult;
  /** La confirmation persistée correspond-elle encore EXACTEMENT aux faits courants ? */
  confirmationFresh: boolean;
  /** Une confirmation existe mais n'est plus valable (révision, empreinte ou total divergents). */
  confirmationStale: boolean;
}

export function evaluateRentReconciliation(
  state: RentReconciliationV2State,
  scope: ReconciliationScope,
): RentReconciliationEvaluation {
  const result = reconcileRentV2(state.facts, scope);
  const c = state.confirmation;
  const fresh =
    c !== undefined &&
    result.status === "SUPPORTED" &&
    c.revision === state.facts.revision &&
    c.factsDigest === factsDigest(state.facts) &&
    c.confirmedLoyersAcquisCents === result.loyersAcquisCents;
  return { result, confirmationFresh: fresh, confirmationStale: c !== undefined && !fresh };
}

export type ConfirmRentReconciliation =
  | { ok: true; state: RentReconciliationV2State }
  | { ok: false; reasons: readonly ReconciliationReason[] };

/** Confirme la révision courante ; refuse tant que le moteur ne conclut pas `SUPPORTED`. */
export function confirmRentReconciliation(
  state: RentReconciliationV2State,
  scope: ReconciliationScope,
  confirmedAtIso: string,
): ConfirmRentReconciliation {
  const { result } = evaluateRentReconciliation(state, scope);
  if (result.status !== "SUPPORTED") return { ok: false, reasons: result.reasons };
  return {
    ok: true,
    state: {
      ...state,
      confirmation: {
        revision: state.facts.revision,
        factsDigest: factsDigest(state.facts),
        confirmedLoyersAcquisCents: result.loyersAcquisCents,
        confirmedAt: confirmedAtIso,
      },
    },
  };
}

/**
 * Restauration défensive d'un état persisté. Retourne `null` pour tout objet qui n'est pas un état F013 v2 valide
 * (en particulier une sortie legacy `legacy_cash_v1`) : jamais une reconstruction depuis un total.
 */
export function parseRentReconciliationState(raw: unknown): RentReconciliationV2State | null {
  if (typeof raw !== "object" || raw === null) return null;
  const record = raw as Record<string, unknown>;
  if (record.stateVersion !== RENT_RECONCILIATION_V2_STATE_VERSION) return null;
  const facts = record.facts;
  if (classifyF013Contract(facts) !== F013_V2_CONTRACT_VERSION) return null;
  const f = facts as Record<string, unknown>;
  if (typeof f.propertyId !== "string" || !Number.isInteger(f.fiscalYear) || !Number.isInteger(f.revision)) return null;
  const state = raw as RentReconciliationV2State;
  if (state.observations === undefined) return state;
  // V2.3 — une observation mal formée ou dont un champ VALIDATED n'est pas justifié par une correction est écartée :
  // jamais promue, jamais « réparée ».
  return { ...state, observations: (Array.isArray(state.observations) ? state.observations : []).filter((o) => parseRentObservation(o) !== null) };
}

/** Une donnée F013 v2 est-elle présente dans ce draft (plat ou au sein d'un bien) ? Détermine la version de snapshot. */
export function draftCarriesRentReconciliationV2(draft: {
  rentReconciliationV2?: unknown;
  biens?: Record<string, { rentReconciliationV2?: unknown }>;
} | undefined): boolean {
  if (!draft) return false;
  if (draft.rentReconciliationV2 !== undefined) return true;
  return Object.values(draft.biens ?? {}).some((bien) => bien.rentReconciliationV2 !== undefined);
}
