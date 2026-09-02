"use client";

import Link from "next/link";

import { Button } from "@/design-system/components/Button";
import { colors } from "@/design-system/theme/colors";
import { gradients } from "@/design-system/theme/gradients";
import { radius } from "@/design-system/theme/radius";
import { shadows } from "@/design-system/theme/shadows";
import { spacing } from "@/design-system/theme/spacing";
import { typography } from "@/design-system/theme/typography";
import { documentJourneyRoute, LMNP_ROUTES } from "@/lib/lmnp/routes";
import { buildClientSummaryDocument } from "@/lib/lmnp/services/declaration/build-client-summary-document";
import {
  downloadLiasseDocument,
  downloadLiasseRfsDocument,
} from "@/lib/lmnp/services/declaration/export-liasse-document";
import { downloadClientSummaryPdf } from "@/lib/lmnp/services/declaration/render-client-summary-pdf";
import { declarationCompletude } from "@/lib/lmnp/services/declaration/run-declaration-generation";
import { useLmnp } from "@/lib/lmnp/store";

function fmtEur(value: number): string {
  return `${Math.round(value).toLocaleString("fr-FR")} €`;
}

export function DeclarationReadyView() {
  const { workspace } = useLmnp();
  const { fiscalYear } = workspace;
  const { fiscalResult, liasseResult, rfs, liasseRfs } = workspace.declarationDraft ?? {};
  const completude = liasseResult ? declarationCompletude(liasseResult) : undefined;

  if (!fiscalResult || !liasseResult) {
    return (
      <div className="relative mx-auto flex w-full max-w-4xl flex-col gap-6 pb-16 text-center">
        <p style={{ ...typography.body.desktop, color: colors.text.secondary }}>
          Le résultat de votre déclaration n&apos;est pas encore disponible.
        </p>
        <div className="flex justify-center">
          <Link href={documentJourneyRoute("validation")} style={{ color: colors.text.muted }}>
            Revenir à la synthèse du dossier
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="relative mx-auto flex w-full max-w-4xl flex-col gap-6 pb-16">
      <div className="flex w-full justify-center">
        <Button href={LMNP_ROUTES.dashboard}>Tableau de bord</Button>
      </div>

      <section
        className="w-full text-center"
        style={{
          borderRadius: radius.lg,
          border: `1px solid ${colors.border.subtle}`,
          boxShadow: shadows.card.default,
          padding: spacing.card.md,
          backgroundImage: [
            `radial-gradient(ellipse 88% 52% at 50% -8%, ${colors.orange[100]} 0%, transparent 62%)`,
            gradients.card.elevated,
          ].join(", "),
        }}
      >
        <p
          style={{
            ...typography.caption.desktop,
            color: colors.text.accent,
            letterSpacing: typography.letterSpacing.label,
          }}
        >
          Déclaration LMNP {fiscalYear.year} —{" "}
          {completude === "complete" ? "génération complète" : "génération partielle"}
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
        <p className="mx-auto mt-3 max-w-lg" style={{ ...typography.body.desktop, color: colors.text.secondary }}>
          Ce document récapitule votre résultat fiscal et vous indique les informations à vérifier ou à
          reporter dans votre déclaration personnelle.
        </p>
        <div className="mt-6 flex justify-center">
          {rfs ? (
            <Button onClick={() => downloadClientSummaryPdf(buildClientSummaryDocument(rfs))}>
              Télécharger ma synthèse fiscale et mon aide à la déclaration (PDF)
            </Button>
          ) : null}
        </div>
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
          Documents techniques
        </p>
        <p
          className="mx-auto mt-2 max-w-lg text-center"
          style={{ ...typography.caption.desktop, color: colors.text.muted }}
        >
          Ce document n&apos;est ni un accusé de télétransmission EDI ni une preuve d&apos;acceptation par
          l&apos;administration.{" "}
          {completude === "complete"
            ? "La liasse fiscale est complète."
            : "Seul le formulaire 2031-SD est disponible à ce stade — les autres formulaires de la liasse ne sont pas encore générés."}
        </p>
        <div className="mt-4 flex justify-center">
          <Button
            variant="ghost"
            onClick={() => downloadLiasseDocument(fiscalYear.year, fiscalResult, liasseResult)}
          >
            Télécharger la liasse
          </Button>
        </div>
        {liasseResult.formulairesManquants.length > 0 ? (
          <p className="mt-3 text-center" style={{ ...typography.caption.desktop, color: colors.text.muted }}>
            Formulaires non encore générés : {liasseResult.formulairesManquants.join(", ")}
          </p>
        ) : null}

        {liasseRfs ? (
          <div className="mt-6 border-t pt-6" style={{ borderColor: colors.border.subtle }}>
            <p
              className="text-center"
              style={{
                ...typography.caption.desktop,
                color: colors.text.muted,
                letterSpacing: typography.letterSpacing.label,
              }}
            >
              Formulaires complémentaires
            </p>
            <p
              className="mx-auto mt-2 max-w-lg text-center"
              style={{ ...typography.caption.desktop, color: colors.text.muted }}
            >
              Représentation texte des cases calculées pour les formulaires 2031-bis, 2033-A, 2033-B et
              2033-C — pas un rendu CERFA officiel.
            </p>
            <div className="mt-4 flex justify-center">
              <Button
                variant="ghost"
                onClick={() => downloadLiasseRfsDocument(fiscalYear.year, liasseRfs)}
              >
                Télécharger les formulaires complémentaires
              </Button>
            </div>
          </div>
        ) : null}
      </section>

      <p className="text-center" style={{ ...typography.caption.desktop, color: colors.text.muted }}>
        {fiscalYear.transmittedAt
          ? "Télétransmission EDI effectuée."
          : "Télétransmission EDI : en attente de l'activation de notre partenaire. Votre dossier est prêt à être transmis dès sa mise en service."}
      </p>

      <p className="text-center" style={{ ...typography.caption.desktop, color: colors.text.muted }}>
        <Link href={documentJourneyRoute("validation")} style={{ color: colors.text.muted }}>
          Revenir à la synthèse du dossier
        </Link>
      </p>
    </div>
  );
}
