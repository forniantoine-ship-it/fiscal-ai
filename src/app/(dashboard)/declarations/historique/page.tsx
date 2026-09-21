"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

import { Button } from "@/design-system/components/Button";
import { colors } from "@/design-system/theme/colors";
import { radius } from "@/design-system/theme/radius";
import { spacing } from "@/design-system/theme/spacing";
import { typography } from "@/design-system/theme/typography";
import { archivedDeclarationRoute, LMNP_ROUTES } from "@/lib/lmnp/routes";
import { useDossier } from "@/lib/lmnp/dossier";
import { useLmnp } from "@/lib/lmnp/store";
import {
  listClosedFiscalYearArchives,
  type ArchivedFiscalYearSummary,
} from "@/lib/lmnp/store/fiscal-year-archive";

type ArchivesLoad =
  | { dossierId: string; status: "ok"; archives: ArchivedFiscalYearSummary[] }
  | { dossierId: string; status: "error" };

/**
 * Lot 6A — "Mes déclarations" : exercice actif (workspace live) + exercices
 * clôturés depuis les snapshots serveur Lot 3 (`listClosedFiscalYearArchives`).
 * Jamais IndexedDB STORE_FISCAL_YEARS — cold browser / IDB vide doit lister N.
 */
export default function DeclarationsHistoriquePage() {
  const { workspace, isReady: workspaceReady } = useLmnp();
  const { currentDossierId, isReady: dossierReady } = useDossier();
  const [load, setLoad] = useState<ArchivesLoad | null>(null);

  useEffect(() => {
    if (!dossierReady || !currentDossierId) return;
    let cancelled = false;
    const dossierId = currentDossierId;
    listClosedFiscalYearArchives(dossierId).then((result) => {
      if (cancelled) return;
      if (result.status !== "ok") {
        setLoad({ dossierId, status: "error" });
        return;
      }
      setLoad({ dossierId, status: "ok", archives: result.archives });
    });
    return () => {
      cancelled = true;
    };
  }, [dossierReady, currentDossierId]);

  // No dossier → empty list without sync setState in the effect.
  const noDossier = dossierReady && !currentDossierId;
  const loadForDossier =
    currentDossierId && load?.dossierId === currentDossierId ? load : null;
  const closedYears = noDossier ? [] : loadForDossier?.status === "ok" ? loadForDossier.archives : null;
  const listError = noDossier ? false : loadForDossier?.status === "error";

  if (!workspaceReady || !dossierReady || (!noDossier && closedYears === null && !listError)) {
    return <p className="text-center text-stone-500">Chargement…</p>;
  }

  const archives = closedYears ?? [];

  return (
    <div className="relative mx-auto flex w-full max-w-4xl flex-col gap-6 pb-16">
      <h1
        className="text-center"
        style={{
          fontFamily: typography.fontFamily.display,
          fontSize: typography.fontSize.xl,
          color: colors.text.primary,
        }}
      >
        Mes déclarations
      </h1>

      <ul className="flex w-full flex-col gap-3">
        <li
          className="flex items-center justify-between gap-4"
          style={{
            borderRadius: radius.lg,
            border: `1px solid ${colors.border.subtle}`,
            padding: spacing.card.md,
          }}
        >
          <p style={{ ...typography.body.desktop, color: colors.text.primary }}>
            {workspace.fiscalYear.year} — En cours
          </p>
          <Button href={LMNP_ROUTES.dashboard}>Ouvrir</Button>
        </li>

        {archives.map((archive) => (
          <li
            key={archive.fiscalYear}
            className="flex items-center justify-between gap-4"
            style={{
              borderRadius: radius.lg,
              border: `1px solid ${colors.border.subtle}`,
              padding: spacing.card.md,
            }}
          >
            <p style={{ ...typography.body.desktop, color: colors.text.primary }}>
              {archive.fiscalYear} — Clôturé
            </p>
            <Button variant="secondary" href={archivedDeclarationRoute(archive.fiscalYear)}>
              Voir la déclaration
            </Button>
          </li>
        ))}
      </ul>

      {listError ? (
        <p className="text-center" style={{ ...typography.caption.desktop, color: colors.error.DEFAULT }}>
          Impossible de charger vos exercices clôturés. Vérifiez votre connexion.
        </p>
      ) : null}

      {!listError && archives.length === 0 ? (
        <p className="text-center" style={{ ...typography.caption.desktop, color: colors.text.muted }}>
          Aucun exercice clôturé pour l&apos;instant.
        </p>
      ) : null}

      <p className="text-center" style={{ ...typography.caption.desktop, color: colors.text.muted }}>
        <Link href={LMNP_ROUTES.dashboard} style={{ color: colors.text.muted }}>
          Retour au tableau de bord
        </Link>
      </p>
    </div>
  );
}
