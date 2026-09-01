"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Button } from "@/design-system/components/Button";
import { Card } from "@/design-system/components/Card";
import { colors } from "@/design-system/theme/colors";
import { radius } from "@/design-system/theme/radius";
import { spacing } from "@/design-system/theme/spacing";
import { typography } from "@/design-system/theme/typography";
import type { F011PrefillFieldKey } from "@/lib/lmnp/services/f011/credit-bridge";
import { runF011UploadFlow } from "@/lib/lmnp/services/f011/f011-document-analysis";
import { shouldFlushF011PersistedStep } from "@/lib/lmnp/services/f011/f011-critical-persist";
import { resolveF011ResumeDecision } from "@/lib/lmnp/services/f011/f011-resume";
import { resolveLoanFormAction, type LoanIdentity } from "@/lib/lmnp/services/f011/f011-loan-form-state";
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

function amountLabelFor(kind: "insurance" | "guarantee" | "fees" | "ira"): string {
  switch (kind) {
    case "insurance":
      return "Montant annuel de l'assurance externe (€)";
    case "guarantee":
      return "Montant de la commission de caution (€)";
    case "fees":
      return "Montant des frais de dossier (€)";
    case "ira":
      return "Montant de l'IRA (€)";
  }
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

    return { decision, turn: assistant.resume(persisted!) };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [state, setState] = useState<F011State>(() => initialResume.turn.state);
  const [messages, setMessages] = useState<F011Message[]>(() => initialResume.turn.messages);
  // Cycle 5 — lu par le chemin d'analyse asynchrone (upload → OCR/GPT), qui
  // s'étend sur plusieurs rendus : `state` seul serait périmé au moment où le
  // pipeline répond. Toujours synchronisé (effet ci-dessous), jamais utilisé
  // pour déclencher un rendu lui-même.
  const stateRef = useRef(state);
  useEffect(() => {
    stateRef.current = state;
  }, [state]);
  const [announcement, setAnnouncement] = useState("");

  const [capital, setCapital] = useState(() =>
    initialResume.turn.state.step === "loan_collect" && initialResume.turn.state.pendingLoan?.capitalInitial !== undefined
      ? String(initialResume.turn.state.pendingLoan.capitalInitial)
      : "200000",
  );
  const [rate, setRate] = useState(() =>
    initialResume.turn.state.step === "loan_collect" && initialResume.turn.state.pendingLoan?.tauxNominal !== undefined
      ? String(initialResume.turn.state.pendingLoan.tauxNominal * 100)
      : "1.85",
  );
  const [duration, setDuration] = useState(() =>
    initialResume.turn.state.step === "loan_collect" && initialResume.turn.state.pendingLoan?.dureeMois !== undefined
      ? String(initialResume.turn.state.pendingLoan.dureeMois)
      : "240",
  );
  const [firstPayment, setFirstPayment] = useState(() =>
    initialResume.turn.state.step === "loan_collect" && initialResume.turn.state.pendingLoan?.datePremiereMensualite
      ? initialResume.turn.state.pendingLoan.datePremiereMensualite
      : "2022-01-15",
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
        void flushWorkspace({
          declarationDraft: { financementAssistantState, creditDeclaredNoneAt: now },
        });
        return;
      }

      const financementCharges = {
        exerciceFiscal: result.charges.exerciceFiscal,
        totalInteretsEmprunt: result.charges.totalInteretsEmprunt,
        totalInteretsPreExploitation: result.charges.totalInteretsPreExploitation,
        totalAssurance: result.charges.totalAssurance,
        totalCapitalRembourse: result.charges.totalCapitalRembourse,
        totalChargesFinancementExercice: result.charges.totalChargesFinancementExercice,
        prets: result.charges.prets,
        fieldSources: finalState.fieldSources,
        computedAt: now,
      };
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
      setState(turn.state);
      setMessages((prev) => [...prev, ...turn.messages]);
      const lastAssistantMessage = [...turn.messages].reverse().find((m) => m.role === "assistant");
      if (lastAssistantMessage) setAnnouncement(lastAssistantMessage.content);
      if (turn.state.step === "loan_collect") {
        applyLoanFormAction(turn.state.pendingLoan, {
          loanIndex: turn.state.currentLoanIndex,
          generation: turn.state.loanFormGeneration,
        });
      }
      persistSession(turn.state);
      if (turn.completed) persistCompletion(turn.state);
    },
    [applyLoanFormAction, persistCompletion, persistSession],
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

        const { files: uploadedFiles } = await uploadFilesForUser([file], user.id);
        const uploadedFile = uploadedFiles[0];
        if (!uploadedFile) return;

        const documentId = crypto.randomUUID();
        dispatch({
          type: "UPLOAD_DOCUMENTS",
          files: [{ file: uploadedFile, category: "emprunt", documentId }],
        });
        dispatch({ type: "REGISTER_FILE", documentId, file: uploadedFile });

        applyTurn(await assistant.handle(stateRef.current, { type: "upload_document", documentId }));
        // L'analyse elle-même part de l'effet ci-dessus, pas d'ici — même
        // chemin que la reprise après refresh.
      } finally {
        setBusy(false);
      }
    },
    [assistant, applyTurn, dispatch],
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
        void runAction({ type: "set_insurance", assuranceType: "bancaire" });
      }
      if (suggestionId === "assurance_externe") {
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

  const submitLoan = useCallback(() => {
    const capitalValue = Number(capital);
    const rateValue = Number(rate) / 100;
    const durationValue = Number(duration);
    if (!Number.isFinite(capitalValue) || !Number.isFinite(rateValue) || !Number.isFinite(durationValue)) {
      return;
    }
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
      void runAction({ type: "set_insurance", assuranceType: "externe", assuranceAnnuelle: parsed });
    } else if (awaitingAmountFor === "guarantee") {
      void runAction({ type: "set_guarantee", typeGarantie: "caution", commissionCaution: parsed });
    } else if (awaitingAmountFor === "fees") {
      void runAction({ type: "set_fees", souscritCetExercice: true, fraisDossier: parsed });
    } else if (awaitingAmountFor === "ira") {
      void runAction({ type: "set_ira", remboursementAnticipe: true, montant: parsed });
    }
    setAwaitingAmountFor(null);
    setAmountInput("");
  }, [amountInput, awaitingAmountFor, runAction]);

  const step = state.step;
  const showLoanForm = step === "loan_collect";
  const canGoBack = Boolean(state.history && state.history.length > 0) && step !== "complete" && step !== "skipped";

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

          {step === "loan_upload" ? (
            <div style={{ marginTop: spacing.scale[4] }}>
              <Button onClick={openFilePicker} disabled={busy}>
                Choisir un fichier
              </Button>
            </div>
          ) : null}

          {showLoanForm ? (
            <div className="flex flex-col gap-3" style={{ marginTop: spacing.scale[4] }}>
              <p style={{ ...typography.body.desktop, color: colors.text.secondary }}>
                Prêt {state.currentLoanIndex + 1} sur {state.nombrePrets ?? 1}
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
                Continuer
              </Button>
            </div>
          ) : null}

          {awaitingAmountFor ? (
            <div className="flex flex-col gap-3" style={{ marginTop: spacing.scale[4] }}>
              <label style={labelStyle}>
                {amountLabelFor(awaitingAmountFor)}
                <input
                  style={inputStyle}
                  value={amountInput}
                  onChange={(e) => setAmountInput(e.target.value)}
                  placeholder="Laisser vide si aucun"
                />
              </label>
              <Button onClick={submitAmount} disabled={busy}>
                Continuer
              </Button>
            </div>
          ) : null}

          {canGoBack ? (
            <div style={{ marginTop: spacing.scale[3] }}>
              <Button variant="ghost" disabled={busy} onClick={() => void runAction({ type: "go_back" })}>
                ← Précédent
              </Button>
            </div>
          ) : null}

          {step === "blocked_missing_date" ? (
            <div style={{ marginTop: spacing.scale[4] }} className="flex gap-2">
              <Link href={LMNP_ROUTES.activite} className="flex-1">
                <Button className="w-full">Aller à l&apos;Activité</Button>
              </Link>
              <Link href={LMNP_ROUTES.dashboard}>
                <Button variant="secondary">Retour au tableau de bord</Button>
              </Link>
            </div>
          ) : null}

          {state.result && !state.result.skipped ? <ResultSummary result={state.result} /> : null}

          {step === "complete" || step === "skipped" ? (
            <div style={{ marginTop: spacing.scale[4] }} className="flex gap-2">
              <Link href={LMNP_ROUTES.revenusAssistant} className="flex-1">
                <Button className="w-full">Continuer vers Revenus</Button>
              </Link>
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
