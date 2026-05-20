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
  removePersistedDocument,
  scheduleSaveWorkspace,
  syncDocumentBlobs,
} from "./persistence";
import { lmnpReducer, selectWorkspace, type LmnpAction, type LmnpState } from "./reducer";
import { AppLoadingSkeleton } from "@/components/lmnp/shared/AppLoadingSkeleton";

interface LmnpContextValue {
  workspace: ReturnType<typeof selectWorkspace>;
  dispatch: (action: LmnpAction) => void;
  getFile: (documentId: string) => File | undefined;
  isReady: boolean;
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
  };
}

export function LmnpProvider({ children }: { children: ReactNode }) {
  const [isReady, setIsReady] = useState(false);
  const [state, dispatch] = useReducer(
    lmnpReducer,
    { ...createDefaultWorkspace(), fileRegistry: new Map() } as LmnpState,
    (initial) => initial,
  );

  const stateRef = useRef(state);
  stateRef.current = state;

  const pendingFileLoadsRef = useRef(new Set<string>());

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const { workspace, fileRegistry } = await hydrateLmnpStore();
      if (cancelled) return;

      if (workspace) {
        dispatch({ type: "HYDRATE", payload: workspace, files: fileRegistry });
      }
      setIsReady(true);
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!isReady) return;
    scheduleSaveWorkspace(toPersisted(state));
  }, [
    isReady,
    state.fiscalYear,
    state.properties,
    state.documents,
    state.extractions,
    state.validationItems,
    state.ledgerEntries,
  ]);

  useLayoutEffect(() => {
    if (!isReady) return;
    void syncDocumentBlobs(state.documents, state.fileRegistry);
  }, [isReady, state.documents, state.fileRegistry]);

  useEffect(() => {
    if (!isReady) return;

    const flush = () => {
      scheduleSaveWorkspace(toPersisted(stateRef.current));
      void flushWorkspaceSave();
      void syncDocumentBlobs(
        stateRef.current.documents,
        stateRef.current.fileRegistry,
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

  const dispatchWithPersistence = useCallback((action: LmnpAction) => {
    dispatch(action);
    if (action.type === "REMOVE_DOCUMENT") {
      void removePersistedDocument(action.documentId);
    }
  }, []);

  const value = useMemo(
    () => ({
      workspace,
      dispatch: dispatchWithPersistence,
      getFile,
      isReady,
    }),
    [workspace, dispatchWithPersistence, getFile, isReady],
  );

  if (!isReady) {
    return <AppLoadingSkeleton message="Restauration de votre dossier…" />;
  }

  return <LmnpContext.Provider value={value}>{children}</LmnpContext.Provider>;
}

export function useLmnp(): LmnpContextValue {
  const ctx = useContext(LmnpContext);
  if (!ctx) throw new Error("useLmnp must be used within LmnpProvider");
  return ctx;
}
