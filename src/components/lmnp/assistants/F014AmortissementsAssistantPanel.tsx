"use client";

import Link from "next/link";
import { useCallback, useMemo, useState } from "react";

import { Button } from "@/design-system/components/Button";
import { Card } from "@/design-system/components/Card";
import { colors } from "@/design-system/theme/colors";
import { radius } from "@/design-system/theme/radius";
import { spacing } from "@/design-system/theme/spacing";
import { typography } from "@/design-system/theme/typography";
import { LMNP_ROUTES } from "@/lib/lmnp/routes";
import { useLmnp } from "@/lib/lmnp/store";
import {
  F014AmortissementsAssistant,
  fiscalResultMatchesAmortissementTotal,
  hasAmortissementDrifted,
  expF014UsageFiscal,
  type F014Action,
  type F014Message,
  type F014Result,
  type F014State,
} from "@/runtime";

function fmtEur(value: number): string {
  return `${Math.round(value).toLocaleString("fr-FR")} €`;
}

function MessageBubble({ message }: { message: F014Message }) {
  const isAssistant = message.role === "assistant";
  return (
    <div className={isAssistant ? "mr-8" : "ml-8 text-right"} style={{ marginBottom: spacing.scale[3] }}>
      <div
        style={{
          display: "inline-block",
          textAlign: "left",
          maxWidth: "100%",
          padding: `${spacing.scale[3]} ${spacing.scale[4]}`,
          borderRadius: radius.lg,
          backgroundColor: isAssistant ? colors.surface.inset : colors.orange[50],
          color: colors.text.primary,
          ...typography.body.desktop,
          whiteSpace: "pre-wrap",
        }}
      >
        {message.content}
      </div>
    </div>
  );
}

function SuggestionButton({
  suggestionId,
  label,
  onPick,
}: {
  suggestionId: string;
  label: string;
  onPick: (id: string) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onPick(suggestionId)}
      style={{
        ...typography.caption.desktop,
        padding: `${spacing.scale[2]} ${spacing.scale[3]}`,
        borderRadius: radius.md,
        border: `1px solid ${colors.border.subtle}`,
        backgroundColor: colors.surface.primary,
        cursor: "pointer",
      }}
    >
      {label}
    </button>
  );
}

function PlanSummaryCard({ result, usageNote }: { result: F014Result; usageNote?: string }) {
  return (
    <div
      style={{
        padding: spacing.scale[4],
        borderRadius: radius.lg,
        backgroundColor: colors.surface.inset,
        marginBottom: spacing.scale[4],
      }}
    >
      <p style={{ ...typography.caption.desktop, color: colors.text.muted }}>{result.headline}</p>
      <p style={{ ...typography.sectionTitle.desktop, color: colors.text.primary }}>
        {fmtEur(result.plan.total_dotations_exercice)}
      </p>
      <p style={{ ...typography.body.desktop, color: colors.text.secondary }}>{result.subtitle}</p>
      <p style={{ ...typography.caption.desktop, color: colors.text.muted, marginTop: spacing.scale[2] }}>
        {usageNote ??
          "Ce montant calculé sera déduit de votre résultat imposable dans la limite de celui-ci ; l'éventuel surplus sera reporté sans limite de durée. Le détail sera connu après le calcul fiscal."}
      </p>
    </div>
  );
}

function suggestionToAction(suggestionId: string): F014Action | null {
  if (suggestionId === "show_detail") return { type: "show_detail" };
  if (suggestionId === "show_pluriannuel") return { type: "show_pluriannuel" };
  if (suggestionId === "start_contestation") return { type: "start_contestation" };
  if (suggestionId === "confirm") return { type: "confirm" };
  if (suggestionId.startsWith("explain_")) {
    return { type: "explain_composant", composantId: suggestionId.replace("explain_", "") };
  }
  if (suggestionId.startsWith("contest_")) {
    return { type: "submit_contestation", composantId: suggestionId.replace("contest_", "") };
  }
  return null;
}

export function F014AmortissementsAssistantPanel() {
  const { workspace, dispatch } = useLmnp();
  const fiscalYear = workspace.fiscalYear.year;
  const draft = workspace.declarationDraft;

  const assistant = useMemo(
    () =>
      new F014AmortissementsAssistant(
        {
          dossierId: workspace.fiscalYear.id,
          fiscalYear,
          route: LMNP_ROUTES.amortissementsAssistant,
        },
        {
          dateMiseEnService: draft?.dateMiseEnService,
          planLogement: draft?.logementAmortissement?.plan,
          prorataRatio: draft?.logementAmortissement?.prorataRatio,
          composantsNouveaux: draft?.chargesAssistant?.composantsNouveaux,
          planValidePrecedemment: Boolean(draft?.amortissementAssistant?.validatedAt),
          anneeValidationInitiale: draft?.amortissementAssistant?.anneeValidationInitiale ?? null,
        },
      ),
    [
      draft?.amortissementAssistant,
      draft?.chargesAssistant?.composantsNouveaux,
      draft?.dateMiseEnService,
      draft?.logementAmortissement,
      fiscalYear,
      workspace.fiscalYear.id,
    ],
  );

  const [state, setState] = useState<F014State>(() => {
    if (draft?.amortissementAssistant && draft.logementAmortissement) {
      const start = assistant.start();
      const drifted =
        !start.state.plan ||
        hasAmortissementDrifted(draft.amortissementAssistant.totalDotations, start.state.plan.total_dotations_exercice);
      if (!drifted) {
        return {
          ...start.state,
          step: "complete",
          result: {
            plan: start.state.plan!,
            profil: start.state.profil!,
            validation: {
              status: "validated",
              exercice: draft.amortissementAssistant.exerciceFiscal,
              total_dotations: draft.amortissementAssistant.totalDotations,
              validated_at: draft.amortissementAssistant.validatedAt,
              plan_version: draft.amortissementAssistant.planVersion,
            },
            explanation: "",
            headline: `Amortissements ${draft.amortissementAssistant.exerciceFiscal}`,
            subtitle: "Plan validé.",
            anomalies: [],
          },
        };
      }
      // Logement/travaux modifiés depuis la dernière validation : on revient sur
      // le plan frais et on laisse l'utilisateur revalider (cf. runAction "confirm").
      return start.state;
    }
    return assistant.start().state;
  });

  const [messages, setMessages] = useState<F014Message[]>(() => {
    if (draft?.amortissementAssistant && draft.logementAmortissement) {
      const start = assistant.start();
      if (start.state.plan) {
        const drifted = hasAmortissementDrifted(
          draft.amortissementAssistant.totalDotations,
          start.state.plan.total_dotations_exercice,
        );
        if (!drifted) {
          return [
            {
              role: "assistant",
              content: `Vos amortissements sont déjà validés pour ${draft.amortissementAssistant.exerciceFiscal}.`,
            },
          ];
        }
        return [
          {
            role: "assistant",
            content:
              `Votre logement ou vos travaux ont changé depuis la validation de vos amortissements ` +
              `(${fmtEur(draft.amortissementAssistant.totalDotations)} validés pour ${draft.amortissementAssistant.exerciceFiscal}).\n\n` +
              `Nouveau total calculé : ${fmtEur(start.state.plan.total_dotations_exercice)}. ` +
              `Vérifiez le détail ci-dessous et revalidez ce plan.`,
          },
          ...start.messages,
        ];
      }
    }
    return assistant.start().messages;
  });

  const [busy, setBusy] = useState(false);

  const persistCompletion = useCallback(
    (finalState: F014State) => {
      const result = finalState.result;
      if (!result) return;

      dispatch({
        type: "DECLARATION_PATCH_DRAFT",
        patch: {
          amortissementConfirmedAt: result.validation.validated_at,
          amortissementAssistant: {
            exerciceFiscal: result.validation.exercice,
            totalDotations: result.validation.total_dotations,
            status: result.validation.status,
            planVersion: result.validation.plan_version,
            profil: result.profil,
            validatedAt: result.validation.validated_at,
            anneeValidationInitiale:
              result.profil === "PROF-001"
                ? result.validation.exercice
                : draft?.amortissementAssistant?.anneeValidationInitiale ?? result.validation.exercice,
          },
        },
      });
      dispatch({ type: "DECLARATION_COMPLETE_STEP", stepId: "amortissement-assistant" });
    },
    [dispatch, draft?.amortissementAssistant?.anneeValidationInitiale],
  );

  const runAction = useCallback(
    async (action: F014Action) => {
      setBusy(true);
      try {
        const turn = await assistant.handle(state, action);
        setState(turn.state);
        setMessages((prev) => [...prev, ...turn.messages]);
        if (turn.completed && turn.state.result) {
          persistCompletion(turn.state);
        }
      } finally {
        setBusy(false);
      }
    },
    [assistant, persistCompletion, state],
  );

  const handleSuggestion = useCallback(
    (suggestionId: string) => {
      if (suggestionId === "redirect_logement") {
        window.location.href = LMNP_ROUTES.logement;
        return;
      }
      if (suggestionId === "redirect_charges") {
        window.location.href = LMNP_ROUTES.chargesAssistant;
        return;
      }
      const action = suggestionToAction(suggestionId);
      if (action) void runAction(action);
    },
    [runAction],
  );

  const step = state.step;
  const lastMessage = messages[messages.length - 1];

  const usageNote = useMemo(() => {
    const plan = state.result?.plan;
    const fiscalResult = draft?.fiscalResult;
    if (!plan || !fiscalResult || fiscalResult.exercice !== plan.exercice) return undefined;
    if (!fiscalResultMatchesAmortissementTotal(fiscalResult.trace.journal, plan.total_dotations_exercice)) {
      return undefined;
    }
    return expF014UsageFiscal({ amortDeduct: fiscalResult.amortDeduct, amortReporte: fiscalResult.amortReporte });
  }, [state.result, draft?.fiscalResult]);

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 style={{ ...typography.sectionTitle.desktop, color: colors.text.primary }}>
            Assistant Amortissements
          </h1>
          <p style={{ ...typography.body.desktop, color: colors.text.secondary }}>
            Exercice {fiscalYear}
          </p>
        </div>
        <Link href={LMNP_ROUTES.dashboard} style={{ ...typography.caption.desktop, color: colors.orange[600] }}>
          Retour au tableau de bord
        </Link>
      </div>

      <Card>
        {state.result ? <PlanSummaryCard result={state.result} usageNote={usageNote} /> : null}

        <div style={{ marginBottom: spacing.scale[4] }}>
          {messages.map((message, index) => (
            <div key={`${message.role}-${index}`}>
              <MessageBubble message={message} />
              {index === messages.length - 1 && message.suggestions ? (
                <div className="mb-4 flex flex-wrap gap-2">
                  {message.suggestions.map((s) => (
                    <SuggestionButton
                      key={s.id}
                      suggestionId={s.id}
                      label={s.label}
                      onPick={handleSuggestion}
                    />
                  ))}
                </div>
              ) : null}
            </div>
          ))}
        </div>

        {step === "blocked" ? (
          <Link href={LMNP_ROUTES.logement}>
            <Button>Compléter l&apos;étape Logement</Button>
          </Link>
        ) : null}

        {step !== "complete" && step !== "blocked" && lastMessage?.suggestions ? null : null}

        {step !== "complete" && step !== "blocked" ? (
          <div className="flex flex-wrap gap-2 border-t pt-4" style={{ borderColor: colors.border.subtle }}>
            <Button variant="secondary" disabled={busy} onClick={() => void runAction({ type: "show_detail" })}>
              Détail par composant
            </Button>
            <Button variant="ghost" disabled={busy} onClick={() => void runAction({ type: "show_pluriannuel" })}>
              Plan pluriannuel
            </Button>
            {state.profil !== "PROF-002" ? (
              <Button variant="ghost" disabled={busy} onClick={() => void runAction({ type: "start_contestation" })}>
                Quelque chose semble incorrect ?
              </Button>
            ) : null}
            <Button disabled={busy} onClick={() => void runAction({ type: "confirm" })}>
              {state.profil === "PROF-002" ? "Confirmer" : "Je valide ce plan"}
            </Button>
          </div>
        ) : null}

        {step === "complete" ? (
          <div className="flex gap-2 border-t pt-4" style={{ borderColor: colors.border.subtle }}>
            <Link href={LMNP_ROUTES.validation} className="flex-1">
              <Button className="w-full">Préparer la déclaration</Button>
            </Link>
            <Link href={LMNP_ROUTES.dashboard}>
              <Button variant="ghost">Retour au tableau de bord</Button>
            </Link>
          </div>
        ) : null}
      </Card>
    </div>
  );
}
