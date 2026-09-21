/**
 * Lot 2 — fiscal origin contract for durable documents.
 *
 * Annual evidence belongs to exactly one calendar fiscal year and must never
 * be re-attached to another exercise by reconcile fallback.
 * Durable historical references reuse the same document id + storagePath
 * (same Storage blob) without becoming annual evidence of N+1.
 */

export type DocumentRole = "annual_evidence" | "durable_reference";

export type DocumentFiscalOrigin = {
  fiscalYear: number | null | undefined;
  documentRole?: DocumentRole | null;
  propertyId?: string | null;
};

/**
 * Whether a remote document may appear in the workspace for this calendar year
 * (cross-device restore of that year's metadata).
 *
 * Fail-closed:
 *  - unknown / null fiscal year → never
 *  - mismatched year → never (N never contaminates N+1)
 *
 * Durable references of the *origin* year may restore into that year so
 * Browser B can recover an acte; they still never enter another year.
 */
export function canInjectRemoteDocumentIntoWorkspace(
  origin: DocumentFiscalOrigin,
  workspaceFiscalYear: number,
): boolean {
  if (origin.fiscalYear == null) return false;
  return origin.fiscalYear === workspaceFiscalYear;
}

/**
 * Annual evidence only — durable historical refs are explicitly excluded.
 * Used by callers that must not treat an acte as a justificatif annuel.
 */
export function isEligibleAnnualEvidenceForFiscalYear(
  origin: DocumentFiscalOrigin,
  workspaceFiscalYear: number,
): boolean {
  if (!canInjectRemoteDocumentIntoWorkspace(origin, workspaceFiscalYear)) return false;
  if (origin.documentRole === "durable_reference") return false;
  return true;
}

/**
 * Metadata merge for a document already present locally (snapshot-proven)
 * remains allowed even when the server row is legacy (null fiscal_year).
 * New remote-only injection is never allowed without a proven year match.
 */
export function canMergeRemoteMetadataIntoLocal(params: {
  hasLocalDocument: boolean;
  origin: DocumentFiscalOrigin;
  workspaceFiscalYear: number;
}): boolean {
  if (params.hasLocalDocument) return true;
  return canInjectRemoteDocumentIntoWorkspace(params.origin, params.workspaceFiscalYear);
}

/**
 * Deterministic legacy proof from snapshots: a document id that appears in
 * exactly one snapshot year is attributed to that year. Zero or multiple
 * matches → unresolved (fail-closed).
 */
export function proveFiscalYearFromSnapshots(
  documentId: string,
  snapshots: ReadonlyArray<{ fiscalYear: number; documentIds: ReadonlyArray<string> }>,
): number | undefined {
  const matches = snapshots
    .filter((snapshot) => snapshot.documentIds.includes(documentId))
    .map((snapshot) => snapshot.fiscalYear);
  const unique = [...new Set(matches)];
  return unique.length === 1 ? unique[0] : undefined;
}

/**
 * Resolve effective fiscal year for a legacy server row.
 * Prefer explicit column; otherwise use deterministic snapshot proof only.
 */
export function resolveEffectiveFiscalYear(params: {
  serverFiscalYear: number | null | undefined;
  documentId: string;
  snapshots?: ReadonlyArray<{ fiscalYear: number; documentIds: ReadonlyArray<string> }>;
}): number | undefined {
  if (params.serverFiscalYear != null) return params.serverFiscalYear;
  if (!params.snapshots) return undefined;
  return proveFiscalYearFromSnapshots(params.documentId, params.snapshots);
}

/**
 * Durable historical reference: same documentId + storagePath, no blob copy.
 * Not an annual evidence entry for another exercise.
 */
export type DurableHistoricalReference = {
  documentId: string;
  storagePath: string;
  originFiscalYear: number | null;
  propertyId?: string;
  documentRole: "durable_reference";
  fileName: string;
  mimeType: string;
};

export function toDurableHistoricalReference(params: {
  documentId: string;
  storagePath: string;
  fileName: string;
  mimeType?: string;
  originFiscalYear?: number | null;
  propertyId?: string;
}): DurableHistoricalReference {
  return {
    documentId: params.documentId,
    storagePath: params.storagePath,
    originFiscalYear: params.originFiscalYear ?? null,
    propertyId: params.propertyId,
    documentRole: "durable_reference",
    fileName: params.fileName,
    mimeType: params.mimeType ?? "application/octet-stream",
  };
}

/**
 * Removing a durable reference from a workspace must not destroy the Storage
 * object still needed by a closed exercise. Annual evidence of the active
 * year may still go through the existing server deletion path.
 */
export function shouldDestroyServerArtifactsOnRemove(params: {
  documentRole?: DocumentRole | null;
  originFiscalYear?: number | null;
  activeFiscalYear?: number;
}): boolean {
  if (params.documentRole === "durable_reference") return false;
  if (
    params.originFiscalYear != null &&
    params.activeFiscalYear != null &&
    params.originFiscalYear !== params.activeFiscalYear
  ) {
    return false;
  }
  return true;
}
