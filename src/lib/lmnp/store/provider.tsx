"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  createDefaultWorkspace,
  flushWorkspaceSave,
  hydrateLmnpStore,
  loadDocumentFile,
  markAutosaveSaved,
  removePersistedDocument,
  resetAutosaveStatus,
  scheduleSaveWorkspace,
  subscribeAutosaveStatus,
  syncDocumentBlobs,
  type AutosaveStatus,
} from "./persistence";
import { lmnpReducer, selectWorkspace, type LmnpAction, type LmnpState } from "./reducer";
import type { DeclarationDraft } from "../types";
import { AppLoadingSkeleton } from "@/components/lmnp/shared/AppLoadingSkeleton";
import { subscribeAuthBoundary } from "@/lib/lmnp/auth/auth-boundary";
import {
  logWorkspaceHydrationComplete,
  logWorkspaceHydrationStart,
} from "@/lib/lmnp/hydration";
import { LmnpHydrationProvider } from "@/lib/lmnp/hydration";
import {
  deleteDocumentOnServer,
  ensureActiveDossier,
  fetchDocumentsForDossier,
  getCurrentDossierId,
  reconcileWorkspaceDocuments,
  resolveDocumentDeletionPlan,
  runCreateNewDeclaration,
  runDocumentRemoval,
} from "@/lib/lmnp/dossier";
interface LmnpContextValue {
  workspace: ReturnType<typeof selectWorkspace>;
  dispatch: (action: LmnpAction) => void;
  getFile: (documentId: string) => File | undefined;
  isReady: boolean;
  autosaveStatus: AutosaveStatus;
  /** Bound auth user id — null means IndexedDB workspace writes are disabled. */
  persistenceUserId: string | null;
  /** Flush pending debounced save; optional draft patch for not-yet-committed dispatches. */
  flushWorkspace: (patch?: { declarationDraft?: Partial<DeclarationDraft> }) => Promise<void>;
  /** Document ids currently awaiting server-side deletion confirmation (Supabase-backed documents only). */
  pendingDocumentDeletions: Set<string>;
  /** Last document-deletion error, if any — cleared on the next removal attempt for that document. */
  documentDeletionError: { documentId: string; message: string } | null;
}

const LmnpContext = createContext<LmnpContextValue | null>(null);

function toPersisted(state: LmnpState) {
  return {
    fiscalYear: state.fiscalYear,
    properties: state.properties,
    documents: state.documents,
    extractions: state.extractions,
    validationItems: state.validationItems,
    ledgerEntries: state.ledgerEntries,
    declarationDraft: state.declarationDraft ?? { completedSteps: [] },
    // AI Activity Feed is the persistent business narrative — must survive refresh/remount.
    aiActivityFeed: state.aiActivityFeed,
  };
}

export function LmnpProvider({ children }: { children: ReactNode }) {
  const [isReady, setIsReady] = useState(false);
  const [isHydratingWorkspace, setIsHydratingWorkspace] = useState(true);
  const [autosaveStatus, setAutosaveStatus] = useState<AutosaveStatus>("idle");
  const [persistenceUserId, setPersistenceUserId] = useState<string | null>(null);
  const [pendingDocumentDeletions, setPendingDocumentDeletions] = useState<Set<string>>(new Set());
  const [documentDeletionError, setDocumentDeletionError] = useState<{
    documentId: string;
    message: string;
  } | null>(null);
  const [state, dispatch] = useReducer(
    lmnpReducer,
    { ...createDefaultWorkspace(), fileRegistry: new Map() } as LmnpState,
    (initial) => initial,
  );

  const stateRef = useRef(state);
  stateRef.current = state;

  const authUserIdRef = useRef<string | null>(null);
  const pendingFileLoadsRef = useRef(new Set<string>());

  useEffect(() => {
    return subscribeAuthBoundary(async ({ userId, previousUserId, userChanged }) => {
      try {
        if (userChanged && previousUserId) {
          await flushWorkspaceSave(previousUserId, toPersisted(stateRef.current));
        }

        authUserIdRef.current = userId;
        setPersistenceUserId(userId);
        setIsReady(false);
        setIsHydratingWorkspace(true);
        logWorkspaceHydrationStart();
        pendingFileLoadsRef.current.clear();

        if (!userId) {
          dispatch({ type: "AUTH_SESSION_RESET" });
          resetAutosaveStatus();
          return;
        }

        const { workspace, fileRegistry } = await hydrateLmnpStore(userId);
        const baseWorkspace = workspace ?? createDefaultWorkspace();

        const dossier = await ensureActiveDossier(userId);
        const supabaseDocuments = dossier ? await fetchDocumentsForDossier(dossier.id) : [];
        const reconciliation = reconcileWorkspaceDocuments({
          localDocuments: baseWorkspace.documents,
          supabaseDocuments,
          fiscalYearId: baseWorkspace.fiscalYear.id,
          propertyId: baseWorkspace.fiscalYear.propertyIds[0],
          localBlobDocumentIds: new Set(fileRegistry.keys()),
          localExtractedDocumentIds: new Set(baseWorkspace.extractions.map((e) => e.documentId)),
        });

        console.log("[workspace] reconciliation completed", {
          userId,
          localCount: baseWorkspace.documents.length,
          supabaseCount: supabaseDocuments.length,
          mergedCount: reconciliation.documents.length,
        });

        // TEMPORARY AUDIT LOG — remove after root-cause is confirmed
        const restoredDocs = reconciliation.documents.filter((d) => d.category === "charges");
        console.log("[charges-hydration]", {
          restoredDocs: restoredDocs.map((doc) => ({
            id: doc.id,
            fileName: doc.fileName,
            status: doc.status,
            hasAnalysis: baseWorkspace.extractions.some((e) => e.documentId === doc.id),
          })),
        });
        // TEMPORARY AUDIT LOG — remove after root-cause is confirmed
        console.log("[charges-hydration-debug]", {
          indexedDbDocCount: baseWorkspace.documents.length,
          fileRegistryKeys: [...fileRegistry.keys()],
          workspaceDocuments: baseWorkspace.documents.map((doc) => ({
            id: doc.id,
            fileName: doc.fileName,
            category: doc.category,
            status: doc.status,
            hasLocalBlob: fileRegistry.has(doc.id),
            hasExtractions: baseWorkspace.extractions.some((e) => e.documentId === doc.id),
          })),
          reconciledDocuments: reconciliation.documents.map((doc) => ({
            id: doc.id,
            fileName: doc.fileName,
            category: doc.category,
            status: doc.status,
            hasLocalBlob: fileRegistry.has(doc.id),
            hasExtractions: baseWorkspace.extractions.some((e) => e.documentId === doc.id),
          })),
        });

        // GLOBAL HYDRATION ANALYZED PROMOTION
        // Runs after reconciliation, before HYDRATE dispatch, for ALL document categories.
        // Invariant: if a doc has persisted extractions, its analysis already completed in a
        // prior session. The stored status may be stale ("uploaded") due to the 350ms debounce
        // save racing an auth event, or Supabase rows being absent. Promote unconditionally.
        const extractedDocIds = new Set(baseWorkspace.extractions.map((e) => e.documentId));
        const promotedDocuments = reconciliation.documents.map((doc) => {
          const previousStatus = doc.status;
          const hasPersistedExtractions = extractedDocIds.has(doc.id);
          const finalStatus =
            doc.status === "uploaded" && hasPersistedExtractions ? "analyzed" as const : doc.status;
          // TEMPORARY AUDIT LOG — remove after root-cause is confirmed
          console.log("[global-hydration-promotion]", {
            id: doc.id,
            fileName: doc.fileName,
            category: doc.category,
            previousStatus,
            hasPersistedExtractions,
            finalStatus,
          });
          return finalStatus !== previousStatus ? { ...doc, status: finalStatus } : doc;
        });

        if (workspace) {
          console.log("[workspace] restored existing workspace", { userId });
        } else {
          console.log("[workspace] initialized fresh workspace", { userId });
        }

        dispatch({
          type: "HYDRATE",
          payload: {
            ...baseWorkspace,
            documents: promotedDocuments,
          },
          files: fileRegistry,
        });

        markAutosaveSaved();
      } finally {
        logWorkspaceHydrationComplete();
        setIsHydratingWorkspace(false);
        console.log("[workspace] hydration completed", { userId: authUserIdRef.current });
        setIsReady(true);
      }
    });
  }, []);

  useEffect(() => subscribeAutosaveStatus(setAutosaveStatus), []);

  useEffect(() => {
    if (!isReady || !authUserIdRef.current) return;
    scheduleSaveWorkspace(toPersisted(state), authUserIdRef.current);
  }, [
    isReady,
    state.fiscalYear,
    state.properties,
    state.documents,
    state.extractions,
    state.validationItems,
    state.ledgerEntries,
    // declarationDraft and aiActivityFeed must be in deps so changes to
    // confirmed financing, event cards, and resolutions are saved immediately.
    state.declarationDraft,
    state.aiActivityFeed,
  ]);

  useLayoutEffect(() => {
    if (!isReady) return;
    void syncDocumentBlobs(state.documents, state.fileRegistry, authUserIdRef.current);
  }, [isReady, state.documents, state.fileRegistry]);

  useEffect(() => {
    if (!isReady) return;

    const flush = () => {
      scheduleSaveWorkspace(toPersisted(stateRef.current), authUserIdRef.current);
      void flushWorkspaceSave(authUserIdRef.current, toPersisted(stateRef.current));
      void syncDocumentBlobs(
        stateRef.current.documents,
        stateRef.current.fileRegistry,
        authUserIdRef.current,
      );
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") flush();
    };

    window.addEventListener("beforeunload", flush);
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      window.removeEventListener("beforeunload", flush);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [isReady]);

  const workspace = useMemo(() => selectWorkspace(state), [state]);

  const getFile = useCallback(
    (documentId: string) => {
      const cached = state.fileRegistry.get(documentId);
      if (cached) return cached;

      if (pendingFileLoadsRef.current.has(documentId)) return undefined;

      const doc = state.documents.find((d) => d.id === documentId);
      if (!doc) return undefined;

      pendingFileLoadsRef.current.add(documentId);
      void loadDocumentFile(documentId).then((file) => {
        pendingFileLoadsRef.current.delete(documentId);
        if (file) dispatch({ type: "REGISTER_FILE", documentId, file });
      });

      return undefined;
    },
    [state.fileRegistry, state.documents],
  );

  const flushWorkspace = useCallback(
    async (patch?: { declarationDraft?: Partial<DeclarationDraft> }) => {
      const userId = authUserIdRef.current;
      if (!userId) return;
      const base = toPersisted(stateRef.current);
      const data = patch?.declarationDraft
        ? {
            ...base,
            declarationDraft: {
              ...base.declarationDraft,
              ...patch.declarationDraft,
            },
          }
        : base;
      await flushWorkspaceSave(userId, data);
    },
    [],
  );

  const dispatchWithPersistence = useCallback((action: LmnpAction) => {
    if (action.type === "REMOVE_DOCUMENT") {
      const documentId = action.documentId;
      const target = stateRef.current.documents.find((d) => d.id === documentId);
      const plan = resolveDocumentDeletionPlan({
        hasSupabaseArtifacts: target?.hasSupabaseArtifacts,
        dossierId: getCurrentDossierId(),
      });

      void runDocumentRemoval({
        documentId,
        plan,
        removeLocal: (id) => {
          dispatch(action);
          void removePersistedDocument(id);
        },
        deleteOnServer: deleteDocumentOnServer,
        onPendingChange: (id, pending) => {
          setPendingDocumentDeletions((current) => {
            const next = new Set(current);
            if (pending) next.add(id);
            else next.delete(id);
            return next;
          });
        },
        onError: (id, message) => {
          setDocumentDeletionError(message ? { documentId: id, message } : null);
        },
      });
      return;
    }

    if (action.type === "CREATE_NEW_DECLARATION") {
      // Purge every Supabase-backed document BEFORE replacing the workspace —
      // never the reverse. dispatch(action) below is what actually wipes
      // state.documents, which is what the autosave effect watches; as long
      // as it isn't called, no IndexedDB write of the empty workspace can
      // happen, and a failed purge leaves the current workspace untouched.
      void runCreateNewDeclaration({
        documents: stateRef.current.documents,
        dossierId: getCurrentDossierId(),
        deleteOnServer: deleteDocumentOnServer,
        dispatchCreateNewDeclaration: () => dispatch(action),
        onError: (message) => {
          if (message) {
            alert(
              `Suppression des documents impossible : ${message}\n\nVotre déclaration actuelle n'a pas été modifiée.`,
            );
          }
        },
      });
      return;
    }

    dispatch(action);
  }, []);

  const value = useMemo(
    () => ({
      workspace,
      dispatch: dispatchWithPersistence,
      getFile,
      isReady,
      autosaveStatus,
      persistenceUserId,
      flushWorkspace,
      pendingDocumentDeletions,
      documentDeletionError,
    }),
    [
      workspace,
      dispatchWithPersistence,
      getFile,
      isReady,
      autosaveStatus,
      persistenceUserId,
      flushWorkspace,
      pendingDocumentDeletions,
      documentDeletionError,
    ],
  );

  if (!isReady) {
    return (
      <LmnpHydrationProvider
        isHydratingWorkspace={isHydratingWorkspace}
        setWorkspaceHydrating={setIsHydratingWorkspace}
      >
        <AppLoadingSkeleton message="Restauration de votre dossier…" />
      </LmnpHydrationProvider>
    );
  }

  return (
    <LmnpHydrationProvider
      isHydratingWorkspace={isHydratingWorkspace}
      setWorkspaceHydrating={setIsHydratingWorkspace}
    >
      <LmnpContext.Provider value={value}>{children}</LmnpContext.Provider>
    </LmnpHydrationProvider>
  );
}

export function useLmnp(): LmnpContextValue {
  const ctx = useContext(LmnpContext);
  if (!ctx) throw new Error("useLmnp must be used within LmnpProvider");
  return ctx;
}
