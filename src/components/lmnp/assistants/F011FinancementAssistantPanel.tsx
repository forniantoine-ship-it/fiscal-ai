"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Button } from "@/design-system/components/Button";
import { Card } from "@/design-system/components/Card";
import { colors } from "@/design-system/theme/colors";
import { motions } from "@/design-system/theme/motions";
import { radius } from "@/design-system/theme/radius";
import { shadows } from "@/design-system/theme/shadows";
import { spacing } from "@/design-system/theme/spacing";
import { typography } from "@/design-system/theme/typography";
import type { F011PrefillFieldKey } from "@/lib/lmnp/services/f011/credit-bridge";
import { runF011UploadFlow } from "@/lib/lmnp/services/f011/f011-document-analysis";
import { shouldFlushF011PersistedStep } from "@/lib/lmnp/services/f011/f011-critical-persist";
import { resolveF011ResumeDecision } from "@/lib/lmnp/services/f011/f011-resume";
import {
  isLoanFormComplete,
  resolveLoanFormAction,
  type LoanIdentity,
} from "@/lib/lmnp/services/f011/f011-loan-form-state";
import { buildFinancementCharges } from "@/lib/lmnp/services/f011/f011-build-financement-charges";
import { documentaryInstallmentsForCreditFinancing } from "@/lib/lmnp/services/f011/f011-documentary-installments";
import { shouldInvalidateCreditConfirmation } from "@/lib/lmnp/services/f011/f011-credit-confirmation-invalidation";
import { LMNP_ROUTES } from "@/lib/lmnp/routes";
import { supabase } from "@/lib/supabase";
import { uploadFilesForUser } from "@/lib/uploadDocument";
import { useLmnp } from "@/lib/lmnp/store";
import {
  F011FinancementAssistant,
  toF011PersistedState,
  type F011Action,
  type F011AssistantTurn,
  type F011Message,
  type F011Result,
  type F011State,
} from "@/runtime";
import { noCreditSupersessionPatch } from "@/lib/lmnp/services/declaration/credit-state";

const inputStyle = {
  ...typography.body.desktop,
  minHeight: 44,
  padding: `${spacing.scale[3]} ${spacing.scale[4]}`,
  borderRadius: radius.lg,
  border: `1px solid ${colors.border.default}`,
  backgroundColor: colors.surface.inset,
  width: "100%",
  color: colors.text.primary,
  outline: "none",
} as const;

const labelStyle = {
  ...typography.caption.desktop,
  color: colors.text.tertiary,
  display: "flex",
  flexDirection: "column" as const,
  gap: spacing.scale[2],
};

const PRIMARY_SUGGESTION_IDS = new Set(["confirm_loan", "confirm_all", "confirm_extraction"]);

const LOAN_PROGRESS_STEPS = new Set<F011State["step"]>([
  "loan_source_choice",
  "loan_upload",
  "loan_analyzing",
  "loan_review_extraction",
  "loan_type",
  "loan_collect",
  "loan_insurance",
  "loan_guarantee",
  "loan_fees",
  "loan_ira",
  "loan_review",
]);

function fmtEur(value: number): string {
  return `${Math.round(value).toLocaleString("fr-FR")} €`;
}

function fmtPct(rate: number): string {
  return `${(rate * 100).toFixed(2).replace(".", ",")} %`;
}

function amountLabelFor(kind: "insurance" | "guarantee" | "fees" | "ira"): string {
  switch (kind) {
    case "insurance":
      // F011-3 — ce libellé sert désormais aussi bien à l'assurance externe
      // qu'à une assurance bancaire de montant inconnu : générique à dessein.
      return "Montant annuel de l'assurance emprunteur (€)";
    case "guarantee":
      return "Montant de la commission de caution (€)";
    case "fees":
      return "Montant des frais de dossier (€)";
    case "ira":
      return "Montant de l'IRA (€)";
  }
}

function assistantMessagesFromTurn(messages: F011Message[]): F011Message[] {
  return messages.filter((message) => message.role === "assistant");
}

function progressCaption(state: F011State): string | null {
  if (!state.nombrePrets) return null;
  if (state.step === "aggregate_review") {
    return state.nombrePrets > 1 ? `${state.nombrePrets} prêts` : "1 prêt";
  }
  if (!LOAN_PROGRESS_STEPS.has(state.step)) return null;
  return `Prêt ${state.currentLoanIndex + 1} sur ${state.nombrePrets}`;
}

function stripLoanPrefix(content: string): string {
  return content.replace(/^Prêt \d+ sur \d+\.\s*/, "");
}

function splitQuestion(content: string): { title: string; body: string | null } {
  const trimmed = stripLoanPrefix(content.trim());
  const paraBreak = trimmed.indexOf("\n\n");
  if (paraBreak > 0 && paraBreak < 180) {
    return { title: trimmed.slice(0, paraBreak), body: trimmed.slice(paraBreak + 2).trim() || null };
  }
  const q = trimmed.indexOf("?");
  if (q > 0 && q < 180 && q < trimmed.length - 1) {
    return { title: trimmed.slice(0, q + 1), body: trimmed.slice(q + 1).trim() || null };
  }
  const firstLine = trimmed.split("\n")[0] ?? trimmed;
  if (firstLine !== trimmed) {
    return { title: firstLine, body: trimmed.slice(firstLine.length).trim() || null };
  }
  return { title: trimmed, body: null };
}

function parseColonRows(content: string): { label: string; value: string }[] {
  return content
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const separator = line.includes(" : ") ? " : " : line.includes(" :") ? " :" : null;
      if (!separator) return { label: line, value: "" };
      const index = line.indexOf(separator);
      return { label: line.slice(0, index), value: line.slice(index + separator.length).trim() };
    });
}

function ChoiceCard({
  label,
  onClick,
  disabled,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const active = (hovered || focused) && !disabled;

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      style={{
        display: "block",
        width: "100%",
        minHeight: 52,
        textAlign: "left",
        padding: `${spacing.scale[4]} ${spacing.scale[5]}`,
        borderRadius: radius.lg,
        border: `1px solid ${active ? colors.border.focus : colors.border.default}`,
        backgroundColor: active ? colors.surface.selected : colors.surface.primary,
        color: colors.text.primary,
        ...typography.body.desktop,
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.6 : 1,
        boxShadow: active ? shadows.card.hover : shadows.card.default,
        transition: motions.hover.card,
      }}
    >
      {label}
    </button>
  );
}

function RecapRow({
  label,
  value,
  emphasize = false,
}: {
  label: string;
  value: string;
  emphasize?: boolean;
}) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "baseline",
        gap: spacing.scale[4],
        padding: `${spacing.scale[3]} 0`,
        borderBottom: `1px solid ${colors.border.subtle}`,
      }}
    >
      <span style={{ ...typography.body.desktop, color: colors.text.secondary }}>{label}</span>
      <span
        style={{
          ...(emphasize ? typography.cardTitle.mobile : typography.body.desktop),
          color: colors.text.primary,
          fontVariantNumeric: "tabular-nums",
          textAlign: "right",
        }}
      >
        {value}
      </span>
    </div>
  );
}

function ResultSummary({ result }: { result: F011Result }) {
  if (result.skipped) return null;
  const { charges } = result;
  return (
    <Card variant="muted">
      <p
        style={{
          ...typography.caption.desktop,
          color: colors.text.tertiary,
          letterSpacing: typography.letterSpacing.caps,
          textTransform: "uppercase",
          marginBottom: spacing.scale[2],
        }}
      >
        Récapitulatif
      </p>
      <RecapRow label="Total déductible" value={fmtEur(charges.totalChargesFinancementExercice)} emphasize />
      <RecapRow label="Intérêts" value={fmtEur(charges.totalInteretsEmprunt)} />
      <RecapRow label="Assurance" value={fmtEur(charges.totalAssurance)} />
      {/*
       * F011-3 (audit KS AX-011/JUG-011) — les intérêts + l'assurance
       * pré-exploitation SONT déductibles (déduction immédiate, JUG-011
       * choix A), déjà comptés dans le résultat fiscal via
       * `chargesPreExploitation` (F-006) — seulement hors du total F-011
       * ci-dessus, qui ne couvre que la période d'exploitation. Jamais
       * "non déductible" : cette étiquette contredisait le traitement réel
       * et pouvait pousser l'utilisateur à les intégrer par erreur aux
       * frais d'acquisition (double comptage).
       */}
      {charges.totalInteretsPreExploitation + (charges.totalAssurancePreExploitation ?? 0) > 0 ? (
        <RecapRow
          label="Pré-exploitation (déductible séparément)"
          value={fmtEur(charges.totalInteretsPreExploitation + (charges.totalAssurancePreExploitation ?? 0))}
        />
      ) : null}
    </Card>
  );
}

function LoanTermsRecap({ loan }: { loan: F011State["pendingLoan"] }) {
  if (!loan) return null;
  const rows: { label: string; value: string }[] = [];
  if (loan.capitalInitial !== undefined) rows.push({ label: "Montant", value: fmtEur(loan.capitalInitial) });
  if (loan.tauxNominal !== undefined) rows.push({ label: "Taux", value: fmtPct(loan.tauxNominal) });
  if (loan.dureeMois !== undefined) rows.push({ label: "Durée", value: `${loan.dureeMois} mois` });
  if (loan.datePremiereMensualite) {
    rows.push({ label: "1re mensualité", value: loan.datePremiereMensualite });
  }
  if (rows.length === 0) return null;
  return (
    <Card variant="muted">
      {rows.map((row) => (
        <RecapRow key={row.label} label={row.label} value={row.value} />
      ))}
    </Card>
  );
}

function MessageRecap({ content }: { content: string }) {
  const rows = parseColonRows(content);
  if (rows.length === 0) return null;
  return (
    <Card variant="muted">
      {rows.map((row, index) =>
        row.value ? (
          <RecapRow key={`${row.label}-${index}`} label={row.label} value={row.value} />
        ) : (
          <p
            key={`${row.label}-${index}`}
            style={{ ...typography.body.desktop, color: colors.text.secondary, padding: `${spacing.scale[2]} 0` }}
          >
            {row.label}
          </p>
        ),
      )}
    </Card>
  );
}

function GoBackControl({
  visible,
  disabled,
  onBack,
}: {
  visible: boolean;
  disabled: boolean;
  onBack: () => void;
}) {
  if (!visible) return null;
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onBack}
      aria-label="Retour à l'étape précédente"
      style={{
        display: "block",
        marginTop: spacing.scale[8],
        minHeight: 44,
        padding: `${spacing.scale[2]} 0`,
        background: "none",
        border: "none",
        color: colors.text.tertiary,
        ...typography.body.desktop,
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.5 : 1,
      }}
    >
      ← Retour
    </button>
  );
}

export function F011FinancementAssistantPanel() {
  const { workspace, dispatch, flushWorkspace, getFile } = useLmnp();
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

  // Cycle 2 — reprise. Ordre imposé : shouldResumeF011 AVANT le repli "déjà
  // complet" — encodé dans resolveF011ResumeDecision, pas ici, pour que
  // l'ordre ne dépende pas d'une relecture attentive de ce composant. Calculé
  // une seule fois au montage : ne doit pas se redéclencher parce que
  // l'identité de `workspace`/`draft` change à chaque tick d'autosave.
  const initialResume = useMemo(() => {
    const persisted = draft?.financementAssistantState;
    const decision = resolveF011ResumeDecision({
      persisted,
      isLegacyComplete: Boolean(draft?.financementCharges),
      isLegacySkipped: Boolean(draft?.creditDeclaredNoneAt),
    });

    if (decision.kind === "legacy_skipped") {
      const state: F011State = {
        step: "skipped",
        currentLoanIndex: 0,
        loans: [],
        fieldSources: {},
        loanFormGeneration: 0,
        result: {
          skipped: true,
          explanation: "",
          anomalies: [],
          charges: {
            exerciceFiscal: fiscalYear,
            prets: [],
            totalInteretsEmprunt: 0,
            totalInteretsPreExploitation: 0,
            totalAssurance: 0,
            totalCapitalRembourse: 0,
            totalChargesFinancementExercice: 0,
          },
        },
      };
      return {
        decision,
        turn: {
          state,
          messages: [
            { role: "assistant" as const, content: "Votre financement est déjà enregistré pour cet exercice." },
          ],
          completed: false,
        },
      };
    }

    if (decision.kind === "legacy_complete") {
      const financementCharges = draft!.financementCharges!;
      const state: F011State = {
        step: "complete",
        currentLoanIndex: 0,
        loans: [],
        fieldSources: {},
        loanFormGeneration: 0,
        result: {
          skipped: false,
          explanation: "",
          anomalies: [],
          charges: {
            exerciceFiscal: financementCharges.exerciceFiscal,
            prets: financementCharges.prets,
            totalInteretsEmprunt: financementCharges.totalInteretsEmprunt,
            totalInteretsPreExploitation: financementCharges.totalInteretsPreExploitation,
            totalAssurance: financementCharges.totalAssurance,
            totalCapitalRembourse: financementCharges.totalCapitalRembourse,
            totalChargesFinancementExercice: financementCharges.totalChargesFinancementExercice,
          },
        },
      };
      return {
        decision,
        turn: {
          state,
          messages: [
            { role: "assistant" as const, content: "Votre financement est déjà enregistré pour cet exercice." },
          ],
          completed: false,
        },
      };
    }

    if (decision.kind === "start") {
      return { decision, turn: assistant.start() };
    }

    if (decision.kind === "resume_complete") {
      // F011-2 — reprend le VRAI `F011PersistedState` complet (prêts, history)
      // au lieu du repli synthétique `legacy_complete`, même message d'accueil
      // qu'avant, pour que « Modifier mes réponses » ouvre un parcours
      // réellement éditable (miroir F010 `resume_complete`).
      return {
        decision,
        turn: {
          state: assistant.resume(persisted!).state,
          messages: [
            { role: "assistant" as const, content: "Votre financement est déjà enregistré pour cet exercice." },
          ],
          completed: false,
        },
      };
    }

    return { decision, turn: assistant.resume(persisted!) };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [state, setState] = useState<F011State>(() => initialResume.turn.state);
  const [currentTurnAssistants, setCurrentTurnAssistants] = useState<F011Message[]>(() =>
    assistantMessagesFromTurn(initialResume.turn.messages),
  );
  // Cycle 5 — lu par le chemin d'analyse asynchrone (upload → OCR/GPT), qui
  // s'étend sur plusieurs rendus : `state` seul serait périmé au moment où le
  // pipeline répond. Toujours synchronisé (effet ci-dessous), jamais utilisé
  // pour déclencher un rendu lui-même.
  const stateRef = useRef(state);
  useEffect(() => {
    stateRef.current = state;
  }, [state]);
  // Dossier courant lu au moment de la persistance finale (purge « aucun crédit ») sans entrer dans les
  // dépendances de `persistCompletion` : son identité alimente `applyTurn`, donc l'effet d'analyse documentaire.
  const draftRef = useRef(draft);
  useEffect(() => {
    draftRef.current = draft;
  }, [draft]);
  const [announcement, setAnnouncement] = useState("");

  const [capital, setCapital] = useState(() =>
    initialResume.turn.state.step === "loan_collect" && initialResume.turn.state.pendingLoan?.capitalInitial !== undefined
      ? String(initialResume.turn.state.pendingLoan.capitalInitial)
      : "",
  );
  const [rate, setRate] = useState(() =>
    initialResume.turn.state.step === "loan_collect" && initialResume.turn.state.pendingLoan?.tauxNominal !== undefined
      ? String(initialResume.turn.state.pendingLoan.tauxNominal * 100)
      : "",
  );
  const [duration, setDuration] = useState(() =>
    initialResume.turn.state.step === "loan_collect" && initialResume.turn.state.pendingLoan?.dureeMois !== undefined
      ? String(initialResume.turn.state.pendingLoan.dureeMois)
      : "",
  );
  const [firstPayment, setFirstPayment] = useState(() =>
    initialResume.turn.state.step === "loan_collect" && initialResume.turn.state.pendingLoan?.datePremiereMensualite
      ? initialResume.turn.state.pendingLoan.datePremiereMensualite
      : "",
  );
  const [busy, setBusy] = useState(false);

  /**
   * Correctif Cycle 10 — identité du prêt pour lequel le formulaire local a
   * été mis à jour en dernier. Seul moyen de distinguer, à l'entrée sur
   * `loan_collect`, un nouveau prêt réellement vide (le formulaire doit
   * revenir à ses valeurs de départ) d'un retour GO_BACK sur ce même prêt
   * pas encore soumis (le formulaire doit garder ce que l'utilisateur a
   * déjà tapé) — `pendingLoan` seul ne permet pas cette distinction, les
   * deux cas ayant `capitalInitial === undefined`. `generation` s'ajoute à
   * `currentLoanIndex` pour couvrir le cas où `set_nombre_prets` remet
   * l'index à 0 après une tentative de prêt 1 déjà abandonnée (voir
   * `LoanIdentity`). Logique de décision pure dans `resolveLoanFormAction`
   * (testable hors React).
   */
  const lastSeededLoanIdentityRef = useRef<LoanIdentity>({
    loanIndex: initialResume.turn.state.currentLoanIndex,
    generation: initialResume.turn.state.loanFormGeneration,
  });

  const applyLoanFormAction = useCallback((pending: F011State["pendingLoan"], current: LoanIdentity) => {
    const decision = resolveLoanFormAction(pending, current, lastSeededLoanIdentityRef.current);
    if (decision.kind === "keep") return;
    setCapital(decision.values.capital);
    setRate(decision.values.rate);
    setDuration(decision.values.duration);
    setFirstPayment(decision.values.firstPayment);
    lastSeededLoanIdentityRef.current = current;
  }, []);

  const [awaitingAmountFor, setAwaitingAmountFor] = useState<
    null | "insurance" | "guarantee" | "fees" | "ira"
  >(null);
  const [amountInput, setAmountInput] = useState("");
  /**
   * F011-3 — quel type d'assurance la saisie de montant en cours
   * (`awaitingAmountFor === "insurance"`) doit produire : "externe" reste
   * inchangé (toujours une saisie dédiée) ; "bancaire" n'ouvre cette même
   * saisie que lorsqu'aucun montant n'est déjà connu (voir `handleSuggestion`),
   * pour ne jamais transformer silencieusement une assurance bancaire de
   * montant inconnu en 0 €.
   */
  const [insuranceAmountType, setInsuranceAmountType] = useState<"bancaire" | "externe">("externe");

  /**
   * Persiste l'état conversationnel F011 (Cycle 2) — jamais le résultat
   * calculé, seulement ce qu'il faut pour reprendre exactement où l'utilisateur
   * en était. Flush immédiat sur les étapes critiques (miroir F010).
   */
  const persistSession = useCallback(
    (nextState: F011State) => {
      const financementAssistantState = toF011PersistedState(nextState, new Date().toISOString());
      dispatch({ type: "DECLARATION_PATCH_DRAFT", patch: { financementAssistantState } });
      if (shouldFlushF011PersistedStep(nextState.step)) {
        void flushWorkspace({
          declarationDraft: {
            ...(draft ?? { completedSteps: [] }),
            financementAssistantState,
          },
        });
      }
    },
    [dispatch, draft, flushWorkspace],
  );

  const persistCompletion = useCallback(
    (finalState: F011State) => {
      const result = finalState.result;
      if (!result) return;
      const now = new Date().toISOString();
      const financementAssistantState = toF011PersistedState(finalState, now);

      if (result.skipped) {
        dispatch({ type: "DECLARE_NO_CREDIT" });
        dispatch({ type: "DECLARATION_COMPLETE_STEP", stepId: "financement-assistant" });
        // Latence « prêt saisi puis aucun crédit » — `flushWorkspace` fusionne ce patch sur l'état PRÉCÉDENT
        // (`stateRef`, pas encore mis à jour par le reducer) : la purge doit donc figurer explicitement ici
        // (clés à `undefined`), sinon la version persistée garderait l'ancien prêt. Même règle que le reducer.
        void flushWorkspace({
          declarationDraft: {
            ...noCreditSupersessionPatch(draftRef.current),
            financementAssistantState,
            creditDeclaredNoneAt: now,
          },
        });
        return;
      }

      const financementCharges = buildFinancementCharges(result.charges, finalState.fieldSources, now);
      const financing = {
        loans: finalState.loans.map((loan, index) => ({
          id: loan.pretId,
          bank: `Prêt ${index + 1}`,
          loanType: loan.typePret,
          borrowedAmount: loan.capitalInitial,
          rate: loan.tauxNominal * 100,
          durationMonths: loan.dureeMois,
          monthlyPayment: 0,
          insurance: loan.assuranceAnnuelle ?? 0,
          ...(loan.assuranceType ? { assuranceType: loan.assuranceType } : {}),
          ...(loan.capitalInitialOffre !== undefined ? { capitalInitialOffre: loan.capitalInitialOffre } : {}),
          fees: 0,
          // F011 fees/guarantee V1 fix — transport pur des mêmes valeurs déjà
          // résolues et utilisées pour `financementCharges` ci-dessus
          // (assistant.ts:computeForLoans), vers le `creditFinancing` canonique.
          // Sans ceci, une reconfirmation ultérieure côté Tunnel A
          // (`CreditDocumentStep.tsx`, qui recalcule toujours
          // `financementCharges` depuis `creditFinancing`) écrasait
          // silencieusement une déduction correcte par 0 — le fait doit
          // vivre dans un seul champ canonique, jamais recalculé
          // différemment par canal.
          loanApplicationFees: loan.fraisDossier,
          loanGuaranteeFees: loan.typeGarantie === "caution" ? loan.commissionCaution : undefined,
          souscritCetExercice: loan.souscritCetExercice,
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
        // R1 — l'échéancier importé est transporté vers le `creditFinancing` canonique (jamais `[]` en dur) :
        // une reconfirmation Tunnel A applique alors le même contrat documentaire au lieu de reconstruire.
        installments: documentaryInstallmentsForCreditFinancing(finalState.loans),
      };

      dispatch({ type: "DECLARATION_PATCH_DRAFT", patch: { financementCharges } });
      dispatch({ type: "CONFIRM_CREDIT_FINANCING", financing });
      dispatch({ type: "DECLARATION_COMPLETE_STEP", stepId: "financement-assistant" });
      void flushWorkspace({
        declarationDraft: {
          financementAssistantState,
          financementCharges,
          creditConfirmedAt: now,
          creditFinancing: financing,
        },
      });
    },
    [dispatch, flushWorkspace],
  );

  /**
   * Applique un tour à l'état du composant — chemin unique partagé entre les
   * actions synchrones (`runAction`) et le chemin d'analyse asynchrone
   * (upload → OCR/GPT), pour ne jamais dupliquer setState/persistance/annonce
   * entre les deux (Cycle 5, miroir F009 `applyTurn`).
   */
  const applyTurn = useCallback(
    (turn: F011AssistantTurn) => {
      const previousStep = stateRef.current.step;
      setState(turn.state);
      setAwaitingAmountFor(null);
      const nextAssistants = assistantMessagesFromTurn(turn.messages);
      if (nextAssistants.length > 0) {
        setCurrentTurnAssistants(nextAssistants);
      }
      const lastAssistantMessage = [...turn.messages].reverse().find((m) => m.role === "assistant");
      if (lastAssistantMessage) setAnnouncement(lastAssistantMessage.content);
      if (turn.state.step === "loan_collect") {
        applyLoanFormAction(turn.state.pendingLoan, {
          loanIndex: turn.state.currentLoanIndex,
          generation: turn.state.loanFormGeneration,
        });
      }
      persistSession(turn.state);
      // F011-2 (audit contradictoire) — miroir de la contrainte #10 F010 :
      // rouvrir `complete` pour modification invalide le signal de complétude
      // partagé (`creditConfirmedAt`, lu par `validation-profile.ts` et
      // `document-journey-progress.ts`) jusqu'à une nouvelle confirmation
      // explicite. Ne touche jamais aux prêts (`financementCharges`/
      // `creditFinancing` restent tels quels, seule la porte se referme).
      if (shouldInvalidateCreditConfirmation({ previousStep, nextStep: turn.state.step })) {
        dispatch({ type: "DECLARATION_PATCH_DRAFT", patch: { creditConfirmedAt: undefined } });
      }
      if (turn.completed) persistCompletion(turn.state);
    },
    [applyLoanFormAction, dispatch, persistCompletion, persistSession],
  );

  const runAction = useCallback(
    async (action: F011Action) => {
      setBusy(true);
      try {
        applyTurn(await assistant.handle(stateRef.current, action));
      } finally {
        setBusy(false);
      }
    },
    [assistant, applyTurn],
  );

  const analyzingRef = useRef(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  /**
   * Analyse réelle d'un document Crédit — chemin unique pour un upload frais,
   * "Réessayer", et la reprise d'une analyse interrompue par un refresh
   * (déclenchée par l'effet ci-dessous dans les trois cas). Ne réimplémente
   * ni OCR ni GPT : délègue à `runF011UploadFlow` (pont Cycle 4 inclus).
   */
  const analyzeDocument = useCallback(
    async (documentId: string, file: File) => {
      const isStillCurrent = () =>
        stateRef.current.step === "loan_analyzing" && stateRef.current.analyzingDocumentId === documentId;

      try {
        const result = await runF011UploadFlow({
          file,
          documentId,
          fiscalYearId: workspace.fiscalYear.id,
          fiscalYear,
        });
        // L'utilisateur a pu revenir en arrière (GO_BACK) pendant l'analyse —
        // ne jamais appliquer un résultat devenu obsolète à un état différent.
        if (!isStillCurrent()) return;
        if (result.outcome.state === "failed") {
          applyTurn(await assistant.handle(stateRef.current, { type: "analysis_failed" }));
          return;
        }
        applyTurn(
          await assistant.handle(stateRef.current, {
            type: "analysis_success",
            documentId,
            prefill: result.prefill,
          }),
        );
      } catch {
        if (!isStillCurrent()) return;
        applyTurn(await assistant.handle(stateRef.current, { type: "analysis_failed" }));
      }
    },
    [assistant, applyTurn, workspace.fiscalYear.id, fiscalYear],
  );

  // Seul déclencheur de l'analyse réelle — couvre l'upload initial, "Réessayer"
  // et la reprise après refresh (`getFile` retrouve le fichier via IndexedDB
  // même si la promesse d'origine a été perdue à la fermeture de l'onglet).
  useEffect(() => {
    if (state.step !== "loan_analyzing" || !state.analyzingDocumentId) return;
    if (analyzingRef.current) return;
    const file = getFile(state.analyzingDocumentId);
    if (!file) return; // getFile déclenche son propre chargement asynchrone ; l'effet se redéclenche à sa résolution.
    const documentId = state.analyzingDocumentId;
    analyzingRef.current = true;
    void analyzeDocument(documentId, file).finally(() => {
      analyzingRef.current = false;
    });
  }, [state.step, state.analyzingDocumentId, getFile, analyzeDocument]);

  const handleFiles = useCallback(
    async (files: File[]) => {
      const file = files[0];
      if (!file) return;
      setBusy(true);
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) return;

        const { files: uploadedFiles, documentIds, filePaths } = await uploadFilesForUser([file], user.id, {
          fiscalYear: workspace.fiscalYear.year,
          documentRole: "annual_evidence",
          propertyId: workspace.fiscalYear.propertyIds[0],
        });
        const uploadedFile = uploadedFiles[0];
        if (!uploadedFile) return;

        // The real Supabase documents.id — already available here, used as-is
        // rather than a locally generated one, so a server-side deletion can
        // later find the exact row it needs to purge.
        const documentId = documentIds[0];
        const storagePath = filePaths[0];
        dispatch({
          type: "UPLOAD_DOCUMENTS",
          files: [{
            file: uploadedFile,
            category: "emprunt",
            documentId,
            isSupabaseDocumentId: true,
            storagePath,
            fiscalYear: workspace.fiscalYear.year,
            documentRole: "annual_evidence",
          }],
        });
        dispatch({ type: "REGISTER_FILE", documentId, file: uploadedFile });

        applyTurn(await assistant.handle(stateRef.current, { type: "upload_document", documentId }));
        // L'analyse elle-même part de l'effet ci-dessus, pas d'ici — même
        // chemin que la reprise après refresh.
      } finally {
        setBusy(false);
      }
    },
    [assistant, applyTurn, dispatch, workspace.fiscalYear.year, workspace.fiscalYear.propertyIds],
  );

  const openFilePicker = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleSuggestion = useCallback(
    (suggestionId: string) => {
      if (suggestionId === "yes") void runAction({ type: "set_presence_emprunt", presence: true });
      if (suggestionId === "no") void runAction({ type: "set_presence_emprunt", presence: false });
      if (suggestionId === "1") void runAction({ type: "set_nombre_prets", count: 1 });
      if (suggestionId === "2") void runAction({ type: "set_nombre_prets", count: 2 });

      if (suggestionId === "source_document") void runAction({ type: "choose_loan_source", source: "document" });
      if (suggestionId === "source_manual") void runAction({ type: "choose_loan_source", source: "manual" });
      if (suggestionId === "retry_analysis") void runAction({ type: "retry_analysis" });
      if (suggestionId === "confirm_extraction") void runAction({ type: "confirm_extraction" });
      if (suggestionId.startsWith("keep_existing:")) {
        const field = suggestionId.slice("keep_existing:".length) as F011PrefillFieldKey;
        void runAction({ type: "resolve_conflict", field, choice: "keep_existing" });
      }
      if (suggestionId.startsWith("use_document:")) {
        const field = suggestionId.slice("use_document:".length) as F011PrefillFieldKey;
        void runAction({ type: "resolve_conflict", field, choice: "use_document" });
      }

      if (suggestionId === "amortissable") void runAction({ type: "set_loan_type", typePret: "amortissable" });
      if (suggestionId === "in_fine") void runAction({ type: "set_loan_type", typePret: "in_fine" });

      if (suggestionId === "assurance_bancaire") {
        // F011-3 — un montant déjà connu (extrait ou déjà saisi) est réutilisé
        // tel quel, jamais redemandé. Sans montant connu, on ouvre la même
        // saisie que pour "externe" plutôt que de laisser F011 retenir 0 €
        // sans jamais permettre à l'utilisateur de préciser le montant.
        if (state.pendingLoan?.assuranceAnnuelle !== undefined) {
          void runAction({ type: "set_insurance", assuranceType: "bancaire" });
        } else {
          setInsuranceAmountType("bancaire");
          setAmountInput("");
          setAwaitingAmountFor("insurance");
        }
      }
      if (suggestionId === "assurance_externe") {
        setInsuranceAmountType("externe");
        setAmountInput(state.pendingLoan?.assuranceAnnuelle !== undefined ? String(state.pendingLoan.assuranceAnnuelle) : "");
        setAwaitingAmountFor("insurance");
      }

      if (suggestionId === "garantie_caution") {
        // Correctif Cycle 9 — préremplit avec un montant déjà connu (une
        // correction en cours prime sur un simple montant vu dans le
        // document, jamais l'inverse) ; l'utilisateur reste libre de le
        // changer avant de valider.
        const prefill =
          state.pendingLoan?.commissionCaution !== undefined
            ? state.pendingLoan.commissionCaution
            : state.detectedGuaranteeFees;
        setAmountInput(prefill !== undefined ? String(prefill) : "");
        setAwaitingAmountFor("guarantee");
      }
      if (suggestionId === "garantie_hypotheque_ippd") {
        void runAction({ type: "set_guarantee", typeGarantie: "hypotheque_ippd" });
      }
      if (suggestionId === "garantie_aucune") void runAction({ type: "set_guarantee", typeGarantie: "aucune" });
      if (suggestionId === "garantie_autre") void runAction({ type: "set_guarantee", typeGarantie: "autre" });

      if (suggestionId === "fees_oui") {
        setAmountInput(state.pendingLoan?.fraisDossier !== undefined ? String(state.pendingLoan.fraisDossier) : "");
        setAwaitingAmountFor("fees");
      }
      if (suggestionId === "fees_non") void runAction({ type: "set_fees", souscritCetExercice: false });

      if (suggestionId === "ira_oui") {
        setAmountInput(state.pendingLoan?.iraMontant !== undefined ? String(state.pendingLoan.iraMontant) : "");
        setAwaitingAmountFor("ira");
      }
      if (suggestionId === "ira_non") void runAction({ type: "set_ira", remboursementAnticipe: false });

      if (suggestionId === "confirm_loan") void runAction({ type: "confirm_loan" });
      if (suggestionId === "confirm_all") void runAction({ type: "confirm_all" });

      if (suggestionId.startsWith("edit_loan:")) {
        const pretId = suggestionId.slice("edit_loan:".length);
        void runAction({ type: "edit_loan", pretId });
      }
    },
    [runAction, state.pendingLoan, state.detectedGuaranteeFees],
  );

  const canSubmitLoan = isLoanFormComplete({ capital, rate, duration, firstPayment });

  const submitLoan = useCallback(() => {
    if (!isLoanFormComplete({ capital, rate, duration, firstPayment })) return;
    const capitalValue = Number(capital);
    const rateValue = Number(rate) / 100;
    const durationValue = Number(duration);
    void runAction({
      type: "submit_loan_terms",
      capitalInitial: capitalValue,
      tauxNominal: rateValue,
      dureeMois: durationValue,
      datePremiereMensualite: firstPayment,
      source: "manual",
    });
  }, [capital, duration, firstPayment, rate, runAction]);

  const submitAmount = useCallback(() => {
    const trimmed = amountInput.trim();
    const value = trimmed === "" ? undefined : Number(trimmed);
    const parsed = value !== undefined && Number.isFinite(value) ? value : undefined;

    if (awaitingAmountFor === "insurance") {
      void runAction({ type: "set_insurance", assuranceType: insuranceAmountType, assuranceAnnuelle: parsed });
    } else if (awaitingAmountFor === "guarantee") {
      void runAction({ type: "set_guarantee", typeGarantie: "caution", commissionCaution: parsed });
    } else if (awaitingAmountFor === "fees") {
      void runAction({ type: "set_fees", souscritCetExercice: true, fraisDossier: parsed });
    } else if (awaitingAmountFor === "ira") {
      void runAction({ type: "set_ira", remboursementAnticipe: true, montant: parsed });
    }
    setAwaitingAmountFor(null);
    setAmountInput("");
  }, [amountInput, awaitingAmountFor, insuranceAmountType, runAction]);

  const step = state.step;
  const showLoanForm = step === "loan_collect";
  const canGoBack = Boolean(state.history && state.history.length > 0) && step !== "complete" && step !== "skipped";
  const lastAssistant = currentTurnAssistants.at(-1);
  const supportingAssistants = currentTurnAssistants.slice(0, -1);
  const suggestions = awaitingAmountFor || showLoanForm ? undefined : lastAssistant?.suggestions;
  const primarySuggestions = suggestions?.filter((suggestion) => PRIMARY_SUGGESTION_IDS.has(suggestion.id)) ?? [];
  const choiceSuggestions = suggestions?.filter((suggestion) => !PRIMARY_SUGGESTION_IDS.has(suggestion.id)) ?? [];
  const caption = progressCaption(state);
  const parsedQuestion = lastAssistant ? splitQuestion(lastAssistant.content) : null;
  const questionSource = awaitingAmountFor
    ? amountLabelFor(awaitingAmountFor)
    : step === "loan_review"
      ? "Votre prêt"
      : step === "loan_collect"
        ? "Les conditions de votre prêt"
        : step === "loan_review_extraction"
          ? parsedQuestion?.title ?? "Votre document"
          : parsedQuestion?.title ?? "Financement";
  const questionBody =
    awaitingAmountFor || step === "loan_review" || step === "loan_collect" || step === "loan_review_extraction"
      ? null
      : parsedQuestion?.body ?? null;
  const supportingText =
    step === "aggregate_review" || step === "loan_review"
      ? ""
      : supportingAssistants
          .map((message) => message.content)
          .filter(Boolean)
          .join("\n\n");
  const aggregateExplanation =
    step === "aggregate_review"
      ? supportingAssistants.map((message) => message.content).filter(Boolean).join("\n\n") ||
        state.result?.explanation ||
        ""
      : "";
  const showResult =
    Boolean(state.result && !state.result.skipped) && (step === "aggregate_review" || step === "complete");

  const goBack = () => {
    void runAction({ type: "go_back" });
  };

  return (
    <div className="mx-auto w-full max-w-lg px-5 pb-12 pt-8 sm:px-6">
      <header style={{ marginBottom: spacing.scale[8] }}>
        <p
          style={{
            ...typography.caption.desktop,
            color: colors.text.muted,
            letterSpacing: typography.letterSpacing.caps,
            textTransform: "uppercase",
          }}
        >
          <Link href={LMNP_ROUTES.dashboard} style={{ color: colors.text.muted }}>
            Tableau de bord
          </Link>
          {" · Financement"}
        </p>
        {caption ? (
          <p
            style={{
              ...typography.caption.desktop,
              color: colors.text.tertiary,
              marginTop: spacing.scale[3],
            }}
          >
            {caption}
          </p>
        ) : null}
      </header>

      {/* Cycle 5 §13 — une seule zone aria-live, annonce le dernier message de
          l'assistant (statut d'analyse compris) sans dupliquer le contenu visuel. */}
      <div aria-live="polite" className="sr-only">
        {announcement}
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf,image/*"
        className="hidden"
        aria-label="Importer le tableau d'amortissement ou l'offre de prêt"
        onChange={(event) => {
          const files = event.target.files;
          if (files?.length) void handleFiles(Array.from(files));
          event.target.value = "";
        }}
      />

      <div
        key={`${step}-${state.currentLoanIndex}-${awaitingAmountFor ?? "none"}`}
        className="animate-[fiscal-fade-in_450ms_cubic-bezier(0.16,1,0.3,1)_both]"
      >
        {supportingText && step !== "loan_review" ? (
          <p
            style={{
              ...typography.body.desktop,
              color: colors.text.secondary,
              marginBottom: spacing.scale[5],
              whiteSpace: "pre-wrap",
            }}
          >
            {supportingText}
          </p>
        ) : null}

        <h1
          style={{
            ...typography.sectionTitle.mobile,
            color: colors.text.primary,
            marginBottom: questionBody ? spacing.scale[4] : spacing.scale[8],
          }}
        >
          {questionSource}
        </h1>

        {questionBody ? (
          <p
            style={{
              ...typography.body.desktop,
              color: colors.text.secondary,
              marginBottom: spacing.scale[8],
              whiteSpace: "pre-wrap",
            }}
          >
            {questionBody}
          </p>
        ) : null}

        {step === "loan_review" ? (
          <div className="flex flex-col gap-4" style={{ marginBottom: spacing.scale[8] }}>
            <LoanTermsRecap loan={state.pendingLoan} />
            {lastAssistant ? <MessageRecap content={lastAssistant.content} /> : null}
          </div>
        ) : null}

        {step === "loan_review_extraction" && lastAssistant ? (
          <div style={{ marginBottom: spacing.scale[8] }}>
            {parsedQuestion?.body ? (
              <Card variant="muted">
                <p
                  style={{
                    ...typography.body.desktop,
                    color: colors.text.secondary,
                    whiteSpace: "pre-wrap",
                  }}
                >
                  {parsedQuestion.body}
                </p>
              </Card>
            ) : null}
          </div>
        ) : null}

        {showResult && state.result ? (
          <div style={{ marginBottom: spacing.scale[8] }}>
            <ResultSummary result={state.result} />
            {aggregateExplanation ? (
              <p
                style={{
                  ...typography.body.desktop,
                  color: colors.text.secondary,
                  marginTop: spacing.scale[5],
                  whiteSpace: "pre-wrap",
                }}
              >
                {aggregateExplanation}
              </p>
            ) : null}
          </div>
        ) : null}

        {primarySuggestions.length > 0 ? (
          <div className="flex flex-col gap-3">
            {primarySuggestions.map((suggestion) => (
              <Button
                key={suggestion.id}
                className="w-full"
                disabled={busy}
                onClick={() => handleSuggestion(suggestion.id)}
              >
                {suggestion.label}
              </Button>
            ))}
          </div>
        ) : null}

        {choiceSuggestions.length > 0 ? (
          <div
            className="flex flex-col gap-3"
            style={{ marginTop: primarySuggestions.length > 0 ? spacing.scale[4] : 0 }}
          >
            {choiceSuggestions.map((suggestion) => (
              <ChoiceCard
                key={suggestion.id}
                label={suggestion.label}
                disabled={busy}
                onClick={() => handleSuggestion(suggestion.id)}
              />
            ))}
          </div>
        ) : null}

        {step === "loan_upload" ? (
          <div style={{ marginTop: suggestions ? spacing.scale[4] : 0 }}>
            <Button className="w-full" onClick={openFilePicker} disabled={busy}>
              Choisir un fichier
            </Button>
          </div>
        ) : null}

        {showLoanForm ? (
          <div className="flex flex-col gap-5">
            <label style={labelStyle}>
              Montant emprunté (€)
              <input
                style={inputStyle}
                value={capital}
                onChange={(e) => setCapital(e.target.value)}
                placeholder="Ex. : 150000"
                inputMode="decimal"
              />
            </label>
            <label style={labelStyle}>
              Taux annuel (%)
              <input
                style={inputStyle}
                value={rate}
                onChange={(e) => setRate(e.target.value)}
                placeholder="Ex. : 1,85"
                inputMode="decimal"
              />
            </label>
            <label style={labelStyle}>
              Durée (mois)
              <input
                style={inputStyle}
                value={duration}
                onChange={(e) => setDuration(e.target.value)}
                placeholder="Ex. : 240"
                inputMode="numeric"
              />
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
            <Button className="w-full" onClick={submitLoan} disabled={busy || !canSubmitLoan}>
              Continuer
            </Button>
          </div>
        ) : null}

        {awaitingAmountFor ? (
          <div className="flex flex-col gap-5">
            <input
              style={inputStyle}
              value={amountInput}
              onChange={(e) => setAmountInput(e.target.value)}
              placeholder="Laisser vide si aucun"
              aria-label={amountLabelFor(awaitingAmountFor)}
            />
            <Button className="w-full" onClick={submitAmount} disabled={busy}>
              Continuer
            </Button>
          </div>
        ) : null}

        {step === "blocked_missing_date" ? (
          <div className="flex flex-col gap-3 sm:flex-row">
            <Link href={LMNP_ROUTES.activite} className="flex-1">
              <Button className="w-full">Aller à l&apos;Activité</Button>
            </Link>
            <Link href={LMNP_ROUTES.dashboard}>
              <Button variant="secondary" className="w-full">
                Retour au tableau de bord
              </Button>
            </Link>
          </div>
        ) : null}

        {step === "complete" || step === "skipped" ? (
          <div className="flex flex-col gap-3" style={{ marginTop: spacing.scale[4] }}>
            <div className="flex flex-col gap-3 sm:flex-row">
              <Link href={LMNP_ROUTES.revenusAssistant} className="flex-1">
                <Button className="w-full">Continuer vers Revenus</Button>
              </Link>
              <Link href={LMNP_ROUTES.dashboard}>
                <Button variant="secondary" className="w-full">
                  Retour au tableau de bord
                </Button>
              </Link>
            </div>
            {step === "complete" ? (
              <Button
                variant="ghost"
                disabled={busy}
                className="w-full"
                onClick={() => void runAction({ type: "go_back" })}
              >
                Modifier mes réponses
              </Button>
            ) : null}
          </div>
        ) : null}

        <GoBackControl visible={canGoBack} disabled={busy} onBack={goBack} />
      </div>
    </div>
  );
}
