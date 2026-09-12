"use client";

import { useState } from "react";

import { Button } from "@/design-system/components/Button";
import { colors } from "@/design-system/theme/colors";
import { gradients } from "@/design-system/theme/gradients";
import { motions } from "@/design-system/theme/motions";
import { radius } from "@/design-system/theme/radius";
import { shadows } from "@/design-system/theme/shadows";
import { spacing } from "@/design-system/theme/spacing";
import { typography } from "@/design-system/theme/typography";
import type {
  ChargeFamilyId,
  DocumentaryFamilyId,
  F012Action,
  F012DocumentReview,
  FamilyCoverage,
} from "@/runtime";
import { missingDocumentFieldMessage, paperInviteMessage } from "@/runtime";
import {
  canConfirmAll,
  conflictMessage,
  documentSourceLabel,
  everydayDecisionLabel,
  everydayProposalNote,
  everydayProposalTitle,
  groupDisplayAmount,
  groupProposals,
  reviewRecap,
  reviewRecapMessage,
} from "@/runtime/assistants/f012-charges/document-review-decisions";
import { amountPaidLabel } from "@/runtime/assistants/f012-charges/ux-copy";
import {
  FAMILY_CARD_TITLES,
  assuranceCreditAlreadyHandledNote,
  coverageMark,
  familyActionLabels,
  familyCardExamples,
  familyCardPhrase,
  familyYearReminder,
  remainingIncompleteMessage,
  syndicEpargneQuestion,
} from "@/runtime/assistants/f012-charges/family-ux";
import { resolveDiversSubmitAction } from "@/lib/lmnp/services/f012/f012-divers-form-state";
import { parseStructuredAmount } from "@/runtime/assistants/f012-charges/family-expense-parse";

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

function ChoiceCard({
  label,
  onClick,
  disabled,
  selected = false,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  selected?: boolean;
}) {
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const active = (hovered || focused || selected) && !disabled;

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
        pointerEvents: "auto",
        boxShadow: active ? shadows.card.hover : shadows.card.default,
        transition: motions.hover.card,
      }}
    >
      {label}
    </button>
  );
}

function parseAmountOptional(value: string): number | undefined {
  return parseStructuredAmount(value);
}

/**
 * Boutons de review : bouton natif `type="button"`.
 * Le Button du design system pose `pointer-events: none` quand `disabled`.
 * Après l'analyse d'un document, un re-render imbriqué (persist) monte la
 * review pendant `busy` : le style inline peut garder `pointer-events: none`
 * une fois `busy` redescendu. Les clics traversent alors sans appeler onClick.
 * On n'utilise donc pas ce Button ici, et on force `pointer-events: auto`.
 */
function ReviewActionButton({
  blocked,
  onClick,
  children,
  variant = "primary",
  className = "",
  "aria-label": ariaLabel,
}: {
  blocked?: boolean;
  onClick: () => void;
  children: React.ReactNode;
  variant?: "primary" | "secondary";
  className?: string;
  "aria-label"?: string;
}) {
  const [hovered, setHovered] = useState(false);
  const [pressed, setPressed] = useState(false);
  const primary = variant === "primary";
  return (
    <button
      type="button"
      className={`inline-flex min-h-[44px] items-center justify-center gap-2 ${className}`}
      aria-label={ariaLabel}
      aria-disabled={blocked || undefined}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => {
        setHovered(false);
        setPressed(false);
      }}
      onMouseDown={() => setPressed(true)}
      onMouseUp={() => setPressed(false)}
      onClick={() => {
        if (blocked) return;
        onClick();
      }}
      style={{
        ...typography.button.desktop,
        pointerEvents: "auto",
        cursor: blocked ? "not-allowed" : "pointer",
        opacity: blocked ? 0.5 : 1,
        color: primary ? colors.text.inverse : colors.text.secondary,
        backgroundImage: primary
          ? pressed
            ? gradients.button.primaryPressed
            : hovered
              ? gradients.button.primaryHover
              : gradients.button.primary
          : undefined,
        backgroundColor: primary
          ? undefined
          : hovered
            ? colors.surface.interactive
            : colors.surface.primary,
        border: primary
          ? undefined
          : `1px solid ${hovered ? colors.border.strong : colors.border.default}`,
        borderRadius: radius.full,
        padding: `${spacing.scale[3]} ${spacing.scale[6]}`,
        boxShadow: primary
          ? hovered
            ? shadows.button.primaryHover
            : shadows.button.primary
          : shadows.card.default,
        transition: motions.hover.button,
      }}
    >
      {children}
    </button>
  );
}

const freeTextPlaceholder = "Vous pouvez tout noter d'un coup, même plusieurs montants.";

export function FamilyCard({
  familyId,
  year,
  showCreditNote,
  disabled,
  onAction,
}: {
  familyId: ChargeFamilyId;
  year: number;
  showCreditNote: boolean;
  disabled: boolean;
  onAction: (action: F012Action) => void;
}) {
  const labels = familyActionLabels(year);
  const examples = familyCardExamples(familyId).join(" · ");
  return (
    <div className="flex flex-col">
      <p
        style={{
          ...typography.caption.desktop,
          color: colors.text.muted,
          letterSpacing: typography.letterSpacing.caps,
          textTransform: "uppercase",
          marginBottom: spacing.scale[3],
        }}
      >
        {FAMILY_CARD_TITLES[familyId]}
      </p>
      <h2
        style={{
          ...typography.sectionTitle.mobile,
          color: colors.text.primary,
          marginBottom: spacing.scale[4],
        }}
      >
        {familyCardPhrase(familyId, year)}
      </h2>
      <div style={{ marginBottom: spacing.scale[5] }}>
        <p
          style={{
            ...typography.caption.desktop,
            fontSize: typography.fontSize.xs,
            lineHeight: typography.lineHeight.ui,
            color: colors.text.muted,
            marginBottom: spacing.scale[2],
          }}
        >
          {familyYearReminder(year)}
        </p>
        <p
          style={{
            ...typography.caption.desktop,
            fontSize: typography.fontSize.xs,
            lineHeight: typography.lineHeight.ui,
            color: colors.text.muted,
          }}
        >
          {examples}
        </p>
      </div>
      {showCreditNote ? (
        <p
          style={{
            ...typography.caption.desktop,
            color: colors.text.tertiary,
            marginBottom: spacing.scale[5],
          }}
        >
          {assuranceCreditAlreadyHandledNote()}
        </p>
      ) : null}
      <div className="flex flex-col gap-3">
        <ChoiceCard
          label={labels.paper}
          disabled={disabled}
          onClick={() => onAction({ type: "open_family_paper" })}
        />
        <ChoiceCard
          label={labels.amount}
          disabled={disabled}
          onClick={() => onAction({ type: "open_family_manual" })}
        />
      </div>
      <div className="flex flex-col gap-3" style={{ marginTop: spacing.scale[5] }}>
        <ChoiceCard
          label={labels.none}
          disabled={disabled}
          onClick={() => onAction({ type: "none_family" })}
        />
        <ChoiceCard
          label={labels.unknown}
          disabled={disabled}
          onClick={() => onAction({ type: "unknown_family" })}
        />
      </div>
    </div>
  );
}

export function FamilyManualForm({
  familyId,
  year,
  disabled,
  onAction,
  initialFreeText,
}: {
  familyId: ChargeFamilyId;
  year: number;
  disabled: boolean;
  onAction: (action: F012Action) => void;
  initialFreeText?: string;
}) {
  const [taxe, setTaxe] = useState("");
  const [autre, setAutre] = useState("");
  const [autreDesc, setAutreDesc] = useState("");
  const [syndicMontant, setSyndicMontant] = useState("");
  const [epargne, setEpargne] = useState<"oui" | "non" | "unknown">("unknown");
  const [epargneMontant, setEpargneMontant] = useState("");
  const [assurance, setAssurance] = useState("");
  const [assuranceGli, setAssuranceGli] = useState("");
  const [assuranceDesc, setAssuranceDesc] = useState("");
  const [agence, setAgence] = useState("");
  const [etatLieux, setEtatLieux] = useState("");
  const [miseEnLocation, setMiseEnLocation] = useState("");
  const [comptable, setComptable] = useState("");
  const [gestionDesc, setGestionDesc] = useState("");
  const [fraisBancaires, setFraisBancaires] = useState("");
  const [diversDesc, setDiversDesc] = useState("");
  const [diversMontant, setDiversMontant] = useState("");
  const [freeText, setFreeText] = useState(initialFreeText ?? "");
  const [paidAt, setPaidAt] = useState("");

  const freeTextField = (
    <label style={labelStyle}>
      Plusieurs dépenses d&apos;un coup
      <textarea
        style={{ ...inputStyle, minHeight: 72 }}
        value={freeText}
        onChange={(e) => setFreeText(e.target.value)}
        placeholder={freeTextPlaceholder}
      />
    </label>
  );
  const paidAtField = (
    <label style={labelStyle}>
      Date de paiement (si utile)
      <input
        style={inputStyle}
        value={paidAt}
        onChange={(e) => setPaidAt(e.target.value)}
        placeholder="ex. 12/03/2024 — seulement si ce n'est pas évident"
      />
    </label>
  );
  const paidAtValue = paidAt.trim()
    ? paidAt.trim().match(/(\d{4})/)?.[1]
      ? `${paidAt.trim().match(/(\d{4})/)![1]}-01-01`
      : paidAt.trim()
    : undefined;

  if (familyId === "impots") {
    return (
      <div className="flex flex-col gap-5">
        <p style={{ ...typography.caption.desktop, color: colors.text.secondary }}>
          La taxe foncière n&apos;est pas obligatoire pour continuer — une autre taxe payée en {year} suffit.
        </p>
        <label style={labelStyle}>
          Taxe foncière — {amountPaidLabel(year)}
          <input style={inputStyle} value={taxe} onChange={(e) => setTaxe(e.target.value)} />
        </label>
        <label style={labelStyle}>
          Autre taxe liée au logement ?
          <input
            style={inputStyle}
            value={autreDesc}
            onChange={(e) => setAutreDesc(e.target.value)}
            placeholder="Laisser vide si non"
          />
        </label>
        {autreDesc ? (
          <label style={labelStyle}>
            {amountPaidLabel(year)}
            <input style={inputStyle} value={autre} onChange={(e) => setAutre(e.target.value)} />
          </label>
        ) : null}
        {freeTextField}
        {paidAtField}
        <Button
          className="w-full"
          disabled={disabled}
          onClick={() => {
            const montant = parseAmountOptional(taxe);
            const extra = parseAmountOptional(autre);
            onAction({
              type: "submit_family_impots",
              ...(montant !== undefined ? { taxeFonciere: montant } : {}),
              ...(autreDesc && extra !== undefined ? { autreDescription: autreDesc, autreMontant: extra } : {}),
              ...(freeText.trim() ? { freeText: freeText.trim() } : {}),
              ...(paidAtValue ? { paidAt: paidAtValue } : {}),
            });
          }}
        >
          Enregistrer
        </Button>
      </div>
    );
  }

  if (familyId === "syndic") {
    return (
      <div className="flex flex-col gap-5">
        <label style={labelStyle}>
          {amountPaidLabel(year)}
          <input style={inputStyle} value={syndicMontant} onChange={(e) => setSyndicMontant(e.target.value)} />
        </label>
        {freeTextField}
        <p style={{ ...typography.body.desktop, color: colors.text.secondary }}>{syndicEpargneQuestion(year)}</p>
        <div className="flex flex-col gap-3">
          {(["oui", "non", "unknown"] as const).map((choice) => (
            <ChoiceCard
              key={choice}
              label={choice === "oui" ? "Oui" : choice === "non" ? "Non" : "Je ne sais pas"}
              disabled={disabled}
              selected={epargne === choice}
              onClick={() => setEpargne(choice)}
            />
          ))}
        </div>
        {epargne === "oui" ? (
          <label style={labelStyle}>
            Montant de cette épargne
            <input style={inputStyle} value={epargneMontant} onChange={(e) => setEpargneMontant(e.target.value)} />
          </label>
        ) : null}
        {paidAtField}
        <Button
          className="w-full"
          disabled={disabled}
          onClick={() => {
            const montant = parseAmountOptional(syndicMontant);
            const epargneValue = parseAmountOptional(epargneMontant);
            onAction({
              type: "submit_family_syndic",
              ...(montant !== undefined ? { montantPaye: montant } : {}),
              epargneTravaux: epargne,
              ...(epargne === "oui" && epargneValue !== undefined ? { epargneMontant: epargneValue } : {}),
              ...(freeText.trim() ? { freeText: freeText.trim() } : {}),
              ...(paidAtValue ? { paidAt: paidAtValue } : {}),
            });
          }}
        >
          Enregistrer
        </Button>
      </div>
    );
  }

  if (familyId === "assurances") {
    return (
      <div className="flex flex-col gap-5">
        <label style={labelStyle}>
          Habitation / propriétaire — {amountPaidLabel(year)}
          <input style={inputStyle} value={assurance} onChange={(e) => setAssurance(e.target.value)} />
        </label>
        <label style={labelStyle}>
          Loyers impayés — {amountPaidLabel(year)}
          <input style={inputStyle} value={assuranceGli} onChange={(e) => setAssuranceGli(e.target.value)} />
        </label>
        <label style={labelStyle}>
          De quoi s&apos;agit-il ?
          <input
            style={inputStyle}
            value={assuranceDesc}
            onChange={(e) => setAssuranceDesc(e.target.value)}
            placeholder="Une ou plusieurs assurances du logement — pas celle du crédit"
          />
        </label>
        {freeTextField}
        {paidAtField}
        <Button
          className="w-full"
          disabled={disabled}
          onClick={() => {
            onAction({
              type: "submit_family_assurance",
              ...(parseAmountOptional(assurance) !== undefined ? { montant: parseAmountOptional(assurance) } : {}),
              ...(parseAmountOptional(assuranceGli) !== undefined
                ? { gliMontant: parseAmountOptional(assuranceGli) }
                : {}),
              ...(assuranceDesc.trim() ? { description: assuranceDesc.trim() } : {}),
              ...(freeText.trim() ? { freeText: freeText.trim() } : {}),
              ...(paidAtValue ? { paidAt: paidAtValue } : {}),
            });
          }}
        >
          Enregistrer
        </Button>
      </div>
    );
  }

  if (familyId === "gestion") {
    return (
      <div className="flex flex-col gap-5">
        <label style={labelStyle}>
          Frais de gestion — {amountPaidLabel(year)}
          <input style={inputStyle} value={agence} onChange={(e) => setAgence(e.target.value)} />
        </label>
        <label style={labelStyle}>
          État des lieux
          <input style={inputStyle} value={etatLieux} onChange={(e) => setEtatLieux(e.target.value)} />
        </label>
        <label style={labelStyle}>
          Mise en location
          <input style={inputStyle} value={miseEnLocation} onChange={(e) => setMiseEnLocation(e.target.value)} />
        </label>
        <label style={labelStyle}>
          Comptable ou logiciel — {amountPaidLabel(year)}
          <input style={inputStyle} value={comptable} onChange={(e) => setComptable(e.target.value)} />
        </label>
        <label style={labelStyle}>
          De quoi s&apos;agit-il ?
          <input
            style={inputStyle}
            value={gestionDesc}
            onChange={(e) => setGestionDesc(e.target.value)}
            placeholder="Agence, comptable ou logiciel — pas les frais du crédit"
          />
        </label>
        {freeTextField}
        {paidAtField}
        <Button
          className="w-full"
          disabled={disabled}
          onClick={() => {
            const honorairesGestion = parseAmountOptional(agence);
            const fraisEtatDesLieux = parseAmountOptional(etatLieux);
            const honorairesComptable = parseAmountOptional(comptable);
            const fraisMiseEnLocation = parseAmountOptional(miseEnLocation);
            onAction({
              type: "submit_family_gestion",
              ...(honorairesGestion !== undefined ? { honorairesGestion } : {}),
              ...(fraisEtatDesLieux !== undefined ? { fraisEtatDesLieux } : {}),
              ...(honorairesComptable !== undefined ? { honorairesComptable } : {}),
              ...(fraisMiseEnLocation !== undefined ? { fraisMiseEnLocation } : {}),
              ...(gestionDesc.trim() ? { description: gestionDesc.trim() } : {}),
              ...(freeText.trim() ? { freeText: freeText.trim() } : {}),
              ...(paidAtValue ? { paidAt: paidAtValue } : {}),
            });
          }}
        >
          Enregistrer
        </Button>
      </div>
    );
  }

  if (familyId === "autres") {
    return (
      <div className="flex flex-col gap-5">
        <p style={{ ...typography.caption.desktop, color: colors.text.muted }}>
          Annonce, fournitures, déplacement, frais bancaires liés au logement.
        </p>
        <label style={labelStyle}>
          Frais du compte — {amountPaidLabel(year)}
          <input style={inputStyle} value={fraisBancaires} onChange={(e) => setFraisBancaires(e.target.value)} />
        </label>
        <label style={labelStyle}>
          Autre dépense
          <input style={inputStyle} value={diversDesc} onChange={(e) => setDiversDesc(e.target.value)} />
        </label>
        <label style={labelStyle}>
          {amountPaidLabel(year)}
          <input style={inputStyle} value={diversMontant} onChange={(e) => setDiversMontant(e.target.value)} />
        </label>
        {freeTextField}
        {paidAtField}
        <Button
          className="w-full"
          disabled={disabled}
          onClick={() => {
            const bank = parseAmountOptional(fraisBancaires);
            const diversAction = resolveDiversSubmitAction({
              description: diversDesc,
              montant: diversMontant,
            });
            onAction({
              type: "submit_family_autres",
              ...(bank !== undefined ? { fraisBancaires: bank } : {}),
              ...(diversAction?.type === "submit_divers"
                ? { diversDescription: diversAction.description, diversMontant: diversAction.montant }
                : {}),
              ...(freeText.trim() ? { freeText: freeText.trim() } : {}),
              ...(paidAtValue ? { paidAt: paidAtValue } : {}),
            });
          }}
        >
          Enregistrer
        </Button>
      </div>
    );
  }

  return null;
}

export function CompletenessCatchForm({
  year,
  disabled,
  onSubmit,
}: {
  year: number;
  disabled: boolean;
  onSubmit: (freeText: string) => void;
}) {
  const [freeText, setFreeText] = useState("");
  return (
    <div className="flex flex-col gap-3">
      <p style={{ ...typography.caption.desktop, color: colors.text.tertiary }}>
        Si vous vous souvenez d&apos;une dépense payée en {year}, notez-la ici — même plusieurs montants.
      </p>
      <textarea
        style={{ ...inputStyle, minHeight: 64 }}
        value={freeText}
        onChange={(e) => setFreeText(e.target.value)}
        placeholder="Ex. 1 800 € de syndic, 450 € à un plombier…"
        aria-label={`Si vous vous souvenez d'une dépense payée en ${year}, notez-la ici — même plusieurs montants.`}
      />
      <Button
        variant="secondary"
        className="w-full"
        disabled={disabled || !freeText.trim()}
        onClick={() => onSubmit(freeText.trim())}
      >
        Enregistrer cette dépense
      </Button>
    </div>
  );
}

export function SlotNudgeForm({
  prompt,
  year,
  disabled,
  onRespond,
}: {
  prompt: string;
  year: number;
  disabled: boolean;
  onRespond: (accepted: boolean, montant?: number) => void;
}) {
  const [montant, setMontant] = useState("");
  return (
    <div className="flex flex-col gap-5">
      <h2
        style={{
          ...typography.sectionTitle.mobile,
          color: colors.text.primary,
        }}
      >
        {prompt}
      </h2>
      <label style={labelStyle}>
        {amountPaidLabel(year)}
        <input style={inputStyle} value={montant} onChange={(e) => setMontant(e.target.value)} />
      </label>
      <div className="flex flex-col gap-3">
        <Button
          className="w-full"
          disabled={disabled || parseAmountOptional(montant) === undefined}
          onClick={() => {
            const amount = parseAmountOptional(montant);
            if (amount !== undefined) onRespond(true, amount);
          }}
        >
          Oui, l&apos;enregistrer
        </Button>
        <Button variant="secondary" className="w-full" disabled={disabled} onClick={() => onRespond(false)}>
          Non
        </Button>
      </div>
    </div>
  );
}

export function FamilyPaperUpload({
  familyId,
  disabled,
  onFile,
  onManual,
}: {
  familyId: DocumentaryFamilyId;
  disabled: boolean;
  onFile: (file: File) => void;
  onManual: () => void;
}) {
  return (
    <div className="flex flex-col gap-5">
      <h2
        style={{
          ...typography.sectionTitle.mobile,
          color: colors.text.primary,
        }}
      >
        {paperInviteMessage(familyId)}
      </h2>
      <input
        type="file"
        accept=".pdf,.png,.jpg,.jpeg,.txt"
        disabled={disabled}
        aria-label="Importer un document de charge"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) onFile(file);
        }}
      />
      <Button variant="secondary" className="w-full" disabled={disabled} onClick={onManual}>
        Je connais un montant
      </Button>
    </div>
  );
}

export function DocumentReviewForm({
  review,
  year,
  disabled,
  onAction,
}: {
  review: F012DocumentReview;
  year: number;
  disabled: boolean;
  onAction: (action: F012Action) => void;
}) {
  const [manualAmounts, setManualAmounts] = useState<Record<string, string>>({});
  const [editingId, setEditingId] = useState<string | undefined>();
  const groups = groupProposals(review.proposals);
  const recap = reviewRecap(review.proposals);
  const openConflicts = (review.conflicts ?? []).filter(
    (conflict) => conflict.choice !== "keep_existing" && conflict.choice !== "use_document",
  );
  const showConfirmAll = canConfirmAll(review.proposals, review.conflicts);

  return (
    <div className="flex flex-col gap-5">
      <p style={{ ...typography.caption.desktop, color: colors.text.tertiary }}>{reviewRecapMessage(recap)}</p>
      {review.fileName ? (
        <p style={{ ...typography.caption.desktop, color: colors.text.muted }}>Document utilisé : {review.fileName}</p>
      ) : null}

      {openConflicts.map((conflict) => (
        <div
          key={`${conflict.label}-${conflict.existingAmount}-${conflict.incomingAmount}`}
          role="region"
          aria-label="Montants différents"
          style={{
            padding: spacing.scale[3],
            borderRadius: radius.md,
            border: `1px solid ${colors.border.subtle}`,
            backgroundColor: colors.surface.inset,
          }}
        >
          <p style={{ ...typography.body.desktop, whiteSpace: "pre-wrap" }}>{conflictMessage(conflict)}</p>
          <div className="flex flex-wrap gap-2" style={{ marginTop: spacing.scale[2] }}>
            <ReviewActionButton
              blocked={disabled}
              onClick={() =>
                onAction({ type: "resolve_document_conflict", choice: "keep_existing", label: conflict.label })
              }
            >
              {`Garder ${conflict.existingAmount.toLocaleString("fr-FR")} €`}
            </ReviewActionButton>
            <ReviewActionButton
              variant="secondary"
              blocked={disabled}
              onClick={() =>
                onAction({ type: "resolve_document_conflict", choice: "use_document", label: conflict.label })
              }
            >
              {`Utiliser ${conflict.incomingAmount.toLocaleString("fr-FR")} €`}
            </ReviewActionButton>
          </div>
        </div>
      ))}

      {groups.map((group) => {
        const lead = group[0]!;
        const total = groupDisplayAmount(group);
        const missingAmount = total === undefined;
        const excluded = Boolean(lead.exclusionReason);
        const status = everydayDecisionLabel(
          group.every((item) => item.decision === "ignored")
            ? "ignored"
            : group.some((item) => item.decision === "modified")
              ? "modified"
              : group.every((item) => item.decision === "confirmed" || Boolean(item.exclusionReason))
                ? "confirmed"
                : "pending",
        );
        const note = everydayProposalNote(lead);
        return (
          <div
            key={lead.groupId ?? lead.id}
            style={{
              padding: spacing.scale[3],
              borderRadius: radius.md,
              border: `1px solid ${colors.border.subtle}`,
            }}
          >
            <p style={typography.body.desktop}>{everydayProposalTitle(lead)}</p>
            <p style={{ ...typography.caption.desktop, color: colors.text.muted }}>
              {total !== undefined ? `${total.toLocaleString("fr-FR")} €` : "montant à renseigner"}
              {lead.exercise ? ` · ${lead.exercise}` : ""}
              {lead.paymentDate ? ` · payé le ${lead.paymentDate}` : ""}
              {` · ${documentSourceLabel()}`}
              {` · ${status}`}
            </p>
            {group.length > 1 ? (
              <ul style={{ ...typography.caption.desktop, color: colors.text.secondary, marginTop: spacing.scale[2] }}>
                {group.map((item) => (
                  <li key={item.id}>
                    {item.description} — {item.amount !== undefined ? `${item.amount.toLocaleString("fr-FR")} €` : "montant à renseigner"}
                  </li>
                ))}
              </ul>
            ) : null}
            {note ? (
              <p style={{ ...typography.caption.desktop, color: colors.text.secondary }}>{note}</p>
            ) : null}
            {missingAmount ? (
              <p style={{ ...typography.caption.desktop, color: colors.text.muted }}>{missingDocumentFieldMessage()}</p>
            ) : null}
            {missingAmount || editingId === lead.id ? (
              <label style={labelStyle}>
                {amountPaidLabel(year)}
                <input
                  style={inputStyle}
                  aria-label={missingAmount ? "Renseigner le montant" : "Corriger le montant"}
                  value={manualAmounts[lead.id] ?? ""}
                  onChange={(event) =>
                    setManualAmounts((current) => ({ ...current, [lead.id]: event.target.value }))
                  }
                />
              </label>
            ) : null}
            <div className="flex flex-wrap gap-2" style={{ marginTop: spacing.scale[2] }}>
              {missingAmount ? (
                <ReviewActionButton
                  blocked={disabled}
                  aria-label="Renseigner le montant"
                  onClick={() => {
                    const amount = Number((manualAmounts[lead.id] ?? "").replace(",", "."));
                    if (!Number.isFinite(amount)) return;
                    onAction({ type: "fill_proposal_manual", proposalId: lead.id, amount });
                  }}
                >
                  Renseigner
                </ReviewActionButton>
              ) : (
                <ReviewActionButton
                  blocked={disabled || excluded}
                  aria-label="Confirmer"
                  onClick={() => onAction({ type: "confirm_proposal", proposalId: lead.id })}
                >
                  {lead.paymentProven === false && total !== undefined
                    ? `J'ai payé ${total.toLocaleString("fr-FR")} € en ${year}`
                    : "Confirmer"}
                </ReviewActionButton>
              )}
              {!missingAmount && !excluded ? (
                <ReviewActionButton
                  variant="secondary"
                  blocked={disabled}
                  aria-label="Modifier"
                  onClick={() => {
                    if (editingId !== lead.id) {
                      setEditingId(lead.id);
                      return;
                    }
                    const amount = Number((manualAmounts[lead.id] ?? "").replace(",", "."));
                    if (!Number.isFinite(amount)) return;
                    onAction({ type: "modify_proposal", proposalId: lead.id, amount });
                    setEditingId(undefined);
                  }}
                >
                  {editingId === lead.id ? "Enregistrer la correction" : "Modifier"}
                </ReviewActionButton>
              ) : null}
              <ReviewActionButton
                variant="secondary"
                blocked={disabled}
                aria-label={lead.paymentProven === false && !excluded ? "Je ne sais pas" : "Ignorer"}
                onClick={() => onAction({ type: "ignore_proposal", proposalId: lead.id })}
              >
                {lead.paymentProven === false && !excluded ? "Je ne sais pas" : "Ignorer"}
              </ReviewActionButton>
            </div>
          </div>
        );
      })}

      {showConfirmAll ? (
        <ReviewActionButton
          variant="secondary"
          className="w-full"
          blocked={disabled}
          aria-label="Tout confirmer"
          onClick={() => onAction({ type: "confirm_all_proposals" })}
        >
          Tout confirmer
        </ReviewActionButton>
      ) : null}
      <ReviewActionButton
        className="w-full"
        blocked={disabled}
        onClick={() => onAction({ type: "commit_document_review" })}
      >
        Enregistrer les lignes confirmées
      </ReviewActionButton>
    </div>
  );
}

export function CoverageRecap({
  familyCoverage,
  onRevisit,
}: {
  familyCoverage: FamilyCoverage[];
  onRevisit?: () => void;
}) {
  const remaining = remainingIncompleteMessage(familyCoverage);
  return (
    <div>
      {familyCoverage.map((row) => (
        <div
          key={row.familyId}
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: spacing.scale[4],
            padding: `${spacing.scale[2]} 0`,
          }}
        >
          <span style={{ ...typography.caption.desktop, color: colors.text.tertiary }}>
            {FAMILY_CARD_TITLES[row.familyId]}
          </span>
          <span style={{ ...typography.caption.desktop, color: colors.text.secondary }}>{coverageMark(row.status)}</span>
        </div>
      ))}
      {remaining ? (
        <p style={{ ...typography.caption.desktop, color: colors.text.tertiary, marginTop: spacing.scale[3] }}>
          {remaining}
        </p>
      ) : null}
      {remaining && onRevisit ? (
        <button
          type="button"
          onClick={onRevisit}
          style={{
            display: "block",
            marginTop: spacing.scale[3],
            minHeight: 44,
            padding: `${spacing.scale[2]} 0`,
            background: "none",
            border: "none",
            color: colors.text.tertiary,
            ...typography.caption.desktop,
            cursor: "pointer",
          }}
        >
          Revenir sur les informations à compléter
        </button>
      ) : null}
    </div>
  );
}
