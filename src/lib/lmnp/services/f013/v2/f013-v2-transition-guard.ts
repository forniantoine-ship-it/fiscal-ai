/**
 * F013 v2 — garde de la transition N → N+1 : garde de CAPACITÉ et de VALIDITÉ (fail-closed).
 *
 * Avant V2.6 : toute clôture d'un workspace portant F013 v2 était refusée (la continuité n'existait pas). Désormais la
 * clôture est ADMISE si et seulement si :
 *
 *   source F013 définitive  ∧  continuité démontrable (plan constructible)  ∧  cible constructible  ∧  gardes verts.
 *
 * Sinon elle reste refusée, avec des raisons structurées. Le code `f013_v2_continuity_not_supported` est conservé comme
 * code unique de refus (les clients et le serveur le connaissent déjà). Un dossier sans donnée F013 v2 (v1) n'est pas
 * concerné : `NOT_APPLICABLE`, comportement historique inchangé. Module pur.
 */
import {
  collectRentStatesRaw,
  planRentContinuity,
  rentStatesEqualPlan,
  type ContinuityReason,
  type RentContinuityDraftLike,
  type RentContinuityInput,
} from "./f013-v2-continuity";
import { WORKSPACE_SNAPSHOT_RENT_V2_SCHEMA_VERSION } from "../../../store/workspace-snapshot";

export const F013_V2_CONTINUITY_NOT_SUPPORTED_CODE = "f013_v2_continuity_not_supported" as const;
export const F013_V2_CONTINUITY_NOT_SUPPORTED_MESSAGE =
  "Ce dossier contient un rapprochement des loyers (F013 v2) dont le report sur l'exercice suivant ne peut pas être démontré : la clôture est impossible tant que ce rapprochement n'est pas définitif et confirmé. Aucune donnée n'a été modifiée.";

export type F013V2ContinuityVerdict =
  | { status: "NOT_APPLICABLE" }
  | { status: "ADMITTED" }
  | { status: "BLOCKED"; reasons: readonly ContinuityReason[] };

type WorkspaceLike = {
  fiscalYear?: { year?: number; propertyIds?: readonly string[] } | undefined;
  declarationDraft?: RentContinuityDraftLike | undefined;
} | null | undefined;

function inputOf(workspace: WorkspaceLike, targetPropertyIds?: readonly string[]): RentContinuityInput {
  const fy = workspace?.fiscalYear;
  return {
    fiscalYear: fy && typeof fy.year === "number" ? { year: fy.year, propertyIds: fy.propertyIds ?? [] } : undefined,
    declarationDraft: workspace?.declarationDraft,
    ...(targetPropertyIds ? { targetPropertyIds } : {}),
  };
}

/** Verdict d'admission de la clôture d'un workspace N. */
export function evaluateF013V2Continuity(workspace: WorkspaceLike, targetPropertyIds?: readonly string[]): F013V2ContinuityVerdict {
  const plan = planRentContinuity(inputOf(workspace, targetPropertyIds));
  if (!plan.ok) return { status: "BLOCKED", reasons: plan.reasons };
  return plan.applicable ? { status: "ADMITTED" } : { status: "NOT_APPLICABLE" };
}

/** Vrai si la transition doit être REFUSÉE (état F013 v2 présent mais continuité non démontrable). */
export function isF013V2ContinuityBlocked(workspace: WorkspaceLike, targetPropertyIds?: readonly string[]): boolean {
  return evaluateF013V2Continuity(workspace, targetPropertyIds).status === "BLOCKED";
}

/** Message utilisateur : message de base + raisons lisibles. */
export function describeContinuityBlock(reasons: readonly ContinuityReason[]): string {
  const labels: Record<ContinuityReason["code"], string> = {
    STATE_UNREADABLE: "état illisible",
    CONTEXT_MISSING: "exercice source indéterminé",
    WRONG_FISCAL_YEAR: "exercice incohérent",
    PROPERTY_MISMATCH: "bien incohérent",
    MIXED_FLAT_AND_SCOPED: "états à plat et par bien mélangés",
    DUPLICATE_PROPERTY: "bien en double",
    SOURCE_NOT_DEFINITIVE: "rapprochement non définitif (donnée inconnue, proposée ou incomplète)",
    CONFIRMATION_ABSENT: "rapprochement non confirmé",
    CONFIRMATION_STALE: "confirmation périmée",
    REMOVED_PROPERTY_WITH_BALANCE: "bien retiré avec un solde non nul",
    SOURCE_PAYLOAD_MISMATCH: "données transmises divergentes de l'exercice enregistré",
    NEXT_PAYLOAD_MISMATCH: "ouverture de l'exercice suivant non conforme à la clôture",
    SCHEMA_VERSION_TOO_LOW: "version de schéma insuffisante",
  };
  const unique = [...new Set(reasons.map((r) => labels[r.code]))];
  return unique.length === 0 ? F013_V2_CONTINUITY_NOT_SUPPORTED_MESSAGE : `${F013_V2_CONTINUITY_NOT_SUPPORTED_MESSAGE} Motif : ${unique.join(" ; ")}.`;
}

function workspaceOfPayload(payload: unknown): WorkspaceLike {
  if (!payload || typeof payload !== "object") return undefined;
  const candidate = payload as { workspace?: unknown };
  const workspace = candidate.workspace && typeof candidate.workspace === "object" ? candidate.workspace : payload;
  return workspace as WorkspaceLike;
}

const carriesRent = (workspace: WorkspaceLike): boolean => {
  const { flat, scoped } = collectRentStatesRaw(workspace?.declarationDraft);
  return flat !== undefined || scoped.length > 0;
};

/** Payload (enveloppe ou workspace nu) portant une donnée F013 v2 dont la continuité n'est pas démontrable. */
export function isF013V2ContinuityPayload(payload: unknown): boolean {
  const workspace = workspaceOfPayload(payload);
  return carriesRent(workspace) && isF013V2ContinuityBlocked(workspace);
}

export type TransitionPayloadVerification = { ok: true } | { ok: false; reasons: readonly ContinuityReason[] };

/**
 * Autorité SERVEUR : les payloads transmis pour la transition portent-ils exactement la continuité attendue ?
 *  - l'état source STOCKÉ (snapshot serveur de N) doit être définitif (plan admis) ;
 *  - le N clos transmis doit porter les MÊMES états F013 que le snapshot stocké ;
 *  - le N+1 transmis doit porter EXACTEMENT les états du plan (ni ajout, ni altération, ni absence) ;
 *  - les versions de schéma doivent être ≥ 3 dès qu'une donnée F013 v2 est portée (jamais de rétrogradation).
 * Sans aucune donnée F013 v2 nulle part : historique inchangé (`ok`).
 */
export function verifyF013V2TransitionPayloads(input: {
  stored: unknown;
  closed: unknown;
  closedSchemaVersion: number;
  next: unknown;
  nextSchemaVersion: number;
}): TransitionPayloadVerification {
  const stored = workspaceOfPayload(input.stored);
  const closed = workspaceOfPayload(input.closed);
  const next = workspaceOfPayload(input.next);
  if (!carriesRent(stored) && !carriesRent(closed) && !carriesRent(next)) return { ok: true };

  if (!carriesRent(stored)) {
    // Un client ne peut pas introduire F013 v2 que le serveur ne connaît pas.
    return { ok: false, reasons: [{ code: "SOURCE_PAYLOAD_MISMATCH", detail: "aucun état F013 v2 dans le snapshot enregistré" }] };
  }
  const nextFy = next?.fiscalYear;
  const plan = planRentContinuity({
    ...inputOf(stored),
    ...(nextFy && Array.isArray(nextFy.propertyIds) ? { targetPropertyIds: nextFy.propertyIds } : {}),
  });
  if (!plan.ok) return { ok: false, reasons: plan.reasons };
  if (!plan.applicable) return { ok: true };

  const storedStates = collectRentStatesRaw(stored?.declarationDraft);
  const closedStates = collectRentStatesRaw(closed?.declarationDraft);
  const sameSource = JSON.stringify([storedStates.flat ?? null, storedStates.scoped]) === JSON.stringify([closedStates.flat ?? null, closedStates.scoped]);
  if (!sameSource) return { ok: false, reasons: [{ code: "SOURCE_PAYLOAD_MISMATCH", detail: "N clos différent du snapshot enregistré" }] };

  if (!rentStatesEqualPlan(next?.declarationDraft, plan.nextStates)) {
    return { ok: false, reasons: [{ code: "NEXT_PAYLOAD_MISMATCH" }] };
  }
  const needsV3 = (workspace: WorkspaceLike) => carriesRent(workspace);
  if ((needsV3(closed) && input.closedSchemaVersion < WORKSPACE_SNAPSHOT_RENT_V2_SCHEMA_VERSION) ||
    (needsV3(next) && input.nextSchemaVersion < WORKSPACE_SNAPSHOT_RENT_V2_SCHEMA_VERSION)) {
    return { ok: false, reasons: [{ code: "SCHEMA_VERSION_TOO_LOW" }] };
  }
  return { ok: true };
}
