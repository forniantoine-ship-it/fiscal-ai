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
  F011FinancementAssistant,
  type F011Action,
  type F011Message,
  type F011Result,
  type F011State,
} from "@/runtime";

const inputStyle = {
  ...typography.body.desktop,
  padding: spacing.scale[3],
  borderRadius: radius.md,
  border: `1px solid ${colors.border.subtle}`,
  backgroundColor: colors.surface.primary,
  width: "100%",
} as const;

const labelStyle = { ...typography.caption.desktop, color: colors.text.muted } as const;

function fmtEur(value: number): string {
  return `${Math.round(value).toLocaleString("fr-FR")} €`;
}

function MessageBubble({ message }: { message: F011Message }) {
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

function ResultSummary({ result }: { result: F011Result }) {
  if (result.skipped) return null;
  const { charges } = result;
  return (
    <div
      style={{
        padding: spacing.scale[4],
        borderRadius: radius.lg,
        backgroundColor: colors.surface.inset,
        marginTop: spacing.scale[4],
      }}
    >
      <p style={{ ...typography.caption.desktop, color: colors.text.muted }}>Total déductible</p>
      <p style={{ ...typography.sectionTitle.desktop, color: colors.text.primary }}>
        {fmtEur(charges.totalChargesFinancementExercice)}
      </p>
      <p style={{ ...typography.body.desktop, color: colors.text.secondary }}>
        Intérêts : {fmtEur(charges.totalInteretsEmprunt)} — Assurance : {fmtEur(charges.totalAssurance)}
      </p>
      {charges.totalInteretsPreExploitation > 0 ? (
        <p style={{ ...typography.body.desktop, color: colors.text.secondary }}>
          Pré-exploitation (non déductible) : {fmtEur(charges.totalInteretsPreExploitation)}
        </p>
      ) : null}
    </div>
  );
}

export function F011FinancementAssistantPanel() {
  const { workspace, dispatch } = useLmnp();
  const fiscalYear = workspace.fiscalYear.year;
  const draft = workspace.declarationDraft;

  const assistant = useMemo(
    () =>
      new F011FinancementAssistant(
        {
          dossierId: workspace.fiscalYear.id,
          fiscalYear,
          route: "/assistants/financement",
        },
        {
          dateMiseEnService: draft?.dateMiseEnService,
          prixRevient: draft?.logementAmortissement?.prixRevient,
        },
      ),
    [draft?.dateMiseEnService, draft?.logementAmortissement?.prixRevient, fiscalYear, workspace.fiscalYear.id],
  );

  const [state, setState] = useState<F011State>(() => {
    if (draft?.financementCharges) {
      return {
        step: "complete",
        currentLoanIndex: 0,
        loans: [],
        fieldSources: {},
        result: {
          skipped: false,
          explanation: "",
          anomalies: [],
          charges: {
            exerciceFiscal: draft.financementCharges.exerciceFiscal,
            prets: draft.financementCharges.prets,
            totalInteretsEmprunt: draft.financementCharges.totalInteretsEmprunt,
            totalInteretsPreExploitation: draft.financementCharges.totalInteretsPreExploitation,
            totalAssurance: draft.financementCharges.totalAssurance,
            totalCapitalRembourse: draft.financementCharges.totalCapitalRembourse,
            totalChargesFinancementExercice: draft.financementCharges.totalChargesFinancementExercice,
          },
        },
      };
    }
    return assistant.start().state;
  });

  const [messages, setMessages] = useState<F011Message[]>(() => {
    if (draft?.financementCharges) {
      return [{ role: "assistant", content: "Votre financement est déjà enregistré pour cet exercice." }];
    }
    return assistant.start().messages;
  });

  const [capital, setCapital] = useState("200000");
  const [rate, setRate] = useState("1.85");
  const [duration, setDuration] = useState("240");
  const [firstPayment, setFirstPayment] = useState("2022-01-15");
  const [loanCount, setLoanCount] = useState(1);
  const [busy, setBusy] = useState(false);

  const persistCompletion = useCallback(
    (finalState: F011State) => {
      const result = finalState.result;
      if (!result) return;

      if (result.skipped) {
        dispatch({ type: "DECLARE_NO_CREDIT" });
        dispatch({ type: "DECLARATION_COMPLETE_STEP", stepId: "financement-assistant" });
        return;
      }

      dispatch({
        type: "DECLARATION_PATCH_DRAFT",
        patch: {
          financementCharges: {
            exerciceFiscal: result.charges.exerciceFiscal,
            totalInteretsEmprunt: result.charges.totalInteretsEmprunt,
            totalInteretsPreExploitation: result.charges.totalInteretsPreExploitation,
            totalAssurance: result.charges.totalAssurance,
            totalCapitalRembourse: result.charges.totalCapitalRembourse,
            totalChargesFinancementExercice: result.charges.totalChargesFinancementExercice,
            prets: result.charges.prets,
            fieldSources: finalState.fieldSources,
            computedAt: new Date().toISOString(),
          },
        },
      });
      dispatch({
        type: "CONFIRM_CREDIT_FINANCING",
        financing: {
          loans: finalState.loans.map((loan, index) => ({
            id: loan.pretId,
            bank: `Prêt ${index + 1}`,
            loanType: loan.typePret,
            borrowedAmount: loan.capitalInitial,
            rate: loan.tauxNominal * 100,
            durationMonths: loan.dureeMois,
            monthlyPayment: 0,
            insurance: loan.assuranceAnnuelle ?? 0,
            fees: 0,
            startDate: loan.datePremiereMensualite,
            firstPaymentDate: loan.datePremiereMensualite,
            remainingCapital: result.charges.prets[index]?.capitalRestantDu31_12 ?? 0,
          })),
          summary: {
            fiscalYearLabel: String(result.charges.exerciceFiscal),
            annualInterest: result.charges.totalInteretsEmprunt,
            annualInsurance: result.charges.totalAssurance,
            remainingCapital: result.charges.prets[0]?.capitalRestantDu31_12 ?? 0,
          },
          installments: [],
        },
      });
      dispatch({ type: "DECLARATION_COMPLETE_STEP", stepId: "financement-assistant" });
    },
    [dispatch],
  );

  const runAction = useCallback(
    async (action: F011Action) => {
      setBusy(true);
      try {
        const turn = await assistant.handle(state, action);
        setState(turn.state);
        setMessages((prev) => [...prev, ...turn.messages]);
        if (turn.completed) persistCompletion(turn.state);
      } finally {
        setBusy(false);
      }
    },
    [assistant, persistCompletion, state],
  );

  const handleSuggestion = useCallback(
    (suggestionId: string) => {
      if (suggestionId === "yes") void runAction({ type: "set_presence_emprunt", presence: true });
      if (suggestionId === "no") void runAction({ type: "set_presence_emprunt", presence: false });
      if (suggestionId === "1") {
        setLoanCount(1);
        void runAction({ type: "set_nombre_prets", count: 1 });
      }
      if (suggestionId === "2") {
        setLoanCount(2);
        void runAction({ type: "set_nombre_prets", count: 2 });
      }
      if (suggestionId === "confirm_loan") void runAction({ type: "confirm_loan" });
      if (suggestionId === "confirm_all") void runAction({ type: "confirm_all" });
    },
    [runAction],
  );

  const submitLoan = useCallback(() => {
    const capitalValue = Number(capital);
    const rateValue = Number(rate) / 100;
    const durationValue = Number(duration);
    if (!Number.isFinite(capitalValue) || !Number.isFinite(rateValue) || !Number.isFinite(durationValue)) {
      return;
    }
    void runAction({
      type: "submit_loan",
      typePret: "amortissable",
      capitalInitial: capitalValue,
      tauxNominal: rateValue,
      dureeMois: durationValue,
      datePremiereMensualite: firstPayment,
      source: "manual",
    });
  }, [capital, duration, firstPayment, rate, runAction]);

  const step = state.step;
  const showLoanForm = step === "loan_collect";

  return (
    <div className="mx-auto max-w-2xl">
      <header style={{ marginBottom: spacing.scale[6] }}>
        <p style={{ ...typography.caption.desktop, color: colors.text.muted }}>
          <Link href={LMNP_ROUTES.dashboard} style={{ color: colors.text.muted }}>
            Tableau de bord
          </Link>
          {" / Financement"}
        </p>
        <h1 style={{ ...typography.sectionTitle.desktop, color: colors.text.primary, marginTop: spacing.scale[2] }}>
          Assistant Financement
        </h1>
        <p style={{ ...typography.body.desktop, color: colors.text.secondary, marginTop: spacing.scale[2] }}>
          Identifiez les charges de financement déductibles pour l&apos;exercice {fiscalYear}.
        </p>
      </header>

      <Card>
        <div style={{ padding: spacing.scale[4] }}>
          {messages.map((message, index) => (
            <MessageBubble key={index} message={message} />
          ))}

          {messages.at(-1)?.suggestions ? (
            <div className="flex flex-wrap gap-2" style={{ marginBottom: spacing.scale[4] }}>
              {messages.at(-1)!.suggestions!.map((s) => (
                <SuggestionButton key={s.id} suggestionId={s.id} label={s.label} onPick={handleSuggestion} />
              ))}
            </div>
          ) : null}

          {showLoanForm ? (
            <div className="flex flex-col gap-3" style={{ marginTop: spacing.scale[4] }}>
              <p style={{ ...typography.body.desktop, color: colors.text.secondary }}>
                Prêt {state.currentLoanIndex + 1} sur {loanCount}
              </p>
              <label style={labelStyle}>
                Montant emprunté (€)
                <input style={inputStyle} value={capital} onChange={(e) => setCapital(e.target.value)} />
              </label>
              <label style={labelStyle}>
                Taux annuel (%)
                <input style={inputStyle} value={rate} onChange={(e) => setRate(e.target.value)} />
              </label>
              <label style={labelStyle}>
                Durée (mois)
                <input style={inputStyle} value={duration} onChange={(e) => setDuration(e.target.value)} />
              </label>
              <label style={labelStyle}>
                Date 1ère mensualité
                <input
                  type="date"
                  style={inputStyle}
                  value={firstPayment}
                  onChange={(e) => setFirstPayment(e.target.value)}
                />
              </label>
              <Button onClick={submitLoan} disabled={busy}>
                Calculer les intérêts déductibles
              </Button>
            </div>
          ) : null}

          {state.result && !state.result.skipped ? <ResultSummary result={state.result} /> : null}

          {step === "complete" ? (
            <div style={{ marginTop: spacing.scale[4] }}>
              <Link href={LMNP_ROUTES.dashboard}>
                <Button variant="secondary">Retour au tableau de bord</Button>
              </Link>
            </div>
          ) : null}
        </div>
      </Card>
    </div>
  );
}
