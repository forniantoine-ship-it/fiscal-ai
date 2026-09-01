"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Button } from "@/design-system/components/Button";
import { Card } from "@/design-system/components/Card";
import { colors } from "@/design-system/theme/colors";
import { radius } from "@/design-system/theme/radius";
import { spacing } from "@/design-system/theme/spacing";
import { typography } from "@/design-system/theme/typography";
import { shouldFlushF012PersistedStep } from "@/lib/lmnp/services/f012/f012-critical-persist";
import { buildCoproLignesFromAmounts } from "@/lib/lmnp/services/f012/f012-copro-form-state";
import { resolveDiversSubmitAction } from "@/lib/lmnp/services/f012/f012-divers-form-state";
import { resolveF012ResumeDecision } from "@/lib/lmnp/services/f012/f012-resume";
import {
  amountPaidLabel,
  amountWhereToLook,
  assistantHeaderLead,
  chargesAlreadyRecorded,
  coproFieldLabels,
} from "@/runtime/assistants/f012-charges/ux-copy";
import { parseStructuredAmount } from "@/runtime/assistants/f012-charges/family-expense-parse";
import { slotNudgePrompt } from "@/runtime/assistants/f012-charges/slot-nudge";
import { collectedToChargeRegistry, isDocumentaryFamily } from "@/runtime";
import {
  resolveSituationalProfilage,
  situationalProfilageQuestions,
} from "@/runtime/assistants/f012-charges/situational-profilage";
import { proposalsFromExistingParsers } from "@/lib/lmnp/services/f012/f012-document-analysis";
import { extractPdfTextClient } from "@/lib/lmnp/services/activite-ocr-text";
import { CoverageRecap, CompletenessCatchForm, DocumentReviewForm, FamilyCard, FamilyManualForm, FamilyPaperUpload, SlotNudgeForm } from "./F012FamilyCapture";
import { LMNP_ROUTES } from "@/lib/lmnp/routes";
import { useLmnp } from "@/lib/lmnp/store";
import {
  F012ChargesAssistant,
  toF012PersistedStateWithRegistry,
  type Anomaly,
  type AnomalySeverity,
  type F012Action,
  type F012AssistantTurn,
  type F012CategoryId,
  type F012Message,
  type F012Result,
  type F012State,
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

function MessageBubble({ message }: { message: F012Message }) {
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

function severityLabel(severity: AnomalySeverity): string {
  switch (severity) {
    case "fatal":
    case "error":
      return "À corriger";
    case "warning":
      return "À vérifier";
  }
}

/** Cycle 4D — le récapitulatif final affiche les anomalies déjà calculées par le moteur (validateCharges + computeChargesExercice), jamais inventées ici. */
function AnomalyList({ anomalies }: { anomalies: Anomaly[] }) {
  if (anomalies.length === 0) return null;
  return (
    <div style={{ marginTop: spacing.scale[3] }} className="flex flex-col gap-2">
      {anomalies.map((anomaly, index) => {
        const blocking = anomaly.severity === "fatal" || anomaly.severity === "error";
        const palette = blocking ? colors.error : colors.warning;
        return (
          <div
            key={index}
            style={{
              padding: spacing.scale[3],
              borderRadius: radius.md,
              backgroundColor: palette.surface,
              border: `1px solid ${palette.border}`,
            }}
          >
            <p style={{ ...typography.caption.desktop, color: palette.DEFAULT, fontWeight: 600 }}>
              {severityLabel(anomaly.severity)}
            </p>
            <p style={{ ...typography.body.desktop, color: colors.text.primary }}>{anomaly.message}</p>
          </div>
        );
      })}
    </div>
  );
}

function ResultSummary({ result }: { result: F012Result }) {
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
        {fmtEur(charges.totalDeductible)}
      </p>
      {charges.totalAmortissable > 0 ? (
        <p style={{ ...typography.body.desktop, color: colors.text.secondary }}>
          À amortir : {fmtEur(charges.totalAmortissable)}
        </p>
      ) : null}
      {charges.totalPreExploitation > 0 ? (
        <p style={{ ...typography.body.desktop, color: colors.text.secondary }}>
          Pré-exploitation (non déductible) : {fmtEur(charges.totalPreExploitation)}
        </p>
      ) : null}
      <AnomalyList anomalies={result.anomalies} />
    </div>
  );
}

function ProfilageForm({
  year,
  knownCopropriete,
  onSubmit,
  disabled,
}: {
  year: number;
  knownCopropriete?: boolean;
  onSubmit: (values: { copropriete: boolean; agence: boolean; travaux: boolean; vacance: boolean; comptable: boolean }) => void;
  disabled: boolean;
}) {
  const [copropriete, setCopropriete] = useState(false);
  const [gestion, setGestion] = useState(false);
  const [travaux, setTravaux] = useState(false);
  const questions = situationalProfilageQuestions({ copropriete: knownCopropriete }, year);

  return (
    <div className="flex flex-col gap-2" style={{ marginTop: spacing.scale[4] }}>
      {questions.map((question) => {
        const checked = question.id === "copropriete" ? copropriete : question.id === "gestion" ? gestion : travaux;
        const setter = question.id === "copropriete" ? setCopropriete : question.id === "gestion" ? setGestion : setTravaux;
        return (
          <label key={question.id} className="flex items-center gap-2" style={typography.body.desktop}>
            <input
              type="checkbox"
              checked={checked}
              onChange={(e) => setter(e.target.checked)}
            />
            {question.label}
          </label>
        );
      })}
      <Button
        disabled={disabled}
        onClick={() => {
          const profil = resolveSituationalProfilage({
            known: { copropriete: knownCopropriete },
            copropriete,
            gestion,
            travaux,
          });
          onSubmit({ ...profil });
        }}
      >
        Continuer
      </Button>
    </div>
  );
}

function AmountActions({
  disabled,
  onValidate,
  onAction,
}: {
  disabled: boolean;
  onValidate: () => void;
  onAction: (action: F012Action) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      <Button disabled={disabled} onClick={onValidate}>
        Valider
      </Button>
      <Button variant="secondary" disabled={disabled} onClick={() => onAction({ type: "unknown_category" })}>
        Je ne sais pas
      </Button>
      <Button variant="secondary" disabled={disabled} onClick={() => onAction({ type: "skip_category" })}>
        Passer
      </Button>
    </div>
  );
}

function CategoryForm({
  categoryId,
  year,
  onAction,
  disabled,
}: {
  categoryId: F012CategoryId;
  year: number;
  onAction: (action: F012Action) => void;
  disabled: boolean;
}) {
  const [amount, setAmount] = useState("");
  const [provisions, setProvisions] = useState("");
  const [regularisation, setRegularisation] = useState("");
  const [fondsTravaux, setFondsTravaux] = useState("");
  const [grosTravaux, setGrosTravaux] = useState("");
  const [honoraires, setHonoraires] = useState("");
  const [etatLieux, setEtatLieux] = useState("");
  const [travauxDesc, setTravauxDesc] = useState("");
  const [travauxMontant, setTravauxMontant] = useState("");
  const [splitMontant, setSplitMontant] = useState("");
  const [diversDesc, setDiversDesc] = useState("");

  const parseAmount = (v: string) => parseStructuredAmount(v) ?? Number.NaN;

  switch (categoryId) {
    case "taxe_fonciere":
    case "assurance_pno":
    case "assurance_gli":
    case "honoraires_comptable":
    case "frais_bancaires":
      return (
        <div className="flex flex-col gap-3" style={{ marginTop: spacing.scale[4] }}>
          <label style={labelStyle}>
            {amountPaidLabel(year)}
            <input style={inputStyle} value={amount} onChange={(e) => setAmount(e.target.value)} />
          </label>
          {amountWhereToLook(categoryId) ? (
            <p style={{ ...typography.caption.desktop, color: colors.text.muted }}>{amountWhereToLook(categoryId)}</p>
          ) : null}
          <AmountActions
            disabled={disabled}
            onAction={onAction}
            onValidate={() => {
              const montant = parseAmount(amount);
              if (!Number.isFinite(montant)) return;
              const map: Record<string, F012Action> = {
                taxe_fonciere: { type: "submit_taxe_fonciere", montant },
                assurance_pno: { type: "submit_assurance_pno", montant },
                assurance_gli: { type: "submit_assurance_gli", montant },
                honoraires_comptable: { type: "submit_comptable", montant },
                frais_bancaires: { type: "submit_frais_bancaires", montant },
              };
              onAction(map[categoryId]!);
            }}
          />
        </div>
      );

    case "copropriete": {
      const coproLabels = coproFieldLabels(year);
      return (
        <div className="flex flex-col gap-3" style={{ marginTop: spacing.scale[4] }}>
          <label style={labelStyle}>{coproLabels.courant}<input style={inputStyle} value={provisions} onChange={(e) => setProvisions(e.target.value)} /></label>
          <label style={labelStyle}>{coproLabels.regularisation}<input style={inputStyle} value={regularisation} onChange={(e) => setRegularisation(e.target.value)} /></label>
          <label style={labelStyle}>{coproLabels.epargneTravaux}<input style={inputStyle} value={fondsTravaux} onChange={(e) => setFondsTravaux(e.target.value)} /></label>
          <label style={labelStyle}>{coproLabels.grosTravaux}<input style={inputStyle} value={grosTravaux} onChange={(e) => setGrosTravaux(e.target.value)} /></label>
          <AmountActions
            disabled={disabled}
            onAction={onAction}
            onValidate={() => {
              const lignes = buildCoproLignesFromAmounts({
                courant: parseAmount(provisions) || 0,
                regularisation: parseAmount(regularisation) || 0,
                epargneTravaux: parseAmount(fondsTravaux) || 0,
                grosTravaux: parseAmount(grosTravaux) || 0,
              });
              onAction({ type: "submit_copro", lignes });
            }}
          />
        </div>
      );
    }

    case "honoraires_gestion":
      return (
        <div className="flex flex-col gap-3" style={{ marginTop: spacing.scale[4] }}>
          <label style={labelStyle}>
            {amountPaidLabel(year)} — agence
            <input style={inputStyle} value={honoraires} onChange={(e) => setHonoraires(e.target.value)} />
          </label>
          <label style={labelStyle}>
            Frais d&apos;état des lieux payés en {year}
            <input style={inputStyle} value={etatLieux} onChange={(e) => setEtatLieux(e.target.value)} />
          </label>
          <AmountActions
            disabled={disabled}
            onAction={onAction}
            onValidate={() =>
              onAction({
                type: "submit_gestion",
                honorairesGestion: parseAmount(honoraires) || 0,
                fraisEtatDesLieux: parseAmount(etatLieux) || 0,
              })
            }
          />
        </div>
      );

    case "travaux":
      return (
        <div className="flex flex-col gap-3" style={{ marginTop: spacing.scale[4] }}>
          <label style={labelStyle}>Description<input style={inputStyle} value={travauxDesc} onChange={(e) => setTravauxDesc(e.target.value)} /></label>
          <label style={labelStyle}>
            {amountPaidLabel(year)}
            <input style={inputStyle} value={travauxMontant} onChange={(e) => setTravauxMontant(e.target.value)} />
          </label>
          <p style={{ ...typography.caption.desktop, color: colors.text.muted }}>{amountWhereToLook("travaux")}</p>
          <label style={labelStyle}>Part remise en état (si la facture mélange réparation et amélioration)<input style={inputStyle} value={splitMontant} onChange={(e) => setSplitMontant(e.target.value)} placeholder="Laisser vide si ce n'est pas le cas" /></label>
          <div className="flex flex-wrap gap-2">
            <Button
              disabled={disabled}
              onClick={() => {
                const montant = parseAmount(travauxMontant);
                if (!travauxDesc || !Number.isFinite(montant)) return;
                onAction({ type: "submit_travaux_description", description: travauxDesc, montant });
              }}
            >
              Décrire la dépense
            </Button>
            <Button variant="secondary" disabled={disabled} onClick={() => onAction({ type: "unknown_category" })}>
              Je ne sais pas
            </Button>
            <Button variant="secondary" disabled={disabled} onClick={() => onAction({ type: "finish_travaux_category" })}>
              Passer
            </Button>
          </div>
        </div>
      );

    case "divers":
      return (
        <div className="flex flex-col gap-3" style={{ marginTop: spacing.scale[4] }}>
          <label style={labelStyle}>Description<input style={inputStyle} value={diversDesc} onChange={(e) => setDiversDesc(e.target.value)} /></label>
          <label style={labelStyle}>
            {amountPaidLabel(year)}
            <input style={inputStyle} value={amount} onChange={(e) => setAmount(e.target.value)} />
          </label>
          <div className="flex flex-wrap gap-2">
            <Button
              disabled={disabled}
              onClick={() => {
                const action = resolveDiversSubmitAction({ description: diversDesc, montant: amount });
                if (action) onAction(action);
              }}
            >
              Ajouter cette dépense
            </Button>
            <Button variant="secondary" disabled={disabled} onClick={() => onAction({ type: "unknown_category" })}>
              Je ne sais pas
            </Button>
            <Button variant="secondary" disabled={disabled} onClick={() => onAction({ type: "skip_category" })}>
              Continuer
            </Button>
          </div>
        </div>
      );

    default:
      return null;
  }
}

export function F012ChargesAssistantPanel() {
  const { workspace, dispatch, flushWorkspace } = useLmnp();
  const fiscalYear = workspace.fiscalYear.year;
  const draft = workspace.declarationDraft;

  const knownCopropriete = workspace.properties[0]?.coproperty;
  const dateMiseEnService = draft?.dateMiseEnService;
  // Cycle 3 — sortie F-011 déjà validée, réutilisée pour détecter un doublon
  // assurance emprunteur dans "Charges diverses" (RAI-000). Champs primitifs
  // extraits individuellement pour que la dépendance du useMemo ci-dessous
  // reste aussi précise que pour `dateMiseEnService`.
  const financementTotalAssurance = draft?.financementCharges?.totalAssurance;
  const financementTotalCapitalRembourse = draft?.financementCharges?.totalCapitalRembourse;

  const assistant = useMemo(
    () =>
      new F012ChargesAssistant(
        {
          dossierId: workspace.fiscalYear.id,
          fiscalYear,
          route: "/assistants/charges",
        },
        {
          dateMiseEnService,
          knownCopropriete,
          financementCharges:
            financementTotalAssurance !== undefined || financementTotalCapitalRembourse !== undefined
              ? {
                  totalAssurance: financementTotalAssurance ?? 0,
                  totalCapitalRembourse: financementTotalCapitalRembourse ?? 0,
                }
              : undefined,
        },
      ),
    [
      dateMiseEnService,
      knownCopropriete,
      financementTotalAssurance,
      financementTotalCapitalRembourse,
      fiscalYear,
      workspace.fiscalYear.id,
    ],
  );

  // Cycle 2 — reprise. Ordre imposé : shouldResumeF012 AVANT le repli "déjà
  // complet" — encodé dans resolveF012ResumeDecision, pas ici, pour que
  // l'ordre ne dépende pas d'une relecture attentive de ce composant. Calculé
  // une seule fois au montage : ne doit pas se redéclencher parce que
  // l'identité de `workspace`/`draft` change à chaque tick d'autosave.
  const initialResume = useMemo(() => {
    const persisted = draft?.chargesAssistantState;
    const decision = resolveF012ResumeDecision({
      persisted,
      isLegacyComplete: Boolean(draft?.chargesAssistant),
    });

    if (decision.kind === "legacy_complete") {
      const chargesAssistant = draft!.chargesAssistant!;
      const state: F012State = {
        step: "complete",
        categoryInventory: [],
        currentCategoryIndex: 0,
        collected: {
          coproLignes: [],
          travaux: [],
          divers: [],
          skippedCategories: [],
        },
        fieldSources: chargesAssistant.fieldSources ?? {},
        result: {
          charges: {
            exerciceFiscal: chargesAssistant.exerciceFiscal,
            lignes: [],
            parCategorie: chargesAssistant.parCategorie,
            totalDeductible: chargesAssistant.totalDeductible,
            totalNonDeductible: chargesAssistant.totalNonDeductible,
            totalAmortissable: chargesAssistant.totalAmortissable,
            totalPreExploitation: chargesAssistant.totalPreExploitation,
            composantsNouveaux: chargesAssistant.composantsNouveaux,
          },
          explanation: "",
          immobilisationNotes: [],
          anomalies: [],
          // Déjà confirmé par le passé (legacy) — aucune anomalie n'a été
          // conservée à l'époque ; ne pas en inventer rétroactivement.
          chargesCoherentes: true,
          composantsNouveaux: chargesAssistant.composantsNouveaux,
        },
      };
      return {
        decision,
        turn: {
          state,
          messages: [
            { role: "assistant" as const, content: chargesAlreadyRecorded(fiscalYear) },
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

  const [state, setState] = useState<F012State>(() => initialResume.turn.state);
  const [messages, setMessages] = useState<F012Message[]>(() => initialResume.turn.messages);
  // Lu par les callbacks qui doivent agir sur l'état le plus frais sans
  // redéclencher leur propre identité à chaque tour — même principe que F-011.
  const stateRef = useRef(state);
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  const [busy, setBusy] = useState(false);

  /**
   * Persiste l'état conversationnel F012 (Cycle 2) — jamais le résultat
   * calculé, seulement ce qu'il faut pour reprendre exactement où l'utilisateur
   * en était. Flush immédiat sur les étapes critiques (miroir F010/F011).
   * Patch construit depuis `nextState` (paramètre), jamais depuis `state`
   * (fermeture React) — pour ne jamais persister une valeur périmée si
   * `applyTurn` est appelé avant que le re-rendu n'ait propagé `state`.
   */
  const persistSession = useCallback(
    (nextState: F012State) => {
      const chargesAssistantState = toF012PersistedStateWithRegistry(
        nextState,
        new Date().toISOString(),
        fiscalYear,
      );
      dispatch({ type: "DECLARATION_PATCH_DRAFT", patch: { chargesAssistantState } });
      if (shouldFlushF012PersistedStep(nextState.step)) {
        void flushWorkspace({
          declarationDraft: {
            ...(draft ?? { completedSteps: [] }),
            chargesAssistantState,
          },
        });
      }
    },
    [dispatch, draft, fiscalYear, flushWorkspace],
  );

  const persistCompletion = useCallback(
    (finalState: F012State) => {
      const result = finalState.result;
      if (!result) return;
      const now = new Date().toISOString();
      const chargesAssistantState = toF012PersistedStateWithRegistry(finalState, now, fiscalYear);
      const chargesAssistant = {
        exerciceFiscal: result.charges.exerciceFiscal,
        totalDeductible: result.charges.totalDeductible,
        totalNonDeductible: result.charges.totalNonDeductible,
        totalAmortissable: result.charges.totalAmortissable,
        totalPreExploitation: result.charges.totalPreExploitation,
        parCategorie: result.charges.parCategorie,
        composantsNouveaux: result.charges.composantsNouveaux,
        fieldSources: finalState.fieldSources,
        computedAt: now,
      };

      dispatch({
        type: "DECLARATION_PATCH_DRAFT",
        patch: { chargesAssistantState, chargesAssistant, chargesConfirmedAt: now },
      });
      dispatch({ type: "DECLARATION_COMPLETE_STEP", stepId: "charges-assistant" });
      void flushWorkspace({
        declarationDraft: {
          chargesAssistantState,
          chargesAssistant,
          chargesConfirmedAt: now,
        },
      });
    },
    [dispatch, fiscalYear, flushWorkspace],
  );

  /**
   * Applique un tour à l'état du composant — chemin unique pour que
   * setState/persistance ne divergent jamais entre les actions (Cycle 2,
   * miroir F011 `applyTurn`).
   */
  const applyTurn = useCallback(
    (turn: F012AssistantTurn) => {
      setState(turn.state);
      setMessages((prev) => [...prev, ...turn.messages]);
      persistSession(turn.state);
      if (turn.completed) persistCompletion(turn.state);
    },
    [persistCompletion, persistSession],
  );

  const runAction = useCallback(
    async (action: F012Action) => {
      setBusy(true);
      try {
        applyTurn(await assistant.handle(stateRef.current, action));
      } finally {
        setBusy(false);
      }
    },
    [assistant, applyTurn],
  );

  const analyzePaperFile = useCallback(
    async (file: File) => {
      const familyId =
        stateRef.current.familyInventory && stateRef.current.currentFamilyIndex !== undefined
          ? stateRef.current.familyInventory[stateRef.current.currentFamilyIndex]
          : undefined;
      if (!familyId || !isDocumentaryFamily(familyId)) return;
      setBusy(true);
      try {
        let text = "";
        if (file.type === "text/plain" || file.name.endsWith(".txt")) {
          text = await file.text();
        } else {
          try {
            text = await extractPdfTextClient(file);
          } catch {
            text = "";
          }
        }
        const documentId = `f012-doc-${file.name}-${file.size}`;
        const proposals = proposalsFromExistingParsers({
          familyId,
          corpus: { text, fileName: file.name },
          documentId,
          fiscalYear,
        });
        applyTurn(
          await assistant.handle(stateRef.current, {
            type: "receive_document_proposals",
            documentId,
            familyId,
            proposals,
            fileName: file.name,
          }),
        );
      } finally {
        setBusy(false);
      }
    },
    [assistant, applyTurn, fiscalYear],
  );

  const handleSuggestion = useCallback(
    (suggestionId: string) => {
      if (suggestionId === "confirm_all") void runAction({ type: "confirm_all" });
      if (suggestionId === "skip_category") void runAction({ type: "skip_category" });
      if (suggestionId === "unknown_category") void runAction({ type: "unknown_category" });
      if (suggestionId === "open_family_paper") void runAction({ type: "open_family_paper" });
      if (suggestionId === "open_family_manual") void runAction({ type: "open_family_manual" });
      if (suggestionId === "none_family") void runAction({ type: "none_family" });
      if (suggestionId === "unknown_family") void runAction({ type: "unknown_family" });
      if (suggestionId === "continue_after_unknown") void runAction({ type: "continue_after_unknown" });
      if (suggestionId === "finish_travaux") void runAction({ type: "finish_travaux_category" });
      if (suggestionId === "start_travaux") void runAction({ type: "start_travaux" });
      if (suggestionId === "completeness_no") void runAction({ type: "confirm_completeness", hasOther: false });
      if (suggestionId === "completeness_yes") void runAction({ type: "confirm_completeness", hasOther: true });
      if (suggestionId === "slot_nudge_no" && stateRef.current.pendingSlotNudge) {
        void runAction({ type: "respond_slot_nudge", slot: stateRef.current.pendingSlotNudge, accepted: false });
      }
      if (suggestionId === "slot_nudge_yes" && stateRef.current.pendingSlotNudge) {
        void runAction({ type: "respond_slot_nudge", slot: stateRef.current.pendingSlotNudge, accepted: true });
      }
      const filetFamily: Record<string, "impots" | "syndic" | "assurances" | "gestion" | "travaux" | "autres"> = {
        completeness_travaux: "travaux",
        completeness_syndic: "syndic",
        completeness_assurances: "assurances",
        completeness_gli: "assurances",
        completeness_gestion: "gestion",
        completeness_comptable: "gestion",
        completeness_bank: "autres",
        completeness_impots: "impots",
        completeness_autres: "autres",
      };
      const chipFamily = filetFamily[suggestionId];
      if (chipFamily) {
        void runAction({
          type: "revisit_family",
          familyId: chipFamily,
          freeText: stateRef.current.pendingFamilyFreeText,
        });
      }
      if (suggestionId === "revisit_incomplete") void runAction({ type: "revisit_incomplete" });
      if (
        suggestionId === "reparation_identique" ||
        suggestionId === "amelioration" ||
        suggestionId === "mixte" ||
        suggestionId === "incertain"
      ) {
        void runAction({
          type: "submit_travaux_qualification",
          choix: suggestionId,
        });
      }
    },
    [runAction],
  );

  const currentCategory = state.categoryInventory[state.currentCategoryIndex];
  const currentFamily =
    state.familyInventory && state.currentFamilyIndex !== undefined
      ? state.familyInventory[state.currentFamilyIndex]
      : undefined;
  const showProfilage = state.step === "profilage";
  const showFamilyCard =
    state.step === "category_collect" && Boolean(currentFamily) && (state.familyPhase ?? "card") === "card";
  const showFamilyManual =
    state.step === "category_collect" &&
    Boolean(currentFamily) &&
    currentFamily !== "travaux" &&
    state.familyPhase === "manual";
  const showSlotNudge = state.step === "category_collect" && state.familyPhase === "slot_nudge" && Boolean(state.pendingSlotNudge);
  const coverageForRecap =
    (state.step === "completeness" ||
      state.step === "aggregate_review" ||
      state.step === "complete") &&
    state.profil
      ? collectedToChargeRegistry({
          collected: state.collected,
          profil: state.profil,
          categoryInventory: state.categoryInventory,
          fieldSources: state.fieldSources,
          exercise: fiscalYear,
        }).familyCoverage
      : [];
  // Cycle 4B — pendant qu'une dépense travaux est en attente de qualification
  // ou de split, le formulaire "travaux" (avec son propre bouton "Terminer
  // les travaux") ne doit jamais rester affiché en même temps que les
  // suggestions de qualification / le champ de split : cliquer "Terminer"
  // à ce moment-là faisait disparaître la dépense décrite sans jamais la
  // qualifier ni l'ajouter à `collected.travaux`. Les deux écrans sont
  // désormais mutuellement exclusifs.
  const travauxAwaitingQualification =
    currentCategory === "travaux" &&
    (state.travauxSubStep === "qualification" || state.travauxSubStep === "split");
  const showCategory =
    state.step === "category_collect" &&
    currentCategory &&
    !travauxAwaitingQualification &&
    !showFamilyCard &&
    !showFamilyManual &&
    state.familyPhase !== "unknown_help" &&
    state.familyPhase !== "paper" &&
    state.familyPhase !== "review";
  const travauxSplit = state.travauxSubStep === "split";
  // Cycle 4E — même convention que F-010/F-011 : un historique non vide et
  // une étape non terminale, jamais un bouton mort.
  const canGoBack = Boolean(state.history && state.history.length > 0) && state.step !== "complete";
  const announcement = [...messages].reverse().find((message) => message.role === "assistant")?.content ?? "";

  return (
    <div className="mx-auto max-w-2xl">
      <div aria-live="polite" className="sr-only">
        {announcement}
      </div>
      <header style={{ marginBottom: spacing.scale[6] }}>
        <p style={{ ...typography.caption.desktop, color: colors.text.muted }}>
          <Link href={LMNP_ROUTES.dashboard} style={{ color: colors.text.muted }}>
            Tableau de bord
          </Link>
          {" / Charges"}
        </p>
        <h1 style={{ ...typography.sectionTitle.desktop, color: colors.text.primary, marginTop: spacing.scale[2] }}>
          Assistant Charges
        </h1>
        <p style={{ ...typography.body.desktop, color: colors.text.secondary, marginTop: spacing.scale[2] }}>
          {assistantHeaderLead(fiscalYear)}
        </p>
      </header>

      <Card>
        <div style={{ padding: spacing.scale[4] }}>
          {messages.map((message, index) => (
            <MessageBubble key={index} message={message} />
          ))}

          {messages.at(-1)?.suggestions && !showFamilyCard ? (
            <div className="flex flex-wrap gap-2" style={{ marginBottom: spacing.scale[4] }}>
              {messages.at(-1)!.suggestions!.map((s) => (
                <SuggestionButton key={s.id} suggestionId={s.id} label={s.label} onPick={handleSuggestion} />
              ))}
            </div>
          ) : null}

          {showProfilage ? (
            <ProfilageForm
              year={fiscalYear}
              knownCopropriete={knownCopropriete}
              disabled={busy}
              onSubmit={(values) =>
                void runAction({
                  type: "submit_profilage",
                  copropriete: values.copropriete,
                  agence: values.agence,
                  travaux: values.travaux,
                  vacance: values.vacance,
                  comptable: values.comptable,
                })
              }
            />
          ) : null}

          {showFamilyCard && currentFamily ? (
            <FamilyCard
              familyId={currentFamily}
              year={fiscalYear}
              showCreditNote={currentFamily === "assurances" && financementTotalAssurance !== undefined}
              disabled={busy}
              onAction={(action) => void runAction(action)}
            />
          ) : null}

          {showFamilyManual && currentFamily ? (
            <FamilyManualForm
              familyId={currentFamily}
              year={fiscalYear}
              disabled={busy}
              initialFreeText={state.pendingFamilyFreeText}
              onAction={(action) => void runAction(action)}
            />
          ) : null}

          {showSlotNudge && state.pendingSlotNudge ? (
            <SlotNudgeForm
              prompt={slotNudgePrompt(state.pendingSlotNudge, fiscalYear)}
              year={fiscalYear}
              disabled={busy}
              onRespond={(accepted, montant) =>
                void runAction({
                  type: "respond_slot_nudge",
                  slot: state.pendingSlotNudge!,
                  accepted,
                  montant,
                })
              }
            />
          ) : null}

          {state.familyPhase === "paper" && currentFamily && isDocumentaryFamily(currentFamily) ? (
            <FamilyPaperUpload
              familyId={currentFamily}
              disabled={busy}
              onFile={(file) => void analyzePaperFile(file)}
              onManual={() => void runAction({ type: "open_family_manual" })}
            />
          ) : null}

          {state.familyPhase === "review" && state.documentReview ? (
            <DocumentReviewForm
              review={state.documentReview}
              year={fiscalYear}
              disabled={busy}
              onAction={(action) => void runAction(action)}
            />
          ) : null}

          {coverageForRecap.length > 0 ? (
            <CoverageRecap
              familyCoverage={coverageForRecap}
              onRevisit={() => void runAction({ type: "revisit_incomplete" })}
            />
          ) : null}

          {state.step === "completeness" ? (
            <CompletenessCatchForm
              year={fiscalYear}
              disabled={busy}
              onSubmit={(freeText) =>
                void runAction({ type: "confirm_completeness", hasOther: true, freeText })
              }
            />
          ) : null}

          {showCategory ? (
            <CategoryForm
              categoryId={currentCategory}
              year={fiscalYear}
              disabled={busy}
              onAction={(action) => void runAction(action)}
            />
          ) : null}

          {travauxSplit ? (
            <div className="flex flex-col gap-3" style={{ marginTop: spacing.scale[4] }}>
              <label style={labelStyle}>
                Part remise en état (€)
                <input
                  style={inputStyle}
                  id="split-montant"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      const value = Number((e.target as HTMLInputElement).value);
                      if (Number.isFinite(value)) {
                        void runAction({ type: "submit_travaux_split", montantReparation: value });
                      }
                    }
                  }}
                />
              </label>
            </div>
          ) : null}

          {canGoBack ? (
            <div style={{ marginTop: spacing.scale[3] }}>
              <Button variant="ghost" disabled={busy} onClick={() => void runAction({ type: "go_back" })}>
                ← Précédent
              </Button>
            </div>
          ) : null}

          {state.result ? <ResultSummary result={state.result} /> : null}

          {state.step === "complete" ? (
            <div style={{ marginTop: spacing.scale[4] }} className="flex gap-2">
              <Link href={LMNP_ROUTES.amortissementsAssistant} className="flex-1">
                <Button className="w-full">Continuer vers Amortissements</Button>
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
