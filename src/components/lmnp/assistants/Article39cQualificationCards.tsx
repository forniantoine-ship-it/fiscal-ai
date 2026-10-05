"use client";

/**
 * INT-4 — cartes de qualification contextuelles (plafond d'amortissement, jamais présenté comme « article 39 C »).
 *
 * Le client répond à des FAITS en langage courant ; il ne choisit jamais une classe fiscale. Rien n'est affiché pour un
 * dossier sans F013 v2 explicite ni lorsqu'aucune question n'est pertinente (aucune question inutile). Chaque réponse est
 * écrite par le writer existant (`DECLARATION_PATCH_DRAFT`) : l'invalidation de la génération est celle du reducer.
 */
import { useMemo, useState } from "react";

import { Button } from "@/design-system/components/Button";
import { Card } from "@/design-system/components/Card";
import { colors } from "@/design-system/theme/colors";
import { spacing } from "@/design-system/theme/spacing";
import { typography } from "@/design-system/theme/typography";
import { useLmnp } from "@/lib/lmnp/store";
import {
  ACTIVITY_CHARGE_NATURE_LABELS,
  buildActivityChargeDeclaration,
  buildArticle39cCardsModel,
  buildCfeNoticeDeclaration,
} from "@/lib/lmnp/services/article-39c/qualification-ui-model";
import { buildArticle39cAnswerAction, type Article39cQuestion } from "@/lib/lmnp/services/article-39c/questions";
import { removeActivityCharge } from "@/lib/lmnp/services/article-39c/qualification-writers";
import type { ActivityChargeNature } from "@/lib/lmnp/services/article-39c/qualification-store";

const inputStyle = { border: `1px solid ${colors.border.default}`, borderRadius: 8, padding: "8px 12px", width: "100%" } as const;

function euros(cents: number): string {
  return `${(cents / 100).toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
}

export function Article39cQualificationCards() {
  const { workspace, dispatch } = useLmnp();
  const dossierId = workspace.fiscalYear.dossierId ?? "";
  const model = useMemo(() => buildArticle39cCardsModel({ workspace, expectedDossierId: dossierId }), [workspace, dossierId]);
  const [error, setError] = useState<string | null>(null);
  const [cfeAmount, setCfeAmount] = useState("");
  const [cfeOpen, setCfeOpen] = useState(false);
  const [chargeNature, setChargeNature] = useState<ActivityChargeNature>("ACCOUNTING_FEES");
  const [chargeAmount, setChargeAmount] = useState("");
  const [chargeDescription, setChargeDescription] = useState("");
  const fiscalYear = workspace.fiscalYear.year;

  if (!model.applicable) return null;
  const hasCfe = model.questions.some((q) => q.kind === "CFE_BASE" || q.kind === "CFE_DIVERS_LINK");
  const draft = workspace.declarationDraft;
  const now = () => new Date().toISOString();

  const answer = (question: Article39cQuestion, value: string, choice?: { loanId?: string; lineChoice?: { propertyId: string; lineId: string } }) => {
    const result = buildArticle39cAnswerAction({ draft, question, answer: value, answeredAt: now(), ...choice });
    if (!result.ok) {
      setError(result.reason === "LINE_REQUIRED" || result.reason === "UNKNOWN_LINE" ? "Choisissez la dépense concernée." : "Cette réponse n'a pas pu être enregistrée.");
      return;
    }
    setError(null);
    if (result.action !== undefined) dispatch(result.action as unknown as Parameters<typeof dispatch>[0]);
  };

  return (
    <div className="flex flex-col gap-4" style={{ marginTop: spacing.scale[6] }}>
      {model.questions.length > 0 ? (
        <p style={{ ...typography.caption.desktop, color: colors.text.secondary }}>
          Quelques précisions nous permettent de calculer correctement la part d&apos;amortissement que vous pouvez déduire cette année.
        </p>
      ) : null}

      {model.questions.map((question) => (
        <QuestionCard key={question.questionId} question={question} onAnswer={answer} />
      ))}

      {!hasCfe && !cfeOpen ? (
        <Card>
          <div className="flex flex-col gap-3">
            <p style={typography.body.desktop}>Avez-vous reçu un avis de CFE (cotisation foncière des entreprises) pour {fiscalYear} ?</p>
            <Button variant="secondary" onClick={() => setCfeOpen(true)}>
              Oui, je le renseigne
            </Button>
          </div>
        </Card>
      ) : null}
      {cfeOpen ? (
        <Card>
          <div className="flex flex-col gap-3">
            <label style={typography.body.desktop}>
              Montant de votre avis de CFE {fiscalYear} (€)
              <input style={inputStyle} value={cfeAmount} onChange={(e) => setCfeAmount(e.target.value)} inputMode="decimal" />
            </label>
            <Button
              onClick={() => {
                const result = buildCfeNoticeDeclaration({ draft, fiscalYear, amountText: cfeAmount, answeredAt: now() });
                if (!result.ok) return setError("Indiquez le montant en euros (ex. 541,00).");
                setError(null);
                if (result.action !== undefined) dispatch(result.action as unknown as Parameters<typeof dispatch>[0]);
                setCfeOpen(false);
                setCfeAmount("");
              }}
            >
              Enregistrer
            </Button>
          </div>
        </Card>
      ) : null}

      {model.showActivityCharges ? (
        <Card>
          <div className="flex flex-col gap-3">
            <p style={typography.body.desktop}>Frais qui concernent l&apos;ensemble de votre activité (et non un logement en particulier)</p>
            {model.activityCharges.map((record) => (
              <div key={record.recordId} className="flex items-center justify-between gap-3">
                <span style={typography.body.desktop}>
                  {ACTIVITY_CHARGE_NATURE_LABELS[record.charge.nature]} — {euros(record.charge.amountCents)}
                </span>
                <Button
                  variant="ghost"
                  onClick={() => {
                    const action = removeActivityCharge(draft, record.recordId);
                    if (action !== undefined) dispatch(action as unknown as Parameters<typeof dispatch>[0]);
                  }}
                >
                  Retirer
                </Button>
              </div>
            ))}
            <select style={inputStyle} value={chargeNature} onChange={(e) => setChargeNature(e.target.value as ActivityChargeNature)}>
              {(Object.keys(ACTIVITY_CHARGE_NATURE_LABELS) as ActivityChargeNature[]).map((n) => (
                <option key={n} value={n}>
                  {ACTIVITY_CHARGE_NATURE_LABELS[n]}
                </option>
              ))}
            </select>
            {chargeNature === "OTHER" ? <input style={inputStyle} placeholder="De quoi s'agit-il ?" value={chargeDescription} onChange={(e) => setChargeDescription(e.target.value)} /> : null}
            <input style={inputStyle} placeholder="Montant (€)" value={chargeAmount} onChange={(e) => setChargeAmount(e.target.value)} inputMode="decimal" />
            <Button
              variant="secondary"
              onClick={() => {
                const result = buildActivityChargeDeclaration({ draft, fiscalYear, nature: chargeNature, amountText: chargeAmount, description: chargeDescription, answeredAt: now() });
                if (!result.ok) return setError(result.reason === "DESCRIPTION_REQUIRED" ? "Précisez de quel frais il s'agit." : "Indiquez le montant en euros (ex. 480,00).");
                setError(null);
                if (result.action !== undefined) dispatch(result.action as unknown as Parameters<typeof dispatch>[0]);
                setChargeAmount("");
                setChargeDescription("");
              }}
            >
              Ajouter
            </Button>
          </div>
        </Card>
      ) : null}

      {error !== null ? (
        <p role="alert" style={{ ...typography.caption.desktop, color: colors.text.secondary }}>
          {error}
        </p>
      ) : null}
    </div>
  );
}

function QuestionCard({
  question,
  onAnswer,
}: {
  question: Article39cQuestion;
  onAnswer: (q: Article39cQuestion, value: string, choice?: { loanId?: string; lineChoice?: { propertyId: string; lineId: string } }) => void;
}) {
  const [loanId, setLoanId] = useState<string | undefined>(undefined);
  const [lineKey, setLineKey] = useState<string | undefined>(undefined);
  const loans = question.kind === "BANK_FEE_PURPOSE" ? (question.candidateLoanIds ?? []) : [];
  const lines = question.kind === "CFE_DIVERS_LINK" || question.kind === "ACTIVITY_CHARGE_DUPLICATE" ? (question.candidateLines ?? []) : [];
  return (
    <Card>
      <div className="flex flex-col gap-3">
        <p style={typography.body.desktop}>{question.prompt}</p>
        <p style={{ ...typography.caption.desktop, color: colors.text.secondary }}>Montant concerné : {euros(question.amountCents)}</p>
        {loans.length > 1 ? (
          <label style={typography.caption.desktop}>
            Si c&apos;est le financement : quel prêt ?
            <select style={inputStyle} value={loanId ?? ""} onChange={(e) => setLoanId(e.target.value === "" ? undefined : e.target.value)}>
              <option value="">Je ne sais pas / aucun en particulier</option>
              {loans.map((id) => (
                <option key={id} value={id}>
                  {id}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        {lines.length > 1 ? (
          <label style={typography.caption.desktop}>
            Quelle dépense ?
            <select style={inputStyle} value={lineKey ?? ""} onChange={(e) => setLineKey(e.target.value === "" ? undefined : e.target.value)}>
              <option value="">Choisir…</option>
              {lines.map((l) => (
                <option key={`${l.propertyId}|${l.lineId}`} value={`${l.propertyId}|${l.lineId}`}>
                  {l.description}
                </option>
              ))}
            </select>
          </label>
        ) : lines.length === 1 ? (
          <p style={typography.caption.desktop}>Dépense concernée : « {lines[0]!.description} »</p>
        ) : null}
        <div className="flex flex-col gap-2">
          {question.options.map((option) => (
            <Button
              key={option.value}
              variant="secondary"
              onClick={() => {
                const [propertyId, lineId] = lineKey?.split("|") ?? [];
                onAnswer(question, option.value, {
                  ...(loanId !== undefined ? { loanId } : {}),
                  ...(propertyId !== undefined && lineId !== undefined ? { lineChoice: { propertyId, lineId } } : {}),
                });
              }}
            >
              {option.label}
            </Button>
          ))}
        </div>
      </div>
    </Card>
  );
}
