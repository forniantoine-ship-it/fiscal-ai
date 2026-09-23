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
  formatEuro,
  type AutoConfirmedAssetRow,
  type ClientExceptionQuestion,
} from "./external-takeover-view-model";
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
  onClassificationSuggestionsDecline,
  onDeficitsNone,
  onDeficitsRows,
  onArdNone,
  onArdAmount,
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
  onClassificationSuggestionsDecline: () => void;
  onDeficitsNone: () => void;
  onDeficitsRows: (rows: OpeningDeficitRow[]) => void;
  onArdNone: () => void;
  onArdAmount: (amount: number) => void;
}) {
  if (questions.length === 0) return null;
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
        if (q.code === "CLASSIFICATION_SUGGESTIONS_CONFIRM") {
          const optionLabel = (value: CandidateAssetClassification) =>
            CLASSIFICATION_OPTIONS.find((o) => o.value === value)?.label ?? value;
          return (
            <fieldset key={q.code} className="space-y-3" style={fieldStyle}>
              <legend style={legendStyle}>
                {EXTERNAL_TAKEOVER_COPY.classificationSuggestionsTitle(q.items.length)}
              </legend>
              <ul className="space-y-1">
                {q.items.map((item) => (
                  <li
                    key={item.candidateKey}
                    style={{ ...typography.caption.desktop, color: colors.text.secondary }}
                  >
                    {item.assetLabel} → {optionLabel(item.suggested)}
                  </li>
                ))}
              </ul>
              <div className="flex flex-col gap-2 sm:flex-row">
                <button
                  type="button"
                  className="min-h-[40px]"
                  style={optionStyle}
                  onClick={() =>
                    onClassificationSuggestionsConfirm(
                      q.items.map((i) => ({
                        candidateKey: i.candidateKey,
                        classification: i.suggested,
                      })),
                    )
                  }
                >
                  {EXTERNAL_TAKEOVER_COPY.classificationSuggestionsConfirm}
                </button>
                <button
                  type="button"
                  className="min-h-[40px]"
                  style={optionStyle}
                  onClick={onClassificationSuggestionsDecline}
                >
                  {EXTERNAL_TAKEOVER_COPY.classificationSuggestionsCorrect}
                </button>
              </div>
            </fieldset>
          );
        }
        if (q.code === "CLASSIFICATION_REQUIRED") {
          return (
            <ChoiceQuestion
              key={`${q.code}-${q.candidateKey}`}
              title={`${EXTERNAL_TAKEOVER_COPY.classificationQuestion} (${q.assetLabel})`}
              options={CLASSIFICATION_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
              onSelect={(value) =>
                onClassification(q.candidateKey, value as CandidateAssetClassification)
              }
            />
          );
        }
        if (q.code === "DEFICITS_REQUIRED") {
          return (
            <DeficitsQuestion
              key={q.code}
              onNone={onDeficitsNone}
              onRows={onDeficitsRows}
            />
          );
        }
        return <ArdQuestion key={q.code} onNone={onArdNone} onAmount={onArdAmount} />;
      })}
    </div>
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
}: {
  onNone: () => void;
  onRows: (rows: OpeningDeficitRow[]) => void;
}) {
  const [mode, setMode] = useState<"ask" | "yes">("ask");
  const [rows, setRows] = useState<OpeningDeficitRow[]>([{ millesime: new Date().getFullYear() - 1, montant: 0 }]);
  const [error, setError] = useState<string | null>(null);

  if (mode === "ask") {
    return (
      <fieldset className="space-y-2" style={fieldStyle}>
        <legend style={legendStyle}>{EXTERNAL_TAKEOVER_COPY.deficitsQuestion}</legend>
        <div className="flex flex-col gap-2 sm:flex-row">
          <button type="button" className="min-h-[40px]" style={optionStyle} onClick={onNone}>
            {EXTERNAL_TAKEOVER_COPY.no}
          </button>
          <button type="button" className="min-h-[40px]" style={optionStyle} onClick={() => setMode("yes")}>
            {EXTERNAL_TAKEOVER_COPY.yes}
          </button>
        </div>
      </fieldset>
    );
  }

  return (
    <fieldset className="space-y-3" style={fieldStyle}>
      <legend style={legendStyle}>{EXTERNAL_TAKEOVER_COPY.deficitsQuestion}</legend>
      {rows.map((row, index) => (
        <div key={index} className="flex flex-wrap gap-3">
          <label className="flex flex-col gap-1" style={typography.caption.desktop}>
            {EXTERNAL_TAKEOVER_COPY.millesimeLabel}
            <input
              type="number"
              inputMode="numeric"
              value={row.millesime || ""}
              aria-invalid={Boolean(error)}
              onChange={(e) => {
                const next = [...rows];
                next[index] = { ...row, millesime: Number(e.target.value) };
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
              value={Number.isFinite(row.montant) ? row.montant : ""}
              aria-invalid={Boolean(error)}
              onChange={(e) => {
                const next = [...rows];
                next[index] = { ...row, montant: Number(e.target.value) };
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
            setRows([...rows, { millesime: new Date().getFullYear() - 1, montant: 0 }])
          }
        >
          {EXTERNAL_TAKEOVER_COPY.addDeficitLine}
        </button>
        <button
          type="button"
          style={optionStyle}
          onClick={() => {
            const valid = rows.every(
              (r) =>
                Number.isFinite(r.millesime) &&
                r.millesime > 1900 &&
                Number.isFinite(r.montant) &&
                r.montant >= 0,
            );
            if (!valid || rows.length === 0) {
              setError("Indiquez une année et un montant valides pour chaque ligne.");
              return;
            }
            setError(null);
            onRows(rows);
          }}
        >
          {EXTERNAL_TAKEOVER_COPY.confirm}
        </button>
      </div>
    </fieldset>
  );
}

function ArdQuestion({
  onNone,
  onAmount,
}: {
  onNone: () => void;
  onAmount: (amount: number) => void;
}) {
  const [mode, setMode] = useState<"ask" | "yes">("ask");
  const [amount, setAmount] = useState("");
  const [error, setError] = useState<string | null>(null);

  if (mode === "ask") {
    return (
      <fieldset className="space-y-2" style={fieldStyle}>
        <legend style={legendStyle}>{EXTERNAL_TAKEOVER_COPY.ardQuestion}</legend>
        <div className="flex flex-col gap-2 sm:flex-row">
          <button type="button" className="min-h-[40px]" style={optionStyle} onClick={onNone}>
            {EXTERNAL_TAKEOVER_COPY.no}
          </button>
          <button type="button" className="min-h-[40px]" style={optionStyle} onClick={() => setMode("yes")}>
            {EXTERNAL_TAKEOVER_COPY.yes}
          </button>
        </div>
      </fieldset>
    );
  }

  return (
    <fieldset className="space-y-3" style={fieldStyle}>
      <legend style={legendStyle}>{EXTERNAL_TAKEOVER_COPY.ardQuestion}</legend>
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
      <button
        type="button"
        style={optionStyle}
        onClick={() => {
          const n = Number(amount);
          if (!Number.isFinite(n) || n < 0) {
            setError("Indiquez un montant valide.");
            return;
          }
          setError(null);
          onAmount(n);
        }}
      >
        {EXTERNAL_TAKEOVER_COPY.confirm}
      </button>
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
