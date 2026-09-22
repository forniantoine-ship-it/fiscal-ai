"use client";

import Link from "next/link";
import { useState } from "react";

import { Button } from "@/design-system/components/Button";
import { colors } from "@/design-system/theme/colors";
import { radius } from "@/design-system/theme/radius";
import { shadows } from "@/design-system/theme/shadows";
import { spacing } from "@/design-system/theme/spacing";
import { typography } from "@/design-system/theme/typography";
import { LMNP_ROUTES } from "@/lib/lmnp/routes";
import { downloadLiasseFiscalePdf } from "@/lib/lmnp/services/declaration/download-liasse-fiscale-pdf";
import { downloadAide2042Pdf } from "@/lib/lmnp/services/declaration/download-aide-2042-pdf";
import {
  resolveArchivedLiasseDownload,
  type ArchivedLiasseDownloadRecord,
} from "@/lib/lmnp/services/declaration/resolve-archived-liasse-download";
import {
  resolveFinalDeclarabilityState,
  FINAL_DECLARABILITY_BLOCKED_MESSAGE,
} from "@/lib/lmnp/services/declaration/final-declarability";

function fmtEur(value: number): string {
  return `${Math.round(value).toLocaleString("fr-FR")} €`;
}

export type ArchivedDeclarationViewProps = {
  record: ArchivedLiasseDownloadRecord;
};

/**
 * P1 / 6B — Historique des exercices clôturés. Vue READ-ONLY d'un exercice
 * archivé, distincte de `DeclarationReadyView` : jamais `useLmnp()`, jamais
 * de `dispatch`. Les deux téléchargements (aide 2042-C-PRO, liasse fiscale)
 * sont construits exclusivement depuis `record` (draft / RFS / extras /
 * stocksOuverture / versionId archivés) — jamais le workspace actif.
 */
export function ArchivedDeclarationView({ record }: ArchivedDeclarationViewProps) {
  const archivedDraft = record.declarationDraft ?? undefined;
  const rfs = archivedDraft?.rfs;
  const activityStartDate = archivedDraft?.activityStartDate;
  const fiscalResult = archivedDraft?.fiscalResult ?? rfs?.fiscalResult;
  const liasseDownload = resolveArchivedLiasseDownload(record);
  const canDownloadLiasse = liasseDownload.status === "ready";
  // NEXT-5 — même prédicat pour les deux téléchargements (aide 2042-C-PRO et
  // liasse fiscale) : jamais l'un bloqué et l'autre livré depuis la même
  // projection incomplète, voir final-declarability.ts.
  const declarability = resolveFinalDeclarabilityState(archivedDraft?.liasseRfs);

  const [liasseDownloading, setLiasseDownloading] = useState(false);
  const [liasseDownloadError, setLiasseDownloadError] = useState<string | undefined>(undefined);
  const [aideDownloadError, setAideDownloadError] = useState<string | undefined>(undefined);

  const handleDownloadLiasseFiscale = async () => {
    const resolved = resolveArchivedLiasseDownload(record);
    if (liasseDownloading || resolved.status !== "ready") return;
    setLiasseDownloading(true);
    setLiasseDownloadError(undefined);
    try {
      await downloadLiasseFiscalePdf(resolved.input);
    } catch (err) {
      setLiasseDownloadError(
        err && typeof err === "object" && "message" in err && typeof err.message === "string"
          ? err.message
          : "La liasse fiscale n'a pas pu être générée. Réessayez dans quelques instants.",
      );
    } finally {
      setLiasseDownloading(false);
    }
  };

  if (!fiscalResult) {
    return (
      <div className="relative mx-auto flex w-full max-w-4xl flex-col gap-6 pb-16 text-center">
        <p style={{ ...typography.body.desktop, color: colors.text.secondary }}>
          Aucun résultat fiscal n&apos;a été trouvé pour cet exercice.
        </p>
        <div className="flex justify-center">
          <Link href={LMNP_ROUTES.declarationsHistorique} style={{ color: colors.text.muted }}>
            Revenir à mes déclarations
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="relative mx-auto flex w-full max-w-4xl flex-col gap-6 pb-16">
      <div className="flex w-full justify-center">
        <Button href={LMNP_ROUTES.declarationsHistorique}>Mes déclarations</Button>
      </div>

      <section
        className="w-full text-center"
        style={{
          borderRadius: radius.lg,
          border: `1px solid ${colors.border.subtle}`,
          boxShadow: shadows.card.default,
          padding: spacing.card.md,
        }}
      >
        <p
          style={{
            ...typography.caption.desktop,
            color: colors.text.accent,
            letterSpacing: typography.letterSpacing.label,
          }}
        >
          Déclaration LMNP {record.year}
        </p>
        <p
          className="mt-2"
          style={{ ...typography.caption.desktop, color: colors.text.muted, fontWeight: typography.fontWeight.medium }}
        >
          Exercice clôturé — consultation uniquement
        </p>
        <h1
          className="mx-auto mt-4 max-w-xl text-[1.375rem] sm:text-[1.625rem]"
          style={{
            fontFamily: typography.fontFamily.display,
            fontWeight: typography.fontWeight.regular,
            color: colors.text.primary,
          }}
        >
          {fiscalResult.deficitNouveau > 0
            ? `${fmtEur(fiscalResult.deficitNouveau)} de déficit`
            : `${fmtEur(fiscalResult.resultatFiscal)} de résultat fiscal`}
        </h1>
      </section>

      <section
        className="w-full"
        style={{
          borderRadius: radius.lg,
          border: `1px solid ${colors.border.subtle}`,
          padding: spacing.card.md,
        }}
      >
        <p
          className="text-center"
          style={{
            ...typography.caption.desktop,
            color: colors.text.muted,
            letterSpacing: typography.letterSpacing.label,
          }}
        >
          Documents fiscaux
        </p>

        <article
          className="mt-5"
          style={{
            borderRadius: radius.lg,
            border: `1px solid ${colors.border.default}`,
            backgroundColor: colors.surface.primary,
            padding: spacing.card.md,
          }}
        >
          <p
            style={{
              fontFamily: typography.fontFamily.display,
              fontSize: typography.fontSize.lg,
              color: colors.text.primary,
            }}
          >
            Aide à ma déclaration 2042-C-PRO
          </p>
          <p className="mt-2" style={{ ...typography.caption.desktop, color: colors.text.secondary }}>
            Guide pratique pour reporter vos montants dans votre déclaration.
          </p>
          <div className="mt-4">
            <Button
              variant="secondary"
              disabled={!rfs || !declarability.deliverable}
              onClick={() => {
                if (!rfs) return;
                setAideDownloadError(undefined);
                // Payment V1 — PDF produit par le serveur (exercice payé requis).
                downloadAide2042Pdf({
                  rfs,
                  activityStartDate,
                  fiscalYear: record.year,
                  fiscalYearOpening: record.externalTakeoverOpening?.opening,
                }).catch((err) =>
                  setAideDownloadError(
                    err && typeof err === "object" && "message" in err && typeof err.message === "string"
                        ? err.message
                        : "L'aide n'a pas pu être générée. Réessayez dans quelques instants.",
                  ),
                );
              }}
            >
              Télécharger mon aide pour la déclaration 2042-C-PRO
            </Button>
            {rfs && !declarability.deliverable ? (
              <p className="mt-2" style={{ ...typography.caption.desktop, color: colors.text.muted }}>
                {FINAL_DECLARABILITY_BLOCKED_MESSAGE}
              </p>
            ) : null}
            {aideDownloadError ? (
              <p role="alert" className="mt-2" style={{ ...typography.caption.desktop, color: colors.error.DEFAULT }}>
                {aideDownloadError}
              </p>
            ) : null}
          </div>
        </article>

        <article
          className="mt-4"
          style={{
            borderRadius: radius.lg,
            border: `1px solid ${colors.border.selected}`,
            backgroundColor: colors.surface.selected,
            boxShadow: shadows.card.default,
            padding: spacing.card.md,
          }}
        >
          <p
            style={{
              fontFamily: typography.fontFamily.display,
              fontSize: typography.fontSize.xl,
              color: colors.text.primary,
            }}
          >
            Ma liasse fiscale
          </p>
          <p className="mt-2" style={{ ...typography.caption.desktop, color: colors.text.secondary }}>
            Votre dossier fiscal complet, avec le détail des calculs et les formulaires fiscaux.
          </p>
          <div className="mt-4 flex flex-col items-start gap-2">
            <Button onClick={handleDownloadLiasseFiscale} disabled={liasseDownloading || !canDownloadLiasse}>
              {liasseDownloading ? "Génération en cours…" : "Télécharger ma liasse fiscale"}
            </Button>
            {!canDownloadLiasse ? (
              <p style={{ ...typography.caption.desktop, color: colors.text.muted }}>
                {liasseDownload.status === "unavailable" && liasseDownload.reason === "internal_projection_issue"
                  ? FINAL_DECLARABILITY_BLOCKED_MESSAGE
                  : "Liasse fiscale indisponible pour cet exercice."}
              </p>
            ) : null}
            {liasseDownloadError ? (
              <p style={{ ...typography.caption.desktop, color: colors.error.DEFAULT }}>{liasseDownloadError}</p>
            ) : null}
          </div>
        </article>
      </section>

      <p className="text-center" style={{ ...typography.caption.desktop, color: colors.text.muted }}>
        <Link href={LMNP_ROUTES.declarationsHistorique} style={{ color: colors.text.muted }}>
          Revenir à mes déclarations
        </Link>
      </p>
    </div>
  );
}
