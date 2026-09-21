export { DossierProvider, useDossier } from "./DossierProvider";
export { getCurrentDossierId, setCurrentDossierId, subscribeCurrentDossierId } from "./current-dossier";
export {
  createLmnpDossier,
  ensureActiveDossier,
  fetchActiveDossierForUser,
  fetchDocumentsForDossier,
  type LmnpDossier,
  type SupabaseDocumentRow,
} from "./supabase-dossier";
export { reconcileWorkspaceDocuments } from "./reconcile-workspace-documents";
export {
  isEligibleAnnualEvidenceForFiscalYear,
  canInjectRemoteDocumentIntoWorkspace,
  canMergeRemoteMetadataIntoLocal,
  proveFiscalYearFromSnapshots,
  resolveEffectiveFiscalYear,
  toDurableHistoricalReference,
  shouldDestroyServerArtifactsOnRemove,
  type DocumentRole,
  type DocumentFiscalOrigin,
  type DurableHistoricalReference,
} from "./document-fiscal-origin";
export { deleteDocumentOnServer, DocumentDeletionError } from "./delete-document-client";
export {
  resolveDocumentDeletionPlan,
  runDocumentRemoval,
  runCreateNewDeclaration,
  type DocumentDeletionPlan,
} from "./document-deletion-plan";
