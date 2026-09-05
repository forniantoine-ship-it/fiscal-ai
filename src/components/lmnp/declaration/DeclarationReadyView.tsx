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
import {
  downloadLiasseDocument,
  downloadLiasseRfsDocument,
} from "@/lib/lmnp/services/declaration/export-liasse-document";
import {
  formatLiasseCoverageMessage,
  resolveLiasseCoverageState,
} from "@/lib/lmnp/services/declaration/liasse-coverage-state";
import { downloadClientSummaryPdf } from "@/lib/lmnp/services/declaration/render-client-summary-pdf";
import { resolveFormulairesManquants } from "@/lib/lmnp/services/declaration/run-declaration-generation";
import { canCloseFiscalYear } from "@/lib/lmnp/services/dossier/fiscal-year-cycle";
import { useLmnp } from "@/lib/lmnp/store";

function fmtEur(value: number): string {
  return `${Math.round(value).toLocaleString("fr-FR")} €`;
}

export function DeclarationReadyView() {
  const router = useRouter();
  const { workspace, closeFiscalYearAndCreateNext, closeFiscalYearError } = useLmnp();
  const { fiscalYear } = workspace;
  const { fiscalResult, liasseResult, rfs, liasseRfs, activityStartDate } = workspace.declarationDraft ?? {};

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
  // P0-2 — préfère liasseRfs (2031-SD + 2031-bis + 2033-A/B/C) à liasseResult
  // (F-007, 2031-SD seul) quand disponible ; jamais de fusion, jamais de recalcul.
  const formulairesManquants = resolveFormulairesManquants(liasseResult, liasseRfs);
  // P0-2a — `formulairesGeneres` (RFS) atteste qu'un formulaire a été assemblé
  // sans erreur, jamais que ses cases sont réellement alimentées : ce décompte
  // ne doit donc jamais être présenté comme une preuve de "liasse complète"
  // au sens officiel (cf. audit P0-2a).
  const coverage = resolveLiasseCoverageState(liasseRfs);
  const { coverageLine, disclaimer } = formatLiasseCoverageMessage(coverage);

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
          Ce document récapitule votre résultat fiscal et vous indique les informations à vérifier ou à
          reporter dans votre déclaration personnelle.
        </p>
        {rfs ? (
          <>
            <p
              className="mt-2"
              style={{ ...typography.caption.desktop, color: colors.success.DEFAULT, fontWeight: typography.fontWeight.medium }}
            >
              Votre aide à la déclaration est prête
            </p>
            <div className="mt-6 flex justify-center">
              <Button
                onClick={() =>
                  downloadClientSummaryPdf(
                    buildClientSummaryDocument(rfs, { activityStartDate }),
                  )
                }
              >
                Télécharger ma synthèse fiscale et mon aide à la déclaration (PDF)
              </Button>
            </div>
          </>
        ) : null}
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
          {coverageLine} {disclaimer}
        </p>
        <div className="mt-4 flex justify-center">
          <Button
            variant="ghost"
            onClick={() => downloadLiasseDocument(fiscalYear.year, fiscalResult, liasseResult)}
          >
            Télécharger la liasse
          </Button>
        </div>
        {formulairesManquants.length > 0 ? (
          <p className="mt-3 text-center" style={{ ...typography.caption.desktop, color: colors.text.muted }}>
            Formulaires non encore générés : {formulairesManquants.join(", ")}
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
