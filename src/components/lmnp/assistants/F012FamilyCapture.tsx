"use client";

import { useState } from "react";

import { Button } from "@/design-system/components/Button";
import { colors } from "@/design-system/theme/colors";
import { radius } from "@/design-system/theme/radius";
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
  padding: spacing.scale[3],
  borderRadius: radius.md,
  border: `1px solid ${colors.border.subtle}`,
  backgroundColor: colors.surface.primary,
  width: "100%",
} as const;

const labelStyle = { ...typography.caption.desktop, color: colors.text.muted } as const;

function parseAmountOptional(value: string): number | undefined {
  return parseStructuredAmount(value);
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
  return (
    <div className="flex flex-col gap-3" style={{ marginTop: spacing.scale[4] }}>
      <p style={{ ...typography.sectionTitle.desktop, color: colors.text.primary }}>
        {FAMILY_CARD_TITLES[familyId]}
      </p>
      <p style={typography.body.desktop}>{familyYearReminder(year)}</p>
      <p style={typography.body.desktop}>{familyCardPhrase(familyId, year)}</p>
      <ul
        style={{
          ...typography.body.desktop,
          margin: 0,
          paddingLeft: spacing.scale[5],
          color: colors.text.secondary,
        }}
      >
        {familyCardExamples(familyId).map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
      {showCreditNote ? (
        <p style={{ ...typography.caption.desktop, color: colors.text.secondary }}>
          {assuranceCreditAlreadyHandledNote()}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" disabled={disabled} onClick={() => onAction({ type: "open_family_paper" })}>
          {labels.paper}
        </Button>
        <Button disabled={disabled} onClick={() => onAction({ type: "open_family_manual" })}>
          {labels.amount}
        </Button>
        <Button variant="secondary" disabled={disabled} onClick={() => onAction({ type: "none_family" })}>
          {labels.none}
        </Button>
        <Button variant="secondary" disabled={disabled} onClick={() => onAction({ type: "unknown_family" })}>
          {labels.unknown}
        </Button>
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
      <div className="flex flex-col gap-3" style={{ marginTop: spacing.scale[4] }}>
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
      <div className="flex flex-col gap-3" style={{ marginTop: spacing.scale[4] }}>
        <p style={typography.body.desktop}>{familyCardPhrase("syndic", year)}</p>
        <label style={labelStyle}>
          {amountPaidLabel(year)}
          <input style={inputStyle} value={syndicMontant} onChange={(e) => setSyndicMontant(e.target.value)} />
        </label>
        {freeTextField}
        <p style={{ ...typography.caption.desktop, color: colors.text.secondary }}>{syndicEpargneQuestion(year)}</p>
        <div className="flex flex-wrap gap-2">
          {(["oui", "non", "unknown"] as const).map((choice) => (
            <Button
              key={choice}
              variant={epargne === choice ? "primary" : "secondary"}
              disabled={disabled}
              onClick={() => setEpargne(choice)}
            >
              {choice === "oui" ? "Oui" : choice === "non" ? "Non" : "Je ne sais pas"}
            </Button>
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
      <div className="flex flex-col gap-3" style={{ marginTop: spacing.scale[4] }}>
        <p style={typography.body.desktop}>{familyCardPhrase("assurances", year)}</p>
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
      <div className="flex flex-col gap-3" style={{ marginTop: spacing.scale[4] }}>
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
      <div className="flex flex-col gap-3" style={{ marginTop: spacing.scale[4] }}>
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
    <div className="flex flex-col gap-3" style={{ marginTop: spacing.scale[4] }}>
      <label style={labelStyle}>
        Si vous vous souvenez d&apos;une dépense payée en {year}, notez-la ici — même plusieurs montants.
        <textarea
          style={{ ...inputStyle, minHeight: 72 }}
          value={freeText}
          onChange={(e) => setFreeText(e.target.value)}
          placeholder="Ex. 1 800 € de syndic, 450 € à un plombier…"
        />
      </label>
      <Button
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
    <div className="flex flex-col gap-3" style={{ marginTop: spacing.scale[4] }}>
      <p style={typography.body.desktop}>{prompt}</p>
      <label style={labelStyle}>
        {amountPaidLabel(year)}
        <input style={inputStyle} value={montant} onChange={(e) => setMontant(e.target.value)} />
      </label>
      <div className="flex flex-wrap gap-2">
        <Button
          disabled={disabled || parseAmountOptional(montant) === undefined}
          onClick={() => {
            const amount = parseAmountOptional(montant);
            if (amount !== undefined) onRespond(true, amount);
          }}
        >
          Oui, l&apos;enregistrer
        </Button>
        <Button variant="secondary" disabled={disabled} onClick={() => onRespond(false)}>
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
    <div className="flex flex-col gap-3" style={{ marginTop: spacing.scale[4] }}>
      <p style={typography.body.desktop}>{paperInviteMessage(familyId)}</p>
      <input
        type="file"
        accept=".pdf,.png,.jpg,.jpeg,.txt"
        disabled={disabled}
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) onFile(file);
        }}
      />
      <Button variant="secondary" disabled={disabled} onClick={onManual}>
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
    <div className="flex flex-col gap-4" style={{ marginTop: spacing.scale[4] }}>
      <p style={{ ...typography.caption.desktop, color: colors.text.muted }}>{reviewRecapMessage(recap)}</p>
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
            <Button
              disabled={disabled}
              onClick={() =>
                onAction({ type: "resolve_document_conflict", choice: "keep_existing", label: conflict.label })
              }
            >
              {`Garder ${conflict.existingAmount.toLocaleString("fr-FR")} €`}
            </Button>
            <Button
              variant="secondary"
              disabled={disabled}
              onClick={() =>
                onAction({ type: "resolve_document_conflict", choice: "use_document", label: conflict.label })
              }
            >
              {`Utiliser ${conflict.incomingAmount.toLocaleString("fr-FR")} €`}
            </Button>
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
                <Button
                  disabled={disabled}
                  aria-label="Renseigner le montant"
                  onClick={() => {
                    const amount = Number((manualAmounts[lead.id] ?? "").replace(",", "."));
                    if (!Number.isFinite(amount)) return;
                    onAction({ type: "fill_proposal_manual", proposalId: lead.id, amount });
                  }}
                >
                  Renseigner
                </Button>
              ) : (
                <Button
                  disabled={disabled || excluded}
                  aria-label="Confirmer"
                  onClick={() => onAction({ type: "confirm_proposal", proposalId: lead.id })}
                >
                  {lead.paymentProven === false && total !== undefined
                    ? `J'ai payé ${total.toLocaleString("fr-FR")} € en ${year}`
                    : "Confirmer"}
                </Button>
              )}
              {!missingAmount && !excluded ? (
                <Button
                  variant="secondary"
                  disabled={disabled}
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
                </Button>
              ) : null}
              <Button
                variant="secondary"
                disabled={disabled}
                aria-label={lead.paymentProven === false && !excluded ? "Je ne sais pas" : "Ignorer"}
                onClick={() => onAction({ type: "ignore_proposal", proposalId: lead.id })}
              >
                {lead.paymentProven === false && !excluded ? "Je ne sais pas" : "Ignorer"}
              </Button>
            </div>
          </div>
        );
      })}

      {showConfirmAll ? (
        <Button
          variant="secondary"
          disabled={disabled}
          aria-label="Tout confirmer"
          onClick={() => onAction({ type: "confirm_all_proposals" })}
        >
          Tout confirmer
        </Button>
      ) : null}
      <Button disabled={disabled} onClick={() => onAction({ type: "commit_document_review" })}>
        Enregistrer les lignes confirmées
      </Button>
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
    <div
      style={{
        marginTop: spacing.scale[4],
        padding: spacing.scale[3],
        borderRadius: radius.md,
        backgroundColor: colors.surface.inset,
      }}
    >
      {familyCoverage.map((row) => (
        <p key={row.familyId} style={typography.body.desktop}>
          {FAMILY_CARD_TITLES[row.familyId]} {coverageMark(row.status)}
        </p>
      ))}
      {remaining ? (
        <p style={{ ...typography.body.desktop, marginTop: spacing.scale[3] }}>{remaining}</p>
      ) : null}
      {remaining && onRevisit ? (
        <div style={{ marginTop: spacing.scale[3] }}>
          <Button variant="secondary" onClick={onRevisit}>
            Revenir sur les informations à compléter
          </Button>
        </div>
      ) : null}
    </div>
  );
}
