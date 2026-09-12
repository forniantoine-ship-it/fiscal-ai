"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { LMNP_ROUTES } from "@/lib/lmnp/routes";
import { useDossier } from "@/lib/lmnp/dossier";
import { loadArchivedFiscalYear, type FiscalYearRecord } from "@/lib/lmnp/store/dossier-db";
import { resolveArchivedFiscalYearAccess } from "@/lib/lmnp/services/dossier/fiscal-year-cycle";
import { ArchivedDeclarationView } from "@/components/lmnp/declaration/ArchivedDeclarationView";

type LoadState =
  | { status: "loading" }
  | { status: "denied" }
  | { status: "ready"; record: FiscalYearRecord };

/**
 * P1 — Historique. Charge UNIQUEMENT `loadArchivedFiscalYear(fiscalYearId)`
 * (store/dossier-db.ts, lecture seule) — jamais un dispatch vers le
 * workspace actif, jamais `useLmnp()` pour les données affichées : le
 * workspace courant (exercice actif) n'est ni lu ni modifié par cette page.
 * Vérifie `resolveArchivedFiscalYearAccess()` (dossier + statut clôturé)
 * avant tout rendu — un exercice introuvable, d'un autre dossier, ou non
 * clôturé (dont l'exercice actif lui-même) redirige proprement vers "Mes
 * déclarations", même convention que `declarations/page.tsx` existant
 * (`router.replace` sur précondition non remplie).
 */
export function ArchivedDeclarationPageClient({ fiscalYearId }: { fiscalYearId: string }) {
  const router = useRouter();
  const { currentDossierId, isReady: dossierReady } = useDossier();
  const [state, setState] = useState<LoadState>({ status: "loading" });

  useEffect(() => {
    if (!dossierReady) return;
    let cancelled = false;

    loadArchivedFiscalYear(fiscalYearId).then((record) => {
      if (cancelled) return;
      const access = resolveArchivedFiscalYearAccess(record, currentDossierId ?? "");
      if (!access.ok || !record) {
        setState({ status: "denied" });
        return;
      }
      setState({ status: "ready", record });
    });

    return () => {
      cancelled = true;
    };
  }, [dossierReady, currentDossierId, fiscalYearId]);

  useEffect(() => {
    if (state.status === "denied") {
      router.replace(LMNP_ROUTES.declarationsHistorique);
    }
  }, [state.status, router]);

  if (state.status !== "ready") {
    return <p className="text-center text-stone-500">Chargement…</p>;
  }

  return <ArchivedDeclarationView record={state.record} />;
}
