"use client";

import { colors } from "@/design-system/theme/colors";
import { radius } from "@/design-system/theme/radius";
import { spacing } from "@/design-system/theme/spacing";
import { typography } from "@/design-system/theme/typography";
import {
  EXTERNAL_TAKEOVER_COPY,
  CLASSIFICATION_OPTIONS,
  PRORATA_OPTIONS,
} from "./external-takeover-copy";
import {
  blankDeficitAmountDraft,
  formatEuro,
  parseDeficitAmountDrafts,
  parseExplicitArdAmount,
  type AutoConfirmedAssetRow,
  type ClientExceptionQuestion,
  type DeficitAmountDraft,
} from "./external-takeover-view-model";
import { isExplicitAnswer, type TakeoverReviewAnswers } from "@/lib/lmnp/services/takeover/review-answers";
import type { Property } from "@/lib/lmnp/types";
import type { OpeningProrataConvention } from "@/lib/lmnp/services/fiscal-year-opening/types";
import type { CandidateAssetClassification } from "@/lib/lmnp/services/takeover/asset-candidates";
import type { OpeningDeficitRow } from "@/lib/lmnp/services/fiscal-year-opening/types";
import { useState } from "react";

export function ExternalTakeoverAutoConfirmed({
  rows,
  controlsOk,
}: {
  rows: AutoConfirmedAssetRow[];
  controlsOk: boolean;
}) {
  if (rows.length === 0 && !controlsOk) return null;
  return (
    <div className="space-y-3" aria-label="Informations récupérées">
      {rows.map((row) => (
        <div
          key={row.candidateKey}
          style={{
            borderRadius: radius.md,
            border: `1px solid ${colors.border.default}`,
            padding: spacing.scale[3],
          }}
        >
          <p style={{ ...typography.body.desktop, color: colors.text.accent }}>
            ✓ {row.label}
          </p>
          {row.coutBrut !== undefined ? (
            <p style={{ ...typography.caption.desktop, color: colors.text.secondary }}>
              {EXTERNAL_TAKEOVER_COPY.historicalValue} : {formatEuro(row.coutBrut)}
            </p>
          ) : null}
          {row.cumulOuverture !== undefined ? (
            <p style={{ ...typography.caption.desktop, color: colors.text.secondary }}>
              {EXTERNAL_TAKEOVER_COPY.priorDepreciation} : {formatEuro(row.cumulOuverture)}
            </p>
          ) : null}
        </div>
      ))}
      {controlsOk ? (
        <p style={{ ...typography.body.desktop, color: colors.text.accent }}>
          ✓ {EXTERNAL_TAKEOVER_COPY.controlsOk}
        </p>
      ) : null}
    </div>
  );
}

export function ExternalTakeoverExceptionForms({
  questions,
  properties,
  onProperty,
  onPropertyBulkYes,
  onPropertyBulkNo,
  onProrata,
  onClassification,
  onClassificationSuggestionsConfirm,
  onDeficitsNone,
  onDeficitsRows,
  onDeficitsUnknown,
  onArdNone,
  onArdAmount,
  onArdUnknown,
  reviewAnswers,
  stockNotices,
}: {
  questions: ClientExceptionQuestion[];
  properties: Property[];
  onProperty: (candidateKey: string, propertyId: string) => void;
  onPropertyBulkYes: (candidateKeys: string[], propertyId: string) => void;
  onPropertyBulkNo: () => void;
  onProrata: (candidateKey: string, value: OpeningProrataConvention) => void;
  onClassification: (candidateKey: string, value: CandidateAssetClassification) => void;
  onClassificationSuggestionsConfirm: (
    items: Array<{ candidateKey: string; classification: CandidateAssetClassification }>,
  ) => void;
  onDeficitsNone: () => void;
  onDeficitsRows: (rows: OpeningDeficitRow[]) => void;
  onDeficitsUnknown: () => void;
  onArdNone: () => void;
  onArdAmount: (amount: number) => void;
  onArdUnknown: () => void;
  reviewAnswers?: TakeoverReviewAnswers;
  stockNotices?: { deficits: boolean; ard: boolean };
}) {
  const deficitsOpen = questions.some((q) => q.code === "DEFICITS_REQUIRED");
  const ardOpen = questions.some((q) => q.code === "ARD_REQUIRED");
  const showDeficitsRecap =
    !deficitsOpen && isExplicitAnswer(reviewAnswers?.deficits);
  const showArdRecap =
    !ardOpen && isExplicitAnswer(reviewAnswers?.amortissementsReportes);
  if (questions.length === 0 && !showDeficitsRecap && !showArdRecap) return null;
  return (
    <div className="space-y-4" aria-label="Informations à confirmer">
      {questions.map((q) => {
        if (q.code === "PROPERTY_BULK_CONFIRM") {
          return (
            <fieldset key={q.code} className="space-y-2" style={fieldStyle}>
              <legend style={legendStyle}>
                {EXTERNAL_TAKEOVER_COPY.propertyBulkQuestion(q.assetCount, q.propertyLabel)}
              </legend>
              <div className="flex flex-col gap-2 sm:flex-row">
                <button
                  type="button"
                  className="min-h-[40px]"
                  style={optionStyle}
                  onClick={() => onPropertyBulkYes(q.candidateKeys, q.propertyId)}
                >
                  {EXTERNAL_TAKEOVER_COPY.propertyBulkYes}
                </button>
                <button
                  type="button"
                  className="min-h-[40px]"
                  style={optionStyle}
                  onClick={onPropertyBulkNo}
                >
                  {EXTERNAL_TAKEOVER_COPY.propertyBulkNo}
                </button>
              </div>
            </fieldset>
          );
        }
        if (q.code === "PROPERTY_MATCH_REQUIRED") {
          return (
            <PropertyQuestion
              key={`${q.code}-${q.candidateKey}`}
              question={q}
              properties={properties}
              onSelect={(propertyId) => onProperty(q.candidateKey, propertyId)}
            />
          );
        }
        if (q.code === "PRORATA_REQUIRED") {
          return (
            <ChoiceQuestion
              key={`${q.code}-${q.candidateKey}`}
              title={`${EXTERNAL_TAKEOVER_COPY.prorataQuestion} (${q.assetLabel})`}
              help={EXTERNAL_TAKEOVER_COPY.prorataHelp}
              options={PRORATA_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
              onSelect={(value) => onProrata(q.candidateKey, value as OpeningProrataConvention)}
            />
          );
        }
        if (q.code === "CLASSIFICATION_COMPACT_REVIEW") {
          return (
            <ClassificationCompactReview
              key={q.code}
              items={q.items}
              onClassification={onClassification}
              onConfirmSuggestions={onClassificationSuggestionsConfirm}
            />
          );
        }
        if (q.code === "DEFICITS_REQUIRED") {
          return (
            <DeficitsQuestion
              key={q.code}
              onNone={onDeficitsNone}
              onRows={onDeficitsRows}
              onUnknown={onDeficitsUnknown}
              stillNeeded={Boolean(stockNotices?.deficits)}
            />
          );
        }
        if (q.code === "ARD_REQUIRED") {
          return (
            <ArdQuestion
              key={q.code}
              onNone={onArdNone}
              onAmount={onArdAmount}
              onUnknown={onArdUnknown}
              stillNeeded={Boolean(stockNotices?.ard)}
            />
          );
        }
        return null;
      })}
      {showDeficitsRecap && reviewAnswers?.deficits ? (
        <StockAnswerRecap
          key="deficits-recap"
          title={EXTERNAL_TAKEOVER_COPY.deficitsQuestion}
          summary={deficitAnswerSummary(reviewAnswers.deficits.value)}
          onChange={onDeficitsUnknown}
        />
      ) : null}
      {showArdRecap && reviewAnswers?.amortissementsReportes ? (
        <StockAnswerRecap
          key="ard-recap"
          title={EXTERNAL_TAKEOVER_COPY.ardQuestion}
          summary={ardAnswerSummary(reviewAnswers.amortissementsReportes.value)}
          onChange={onArdUnknown}
        />
      ) : null}
    </div>
  );
}

function deficitAnswerSummary(rows: OpeningDeficitRow[]): string {
  if (rows.length === 0) return EXTERNAL_TAKEOVER_COPY.deficitsNo;
  return rows.map((row) => `${row.millesime} : ${formatEuro(row.montant)}`).join(" · ");
}

function ardAnswerSummary(amount: number): string {
  if (amount === 0) return EXTERNAL_TAKEOVER_COPY.ardNo;
  return formatEuro(amount);
}

function StockAnswerRecap({
  title,
  summary,
  onChange,
}: {
  title: string;
  summary: string;
  onChange: () => void;
}) {
  return (
    <fieldset className="space-y-2" style={fieldStyle}>
      <legend style={legendStyle}>{title}</legend>
      <p style={{ ...typography.body.desktop, color: colors.text.secondary }}>{summary}</p>
      <button type="button" className="min-h-[40px] text-left" style={optionStyle} onClick={onChange}>
        {EXTERNAL_TAKEOVER_COPY.changeAnswer}
      </button>
    </fieldset>
  );
}

function StockStillNeeded({ show }: { show: boolean }) {
  if (!show) return null;
  return (
    <p role="status" style={{ ...typography.body.desktop, color: colors.text.primary }}>
      {EXTERNAL_TAKEOVER_COPY.stockStillNeeded}
    </p>
  );
}

function ClassificationCompactReview({
  items,
  onClassification,
  onConfirmSuggestions,
}: {
  items: Extract<ClientExceptionQuestion, { code: "CLASSIFICATION_COMPACT_REVIEW" }>["items"];
  onClassification: (candidateKey: string, value: CandidateAssetClassification) => void;
  onConfirmSuggestions: (
    items: Array<{ candidateKey: string; classification: CandidateAssetClassification }>,
  ) => void;
}) {
  const suggestedItems = items.filter(
    (item): item is typeof item & { suggested: CandidateAssetClassification } =>
      Boolean(item.suggested),
  );

  return (
    <fieldset className="space-y-3" style={fieldStyle}>
      <legend style={legendStyle}>{EXTERNAL_TAKEOVER_COPY.classificationReviewTitle}</legend>
      <p style={{ ...typography.body.desktop, color: colors.text.secondary }}>
        {EXTERNAL_TAKEOVER_COPY.classificationReviewIntro(items.length)}
      </p>
      <p style={{ ...typography.caption.desktop, color: colors.text.secondary }}>
        {EXTERNAL_TAKEOVER_COPY.classificationSaveProgress(0, items.length)}
      </p>

      {suggestedItems.length >= 1 ? (
        <button
          type="button"
          className="min-h-[40px]"
          style={optionStyle}
          onClick={() =>
            onConfirmSuggestions(
              suggestedItems.map((item) => ({
                candidateKey: item.candidateKey,
                classification: item.suggested,
              })),
            )
          }
        >
          {EXTERNAL_TAKEOVER_COPY.classificationSuggestionsConfirm}
        </button>
      ) : null}

      <ul className="space-y-3" aria-label="Éléments à classer">
        {items.map((item) => {
          const optionLabel = (value: CandidateAssetClassification) =>
            CLASSIFICATION_OPTIONS.find((o) => o.value === value)?.label ?? value;
          const selectId = `classification-${item.candidateKey}`;
          return (
            <li
              key={item.candidateKey}
              className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-4"
              style={{
                borderTop: `1px solid ${colors.border.default}`,
                paddingTop: spacing.scale[3],
              }}
            >
              <div className="min-w-0 flex-1 space-y-1">
                <label
                  htmlFor={selectId}
                  style={{ ...typography.body.desktop, color: colors.text.primary }}
                >
                  {item.assetLabel}
                </label>
                {item.assetHint ? (
                  <p style={{ ...typography.caption.desktop, color: colors.text.secondary }}>
                    {item.assetHint}
                  </p>
                ) : null}
                {item.suggested ? (
                  <p style={{ ...typography.caption.desktop, color: colors.text.accent }}>
                    {EXTERNAL_TAKEOVER_COPY.classificationProposed(optionLabel(item.suggested))}
                  </p>
                ) : null}
              </div>
              <select
                id={selectId}
                className="min-h-[40px] w-full sm:w-[220px] shrink-0"
                style={inputStyle}
                defaultValue=""
                onChange={(e) => {
                  const raw = e.target.value;
                  if (!raw) return;
                  onClassification(item.candidateKey, raw as CandidateAssetClassification);
                }}
              >
                <option value="">{EXTERNAL_TAKEOVER_COPY.classificationSelectPlaceholder}</option>
                {CLASSIFICATION_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </li>
          );
        })}
      </ul>
    </fieldset>
  );
}

function PropertyQuestion({
  question,
  properties,
  onSelect,
}: {
  question: Extract<ClientExceptionQuestion, { code: "PROPERTY_MATCH_REQUIRED" }>;
  properties: Property[];
  onSelect: (propertyId: string) => void;
}) {
  return (
    <fieldset className="space-y-2" style={fieldStyle}>
      <legend style={legendStyle}>{EXTERNAL_TAKEOVER_COPY.propertyQuestion}</legend>
      <p style={{ ...typography.caption.desktop, color: colors.text.secondary }}>
        {question.assetLabel}
        {question.assetHint ? ` — ${question.assetHint}` : ""}
      </p>
      <div className="flex flex-col gap-2">
        {properties.map((p) => (
          <button
            key={p.id}
            type="button"
            className="min-h-[40px] text-left"
            style={optionStyle}
            onClick={() => onSelect(p.id)}
          >
            {p.label || p.address || p.id}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

function ChoiceQuestion({
  title,
  help,
  options,
  onSelect,
}: {
  title: string;
  help?: string;
  options: { value: string; label: string }[];
  onSelect: (value: string) => void;
}) {
  return (
    <fieldset className="space-y-2" style={fieldStyle}>
      <legend style={legendStyle}>{title}</legend>
      {help ? (
        <p style={{ ...typography.caption.desktop, color: colors.text.secondary }}>{help}</p>
      ) : null}
      <div className="flex flex-col gap-2">
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            className="min-h-[40px] text-left"
            style={optionStyle}
            onClick={() => onSelect(o.value)}
          >
            {o.label}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

function DeficitsQuestion({
  onNone,
  onRows,
  onUnknown,
  stillNeeded,
}: {
  onNone: () => void;
  onRows: (rows: OpeningDeficitRow[]) => void;
  onUnknown: () => void;
  stillNeeded: boolean;
}) {
  const [mode, setMode] = useState<"ask" | "yes">("ask");
  const [rows, setRows] = useState<DeficitAmountDraft[]>([
    blankDeficitAmountDraft(new Date().getFullYear() - 1),
  ]);
  const [error, setError] = useState<string | null>(null);

  if (mode === "ask") {
    return (
      <fieldset className="space-y-2" style={fieldStyle}>
        <legend style={legendStyle}>{EXTERNAL_TAKEOVER_COPY.deficitsQuestion}</legend>
        <p style={{ ...typography.caption.desktop, color: colors.text.secondary }}>
          {EXTERNAL_TAKEOVER_COPY.deficitsUnknownHelp}
        </p>
        <StockStillNeeded show={stillNeeded} />
        <div className="flex flex-col gap-2">
          <button type="button" className="min-h-[40px] text-left" style={optionStyle} onClick={() => setMode("yes")}>
            {EXTERNAL_TAKEOVER_COPY.deficitsYes}
          </button>
          <button type="button" className="min-h-[40px] text-left" style={optionStyle} onClick={onNone}>
            {EXTERNAL_TAKEOVER_COPY.deficitsNo}
          </button>
          <button type="button" className="min-h-[40px] text-left" style={optionStyle} onClick={onUnknown}>
            {EXTERNAL_TAKEOVER_COPY.unknown}
          </button>
        </div>
      </fieldset>
    );
  }

  return (
    <fieldset className="space-y-3" style={fieldStyle}>
      <legend style={legendStyle}>{EXTERNAL_TAKEOVER_COPY.deficitsQuestion}</legend>
      <StockStillNeeded show={stillNeeded} />
      {rows.map((row, index) => (
        <div key={index} className="flex flex-wrap gap-3">
          <label className="flex flex-col gap-1" style={typography.caption.desktop}>
            {EXTERNAL_TAKEOVER_COPY.millesimeLabel}
            <input
              type="number"
              inputMode="numeric"
              value={row.millesime}
              aria-invalid={Boolean(error)}
              onChange={(e) => {
                const next = [...rows];
                next[index] = { ...row, millesime: e.target.value };
                setRows(next);
              }}
              style={inputStyle}
            />
          </label>
          <label className="flex flex-col gap-1" style={typography.caption.desktop}>
            {EXTERNAL_TAKEOVER_COPY.montantLabel}
            <input
              type="number"
              inputMode="decimal"
              min={0}
              step="1"
              value={row.montant}
              aria-invalid={Boolean(error)}
              onChange={(e) => {
                const next = [...rows];
                next[index] = { ...row, montant: e.target.value };
                setRows(next);
              }}
              style={inputStyle}
            />
          </label>
        </div>
      ))}
      {error ? (
        <p role="alert" style={{ ...typography.caption.desktop, color: colors.error.DEFAULT }}>
          {error}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          style={optionStyle}
          onClick={() =>
            setRows([...rows, blankDeficitAmountDraft(new Date().getFullYear() - 1)])
          }
        >
          {EXTERNAL_TAKEOVER_COPY.addDeficitLine}
        </button>
        <button
          type="button"
          style={optionStyle}
          onClick={() => {
            const parsed = parseDeficitAmountDrafts(rows);
            if (!parsed) {
              setError("Indiquez une année et un montant valides pour chaque ligne.");
              return;
            }
            setError(null);
            onRows(parsed);
          }}
        >
          {EXTERNAL_TAKEOVER_COPY.confirm}
        </button>
        <button type="button" className="min-h-[40px] text-left" style={optionStyle} onClick={onUnknown}>
          {EXTERNAL_TAKEOVER_COPY.unknown}
        </button>
      </div>
    </fieldset>
  );
}

function ArdQuestion({
  onNone,
  onAmount,
  onUnknown,
  stillNeeded,
}: {
  onNone: () => void;
  onAmount: (amount: number) => void;
  onUnknown: () => void;
  stillNeeded: boolean;
}) {
  const [mode, setMode] = useState<"ask" | "yes">("ask");
  const [amount, setAmount] = useState("");
  const [error, setError] = useState<string | null>(null);

  if (mode === "ask") {
    return (
      <fieldset className="space-y-2" style={fieldStyle}>
        <legend style={legendStyle}>{EXTERNAL_TAKEOVER_COPY.ardQuestion}</legend>
        <p style={{ ...typography.caption.desktop, color: colors.text.secondary }}>
          {EXTERNAL_TAKEOVER_COPY.ardUnknownHelp}
        </p>
        <StockStillNeeded show={stillNeeded} />
        <div className="flex flex-col gap-2">
          <button type="button" className="min-h-[40px] text-left" style={optionStyle} onClick={() => setMode("yes")}>
            {EXTERNAL_TAKEOVER_COPY.ardYes}
          </button>
          <button type="button" className="min-h-[40px] text-left" style={optionStyle} onClick={onNone}>
            {EXTERNAL_TAKEOVER_COPY.ardNo}
          </button>
          <button type="button" className="min-h-[40px] text-left" style={optionStyle} onClick={onUnknown}>
            {EXTERNAL_TAKEOVER_COPY.unknown}
          </button>
        </div>
      </fieldset>
    );
  }

  return (
    <fieldset className="space-y-3" style={fieldStyle}>
      <legend style={legendStyle}>{EXTERNAL_TAKEOVER_COPY.ardQuestion}</legend>
      <StockStillNeeded show={stillNeeded} />
      <label className="flex flex-col gap-1" style={typography.caption.desktop}>
        {EXTERNAL_TAKEOVER_COPY.montantLabel}
        <input
          type="number"
          inputMode="decimal"
          min={0}
          value={amount}
          aria-invalid={Boolean(error)}
          onChange={(e) => setAmount(e.target.value)}
          style={inputStyle}
        />
      </label>
      {error ? (
        <p role="alert" style={{ ...typography.caption.desktop, color: colors.error.DEFAULT }}>
          {error}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          style={optionStyle}
          onClick={() => {
            const parsed = parseExplicitArdAmount(amount);
            if (parsed === null) {
              setError("Indiquez un montant valide.");
              return;
            }
            setError(null);
            onAmount(parsed);
          }}
        >
          {EXTERNAL_TAKEOVER_COPY.confirm}
        </button>
        <button type="button" className="min-h-[40px] text-left" style={optionStyle} onClick={onUnknown}>
          {EXTERNAL_TAKEOVER_COPY.unknown}
        </button>
      </div>
    </fieldset>
  );
}

const fieldStyle: React.CSSProperties = {
  borderRadius: radius.md,
  border: `1px solid ${colors.border.default}`,
  padding: spacing.scale[3],
  margin: 0,
};

const legendStyle: React.CSSProperties = {
  ...typography.body.desktop,
  color: colors.text.primary,
  fontWeight: typography.fontWeight.medium,
  paddingInline: spacing.scale[1],
};

const optionStyle: React.CSSProperties = {
  borderRadius: radius.md,
  border: `1px solid ${colors.border.default}`,
  backgroundColor: colors.surface.primary,
  color: colors.text.secondary,
  padding: `${spacing.scale[2]} ${spacing.scale[3]}`,
  ...typography.body.desktop,
};

const inputStyle: React.CSSProperties = {
  borderRadius: radius.md,
  border: `1px solid ${colors.border.default}`,
  padding: spacing.scale[2],
  minHeight: 40,
  ...typography.body.desktop,
};
