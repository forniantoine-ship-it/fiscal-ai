"use client";

import Link from "next/link";
import { useCallback, useMemo, useState } from "react";

import { Button } from "@/design-system/components/Button";
import { Card } from "@/design-system/components/Card";
import { colors } from "@/design-system/theme/colors";
import { radius } from "@/design-system/theme/radius";
import { spacing } from "@/design-system/theme/spacing";
import { typography } from "@/design-system/theme/typography";
import { ACTIVITE_ACTIVITY_TYPE } from "@/lib/lmnp/constants/activite-product";
import { LMNP_ROUTES } from "@/lib/lmnp/routes";
import { useLmnp } from "@/lib/lmnp/store";
import {
  F009ActiviteAssistant,
  type F009Action,
  type F009Message,
  type F009Orientation,
  type F009State,
} from "@/runtime";

function MessageBubble({ message }: { message: F009Message }) {
  const isAssistant = message.role === "assistant";
  return (
    <div
      className={isAssistant ? "mr-8" : "ml-8 text-right"}
      style={{ marginBottom: spacing.scale[3] }}
    >
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
        }}
      >
        {message.content}
      </div>
    </div>
  );
}

export function F009ActiviteAssistantPanel() {
  const { workspace, dispatch } = useLmnp();
  const fiscalYear = workspace.fiscalYear.year;

  const assistant = useMemo(
    () =>
      new F009ActiviteAssistant({
        dossierId: workspace.fiscalYear.id,
        fiscalYear,
        route: "/assistants/activite",
      }),
    [fiscalYear, workspace.fiscalYear.id],
  );

  const [state, setState] = useState<F009State>(() => {
    const draft = workspace.declarationDraft;
    if (draft?.siret && draft.activityStartDate && draft.dateMiseEnService) {
      return {
        step: "complete",
        siret: draft.siret,
        dateDebutActivite: draft.activityStartDate,
        dateMiseEnService: draft.dateMiseEnService,
        regimeFiscal: "reel_simplifie",
        fieldSources: {},
      };
    }
    return assistant.start().state;
  });

  const [messages, setMessages] = useState<F009Message[]>(() => {
    const draft = workspace.declarationDraft;
    if (draft?.siret && draft.activityStartDate && draft.dateMiseEnService) {
      return [
        {
          role: "assistant",
          content: "Votre activité est déjà enregistrée pour cet exercice.",
        },
      ];
    }
    return assistant.start().messages;
  });

  const [siretInput, setSiretInput] = useState("");
  const [dateDebutInput, setDateDebutInput] = useState("");
  const [dateMiseEnServiceInput, setDateMiseEnServiceInput] = useState("");
  const [busy, setBusy] = useState(false);

  const persistCompletion = useCallback(
    (finalState: F009State) => {
      dispatch({
        type: "DECLARATION_PATCH_DRAFT",
        patch: {
          siret: finalState.siret,
          siren: finalState.siret?.slice(0, 9),
          activityStartDate: finalState.dateDebutActivite,
          dateMiseEnService: finalState.dateMiseEnService,
          activityType: ACTIVITE_ACTIVITY_TYPE,
        },
      });
      dispatch({ type: "DECLARATION_COMPLETE_STEP", stepId: "activite-assistant" });
      dispatch({
        type: "CONFIRM_REGIME",
        regime: "reel",
      });
    },
    [dispatch],
  );

  const runAction = useCallback(
    async (action: F009Action) => {
      setBusy(true);
      try {
        const turn = await assistant.handle(state, action);
        setState(turn.state);
        setMessages((prev) => [...prev, ...turn.messages]);
        if (turn.completed) {
          persistCompletion(turn.state);
        }
      } finally {
        setBusy(false);
      }
    },
    [assistant, persistCompletion, state],
  );

  const showOrientation = state.step === "orientation";
  const showSiret = state.step === "collect_siret";
  const showActivity = state.step === "collect_activity";
  const showMiseEnService = state.step === "mise_en_service";
  const showConfirmation = state.step === "confirmation";
  const isComplete = state.step === "complete";

  return (
    <div className="mx-auto max-w-2xl">
      <header style={{ marginBottom: spacing.scale[6] }}>
        <p
          style={{
            ...typography.caption.desktop,
            color: colors.text.muted,
            letterSpacing: typography.letterSpacing.label,
            textTransform: "uppercase",
          }}
        >
          Assistant Activité
        </p>
        <h1
          style={{
            ...typography.sectionTitle.desktop,
            color: colors.text.primary,
            marginTop: spacing.scale[2],
          }}
        >
          Établissons votre activité LMNP
        </h1>
        <p
          className="mt-2"
          style={{ ...typography.body.desktop, color: colors.text.secondary }}
        >
          Exercice {fiscalYear} — quelques questions pour poser les bases de votre dossier.
        </p>
      </header>

      <Card className="!p-0 overflow-hidden">
        <div
          style={{
            padding: spacing.scale[5],
            minHeight: "280px",
            maxHeight: "420px",
            overflowY: "auto",
            backgroundColor: colors.surface.primary,
          }}
        >
          {messages.map((message, index) => (
            <MessageBubble key={`${message.role}-${index}`} message={message} />
          ))}
        </div>

        <div
          style={{
            borderTop: `1px solid ${colors.border.subtle}`,
            padding: spacing.scale[5],
            backgroundColor: colors.surface.secondary,
          }}
        >
          {showOrientation ? (
            <div className="flex flex-col gap-2">
              {[
                { id: "registered_siret" as const, label: "Oui, et j'ai mon SIRET" },
                { id: "registered_no_siret" as const, label: "Oui, mais je n'ai pas mon SIRET" },
                { id: "not_sure" as const, label: "Je ne suis pas sûr" },
                { id: "not_yet" as const, label: "Pas encore déclarée" },
              ].map((option) => (
                <Button
                  key={option.id}
                  variant="secondary"
                  disabled={busy}
                  onClick={() =>
                    runAction({ type: "select_orientation", orientation: option.id as F009Orientation })
                  }
                >
                  {option.label}
                </Button>
              ))}
            </div>
          ) : null}

          {showSiret ? (
            <form
              className="flex flex-col gap-3"
              onSubmit={(event) => {
                event.preventDefault();
                void runAction({ type: "submit_siret", siret: siretInput });
              }}
            >
              <input
                value={siretInput}
                onChange={(event) => setSiretInput(event.target.value)}
                placeholder="14 chiffres"
                inputMode="numeric"
                className="w-full outline-none"
                style={{
                  ...typography.body.desktop,
                  padding: spacing.scale[3],
                  borderRadius: radius.md,
                  border: `1px solid ${colors.border.subtle}`,
                  backgroundColor: colors.surface.primary,
                }}
              />
              <Button type="submit" disabled={busy || !siretInput.trim()}>
                Vérifier mon SIRET
              </Button>
            </form>
          ) : null}

          {showActivity ? (
            <form
              className="flex flex-col gap-3"
              onSubmit={(event) => {
                event.preventDefault();
                void runAction({
                  type: "submit_activity",
                  dateDebutActivite: dateDebutInput,
                  regimeFiscal: "reel_simplifie",
                });
              }}
            >
              <label style={{ ...typography.caption.desktop, color: colors.text.muted }}>
                Date de début d&apos;activité (immatriculation)
              </label>
              <input
                type="date"
                value={dateDebutInput}
                onChange={(event) => setDateDebutInput(event.target.value)}
                className="w-full outline-none"
                style={{
                  padding: spacing.scale[3],
                  borderRadius: radius.md,
                  border: `1px solid ${colors.border.subtle}`,
                  backgroundColor: colors.surface.primary,
                }}
              />
              <Button type="submit" disabled={busy || !dateDebutInput}>
                Continuer
              </Button>
            </form>
          ) : null}

          {showMiseEnService ? (
            <form
              className="flex flex-col gap-3"
              onSubmit={(event) => {
                event.preventDefault();
                void runAction({
                  type: "submit_mise_en_service",
                  dateMiseEnService: dateMiseEnServiceInput,
                });
              }}
            >
              <label style={{ ...typography.caption.desktop, color: colors.text.muted }}>
                Date de première mise en location
              </label>
              <input
                type="date"
                value={dateMiseEnServiceInput}
                onChange={(event) => setDateMiseEnServiceInput(event.target.value)}
                className="w-full outline-none"
                style={{
                  padding: spacing.scale[3],
                  borderRadius: radius.md,
                  border: `1px solid ${colors.border.subtle}`,
                  backgroundColor: colors.surface.primary,
                }}
              />
              <Button type="submit" disabled={busy || !dateMiseEnServiceInput}>
                Voir l&apos;impact sur mon exercice
              </Button>
            </form>
          ) : null}

          {showConfirmation ? (
            <div className="flex flex-col gap-2">
              <Button disabled={busy} onClick={() => void runAction({ type: "confirm" })}>
                Confirmer
              </Button>
              <Button
                variant="ghost"
                disabled={busy}
                onClick={() => void runAction({ type: "restart" })}
              >
                Recommencer
              </Button>
            </div>
          ) : null}

          {isComplete ? (
            <Link href={LMNP_ROUTES.dashboard}>
              <Button className="w-full">Retour au tableau de bord</Button>
            </Link>
          ) : null}
        </div>
      </Card>
    </div>
  );
}
