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
import { listFiscalYearsForDossier } from "@/lib/lmnp/store/db";
import type { FiscalYearRecord } from "@/lib/lmnp/store/dossier-db";

/**
 * P1 — "Mes déclarations" : exercice en cours + exercices clôturés du même
 * dossier. Utilise `listFiscalYearsForDossier()` (déjà indexé par
 * `dossierId`, jamais un scan complet de STORE_FISCAL_YEARS) — jamais
 * l'exercice actif n'est dupliqué depuis sa coquille technique dans ce
 * store : seuls les exercices `status === "closed"` y sont listés, l'actif
 * vient exclusivement du workspace live (`useLmnp()`).
 */
export default function DeclarationsHistoriquePage() {
  const { workspace, isReady: workspaceReady } = useLmnp();
  const { currentDossierId, isReady: dossierReady } = useDossier();
  const [closedYears, setClosedYears] = useState<FiscalYearRecord[] | null>(null);

  useEffect(() => {
    if (!dossierReady) return;
    let cancelled = false;
    const pending = currentDossierId
      ? listFiscalYearsForDossier<FiscalYearRecord>(currentDossierId)
      : Promise.resolve<FiscalYearRecord[]>([]);
    pending.then((records) => {
      if (cancelled) return;
      setClosedYears(records.filter((record) => record.status === "closed"));
    });
    return () => {
      cancelled = true;
    };
  }, [dossierReady, currentDossierId]);

  if (!workspaceReady || !dossierReady || closedYears === null) {
    return <p className="text-center text-stone-500">Chargement…</p>;
  }

  const sortedClosedYears = [...closedYears].sort((a, b) => b.year - a.year);

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
          <Button href={LMNP_ROUTES.declarations}>Ouvrir</Button>
        </li>

        {sortedClosedYears.map((fiscalYear) => (
          <li
            key={fiscalYear.id}
            className="flex items-center justify-between gap-4"
            style={{
              borderRadius: radius.lg,
              border: `1px solid ${colors.border.subtle}`,
              padding: spacing.card.md,
            }}
          >
            <p style={{ ...typography.body.desktop, color: colors.text.primary }}>
              {fiscalYear.year} — Clôturée
            </p>
            <Button variant="secondary" href={archivedDeclarationRoute(fiscalYear.id)}>
              Voir la déclaration
            </Button>
          </li>
        ))}
      </ul>

      {sortedClosedYears.length === 0 ? (
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
