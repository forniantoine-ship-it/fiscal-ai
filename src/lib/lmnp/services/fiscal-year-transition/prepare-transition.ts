/**
 * Lot 3 — prepare deterministic N closed + N+1 candidate from Lot 1 builder.
 * Pure (aside from optional id factory). Never talks to the network.
 */
import {
  buildNextExerciseFromClosedYear,
  canCloseFiscalYear,
  canCreateNextFiscalYear,
  closeFiscalYear,
  extractDossierLevelDataFromWorkspace,
} from "@/lib/lmnp/services/dossier/fiscal-year-cycle";
import { snapshotImmobilisationsFromGeneratedRfs } from "@/lib/lmnp/services/dossier/immobilisations-comptables";
import type { PersistedWorkspace } from "@/lib/lmnp/store/persistence";
import { serializeWorkspaceSnapshot } from "@/lib/lmnp/store/workspace-snapshot";
import type { FiscalYear } from "@/lib/lmnp/types/domain";
import {
  isMultiPropertyClosingBlocked,
  isMultiPropertyNextYearBlocked,
  MULTI_PROPERTY_NOT_ENABLED_CODE,
  MULTI_PROPERTY_NOT_ENABLED_MESSAGE,
} from "@/lib/lmnp/dossier/multi-property-activation";
import {
  F013_V2_CONTINUITY_NOT_SUPPORTED_CODE,
  F013_V2_CONTINUITY_NOT_SUPPORTED_MESSAGE,
  isF013V2ContinuityBlocked,
} from "@/lib/lmnp/services/f013/v2/f013-v2-transition-guard";
import { resolveMonoPropertyId } from "@/lib/lmnp/dossier/property-scope";

export type PrepareTransitionFailure =
  | { ok: false; reason: string; code: "not_ready" | "serialize_failed" | "already_closed_without_builder" | "multi_property_not_enabled" | typeof F013_V2_CONTINUITY_NOT_SUPPORTED_CODE };

export type PrepareTransitionSuccess = {
  ok: true;
  fromYear: number;
  nextYear: number;
  closedFiscalYear: FiscalYear;
  nextWorkspace: PersistedWorkspace;
  closedNPayload: unknown;
  closedNSchemaVersion: number;
  nextPayload: unknown;
  nextSchemaVersion: number;
  /** True when N was already closed — candidate may be ignored by idempotent server. */
  sourceAlreadyClosed: boolean;
};

export type PrepareTransitionResult = PrepareTransitionSuccess | PrepareTransitionFailure;

export function prepareFiscalYearTransitionCandidate(input: {
  workspace: PersistedWorkspace;
  dossierId: string;
  now: string;
  nextFiscalYearId?: string;
}): PrepareTransitionResult {
  const { workspace, dossierId, now } = input;
  // R2C.3c1 — barrière multi explicite AVANT resolveMonoPropertyId / snapshot mono / préparation N+1 (R2C.5 les rendra
  // multi-compatibles). Source ouverte ou déjà close : même refus.
  if (isMultiPropertyClosingBlocked(workspace) || isMultiPropertyNextYearBlocked(workspace)) {
    return { ok: false, reason: MULTI_PROPERTY_NOT_ENABLED_MESSAGE, code: MULTI_PROPERTY_NOT_ENABLED_CODE };
  }
  // F013 v2 — continuité N→N+1 non définie : refus AVANT toute préparation (source ouverte ou déjà close).
  if (isF013V2ContinuityBlocked(workspace)) {
    return { ok: false, reason: F013_V2_CONTINUITY_NOT_SUPPORTED_MESSAGE, code: F013_V2_CONTINUITY_NOT_SUPPORTED_CODE };
  }
  const sourceAlreadyClosed = workspace.fiscalYear.status === "closed";

  if (!sourceAlreadyClosed) {
    const precondition = canCloseFiscalYear({
      fiscalYear: workspace.fiscalYear,
      declarationDraft: workspace.declarationDraft,
      properties: workspace.properties,
    });
    if (!precondition.ok) {
      return { ok: false, reason: precondition.reason, code: "not_ready" };
    }
  } else {
    const precondition = canCreateNextFiscalYear(workspace.fiscalYear, workspace);
    if (!precondition.ok) {
      return { ok: false, reason: precondition.reason, code: "not_ready" };
    }
  }

  const fiscalResult = workspace.declarationDraft?.fiscalResult;
  if (!sourceAlreadyClosed && !fiscalResult) {
    return {
      ok: false,
      reason: "Impossible de clôturer cet exercice : aucun résultat fiscal disponible pour figer une clôture.",
      code: "not_ready",
    };
  }

  const patrimoineN = workspace.declarationDraft?.rfs?.patrimoine;
  const ranSituationN = workspace.declarationDraft?.bilanPatrimonial?.ran?.situation;
  const patrimoineSource =
    patrimoineN !== undefined && ranSituationN !== undefined
      ? { state: patrimoineN, ranSituation: ranSituationN }
      : undefined;

  // Lot 5 B1 — snapshot depuis la RFS déjà générée/validée de N, au boundary
  // produit réel (prepare → RPC Lot 3). Jamais une année déjà clôturée.
  const immobilisationsComptables = sourceAlreadyClosed
    ? undefined
    : snapshotImmobilisationsFromGeneratedRfs({
        immobilisations: workspace.declarationDraft?.rfs?.immobilisations,
        exerciceFiscal: workspace.fiscalYear.year,
        propertyId: resolveMonoPropertyId(workspace),
      });

  const closedFiscalYearIdentity: FiscalYear = sourceAlreadyClosed
    ? { ...workspace.fiscalYear, dossierId, updatedAt: now }
    : closeFiscalYear(
        { ...workspace.fiscalYear, status: "closed", dossierId, updatedAt: now },
        fiscalResult!,
        now,
        {
          sourceDeclarationVersionId: workspace.declarationDraft?.declaration?.currentVersionId,
          patrimoine: patrimoineSource,
          immobilisationsComptables,
        },
      );

  const { properties } = extractDossierLevelDataFromWorkspace(workspace);
  const built = buildNextExerciseFromClosedYear({
    closedFiscalYear: closedFiscalYearIdentity,
    previousDraft: workspace.declarationDraft,
    dossierId,
    nextFiscalYearId: input.nextFiscalYearId ?? crypto.randomUUID(),
    now,
  });

  const nextWorkspace: PersistedWorkspace = {
    fiscalYear: built.fiscalYear,
    properties,
    documents: [],
    extractions: [],
    validationItems: [],
    ledgerEntries: [],
    declarationDraft: built.declarationDraft,
    aiActivityFeed: [],
  };

  const closedWorkspace: PersistedWorkspace = {
    ...workspace,
    fiscalYear: closedFiscalYearIdentity,
    properties,
  };

  const closedSerialized = serializeWorkspaceSnapshot(closedWorkspace);
  const nextSerialized = serializeWorkspaceSnapshot(nextWorkspace);
  if (!closedSerialized.ok || !nextSerialized.ok) {
    return {
      ok: false,
      reason: "Impossible de sérialiser le snapshot de transition.",
      code: "serialize_failed",
    };
  }

  return {
    ok: true,
    fromYear: closedFiscalYearIdentity.year,
    nextYear: built.fiscalYear.year,
    closedFiscalYear: closedFiscalYearIdentity,
    nextWorkspace,
    closedNPayload: closedSerialized.envelope,
    // R2B.2a — version portée par chaque enveloppe (v1 mono inchangé ; v2 seulement pour un workspace scopé).
    closedNSchemaVersion: closedSerialized.envelope.schemaVersion,
    nextPayload: nextSerialized.envelope,
    nextSchemaVersion: nextSerialized.envelope.schemaVersion,
    sourceAlreadyClosed,
  };
}
