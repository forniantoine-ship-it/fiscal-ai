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
  F006FiscalEngineAssistant,
  type F006Action,
  type F006Message,
  type F006Result,
  type F006State,
} from "@/runtime";

function fmtEur(value: number): string {
  return `${Math.round(value).toLocaleString("fr-FR")} €`;
}

function MessageBubble({ message }: { message: F006Message }) {
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

function ResultSummaryCard({ result }: { result: F006Result }) {
  const fr = result.fiscalResult;
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
        {fmtEur(fr.resultatFiscal)}
      </p>
      <p style={{ ...typography.body.desktop, color: colors.text.secondary }}>{result.subtitle}</p>
    </div>
  );
}

function suggestionToAction(suggestionId: string): F006Action | null {
  if (suggestionId === "confirm") return { type: "confirm" };
  if (suggestionId === "explain_detail") return { type: "compute" };
  return null;
}

export function F006FiscalEnginePanel() {
  const { workspace, dispatch } = useLmnp();
  const fiscalYear = workspace.fiscalYear.year;
  const draft = workspace.declarationDraft;

  const deps = useMemo(
    () => ({
      exerciceFiscal: fiscalYear,
      activite: {
        siret: draft?.siret,
        dateMiseEnService: draft?.dateMiseEnService,
        activityType: draft?.activityType,
      },
      logementAmortissement: draft?.logementAmortissement,
      financementCharges: draft?.financementCharges,
      chargesAssistant: draft?.chargesAssistant,
      revenusAssistant: draft?.revenusAssistant,
      amortissementAssistant: draft?.amortissementAssistant,
      stockDeficitsAnterieurs: draft?.fiscalResult?.stocks.deficits,
      stockAmortissementsReportes: draft?.fiscalResult?.stocks.amortissementsReportes,
    }),
    [draft, fiscalYear],
  );

  const assistant = useMemo(
    () =>
      new F006FiscalEngineAssistant(
        {
          dossierId: workspace.fiscalYear.id,
          fiscalYear,
          route: LMNP_ROUTES.fiscalEngine,
        },
        deps,
      ),
    [deps, fiscalYear, workspace.fiscalYear.id],
  );

  const [state, setState] = useState<F006State>(() => {
    if (draft?.fiscalResult) {
      return { step: "complete" };
    }
    return assistant.start().state;
  });

  const [messages, setMessages] = useState<F006Message[]>(() => {
    if (draft?.fiscalResult) {
      return [
        {
          role: "assistant",
          content: `Résultat fiscal ${draft.fiscalResult.exercice} déjà calculé.\n\nRésultat imposable : ${fmtEur(draft.fiscalResult.resultatFiscal)}`,
        },
      ];
    }
    return assistant.start().messages;
  });

  const persistResult = useCallback(
    (result: F006Result) => {
      dispatch({
        type: "DECLARATION_PATCH_DRAFT",
        patch: {
          fiscalResult: {
            exercice: result.fiscalResult.exercice,
            resultatFiscal: result.fiscalResult.resultatFiscal,
            resultatAvantAmort: result.fiscalResult.resultatAvantAmort,
            totalRecettes: result.fiscalResult.recettes.total,
            totalCharges: result.fiscalResult.charges.totalDeductible,
            amortDeduct: result.fiscalResult.amortDeduct,
            amortReporte: result.fiscalResult.amortReporte,
            deficitNouveau: result.fiscalResult.deficitNouveau,
            stocks: result.fiscalResult.stocks,
            trace: result.fiscalResult.trace,
            computedAt: result.fiscalResult.trace.computedAt,
          },
          fiscalResultConfirmedAt: new Date().toISOString(),
        },
      });
      dispatch({ type: "DECLARATION_COMPLETE_STEP", stepId: "fiscal-engine" });
    },
    [dispatch],
  );

  const runAction = useCallback(
    async (action: F006Action) => {
      const turn = assistant.handle(state, action);
      setState(turn.state);
      setMessages((prev) => [...prev, ...turn.messages]);

      if (turn.completed && turn.state.result) {
        persistResult(turn.state.result);
      }
    },
    [assistant, persistResult, state],
  );

  const handleSuggestion = useCallback(
    (suggestionId: string) => {
      if (suggestionId === "redirect_revenus") {
        window.location.href = LMNP_ROUTES.revenusAssistant;
        return;
      }
      if (suggestionId === "redirect_charges") {
        window.location.href = LMNP_ROUTES.chargesAssistant;
        return;
      }
      if (suggestionId === "redirect_amortissements") {
        window.location.href = LMNP_ROUTES.amortissementsAssistant;
        return;
      }
      if (suggestionId === "redirect_activite") {
        window.location.href = LMNP_ROUTES.activite;
        return;
      }
      if (suggestionId === "redirect_dashboard") {
        window.location.href = LMNP_ROUTES.dashboard;
        return;
      }
      const action = suggestionToAction(suggestionId);
      if (action) void runAction(action);
    },
    [runAction],
  );

  const lastMessage = messages[messages.length - 1];

  return (
    <div style={{ maxWidth: 720, margin: "0 auto", padding: spacing.scale[6] }}>
      <Card>
        <h1 style={{ ...typography.sectionTitle.desktop, marginBottom: spacing.scale[2] }}>
          Calcul fiscal
        </h1>
        <p style={{ ...typography.body.desktop, color: colors.text.secondary, marginBottom: spacing.scale[5] }}>
          Consolidation des assistants validés — exercice {fiscalYear}
        </p>

        {state.result ? <ResultSummaryCard result={state.result} /> : null}

        <div style={{ marginBottom: spacing.scale[4] }}>
          {messages.map((message, index) => (
            <MessageBubble key={`${message.role}-${index}`} message={message} />
          ))}
        </div>

        {lastMessage?.suggestions?.length ? (
          <div style={{ display: "flex", flexWrap: "wrap", gap: spacing.scale[2], marginBottom: spacing.scale[4] }}>
            {lastMessage.suggestions.map((suggestion) => (
              <Button
                key={suggestion.id}
                variant={suggestion.id === "confirm" ? "primary" : "secondary"}
                onClick={() => handleSuggestion(suggestion.id)}
              >
                {suggestion.label}
              </Button>
            ))}
          </div>
        ) : null}

        {state.step === "complete" ? (
          <Link href={LMNP_ROUTES.dashboard} style={{ ...typography.body.desktop, color: colors.orange[600] }}>
            Retour au tableau de bord
          </Link>
        ) : null}
      </Card>
    </div>
  );
}
