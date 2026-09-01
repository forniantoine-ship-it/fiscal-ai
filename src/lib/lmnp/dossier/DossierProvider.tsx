"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { AppLoadingSkeleton } from "@/components/lmnp/shared/AppLoadingSkeleton";
import { subscribeAuthBoundary } from "@/lib/lmnp/auth/auth-boundary";

import { setCurrentDossierId } from "./current-dossier";
import {
  ensureActiveDossier,
  fetchDocumentsForDossier,
  type LmnpDossier,
  type SupabaseDocumentRow,
} from "./supabase-dossier";

type DossierContextValue = {
  currentDossierId: string | null;
  dossier: LmnpDossier | null;
  documents: SupabaseDocumentRow[];
  isReady: boolean;
  refreshDossier: () => Promise<void>;
};

const DossierContext = createContext<DossierContextValue | null>(null);

async function loadActiveDossierState(userId: string | null): Promise<{
  dossier: LmnpDossier | null;
  documents: SupabaseDocumentRow[];
}> {
  if (!userId) {
    setCurrentDossierId(null);
    return { dossier: null, documents: [] };
  }

  const dossier = await ensureActiveDossier(userId);
  if (!dossier) {
    setCurrentDossierId(null, userId);
    return { dossier: null, documents: [] };
  }

  setCurrentDossierId(dossier.id, userId);
  const documents = await fetchDocumentsForDossier(dossier.id);

  console.log("[dossier] state restored", {
    userId,
    dossierId: dossier.id,
    documentCount: documents.length,
  });

  return { dossier, documents };
}

export function DossierProvider({ children }: { children: ReactNode }) {
  const [authUserId, setAuthUserId] = useState<string | null>(null);
  const [dossier, setDossier] = useState<LmnpDossier | null>(null);
  const [documents, setDocuments] = useState<SupabaseDocumentRow[]>([]);
  const [isReady, setIsReady] = useState(false);

  const refreshDossier = useCallback(async () => {
    const next = await loadActiveDossierState(authUserId);
    setDossier(next.dossier);
    setDocuments(next.documents);
  }, [authUserId]);

  useEffect(() => {
    return subscribeAuthBoundary(async ({ userId, userChanged }) => {
      setAuthUserId(userId);
      setIsReady(false);

      if (userChanged) {
        setDossier(null);
        setDocuments([]);
      }

      const next = await loadActiveDossierState(userId);
      setDossier(next.dossier);
      setDocuments(next.documents);
      setIsReady(true);
    });
  }, []);

  const value = useMemo(
    () => ({
      currentDossierId: dossier?.id ?? null,
      dossier,
      documents,
      isReady,
      refreshDossier,
    }),
    [dossier, documents, isReady, refreshDossier],
  );

  if (!isReady) {
    return <AppLoadingSkeleton message="Chargement de votre dossier LMNP…" />;
  }

  return <DossierContext.Provider value={value}>{children}</DossierContext.Provider>;
}

export function useDossier(): DossierContextValue {
  const ctx = useContext(DossierContext);
  if (!ctx) throw new Error("useDossier must be used within DossierProvider");
  return ctx;
}
