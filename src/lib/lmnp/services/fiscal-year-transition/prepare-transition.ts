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
import {
  serializeWorkspaceSnapshot,
  WORKSPACE_SNAPSHOT_SCHEMA_VERSION,
} from "@/lib/lmnp/store/workspace-snapshot";
import type { FiscalYear } from "@/lib/lmnp/types/domain";

export type PrepareTransitionFailure =
  | { ok: false; reason: string; code: "not_ready" | "serialize_failed" | "already_closed_without_builder" };

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
    const precondition = canCreateNextFiscalYear(workspace.fiscalYear);
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
        propertyId: workspace.fiscalYear.propertyIds[0],
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
    closedNSchemaVersion: WORKSPACE_SNAPSHOT_SCHEMA_VERSION,
    nextPayload: nextSerialized.envelope,
    nextSchemaVersion: WORKSPACE_SNAPSHOT_SCHEMA_VERSION,
    sourceAlreadyClosed,
  };
}
