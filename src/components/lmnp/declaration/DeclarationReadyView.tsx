"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/design-system/components/Button";
import { colors } from "@/design-system/theme/colors";
import { gradients } from "@/design-system/theme/gradients";
import { radius } from "@/design-system/theme/radius";
import { shadows } from "@/design-system/theme/shadows";
import { spacing } from "@/design-system/theme/spacing";
import { typography } from "@/design-system/theme/typography";
import { documentJourneyRoute, LMNP_ROUTES } from "@/lib/lmnp/routes";
import { buildClientSummaryDocument } from "@/lib/lmnp/services/declaration/build-client-summary-document";
import { downloadAide2042Pdf } from "@/lib/lmnp/services/declaration/render-aide-2042-pdf";
import { collectLiasseDossierExtras } from "@/lib/lmnp/services/declaration/collect-liasse-dossier-extras";
import { downloadLiasseFiscalePdf } from "@/lib/lmnp/services/declaration/download-liasse-fiscale-pdf";
import { resolveDeclarationOutOfDate } from "@/lib/lmnp/services/declaration/declaration-freshness";
import {
  resolveFinalDeclarabilityState,
  FINAL_DECLARABILITY_BLOCKED_MESSAGE,
} from "@/lib/lmnp/services/declaration/final-declarability";
import { canCloseFiscalYear } from "@/lib/lmnp/services/dossier/fiscal-year-cycle";
import { useLmnp } from "@/lib/lmnp/store";

function fmtEur(value: number): string {
  return `${Math.round(value).toLocaleString("fr-FR")} €`;
}

export function DeclarationReadyView() {
  const router = useRouter();
  const { workspace, closeFiscalYearAndCreateNext, closeFiscalYearError } = useLmnp();
  const { fiscalYear } = workspace;
  const { fiscalResult, liasseResult, rfs, activityStartDate, declaration } = workspace.declarationDraft ?? {};

  // Design Gate "Clôture N → N+1", Décision 1 — geste utilisateur unique
  // "Clôturer et continuer". Précondition affichage = précondition métier
  // EXACTE, via la même fonction que l'orchestration
  // (canCloseFiscalYear, fiscal-year-cycle.ts) — jamais un second calcul
  // local dupliqué (P0-1, B1/B2) : status ready_to_close ET
  // declarationGeneratedAt ET absence de dérive détectée par
  // resolveDeclarationGenerationGate() (fiscale ou identité). Revalidée en
  // live via useLmnp() (réactif), jamais en cache. Un exercice déjà clos
  // (status "closed") ou déjà transitionné vers N+1 (status "draft") ne
  // remplit jamais cette condition : aucun bouton de clôture ne peut donc
  // être rendu pour un exercice déjà clos, par construction. useMemo — même
  // recalcul potentiellement coûteux (F-006/F-007) que celui déjà accepté
  // par ValidationDocumentStep.tsx pour resolveDeclarationGenerationGate().
  const closePrecondition = useMemo(
    () =>
      canCloseFiscalYear({
        fiscalYear,
        declarationDraft: workspace.declarationDraft,
        properties: workspace.properties,
      }),
    [fiscalYear, workspace.declarationDraft, workspace.properties],
  );
  const canCloseThisFiscalYear = closePrecondition.ok;

  // P0-2a — Vérité immédiate de la liasse : ce booléen ne change JAMAIS ce qui
  // est affiché/téléchargé (fiscalResult/liasseResult/rfs/liasseRfs restent la
  // dernière génération réellement produite, "B") — il ajoute uniquement un
  // signal de fraîcheur. Réutilise le même mécanisme que canCloseThisFiscalYear
  // ci-dessus (resolveDeclarationGenerationGate(), P0-1), via un second appel
  // pur dans un useMemo plutôt qu'une seconde logique de détection.
  const declarationOutOfDate = useMemo(
    () =>
      resolveDeclarationOutOfDate({
        fiscalYear,
        declarationDraft: workspace.declarationDraft,
        properties: workspace.properties,
      }),
    [fiscalYear, workspace.declarationDraft, workspace.properties],
  );

  const [closeConfirmOpen, setCloseConfirmOpen] = useState(false);
  const [closingFiscalYear, setClosingFiscalYear] = useState(false);
  const pendingCloseRef = useRef(false);
  const prevFiscalYearIdRef = useRef(fiscalYear.id);

  useEffect(() => {
    if (pendingCloseRef.current && fiscalYear.id !== prevFiscalYearIdRef.current) {
      pendingCloseRef.current = false;
      router.push(LMNP_ROUTES.dashboard);
    }
    prevFiscalYearIdRef.current = fiscalYear.id;
  }, [fiscalYear.id, router]);

  useEffect(() => {
    if (closeFiscalYearError) {
      pendingCloseRef.current = false;
    }
  }, [closeFiscalYearError]);

  const handleConfirmCloseFiscalYear = async () => {
    setClosingFiscalYear(true);
    pendingCloseRef.current = true;
    await closeFiscalYearAndCreateNext();
    setClosingFiscalYear(false);
    setCloseConfirmOpen(false);
  };

  // P1-2 / liasse documentaire — téléchargement de la liasse fiscale
  // (pages documentaires + Cerfa). N'est rendu que si !declarationOutOfDate :
  // jamais de contournement de la fraîcheur P0-2. La RFS transmise est
  // exactement celle de la génération affichée (`workspace.declarationDraft.rfs`)
  // — jamais reconstruite. Les Cerfa restent produits par la route existante.
  const [liasseDownloading, setLiasseDownloading] = useState(false);
  const [liasseDownloadError, setLiasseDownloadError] = useState<string | undefined>(undefined);
  const declarationVersionId = declaration?.currentVersionId;
  // NEXT-5 — même prédicat pour les deux téléchargements (aide 2042-C-PRO et
  // liasse fiscale) : jamais l'un bloqué et l'autre livré depuis la même
  // projection incomplète, voir final-declarability.ts.
  const declarability = resolveFinalDeclarabilityState(workspace.declarationDraft?.liasseRfs);
  const canDownloadLiasse = Boolean(
    rfs && declarationVersionId && !declarationOutOfDate && declarability.deliverable,
  );

  const handleDownloadLiasseFiscale = async () => {
    if (liasseDownloading || !rfs || !declarationVersionId) return;
    setLiasseDownloading(true);
    setLiasseDownloadError(undefined);
    try {
      await downloadLiasseFiscalePdf({
        rfs,
        extras: collectLiasseDossierExtras({
          declarationDraft: workspace.declarationDraft,
          fiscalYear,
        }),
        declarationVersionId,
        fiscalYear: fiscalYear.year,
      });
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
          Déclaration LMNP {fiscalYear.year} — vos éléments fiscaux sont générés
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
          Résultat fiscal de votre activité pour l&apos;exercice {fiscalYear.year}.
        </p>
      </section>

      {declarationOutOfDate ? (
        <section
          className="w-full text-center"
          style={{
            borderRadius: radius.lg,
            border: `1px solid ${colors.warning.border}`,
            backgroundColor: colors.warning.surface,
            padding: spacing.card.md,
          }}
        >
          <p
            style={{
              ...typography.caption.desktop,
              color: colors.warning.DEFAULT,
              fontWeight: typography.fontWeight.medium,
              letterSpacing: typography.letterSpacing.label,
            }}
          >
            Ces chiffres correspondent à une génération antérieure
          </p>
          <p className="mx-auto mt-2 max-w-lg" style={{ ...typography.caption.desktop, color: colors.text.secondary }}>
            Les informations de votre dossier ont changé depuis cette génération. Vous pouvez toujours
            consulter et télécharger cette déclaration, mais générez une nouvelle version pour obtenir une
            déclaration à jour.
          </p>
          <p className="mt-3">
            <Link href={documentJourneyRoute("validation")} style={{ color: colors.warning.DEFAULT }}>
              Mettre à jour ma déclaration
            </Link>
          </p>
        </section>
      ) : null}

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
                downloadAide2042Pdf(buildClientSummaryDocument(rfs, { activityStartDate }));
              }}
            >
              Télécharger mon aide pour la déclaration 2042-C-PRO
            </Button>
            {rfs && !declarability.deliverable ? (
              <p className="mt-2" style={{ ...typography.caption.desktop, color: colors.text.muted }}>
                {FINAL_DECLARABILITY_BLOCKED_MESSAGE}
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
              {rfs && declarationVersionId && !declarationOutOfDate && !declarability.deliverable ? (
                <p style={{ ...typography.caption.desktop, color: colors.text.muted }}>
                  {FINAL_DECLARABILITY_BLOCKED_MESSAGE}
                </p>
              ) : null}
              {liasseDownloadError ? (
                <p style={{ ...typography.caption.desktop, color: colors.error.DEFAULT }}>{liasseDownloadError}</p>
              ) : null}
            </div>
          </article>
        </section>

      {canCloseThisFiscalYear ? (
        <section
          className="w-full text-center"
          style={{
            borderRadius: radius.lg,
            border: `1px solid ${colors.border.subtle}`,
            padding: spacing.card.md,
          }}
        >
          <p
            style={{
              ...typography.caption.desktop,
              color: colors.text.muted,
              letterSpacing: typography.letterSpacing.label,
            }}
          >
            Exercice {fiscalYear.year} terminé
          </p>
          <div className="mt-4 flex justify-center">
            <Button onClick={() => setCloseConfirmOpen(true)}>
              Continuer vers l&apos;exercice {fiscalYear.year + 1}
            </Button>
          </div>
          {closeFiscalYearError ? (
            <p className="mx-auto mt-3 max-w-lg" style={{ ...typography.caption.desktop, color: colors.error.DEFAULT }}>
              {closeFiscalYearError}
            </p>
          ) : null}
        </section>
      ) : null}

      {closeConfirmOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ backgroundColor: "rgba(28, 25, 23, 0.24)" }}
          role="dialog"
          aria-modal="true"
          aria-labelledby="close-fiscal-year-confirm-title"
        >
          <section
            className="w-full max-w-md animate-[fiscal-fade-in_450ms_cubic-bezier(0.16,1,0.3,1)_both]"
            style={{
              borderRadius: radius.lg,
              border: `1px solid ${colors.border.subtle}`,
              backgroundImage: [
                `radial-gradient(ellipse 88% 52% at 50% -8%, ${colors.orange[100]} 0%, transparent 62%)`,
                gradients.card.elevated,
              ].join(", "),
              boxShadow: shadows.card.hover,
              padding: spacing.card.md,
            }}
          >
            <p
              id="close-fiscal-year-confirm-title"
              className="text-center"
              style={{
                fontFamily: typography.fontFamily.display,
                fontSize: typography.fontSize.xl,
                color: colors.text.primary,
              }}
            >
              Clôturer l&apos;exercice {fiscalYear.year} ?
            </p>
            <p
              className="mx-auto mt-3 max-w-sm text-center"
              style={{ ...typography.body.desktop, color: colors.text.secondary }}
            >
              L&apos;exercice {fiscalYear.year} quitte le parcours actif et ne sera plus
              modifiable. L&apos;exercice {fiscalYear.year + 1} s&apos;ouvre immédiatement,
              avec les informations utiles de votre dossier (identité, bien, financement)
              déjà reprises. Fiscal AI ne transmet pas votre déclaration à votre place :
              cette action est une transition entre exercices, indépendante de la
              télétransmission.
            </p>
            <div className="mt-6 flex flex-col items-center gap-3">
              <Button onClick={handleConfirmCloseFiscalYear} disabled={closingFiscalYear}>
                {closingFiscalYear ? "Clôture en cours…" : "Clôturer et continuer"}
              </Button>
              <button
                type="button"
                onClick={() => setCloseConfirmOpen(false)}
                disabled={closingFiscalYear}
                style={{ ...typography.caption.desktop, color: colors.text.muted }}
              >
                Annuler
              </button>
            </div>
          </section>
        </div>
      ) : null}

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
