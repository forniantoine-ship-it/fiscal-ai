"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useState,
  type ReactNode,
} from "react";
import {
  createDefaultWorkspace,
  loadWorkspace,
  saveWorkspace,
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

  useEffect(() => {
    const persisted = loadWorkspace();
    if (persisted) {
      dispatch({ type: "HYDRATE", payload: persisted });
    }
    setIsReady(true);
  }, []);

  useEffect(() => {
    if (!isReady) return;
    saveWorkspace(toPersisted(state));
  }, [state, isReady]);

  const workspace = useMemo(() => selectWorkspace(state), [state]);

  const getFile = useCallback(
    (documentId: string) => state.fileRegistry.get(documentId),
    [state.fileRegistry],
  );

  const value = useMemo(
    () => ({ workspace, dispatch, getFile, isReady }),
    [workspace, getFile, isReady],
  );

  if (!isReady) {
    return <AppLoadingSkeleton />;
  }

  return <LmnpContext.Provider value={value}>{children}</LmnpContext.Provider>;
}

export function useLmnp(): LmnpContextValue {
  const ctx = useContext(LmnpContext);
  if (!ctx) throw new Error("useLmnp must be used within LmnpProvider");
  return ctx;
}
