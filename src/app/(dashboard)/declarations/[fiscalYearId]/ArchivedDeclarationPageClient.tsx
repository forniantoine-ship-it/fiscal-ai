"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { LMNP_ROUTES } from "@/lib/lmnp/routes";
import { useDossier } from "@/lib/lmnp/dossier";
import {
  archivedLiasseRecordFromWorkspace,
  loadArchivedWorkspaceFromServer,
  parseArchivedFiscalYearParam,
} from "@/lib/lmnp/store/fiscal-year-archive";
import { ArchivedDeclarationView } from "@/components/lmnp/declaration/ArchivedDeclarationView";
import type { ArchivedLiasseDownloadRecord } from "@/lib/lmnp/services/declaration/resolve-archived-liasse-download";

type LoadState =
  | { status: "loading" }
  | { status: "denied"; year: number }
  | { status: "ready"; year: number; record: ArchivedLiasseDownloadRecord };

/**
 * Lot 6A — Historique. Charge UNIQUEMENT le snapshot serveur Lot 3
 * (lecture seule) — jamais le store IndexedDB local des exercices,
 * jamais un dispatch vers le workspace actif, jamais le hook du
 * workspace live pour les données affichées.
 *
 * Param de route = année civile. Un exercice non clôturé côté serveur
 * (dont l'actif N+1) est refusé et redirige vers "Mes déclarations".
 */
export function ArchivedDeclarationPageClient({ fiscalYearId }: { fiscalYearId: string }) {
  const router = useRouter();
  const { currentDossierId, isReady: dossierReady } = useDossier();
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const year = parseArchivedFiscalYearParam(fiscalYearId);
  // Sync denial without setState in the effect (invalid route / no dossier).
  const deniedEarly = dossierReady && (year == null || !currentDossierId);
  const deniedLoad = state.status === "denied" && year != null && state.year === year;
  const denied = deniedEarly || deniedLoad;
  const ready =
    state.status === "ready" && year != null && state.year === year ? state.record : null;

  useEffect(() => {
    if (!dossierReady || year == null || !currentDossierId) return;
    let cancelled = false;
    const targetYear = year;
    const dossierId = currentDossierId;
    loadArchivedWorkspaceFromServer({ dossierId, fiscalYear: targetYear }).then((result) => {
      if (cancelled) return;
      if (result.status !== "ok") {
        setState({ status: "denied", year: targetYear });
        return;
      }
      // readOnly / blockWrites are always true on success — never adopt as active.
      setState({
        status: "ready",
        year: targetYear,
        record: archivedLiasseRecordFromWorkspace(result.workspace),
      });
    });
    return () => {
      cancelled = true;
    };
  }, [dossierReady, currentDossierId, year]);

  useEffect(() => {
    if (denied) {
      router.replace(LMNP_ROUTES.declarationsHistorique);
    }
  }, [denied, router]);

  if (denied || !ready) {
    return <p className="text-center text-stone-500">Chargement…</p>;
  }

  return <ArchivedDeclarationView record={ready} />;
}
