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
import { shouldFlushF012PersistedStep } from "@/lib/lmnp/services/f012/f012-critical-persist";
import { buildCoproLignesFromAmounts } from "@/lib/lmnp/services/f012/f012-copro-form-state";
import { resolveDiversSubmitAction } from "@/lib/lmnp/services/f012/f012-divers-form-state";
import { resolveF012ResumeDecision } from "@/lib/lmnp/services/f012/f012-resume";
import { composantsNouveauxChanged } from "@/lib/lmnp/services/f012/f012-amortissement-freshness";
import { analyzeImpotsDocument, IMPOTS_UPLOAD_CATEGORY } from "@/lib/lmnp/services/f012/f012-impots-document-upload";
import {
  analyzeDocumentaryReview,
  DOCUMENTARY_REVIEW_UPLOAD_CATEGORY,
} from "@/lib/lmnp/services/f012/f012-documentary-review-upload";
import {
  amountPaidLabel,
  amountWhereToLook,
  categoryLabel,
  chargesAlreadyRecorded,
  coproFieldLabels,
  paidInYearAnchor,
} from "@/runtime/assistants/f012-charges/ux-copy";
import { parseStructuredAmount } from "@/runtime/assistants/f012-charges/family-expense-parse";
import { slotNudgePrompt } from "@/runtime/assistants/f012-charges/slot-nudge";
import { collectedToChargeRegistry, isDocumentaryFamily } from "@/runtime";
import {
  FAMILY_CARD_TITLES,
  familyCardPhrase,
  filetFinalPrompt,
} from "@/runtime/assistants/f012-charges/family-ux";
import {
  resolveSituationalProfilage,
  situationalProfilageQuestions,
} from "@/runtime/assistants/f012-charges/situational-profilage";
import { CoverageRecap, CompletenessCatchForm, DocumentReviewForm, FamilyCard, FamilyManualForm, FamilyPaperUpload, SlotNudgeForm, TaxeFonciereReplaceForm, TaxeFonciereReviewForm } from "./F012FamilyCapture";
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
  type ChargeCategorie,
} from "@/runtime";

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

const PRIMARY_SUGGESTION_IDS = new Set(["confirm_all", "completeness_no"]);

const CATEGORY_RECAP_ORDER: ChargeCategorie[] = [
  "taxe_fonciere",
  "assurance_pno",
  "assurance_gli",
  "copropriete",
  "honoraires_gestion",
  "honoraires_comptable",
  "travaux",
  "frais_bancaires",
  "divers",
];

function fmtEur(value: number): string {
  return `${Math.round(value).toLocaleString("fr-FR")} €`;
}

function assistantMessagesFromTurn(messages: F012Message[]): F012Message[] {
  return messages.filter((message) => message.role === "assistant");
}

function splitQuestion(content: string): { title: string; body: string | null } {
  const trimmed = content.trim();
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

function completenessCopy(year: number): { title: string; body: string | null } {
  const lines = filetFinalPrompt(year)
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const question = lines.find((line) => line.includes("?")) ?? lines[0] ?? "Avant de terminer";
  const intro = lines.find((line) => line !== question && !line.includes("·")) ?? null;
  return { title: question, body: intro };
}

function headingForStep(input: {
  showFamilyCard: boolean;
  showProfilage: boolean;
  showFamilyManual: boolean;
  showSlotNudge: boolean;
  showPaper: boolean;
  showReview: boolean;
  completeness: { title: string; body: string | null } | null;
  isAggregateReview: boolean;
  familyPhrase: string | null;
  parsed: { title: string; body: string | null } | null;
  paidInYear: string;
  lastAssistantContent?: string;
}): { title: string | null; body: string | null } {
  if (input.showFamilyCard || input.showSlotNudge || input.showPaper) {
    return { title: null, body: null };
  }
  if (input.showProfilage) {
    return { title: "Avant de commencer", body: input.paidInYear };
  }
  if (input.showFamilyManual && input.familyPhrase) {
    return { title: input.familyPhrase, body: null };
  }
  if (input.showReview) {
    return { title: "Vérification de votre document", body: null };
  }
  if (input.completeness) {
    return input.completeness;
  }
  if (input.isAggregateReview) {
    return splitQuestion(input.lastAssistantContent ?? "Ces montants vous conviennent-ils ?");
  }
  return { title: input.parsed?.title ?? null, body: input.parsed?.body ?? null };
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

function QuietChip({
  label,
  onClick,
  disabled,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      style={{
        minHeight: 40,
        padding: `${spacing.scale[2]} ${spacing.scale[4]}`,
        borderRadius: radius.full,
        border: `1px solid ${colors.border.subtle}`,
        backgroundColor: colors.surface.primary,
        color: colors.text.secondary,
        ...typography.caption.desktop,
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.6 : 1,
      }}
    >
      {label}
    </button>
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
        pointerEvents: "auto",
      }}
    >
      ← Retour
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
  const rows = CATEGORY_RECAP_ORDER.flatMap((category) => {
    const value = charges.parCategorie[category];
    if (value === undefined || value === 0) return [];
    return [{ label: categoryLabel(category), value: fmtEur(value) }];
  });
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
        Vos charges
      </p>
      {rows.map((row) => (
        <RecapRow key={row.label} label={row.label} value={row.value} />
      ))}
      <RecapRow label="Total déductible" value={fmtEur(charges.totalDeductible)} emphasize />
      {charges.totalAmortissable > 0 ? (
        <RecapRow label="À amortir" value={fmtEur(charges.totalAmortissable)} />
      ) : null}
      {charges.totalPreExploitation > 0 ? (
        <RecapRow label="Pré-exploitation (non déductible)" value={fmtEur(charges.totalPreExploitation)} />
      ) : null}
      <AnomalyList anomalies={result.anomalies} />
    </Card>
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
    <div className="flex flex-col gap-5">
      {questions.map((question) => {
        const checked = question.id === "copropriete" ? copropriete : question.id === "gestion" ? gestion : travaux;
        const setter = question.id === "copropriete" ? setCopropriete : question.id === "gestion" ? setGestion : setTravaux;
        return (
          <label
            key={question.id}
            className="flex items-start gap-3"
            style={{
              ...typography.body.desktop,
              minHeight: 52,
              padding: `${spacing.scale[4]} ${spacing.scale[5]}`,
              borderRadius: radius.lg,
              border: `1px solid ${checked ? colors.border.selected : colors.border.default}`,
              backgroundColor: checked ? colors.surface.selected : colors.surface.primary,
              cursor: disabled ? "not-allowed" : "pointer",
              boxShadow: shadows.card.default,
            }}
          >
            <input
              type="checkbox"
              checked={checked}
              disabled={disabled}
              onChange={(e) => setter(e.target.checked)}
              style={{ marginTop: 4, width: 18, height: 18, accentColor: colors.text.accent }}
            />
            <span>{question.label}</span>
          </label>
        );
      })}
      <Button
        className="w-full"
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

function TravauxSplitField({
  disabled,
  onSubmit,
}: {
  disabled: boolean;
  onSubmit: (value: number) => void;
}) {
  const [value, setValue] = useState("");
  return (
    <div className="flex flex-col gap-5">
      <label style={labelStyle}>
        Part remise en état (€)
        <input
          style={inputStyle}
          id="split-montant"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              const parsed = Number(value);
              if (Number.isFinite(parsed)) onSubmit(parsed);
            }
          }}
        />
      </label>
      <Button
        className="w-full"
        disabled={disabled}
        onClick={() => {
          const parsed = Number(value);
          if (Number.isFinite(parsed)) onSubmit(parsed);
        }}
      >
        Continuer
      </Button>
    </div>
  );
}

function TravauxDateField({
  disabled,
  onSubmit,
}: {
  disabled: boolean;
  onSubmit: (value: string) => void;
}) {
  const [value, setValue] = useState("");
  return (
    <div className="flex flex-col gap-5">
      <label style={labelStyle}>
        Date de fin des travaux / mise en service du composant
        <input
          type="date"
          style={inputStyle}
          id="travaux-date-debut"
          value={value}
          onChange={(e) => setValue(e.target.value)}
        />
      </label>
      <Button
        className="w-full"
        disabled={disabled || !value}
        onClick={() => {
          if (value) onSubmit(value);
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
    <div className="flex flex-col gap-3">
      <Button className="w-full" disabled={disabled} onClick={onValidate}>
        Valider
      </Button>
      <ChoiceCard label="Je ne sais pas" disabled={disabled} onClick={() => onAction({ type: "unknown_category" })} />
      <ChoiceCard label="Passer" disabled={disabled} onClick={() => onAction({ type: "skip_category" })} />
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
        <div className="flex flex-col gap-5">
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
        <div className="flex flex-col gap-5">
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
        <div className="flex flex-col gap-5">
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
        <div className="flex flex-col gap-5">
          <label style={labelStyle}>Description<input style={inputStyle} value={travauxDesc} onChange={(e) => setTravauxDesc(e.target.value)} /></label>
          <label style={labelStyle}>
            {amountPaidLabel(year)}
            <input style={inputStyle} value={travauxMontant} onChange={(e) => setTravauxMontant(e.target.value)} />
          </label>
          <p style={{ ...typography.caption.desktop, color: colors.text.muted }}>{amountWhereToLook("travaux")}</p>
          <label style={labelStyle}>Part remise en état (si la facture mélange réparation et amélioration)<input style={inputStyle} value={splitMontant} onChange={(e) => setSplitMontant(e.target.value)} placeholder="Laisser vide si ce n'est pas le cas" /></label>
          <div className="flex flex-col gap-3">
            <Button
              className="w-full"
              disabled={disabled}
              onClick={() => {
                const montant = parseAmount(travauxMontant);
                if (!travauxDesc || !Number.isFinite(montant)) return;
                onAction({ type: "submit_travaux_description", description: travauxDesc, montant });
              }}
            >
              Décrire la dépense
            </Button>
            <ChoiceCard
              label="Je ne sais pas"
              disabled={disabled}
              onClick={() => onAction({ type: "unknown_category" })}
            />
            <ChoiceCard
              label="Passer"
              disabled={disabled}
              onClick={() => onAction({ type: "finish_travaux_category" })}
            />
          </div>
        </div>
      );

    case "divers":
      return (
        <div className="flex flex-col gap-5">
          <label style={labelStyle}>Description<input style={inputStyle} value={diversDesc} onChange={(e) => setDiversDesc(e.target.value)} /></label>
          <label style={labelStyle}>
            {amountPaidLabel(year)}
            <input style={inputStyle} value={amount} onChange={(e) => setAmount(e.target.value)} />
          </label>
          <div className="flex flex-col gap-3">
            <Button
              className="w-full"
              disabled={disabled}
              onClick={() => {
                const action = resolveDiversSubmitAction({ description: diversDesc, montant: amount });
                if (action) onAction(action);
              }}
            >
              Ajouter cette dépense
            </Button>
            <ChoiceCard
              label="Je ne sais pas"
              disabled={disabled}
              onClick={() => onAction({ type: "unknown_category" })}
            />
            <ChoiceCard
              label="Continuer"
              disabled={disabled}
              onClick={() => onAction({ type: "skip_category" })}
            />
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
  const [currentTurnAssistants, setCurrentTurnAssistants] = useState<F012Message[]>(() =>
    assistantMessagesFromTurn(initialResume.turn.messages),
  );
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

      // Chantier 2 — F012 → F014 freshness (§4) : une (re)confirmation qui
      // change réellement un composant amortissable (nouveau, supprimé, ou
      // base/durée/date modifiée) invalide la validation F-014 existante —
      // jamais sur un simple clic "Modifier" sans changement réel, jamais
      // sur l'édition d'une charge pure. `amortissementAssistant` fait déjà
      // partie des clés contributives de DECLARATION_PATCH_DRAFT
      // (reducer.ts) : l'invalider ici suffit à rouvrir F-014 ET à
      // invalider `declarationGeneratedAt` par le mécanisme déjà existant,
      // sans dupliquer cette logique ici.
      const amortissementStale =
        draft?.amortissementAssistant !== undefined &&
        composantsNouveauxChanged(draft?.chargesAssistant?.composantsNouveaux, chargesAssistant.composantsNouveaux);

      dispatch({
        type: "DECLARATION_PATCH_DRAFT",
        patch: {
          chargesAssistantState,
          chargesAssistant,
          chargesConfirmedAt: now,
          ...(amortissementStale ? { amortissementAssistant: undefined } : {}),
        },
      });
      dispatch({ type: "DECLARATION_COMPLETE_STEP", stepId: "charges-assistant" });
      void flushWorkspace({
        declarationDraft: {
          chargesAssistantState,
          chargesAssistant,
          chargesConfirmedAt: now,
          ...(amortissementStale ? { amortissementAssistant: undefined } : {}),
        },
      });
    },
    [dispatch, draft, fiscalYear, flushWorkspace],
  );

  /**
   * Applique un tour à l'état du composant — chemin unique pour que
   * setState/persistance ne divergent jamais entre les actions (Cycle 2,
   * miroir F011 `applyTurn`).
   */
  const applyTurn = useCallback(
    (turn: F012AssistantTurn) => {
      stateRef.current = turn.state;
      setState(turn.state);
      const nextAssistants = assistantMessagesFromTurn(turn.messages);
      if (nextAssistants.length > 0) {
        setCurrentTurnAssistants(nextAssistants);
      }
      persistSession(turn.state);
      if (turn.completed) persistCompletion(turn.state);
    },
    [persistCompletion, persistSession],
  );

  const runAction = useCallback(
    async (action: F012Action) => {
      setBusy(true);
      try {
        const wasComplete = stateRef.current.step === "complete";
        const turn = await assistant.handle(stateRef.current, action);
        applyTurn(turn);
        // F012-2 (« Modifier mes réponses ») — miroir exact F010/F011 : rouvrir
        // `complete` pour modification invalide immédiatement le signal de
        // confirmation partagé (Cycle 0), jusqu'à une nouvelle confirmation
        // explicite — le dossier redevient incomplet pendant la correction.
        // `amortissementAssistant`/`declarationGeneratedAt` ne sont PAS
        // touchés ici : leur invalidation reste conditionnée à un changement
        // contributif réel, détecté à la reconfirmation (persistCompletion).
        if (wasComplete && turn.state.step !== "complete") {
          dispatch({ type: "DECLARATION_PATCH_DRAFT", patch: { chargesConfirmedAt: undefined } });
        }
      } finally {
        setBusy(false);
      }
    },
    [assistant, applyTurn, dispatch],
  );

  const analyzePaperFile = useCallback(
    async (file: File) => {
      const familyId =
        stateRef.current.familyInventory && stateRef.current.currentFamilyIndex !== undefined
          ? stateRef.current.familyInventory[stateRef.current.currentFamilyIndex]
          : undefined;
      if (!familyId || !isDocumentaryFamily(familyId)) return;

      // F012 V2 Phase 2 — famille "impots" (taxe foncière) migrée : chemin
      // document → Expense avec un VRAI LmnpDocument (upload Supabase réel,
      // même pipeline que ChargesDocumentStep.tsx), jamais l'id synthétique
      // `f012-doc-*` ci-dessous. Les autres familles documentaires
      // (assurances/gestion/syndic) restent intégralement sur le chemin
      // `ChargeProposal` historique — aucun comportement hybride pour impots.
      if (familyId === "impots") {
        setBusy(true);
        try {
          const result = await analyzeImpotsDocument(file, fiscalYear);
          if (result.status === "not_authenticated") {
            alert("Utilisateur non connecté");
            return;
          }
          if (result.status === "upload_failed") {
            alert("L'envoi du document a échoué — réessayez.");
            return;
          }
          // Le document est réellement stocké (Storage + table `documents`)
          // dès que l'upload réussit — enregistré ici, que l'extraction
          // réussisse ou non, pour que `REMOVE_DOCUMENT` puisse ensuite le
          // retrouver (§7 : plus jamais un id F012 invisible du registre).
          dispatch({
            type: "UPLOAD_DOCUMENTS",
            files: [
              {
                file: result.uploadedFile,
                documentId: result.documentId,
                isSupabaseDocumentId: true,
                category: IMPOTS_UPLOAD_CATEGORY,
              },
            ],
          });
          if (result.status === "extraction_failed") {
            // Document réel enregistré, mais AUCUNE Expense fabriquée sans
            // donnée réelle (§3.B) — l'utilisateur reste libre de saisir le
            // montant manuellement via le formulaire existant.
            alert("Nous n'avons pas pu lire ce document — vous pouvez renseigner le montant manuellement.");
            return;
          }
          for (const expense of result.expenses) {
            applyTurn(
              await assistant.handle(stateRef.current, {
                type: "receive_taxe_fonciere_expense",
                expense,
              }),
            );
          }
        } finally {
          setBusy(false);
        }
        return;
      }

      // F012 V2 Phase 3 — familles "assurances"/"gestion"/"syndic" migrées :
      // upload réel (même pipeline Supabase que "impots", Phase 2) — jamais
      // plus l'id synthétique `f012-doc-*` ci-dessous pour ces familles. La
      // revue reste `ChargeProposal[]` / `DocumentReviewForm` (aucune
      // nouvelle UI, §1 de la mission) ; seule la persistance au commit
      // change (voir `commit_document_review` → `applyDocumentReviewAsExpenses`).
      setBusy(true);
      try {
        const result = await analyzeDocumentaryReview(file, familyId, fiscalYear);
        if (result.status === "not_authenticated") {
          alert("Utilisateur non connecté");
          return;
        }
        if (result.status === "upload_failed") {
          alert("L'envoi du document a échoué — réessayez.");
          return;
        }
        // Document réellement stocké dès que l'upload réussit — enregistré
        // ici que l'extraction réussisse ou non, pour que REMOVE_DOCUMENT
        // puisse ensuite le retrouver (même garantie que "impots").
        dispatch({
          type: "UPLOAD_DOCUMENTS",
          files: [
            {
              file: result.uploadedFile,
              documentId: result.documentId,
              isSupabaseDocumentId: true,
              category: DOCUMENTARY_REVIEW_UPLOAD_CATEGORY,
            },
          ],
        });
        if (result.status === "extraction_failed") {
          alert("Nous n'avons pas pu lire ce document — vous pouvez renseigner le montant manuellement.");
          return;
        }
        applyTurn(
          await assistant.handle(stateRef.current, {
            type: "receive_document_proposals",
            documentId: result.documentId,
            familyId,
            proposals: result.proposals,
            fileName: file.name,
          }),
        );
      } finally {
        setBusy(false);
      }
    },
    [assistant, applyTurn, dispatch, fiscalYear],
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
      // Correctif post-audit P0 — `confirm_taxe_fonciere_expense` /
      // `ignore_taxe_fonciere_expense` arrivent comme suggestions du message
      // `taxeFonciereExpenseReceivedMessage` (assistant.ts) : avant ce
      // correctif, aucune branche ne les dispatchait ici (cliquer ne faisait
      // rien). `correct_taxe_fonciere_expense` a besoin d'un montant, donc
      // n'est jamais une simple suggestion : elle est câblée directement par
      // `TaxeFonciereReviewForm` (même convention que `DocumentReviewForm`
      // pour `modify_proposal`, qui n'utilise pas non plus `handleSuggestion`).
      if (suggestionId === "confirm_taxe_fonciere_expense") {
        void runAction({ type: "confirm_taxe_fonciere_expense" });
      }
      if (suggestionId === "ignore_taxe_fonciere_expense") {
        void runAction({ type: "ignore_taxe_fonciere_expense" });
      }
      // Blocker #2 — mêmes conventions que ci-dessus : ces deux suggestions
      // arrivent avec le message de conflit de remplacement (`taxeFonciereReplaceMessage`,
      // assistant.ts) et sont aussi câblées directement par `TaxeFonciereReplaceForm`.
      if (suggestionId === "confirm_taxe_fonciere_replace") {
        void runAction({ type: "confirm_taxe_fonciere_replace" });
      }
      if (suggestionId === "decline_taxe_fonciere_replace") {
        void runAction({ type: "decline_taxe_fonciere_replace" });
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
    state.step === "completeness" && state.profil
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
    (state.travauxSubStep === "qualification" ||
      state.travauxSubStep === "split" ||
      state.travauxSubStep === "date");
  // Correctif post-audit P0 — dès qu'une `Expense` "taxe foncière" est en
  // attente de décision (`pendingTaxeFonciereExpense`), l'écran d'upload
  // doit céder la place à `TaxeFonciereReviewForm` : avant ce correctif,
  // `familyPhase` restait "paper" après réception de l'Expense, donc
  // `showPaper` restait vrai et masquait les boutons confirmer/corriger/
  // ignorer (bloc `suggestions` ci-dessous, gardé par `!showPaper`) — ni les
  // clics ni le formulaire de correction n'étaient jamais accessibles.
  const showTaxeFonciereReview = Boolean(state.pendingTaxeFonciereExpense);
  // Blocker #2 — même garde que `showTaxeFonciereReview` ci-dessus : dès
  // qu'un conflit de remplacement est en attente (`pendingTaxeFonciereReplace`),
  // l'écran d'upload générique doit céder la place à `TaxeFonciereReplaceForm`
  // (les deux boutons remplacer/conserver ne sont jamais masqués par
  // `showPaper`, même défaut que celui déjà corrigé pour `showTaxeFonciereReview`).
  const showTaxeFonciereReplace = Boolean(state.pendingTaxeFonciereReplace);
  const showPaper =
    state.step === "category_collect" &&
    state.familyPhase === "paper" &&
    currentFamily !== undefined &&
    isDocumentaryFamily(currentFamily) &&
    !showTaxeFonciereReview &&
    !showTaxeFonciereReplace;
  // Fix 4 (Blocker #2, re-re-audit) — au boundary réel du panel (pas
  // seulement le reducer) : `TaxeFonciereReviewForm`/`TaxeFonciereReplaceForm`
  // et `DocumentReviewForm` ne doivent JAMAIS être actionnables ensemble
  // pour la taxe foncière. Le reducer (assistant.ts) garantit déjà que
  // `documentReview` "impots" et `pendingTaxeFonciereExpense`/
  // `pendingTaxeFonciereReplace` ne coexistent normalement pas, mais cette
  // condition de rendu reste la dernière ligne de défense si un état
  // incohérent existait malgré tout (ex. reprise d'un état persisté
  // antérieur à ce correctif). Scopé strictement à "impots" — un
  // `documentReview` assurances/gestion/syndic n'est jamais masqué par ces
  // deux drapeaux (indépendants de ces familles).
  const showReview =
    state.familyPhase === "review" &&
    Boolean(state.documentReview) &&
    !(state.documentReview?.familyId === "impots" && (showTaxeFonciereReview || showTaxeFonciereReplace));
  const showCategory =
    state.step === "category_collect" &&
    currentCategory &&
    !travauxAwaitingQualification &&
    !showFamilyCard &&
    !showFamilyManual &&
    !showSlotNudge &&
    state.familyPhase !== "unknown_help" &&
    state.familyPhase !== "paper" &&
    state.familyPhase !== "review";
  const travauxSplit = state.travauxSubStep === "split";
  const travauxDate = state.travauxSubStep === "date";
  // Chantier 2 (§8) — un travaux "incertain" résolu en immobilisation (SAV-015)
  // bloque à `confirm_all` faute de date propre (TRF-0028) ; l'anomalie
  // bloquante porte l'id de la charge dans `field`. On identifie ici les
  // items déjà collectés, marqués "incertain", sans `dateDebut`, et
  // réellement cités par une anomalie bloquante — jamais une réouverture de
  // qualification, uniquement la date manquante.
  const pendingIncertainDates =
    state.step === "aggregate_review"
      ? state.collected.travaux.filter(
          (t) =>
            t.choix === "incertain" &&
            t.dateDebut === undefined &&
            state.result?.anomalies.some((a) => a.severity === "error" && a.field === t.id),
        )
      : [];
  // Cycle 4E — même convention que F-010/F-011 : un historique non vide et
  // une étape non terminale, jamais un bouton mort.
  const canGoBack = Boolean(state.history && state.history.length > 0) && state.step !== "complete";
  const lastAssistant = currentTurnAssistants.at(-1);
  const announcement = lastAssistant?.content ?? "";
  const hideEngineQuestion =
    showFamilyCard ||
    showProfilage ||
    showFamilyManual ||
    showSlotNudge ||
    showPaper ||
    showReview ||
    showTaxeFonciereReview ||
    state.step === "completeness" ||
    state.step === "aggregate_review";
  const parsedQuestion = lastAssistant && !hideEngineQuestion ? splitQuestion(lastAssistant.content) : null;
  const { title: questionTitle, body: questionBody } = headingForStep({
    showFamilyCard,
    showProfilage,
    showFamilyManual,
    showSlotNudge,
    showPaper,
    showReview: showReview || showTaxeFonciereReview,
    completeness: state.step === "completeness" ? completenessCopy(fiscalYear) : null,
    isAggregateReview: state.step === "aggregate_review",
    familyPhrase: currentFamily ? familyCardPhrase(currentFamily, fiscalYear) : null,
    parsed: parsedQuestion,
    paidInYear: paidInYearAnchor(fiscalYear),
    lastAssistantContent: lastAssistant?.content,
  });
  const familyTitle = currentFamily ? FAMILY_CARD_TITLES[currentFamily] : null;
  const progress =
    state.step === "category_collect" &&
    state.familyInventory &&
    state.familyInventory.length > 0 &&
    state.currentFamilyIndex !== undefined
      ? `Famille ${state.currentFamilyIndex + 1} sur ${state.familyInventory.length}`
      : null;
  const suggestions =
    lastAssistant?.suggestions &&
    !showFamilyCard &&
    !showProfilage &&
    !showFamilyManual &&
    !showSlotNudge &&
    !showPaper &&
    !showReview &&
    !showTaxeFonciereReview &&
    !showCategory
      ? lastAssistant.suggestions
      : undefined;
  const primarySuggestions = suggestions?.filter((suggestion) => PRIMARY_SUGGESTION_IDS.has(suggestion.id)) ?? [];
  const choiceSuggestions = suggestions?.filter((suggestion) => !PRIMARY_SUGGESTION_IDS.has(suggestion.id)) ?? [];
  const completenessFiletSuggestions =
    state.step === "completeness"
      ? choiceSuggestions.filter((suggestion) => suggestion.id !== "revisit_incomplete")
      : [];
  const showResult =
    Boolean(state.result) && (state.step === "aggregate_review" || state.step === "complete");

  return (
    <div className="mx-auto w-full max-w-lg px-5 pb-12 pt-8 sm:px-6">
      <div aria-live="polite" className="sr-only">
        {announcement}
      </div>
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
          {" · Charges"}
        </p>
        {progress ? (
          <p
            style={{
              ...typography.caption.desktop,
              color: colors.text.tertiary,
              marginTop: spacing.scale[3],
            }}
          >
            {progress}
          </p>
        ) : null}
      </header>

      <div
        key={`${state.step}-${state.currentFamilyIndex ?? "none"}-${state.familyPhase ?? "none"}-${state.travauxSubStep ?? "none"}`}
        className="animate-[fiscal-fade-in_450ms_cubic-bezier(0.16,1,0.3,1)]"
        style={{ pointerEvents: "auto" }}
        onAnimationEnd={(event) => {
          if (event.target !== event.currentTarget) return;
          event.currentTarget.style.animation = "none";
          event.currentTarget.style.transform = "none";
          event.currentTarget.style.pointerEvents = "auto";
        }}
      >
        {showFamilyManual && familyTitle ? (
          <p
            style={{
              ...typography.caption.desktop,
              color: colors.text.muted,
              letterSpacing: typography.letterSpacing.caps,
              textTransform: "uppercase",
              marginBottom: spacing.scale[4],
            }}
          >
            {familyTitle}
          </p>
        ) : null}

        {questionTitle ? (
          <h1
            style={{
              ...typography.sectionTitle.mobile,
              color: colors.text.primary,
              marginBottom: questionBody
                ? spacing.scale[3]
                : state.step === "completeness"
                  ? spacing.scale[5]
                  : spacing.scale[8],
            }}
          >
            {questionTitle}
          </h1>
        ) : null}

        {questionBody ? (
          <p
            style={{
              ...(state.step === "completeness" ? typography.caption.desktop : typography.body.desktop),
              color: colors.text.secondary,
              marginBottom: state.step === "completeness" ? spacing.scale[5] : spacing.scale[8],
              whiteSpace: "pre-wrap",
            }}
          >
            {questionBody}
          </p>
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

        {showPaper && currentFamily && isDocumentaryFamily(currentFamily) ? (
          <FamilyPaperUpload
            familyId={currentFamily}
            disabled={busy}
            onFile={(file) => void analyzePaperFile(file)}
            onManual={() => void runAction({ type: "open_family_manual" })}
          />
        ) : null}

        {showTaxeFonciereReview && state.pendingTaxeFonciereExpense ? (
          <TaxeFonciereReviewForm
            expense={state.pendingTaxeFonciereExpense}
            year={fiscalYear}
            disabled={busy}
            onAction={(action) => void runAction(action)}
          />
        ) : null}

        {showTaxeFonciereReplace && state.pendingTaxeFonciereReplace ? (
          <TaxeFonciereReplaceForm
            existing={state.pendingTaxeFonciereReplace.existing}
            candidate={state.pendingTaxeFonciereReplace.candidate}
            disabled={busy}
            onAction={(action) => void runAction(action)}
          />
        ) : null}

        {showReview && state.documentReview ? (
          <DocumentReviewForm
            review={state.documentReview}
            year={fiscalYear}
            disabled={false}
            onAction={(action) => void runAction(action)}
          />
        ) : null}

        {showReview && lastAssistant && lastAssistant.content.length < 180 ? (
          <p
            style={{
              ...typography.caption.desktop,
              color: colors.text.secondary,
              marginTop: spacing.scale[4],
            }}
          >
            {lastAssistant.content}
          </p>
        ) : null}

        {coverageForRecap.length > 0 ? (
          <div style={{ marginBottom: spacing.scale[6] }}>
            <CoverageRecap
              familyCoverage={coverageForRecap}
              onRevisit={() => void runAction({ type: "revisit_incomplete" })}
            />
          </div>
        ) : null}

        {showResult && state.result ? (
          <div style={{ marginBottom: spacing.scale[8] }}>
            <ResultSummary result={state.result} />
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

        {state.step === "completeness" && completenessFiletSuggestions.length > 0 ? (
          <div className="flex flex-wrap gap-2" style={{ marginTop: spacing.scale[6] }}>
            {completenessFiletSuggestions.map((suggestion) => (
              <QuietChip
                key={suggestion.id}
                label={suggestion.label}
                disabled={busy}
                onClick={() => handleSuggestion(suggestion.id)}
              />
            ))}
          </div>
        ) : null}

        {state.step !== "completeness" && choiceSuggestions.length > 0 ? (
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

        {state.step === "completeness" ? (
          <div style={{ marginTop: spacing.scale[5] }}>
            <CompletenessCatchForm
              year={fiscalYear}
              disabled={busy}
              onSubmit={(freeText) =>
                void runAction({ type: "confirm_completeness", hasOther: true, freeText })
              }
            />
          </div>
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
          <TravauxSplitField
            disabled={busy}
            onSubmit={(value) => void runAction({ type: "submit_travaux_split", montantReparation: value })}
          />
        ) : null}

        {travauxDate ? (
          <TravauxDateField
            disabled={busy}
            onSubmit={(value) => void runAction({ type: "submit_travaux_date", dateDebut: value })}
          />
        ) : null}

        {pendingIncertainDates.map((t) => (
          <div key={t.id} className="flex flex-col gap-2">
            <p style={{ ...typography.caption.desktop, color: colors.text.muted }}>
              « {t.description} » sera amorti : sa date de fin des travaux / mise en service est nécessaire.
            </p>
            <TravauxDateField
              disabled={busy}
              onSubmit={(value) => void runAction({ type: "resolve_travaux_date", travauxId: t.id, dateDebut: value })}
            />
          </div>
        ))}

        {state.step === "complete" ? (
          <div className="flex flex-col gap-2" style={{ marginTop: spacing.scale[4] }}>
            <div className="flex flex-col gap-3 sm:flex-row">
              <Link href={LMNP_ROUTES.amortissementsAssistant} className="flex-1">
                <Button className="w-full">Continuer vers Amortissements</Button>
              </Link>
              <Link href={LMNP_ROUTES.dashboard}>
                <Button variant="secondary" className="w-full">
                  Retour au tableau de bord
                </Button>
              </Link>
            </div>
            <Button
              variant="ghost"
              disabled={busy}
              className="w-full"
              onClick={() => void runAction({ type: "go_back" })}
            >
              Modifier mes réponses
            </Button>
          </div>
        ) : null}

        <GoBackControl visible={canGoBack} disabled={busy} onBack={() => void runAction({ type: "go_back" })} />
      </div>
    </div>
  );
}
