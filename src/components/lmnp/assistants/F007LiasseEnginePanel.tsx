"use client";

import Link from "next/link";
import { useCallback, useMemo, useState } from "react";

import { Button } from "@/design-system/components/Button";
import { Card } from "@/design-system/components/Card";
import { colors } from "@/design-system/theme/colors";
import { radius } from "@/design-system/theme/radius";
import { spacing } from "@/design-system/theme/spacing";
import { typography } from "@/design-system/theme/typography";
import {
  fiscalResultFromDraft,
  identiteFromDeclarationDraft,
} from "@/lib/lmnp/services/f007/draft-to-liasse-inputs";
import { LMNP_ROUTES } from "@/lib/lmnp/routes";
import { useLmnp } from "@/lib/lmnp/store";
import {
  F007LiasseEngineAssistant,
  type F007Action,
  type F007Message,
  type F007Result,
  type F007State,
} from "@/runtime";

function fmtEur(value: number): string {
  return `${Math.round(value).toLocaleString("fr-FR")} €`;
}

function MessageBubble({ message }: { message: F007Message }) {
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

function CasesPreviewCard({ result }: { result: F007Result }) {
  const form = result.liasse.formulairesGeneres[0];
  if (!form) return null;

  const monetaryCases = form.cases.filter((c) => typeof c.value === "number");

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
      <p style={{ ...typography.body.desktop, color: colors.text.secondary, marginBottom: spacing.scale[3] }}>
        {result.subtitle}
      </p>
      <table style={{ width: "100%", ...typography.caption.desktop }}>
        <thead>
          <tr>
            <th style={{ textAlign: "left", paddingBottom: spacing.scale[2] }}>Case</th>
            <th style={{ textAlign: "right", paddingBottom: spacing.scale[2] }}>Valeur</th>
          </tr>
        </thead>
        <tbody>
          {monetaryCases.map((c) => (
            <tr key={c.caseId}>
              <td style={{ padding: `${spacing.scale[1]} 0`, color: colors.text.secondary }}>
                {c.caseId} — {c.label}
              </td>
              <td style={{ textAlign: "right", color: colors.text.primary }}>
                {fmtEur(c.value as number)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {result.liasse.formulairesManquants.length > 0 ? (
        <p style={{ ...typography.caption.desktop, color: colors.text.muted, marginTop: spacing.scale[3] }}>
          À générer : {result.liasse.formulairesManquants.join(", ")}
        </p>
      ) : null}
    </div>
  );
}

function suggestionToAction(suggestionId: string): F007Action | null {
  if (suggestionId === "confirm") return { type: "confirm" };
  if (suggestionId === "explain_detail") return { type: "generate" };
  return null;
}

export function F007LiasseEnginePanel() {
  const { workspace, dispatch } = useLmnp();
  const fiscalYear = workspace.fiscalYear.year;
  const draft = workspace.declarationDraft;

  const fiscalResult = useMemo(() => fiscalResultFromDraft(draft), [draft]);
  const identite = useMemo(
    () => identiteFromDeclarationDraft(draft, fiscalYear),
    [draft, fiscalYear],
  );

  const deps = useMemo(() => {
    if (!fiscalResult) return null;
    return { fiscalResult, identite };
  }, [fiscalResult, identite]);

  const assistant = useMemo(() => {
    if (!deps) return null;
    return new F007LiasseEngineAssistant(
      {
        dossierId: workspace.fiscalYear.id,
        fiscalYear,
        route: LMNP_ROUTES.liasseEngine,
      },
      deps,
    );
  }, [deps, fiscalYear, workspace.fiscalYear.id]);

  const [state, setState] = useState<F007State>(() => {
    if (draft?.liasseResult) return { step: "complete" };
    if (!assistant) return { step: "blocked" };
    return assistant.start().state;
  });

  const [messages, setMessages] = useState<F007Message[]>(() => {
    if (draft?.liasseResult) {
      return [
        {
          role: "assistant",
          content: `Liasse exercice ${draft.liasseResult.exercice} déjà générée.\n\nFormulaire 2031-SD : ${draft.liasseResult.caseCount} cases.`,
        },
      ];
    }
    if (!assistant) {
      return [
        {
          role: "assistant",
          content: "Validez d'abord le calcul fiscal (F-006) avant de générer la liasse.",
          suggestions: [{ id: "redirect_fiscal", label: "Aller au Calcul fiscal" }],
        },
      ];
    }
    return assistant.start().messages;
  });

  // P2-4 — F-007 ne persiste plus liasseResult directement : seul
  // runDeclarationGeneration() (Validation) écrit fiscalResult/rfs/liasseRfs/
  // liasseResult, en un seul appel atomique. Ce panel reste un outil de
  // calcul/affichage local (state.result, via CasesPreviewCard) — il ne fait
  // ici que suivre l'avancement du parcours, sans écrire le résultat lui-même.
  const completeLiasseEngineStep = useCallback(() => {
    dispatch({ type: "DECLARATION_COMPLETE_STEP", stepId: "liasse-engine" });
  }, [dispatch]);

  const runAction = useCallback(
    async (action: F007Action) => {
      if (!assistant) return;
      const turn = assistant.handle(state, action);
      setState(turn.state);
      setMessages((prev) => [...prev, ...turn.messages]);

      if (turn.completed && turn.state.result) {
        completeLiasseEngineStep();
      }
    },
    [assistant, completeLiasseEngineStep, state],
  );

  const handleSuggestion = useCallback(
    (suggestionId: string) => {
      if (suggestionId === "redirect_fiscal") {
        window.location.href = LMNP_ROUTES.fiscalEngine;
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
          Génération de la liasse
        </h1>
        <p style={{ ...typography.body.desktop, color: colors.text.secondary, marginBottom: spacing.scale[5] }}>
          Transformation documentaire — formulaire 2031-SD — exercice {fiscalYear}
        </p>

        {state.result ? <CasesPreviewCard result={state.result} /> : null}

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
          <Link href={LMNP_ROUTES.validation} style={{ ...typography.body.desktop, color: colors.orange[600] }}>
            Préparer la déclaration
          </Link>
        ) : null}
      </Card>
    </div>
  );
}
