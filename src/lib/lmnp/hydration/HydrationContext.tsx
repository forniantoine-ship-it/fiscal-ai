"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  type ReactNode,
} from "react";

import {
  logPassiveHydrationStart,
  logPassiveRestore,
  shouldApplyPrefill,
  shouldRunExtraction,
  type ExecutionTrigger,
  type HydrationGuardContext,
} from "./lifecycle";

type LmnpHydrationContextValue = {
  isHydratingWorkspace: boolean;
  setWorkspaceHydrating: (value: boolean) => void;
};

const LmnpHydrationContext = createContext<LmnpHydrationContextValue | null>(null);

export function LmnpHydrationProvider({
  children,
  isHydratingWorkspace,
  setWorkspaceHydrating,
}: {
  children: ReactNode;
  isHydratingWorkspace: boolean;
  setWorkspaceHydrating: (value: boolean) => void;
}) {
  const value = useMemo(
    () => ({ isHydratingWorkspace, setWorkspaceHydrating }),
    [isHydratingWorkspace, setWorkspaceHydrating],
  );

  return <LmnpHydrationContext.Provider value={value}>{children}</LmnpHydrationContext.Provider>;
}

export function useLmnpHydrationRoot(): LmnpHydrationContextValue {
  const ctx = useContext(LmnpHydrationContext);
  if (!ctx) {
    throw new Error("useLmnpHydrationRoot must be used within LmnpHydrationProvider");
  }
  return ctx;
}

export type TunnelHydrationControls = {
  isHydratingWorkspace: boolean;
  isPassiveHydration: boolean;
  executionTrigger: ExecutionTrigger | null;
  markExecution: (trigger: ExecutionTrigger) => void;
  clearExecution: () => void;
  endPassiveHydration: () => void;
  shouldRunExtraction: () => boolean;
  shouldApplyPrefill: () => boolean;
  guardContext: HydrationGuardContext;
};

/**
 * Per-tunnel hydration controls.
 * Passive mode is active on mount until `endPassiveHydration()` is called once after restore.
 */
export function useTunnelHydration(tunnel: string): TunnelHydrationControls {
  const { isHydratingWorkspace } = useLmnpHydrationRoot();
  const isPassiveHydrationRef = useRef(true);
  const executionTriggerRef = useRef<ExecutionTrigger | null>(null);
  const loggedPassiveStartRef = useRef(false);

  if (!loggedPassiveStartRef.current) {
    loggedPassiveStartRef.current = true;
    logPassiveHydrationStart(tunnel);
  }

  const markExecution = useCallback((trigger: ExecutionTrigger) => {
    executionTriggerRef.current = trigger;
    isPassiveHydrationRef.current = false;
  }, []);

  const clearExecution = useCallback(() => {
    executionTriggerRef.current = null;
  }, []);

  const endPassiveHydration = useCallback(() => {
    if (!isPassiveHydrationRef.current) return;
    isPassiveHydrationRef.current = false;
    logPassiveRestore(tunnel);
  }, [tunnel]);

  const guardContext: HydrationGuardContext = useMemo(
    () => ({
      isHydratingWorkspace,
      isPassiveHydration: isPassiveHydrationRef.current,
      executionTrigger: executionTriggerRef.current,
    }),
    [isHydratingWorkspace],
  );

  const shouldRunExtractionNow = useCallback(() => {
    return shouldRunExtraction({
      isHydratingWorkspace,
      isPassiveHydration: isPassiveHydrationRef.current,
      executionTrigger: executionTriggerRef.current,
    });
  }, [isHydratingWorkspace]);

  const shouldApplyPrefillNow = useCallback(() => {
    return shouldApplyPrefill({
      isHydratingWorkspace,
      isPassiveHydration: isPassiveHydrationRef.current,
      executionTrigger: executionTriggerRef.current,
    });
  }, [isHydratingWorkspace]);

  return {
    isHydratingWorkspace,
    isPassiveHydration: isPassiveHydrationRef.current,
    executionTrigger: executionTriggerRef.current,
    markExecution,
    clearExecution,
    endPassiveHydration,
    shouldRunExtraction: shouldRunExtractionNow,
    shouldApplyPrefill: shouldApplyPrefillNow,
    guardContext,
  };
}
