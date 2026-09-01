"use client";

import { useCallback } from "react";

import { colors } from "@/design-system/theme/colors";
import { radius } from "@/design-system/theme/radius";
import { shadows } from "@/design-system/theme/shadows";
import { spacing } from "@/design-system/theme/spacing";
import { typography } from "@/design-system/theme/typography";
import { shouldShowClassificationReview } from "@/lib/ai/classification-labels";
import type { ResolvedDocumentClassification } from "@/lib/ai/document-classification-types";
import type { ExtractDocumentResult, UniversalExtractionSchema } from "@/lib/ai/document-types";
import { DocumentClassificationReviewCard } from "@/components/lmnp/review/DocumentClassificationReviewCard";

type DocumentExtractionSummaryProps = {
  results: ExtractDocumentResult[];
  fileNames?: string[];
  isProcessing?: boolean;
  progressLabel?: string;
  cardStyle?: React.CSSProperties;
  onClassificationResolved?: (
    extractionRowId: string,
    classification: ResolvedDocumentClassification,
  ) => void;
};

const DOCUMENT_TYPE_LABELS: Record<string, string> = {
  travaux_invoice: "Facture de travaux",
  furniture_invoice: "Facture de mobilier",
  loan_offer: "Offre de prêt",
  notary_act: "Acte notarié",
  property_tax: "Taxe foncière",
  insurance_document: "Document d'assurance",
  unknown: "Document non identifié",
};

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 2,
  }).format(value);
}

function formatPercent(value: number): string {
  return `${(value <= 1 ? value * 100 : value).toFixed(2)} %`;
}

function buildKeyValues(data: UniversalExtractionSchema): Array<{ label: string; value: string }> {
  const rows: Array<{ label: string; value: string }> = [];

  if (data.supplier) rows.push({ label: "Fournisseur", value: data.supplier });
  if (data.organization) rows.push({ label: "Organisme", value: data.organization });
  if (data.invoice_date) rows.push({ label: "Date", value: data.invoice_date });
  if (data.amount_ttc != null) rows.push({ label: "Montant TTC", value: formatCurrency(data.amount_ttc) });
  if (data.amount_ht != null) rows.push({ label: "Montant HT", value: formatCurrency(data.amount_ht) });
  if (data.vat_amount != null) rows.push({ label: "TVA", value: formatCurrency(data.vat_amount) });
  if (data.loan_amount != null) rows.push({ label: "Montant du prêt", value: formatCurrency(data.loan_amount) });
  if (data.interest_rate != null) rows.push({ label: "Taux d'intérêt", value: formatPercent(data.interest_rate) });
  if (data.monthly_payment != null) {
    rows.push({ label: "Mensualité", value: formatCurrency(data.monthly_payment) });
  }
  if (data.property_price != null) {
    rows.push({ label: "Prix du bien", value: formatCurrency(data.property_price) });
  }
  if (data.notary_fees != null) rows.push({ label: "Frais de notaire", value: formatCurrency(data.notary_fees) });
  if (data.category) rows.push({ label: "Catégorie", value: data.category });

  return rows;
}

export function DocumentExtractionSummary({
  results,
  fileNames = [],
  isProcessing = false,
  progressLabel,
  cardStyle,
  onClassificationResolved,
}: DocumentExtractionSummaryProps) {
  const handleResolved = useCallback(
    (extractionRowId: string, updated: ResolvedDocumentClassification) => {
      onClassificationResolved?.(extractionRowId, updated);
    },
    [onClassificationResolved],
  );

  if (!isProcessing && results.length === 0) return null;

  const completed = results.filter((r) => r.extractionStatus === "completed").length;
  const failed = results.filter((r) => r.extractionStatus === "failed").length;

  return (
    <section
      className="w-full animate-[fiscal-fade-in_450ms_cubic-bezier(0.16,1,0.3,1)_both]"
      style={{
        borderRadius: radius.lg,
        border: `1px solid ${colors.border.subtle}`,
        backgroundColor: colors.surface.primary,
        boxShadow: shadows.card.default,
        padding: spacing.card.md,
        ...cardStyle,
      }}
    >
      <p
        style={{
          ...typography.caption.desktop,
          color: colors.text.accent,
          letterSpacing: typography.letterSpacing.label,
        }}
      >
        Extraction documentaire
      </p>

      {isProcessing ? (
        <div className="mt-4">
          <p style={{ ...typography.body.desktop, color: colors.text.primary }}>
            {progressLabel ?? "Analyse en cours…"}
          </p>
          <div
            className="mt-4 overflow-hidden"
            style={{
              height: "3px",
              borderRadius: radius.full,
              backgroundColor: colors.surface.tertiary,
            }}
          >
            <div
              className="h-full animate-pulse"
              style={{
                width: "66%",
                borderRadius: radius.full,
                backgroundColor: colors.orange[400],
              }}
            />
          </div>
        </div>
      ) : (
        <>
          <p
            className="mt-2"
            style={{
              fontFamily: typography.fontFamily.display,
              fontSize: typography.fontSize.xl,
              color: colors.text.primary,
            }}
          >
            {failed === 0
              ? `${completed} document${completed > 1 ? "s" : ""} analysé${completed > 1 ? "s" : ""}`
              : `${completed} réussi${completed > 1 ? "s" : ""}, ${failed} échec${failed > 1 ? "s" : ""}`}
          </p>

          <div className="mt-6 space-y-5">
            {results.map((result, index) => {
              const data = result.structuredData;
              const keyValues = buildKeyValues(data);
              const typeLabel =
                DOCUMENT_TYPE_LABELS[data.document_type] ?? data.document_type ?? "Document";
              const fileLabel = fileNames[index];

              return (
                <article
                  key={result.id || `${index}-${fileLabel ?? "doc"}`}
                  style={{
                    borderRadius: radius.md,
                    border: `1px solid ${colors.border.subtle}`,
                    backgroundColor: colors.surface.inset,
                    padding: spacing.scale[5],
                  }}
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      {fileLabel ? (
                        <p style={{ ...typography.caption.desktop, color: colors.text.muted }}>
                          {fileLabel}
                        </p>
                      ) : null}
                      <p
                        style={{
                          ...typography.body.desktop,
                          fontWeight: typography.fontWeight.medium,
                          color: colors.text.primary,
                        }}
                      >
                        {typeLabel}
                      </p>
                    </div>
                    <span
                      style={{
                        ...typography.caption.desktop,
                        color:
                          result.extractionStatus === "completed"
                            ? colors.success.DEFAULT
                            : colors.text.muted,
                      }}
                    >
                      {result.extractionStatus === "completed" ? "Extraction réussie" : "Échec"}
                    </span>
                  </div>

                  {data.summary ? (
                    <p className="mt-3" style={{ ...typography.body.desktop, color: colors.text.secondary }}>
                      {data.summary}
                    </p>
                  ) : null}

                  {keyValues.length > 0 ? (
                    <dl className="mt-4 grid gap-2 sm:grid-cols-2">
                      {keyValues.map((row) => (
                        <div key={row.label}>
                          <dt style={{ ...typography.caption.desktop, color: colors.text.muted }}>
                            {row.label}
                          </dt>
                          <dd
                            style={{
                              ...typography.body.desktop,
                              color: colors.text.primary,
                              fontWeight: typography.fontWeight.medium,
                            }}
                          >
                            {row.value}
                          </dd>
                        </div>
                      ))}
                    </dl>
                  ) : null}

                  {result.extractionStatus === "completed" ? (
                    <p className="mt-3" style={{ ...typography.caption.desktop, color: colors.text.muted }}>
                      Confiance : {Math.round(result.confidenceScore * 100)} %
                    </p>
                  ) : null}

                  {result.error ? (
                    <p className="mt-2" style={{ ...typography.caption.desktop, color: colors.text.muted }}>
                      {result.error}
                    </p>
                  ) : null}

                  {result.id &&
                  result.classification &&
                  shouldShowClassificationReview(result.classification, result.extractionStatus) ? (
                    <DocumentClassificationReviewCard
                      extractionRowId={result.id}
                      classification={result.classification}
                      fileName={fileLabel}
                      onResolved={(updated) => handleResolved(result.id, updated)}
                    />
                  ) : null}
                </article>
              );
            })}
          </div>
        </>
      )}
    </section>
  );
}
