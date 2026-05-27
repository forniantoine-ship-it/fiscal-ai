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
import { supabase } from "@/lib/supabase";

import { getCurrentDossierId, setCurrentDossierId } from "./current-dossier";
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

async function loadActiveDossierState(): Promise<{
  dossier: LmnpDossier | null;
  documents: SupabaseDocumentRow[];
}> {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    setCurrentDossierId(null);
    return { dossier: null, documents: [] };
  }

  const dossier = await ensureActiveDossier(user.id);
  if (!dossier) {
    setCurrentDossierId(null);
    return { dossier: null, documents: [] };
  }

  setCurrentDossierId(dossier.id);
  const documents = await fetchDocumentsForDossier(dossier.id);

  console.log("[dossier] state restored", {
    dossierId: dossier.id,
    documentCount: documents.length,
  });

  return { dossier, documents };
}

export function DossierProvider({ children }: { children: ReactNode }) {
  const [dossier, setDossier] = useState<LmnpDossier | null>(null);
  const [documents, setDocuments] = useState<SupabaseDocumentRow[]>([]);
  const [isReady, setIsReady] = useState(false);

  const refreshDossier = useCallback(async () => {
    const next = await loadActiveDossierState();
    setDossier(next.dossier);
    setDocuments(next.documents);
  }, []);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const next = await loadActiveDossierState();
      if (cancelled) return;
      setDossier(next.dossier);
      setDocuments(next.documents);
      setIsReady(true);
    })();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (cancelled) return;

      if (!session?.user) {
        setCurrentDossierId(null);
        setDossier(null);
        setDocuments([]);
        setIsReady(true);
        return;
      }

      void refreshDossier();
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, [refreshDossier]);

  const value = useMemo(
    () => ({
      currentDossierId: dossier?.id ?? getCurrentDossierId(),
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
