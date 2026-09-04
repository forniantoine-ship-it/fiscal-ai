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
export { deleteDocumentOnServer, DocumentDeletionError } from "./delete-document-client";
export {
  resolveDocumentDeletionPlan,
  runDocumentRemoval,
  type DocumentDeletionPlan,
} from "./document-deletion-plan";
