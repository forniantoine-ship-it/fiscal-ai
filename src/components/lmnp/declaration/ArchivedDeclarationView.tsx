"use client";

import Link from "next/link";

import { Button } from "@/design-system/components/Button";
import { colors } from "@/design-system/theme/colors";
import { radius } from "@/design-system/theme/radius";
import { shadows } from "@/design-system/theme/shadows";
import { spacing } from "@/design-system/theme/spacing";
import { typography } from "@/design-system/theme/typography";
import { LMNP_ROUTES } from "@/lib/lmnp/routes";
import { buildClientSummaryDocument } from "@/lib/lmnp/services/declaration/build-client-summary-document";
import { downloadClientSummaryPdf } from "@/lib/lmnp/services/declaration/render-client-summary-pdf";
import { downloadAide2042Pdf } from "@/lib/lmnp/services/declaration/render-aide-2042-pdf";
import type { DeclarationDraft, FiscalYear } from "@/lib/lmnp/types/domain";

function fmtEur(value: number): string {
  return `${Math.round(value).toLocaleString("fr-FR")} €`;
}

export type ArchivedDeclarationViewProps = {
  fiscalYear: Pick<FiscalYear, "year">;
  declarationDraft: DeclarationDraft;
};

/**
 * P1 — Historique des exercices clôturés. Vue READ-ONLY d'un exercice
 * archivé, distincte de `DeclarationReadyView` (exercice actif) : jamais
 * `useLmnp()`, jamais de `dispatch`, aucune action de clôture/régénération —
 * uniquement les deux téléchargements exigés par ce chantier (synthèse
 * fiscale, aide 2042-C-PRO), construits depuis `declarationDraft.rfs` tel
 * qu'archivé au moment de la clôture (jamais le workspace actif).
 */
export function ArchivedDeclarationView({ fiscalYear, declarationDraft }: ArchivedDeclarationViewProps) {
  const { fiscalResult, rfs, activityStartDate } = declarationDraft;

  if (!fiscalResult || !rfs) {
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
          Déclaration LMNP {fiscalYear.year}
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

        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <Button onClick={() => downloadAide2042Pdf(buildClientSummaryDocument(rfs, { activityStartDate }))}>
            Télécharger mon aide pour la déclaration 2042-C-PRO
          </Button>
          <Button
            variant="secondary"
            onClick={() => downloadClientSummaryPdf(buildClientSummaryDocument(rfs, { activityStartDate }))}
          >
            Télécharger ma synthèse fiscale (PDF)
          </Button>
        </div>
      </section>

      <p className="text-center" style={{ ...typography.caption.desktop, color: colors.text.muted }}>
        <Link href={LMNP_ROUTES.declarationsHistorique} style={{ color: colors.text.muted }}>
          Revenir à mes déclarations
        </Link>
      </p>
    </div>
  );
}
