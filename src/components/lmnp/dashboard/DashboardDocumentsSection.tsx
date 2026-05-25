"use client";

import Link from "next/link";

import { Button } from "@/design-system/components/Button";
import { Card } from "@/design-system/components/Card";
import { colors } from "@/design-system/theme/colors";
import { gradients } from "@/design-system/theme/gradients";
import { motions } from "@/design-system/theme/motions";
import { radius } from "@/design-system/theme/radius";
import { shadows } from "@/design-system/theme/shadows";
import { spacing } from "@/design-system/theme/spacing";
import { typography } from "@/design-system/theme/typography";
import {
  resolveDocumentFieldLabels,
  resolveDocumentWorkflowStep,
} from "@/components/lmnp/dashboard/dashboard-workflow-model";
import { LMNP_ROUTES } from "@/lib/lmnp/routes";
import { useLmnp } from "@/lib/lmnp/store";
import type { LmnpDocument, ValidationItem } from "@/lib/lmnp/types";

const STATUS_LABEL: Record<LmnpDocument["status"], string> = {
  uploaded: "En attente d'analyse",
  processing: "Analyse IA en cours",
  analyzed: "Analysé par l'IA",
  failed: "Échec de lecture",
};

function validationSummary(items: ValidationItem[]) {
  const pending = items.filter((item) => item.status === "pending").length;
  if (pending > 0) return { label: `${pending} correction${pending > 1 ? "s" : ""}`, tone: "pending" as const };
  if (items.some((item) => item.status === "approved" || item.status === "corrected")) {
    return { label: "Validé", tone: "validated" as const };
  }
  return { label: "—", tone: "none" as const };
}

function DocumentCard({
  doc,
  stepLabel,
  extractedFields,
  validation,
  onRemove,
  isBusy,
}: {
  doc: LmnpDocument;
  stepLabel: string;
  extractedFields: string[];
  validation: ReturnType<typeof validationSummary>;
  onRemove: () => void;
  isBusy: boolean;
}) {
  const statusColor =
    doc.status === "analyzed"
      ? colors.success.DEFAULT
      : doc.status === "failed"
        ? colors.error.DEFAULT
        : doc.status === "processing"
          ? colors.orange[500]
          : colors.text.muted;

  const badgeColor =
    validation.tone === "validated"
      ? colors.success.DEFAULT
      : validation.tone === "pending"
        ? colors.text.accent
        : colors.text.muted;

  return (
    <li
      style={{
        padding: spacing.card.md,
        borderRadius: radius.xl,
        border: `1px solid ${colors.border.subtle}`,
        backgroundImage: gradients.card.elevated,
        boxShadow: shadows.card.default,
        transition: motions.hover.card,
      }}
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span
              style={{
                ...typography.caption.desktop,
                color: colors.text.accent,
                letterSpacing: typography.letterSpacing.label,
                textTransform: "uppercase",
              }}
            >
              {stepLabel}
            </span>
            <span
              style={{
                ...typography.caption.desktop,
                color: badgeColor,
                padding: `${spacing.scale[1]} ${spacing.scale[2]}`,
                borderRadius: radius.full,
                border: `1px solid ${validation.tone === "validated" ? colors.success.border : colors.border.subtle}`,
                backgroundColor:
                  validation.tone === "validated" ? colors.success.surface : colors.surface.secondary,
              }}
            >
              {validation.label}
            </span>
          </div>

          <p
            className="mt-3 truncate"
            style={{
              fontFamily: typography.fontFamily.display,
              fontWeight: typography.fontWeight.regular,
              fontSize: typography.fontSize.lg,
              color: colors.text.primary,
            }}
          >
            {doc.fileName}
          </p>

          <p className="mt-2" style={{ ...typography.caption.desktop, color: statusColor }}>
            {STATUS_LABEL[doc.status]}
          </p>

          {extractedFields.length > 0 ? (
            <div className="mt-3 flex flex-wrap gap-2">
              {extractedFields.map((field) => (
                <span
                  key={field}
                  style={{
                    ...typography.caption.desktop,
                    color: colors.text.secondary,
                    padding: `${spacing.scale[1]} ${spacing.scale[2]}`,
                    borderRadius: radius.full,
                    backgroundColor: colors.surface.inset,
                  }}
                >
                  {field}
                </span>
              ))}
            </div>
          ) : null}
        </div>

        <button
          type="button"
          onClick={onRemove}
          disabled={isBusy && doc.status === "processing"}
          style={{
            ...typography.caption.desktop,
            color: colors.text.muted,
            padding: `${spacing.scale[2]} ${spacing.scale[3]}`,
            borderRadius: radius.full,
            border: `1px solid ${colors.border.subtle}`,
            backgroundColor: colors.surface.primary,
          }}
        >
          Supprimer
        </button>
      </div>
    </li>
  );
}

export function DashboardDocumentsSection() {
  const { workspace, dispatch } = useLmnp();
  const documents = [...workspace.documents].sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt));
  const isBusy = workspace.documents.some((doc) => doc.status === "processing");

  return (
    <section>
      <div className="mb-6 text-center">
        <p
          style={{
            ...typography.caption.desktop,
            color: colors.text.accent,
            letterSpacing: typography.letterSpacing.label,
            textTransform: "uppercase",
          }}
        >
          Toutes vos pièces
        </p>
        <h2
          className="mt-2"
          style={{
            fontFamily: typography.fontFamily.display,
            fontWeight: typography.fontWeight.regular,
            fontSize: typography.fontSize["2xl"],
            color: colors.text.primary,
          }}
        >
          Documents importés
        </h2>
        <p className="mx-auto mt-3 max-w-2xl" style={{ ...typography.body.desktop, color: colors.text.secondary }}>
          Chaque document est relié à une étape de votre parcours LMNP.
        </p>
      </div>

      {documents.length === 0 ? (
        <Card
          variant="muted"
          interactive
          className="mx-auto max-w-2xl text-center"
          style={{
            backgroundImage: [
              `radial-gradient(ellipse 70% 55% at 100% 0%, ${colors.orange[100]} 0%, transparent 62%)`,
              gradients.card.interactive,
            ].join(", "),
            boxShadow: shadows.card.default,
          }}
        >
          <p style={{ ...typography.body.desktop, color: colors.text.secondary }}>
            Aucun document importé pour le moment. Commencez par l&apos;étape en cours ci-dessus.
          </p>
          <div className="mt-6 flex justify-center">
            <Button href={LMNP_ROUTES.documents}>Importer un document</Button>
          </div>
        </Card>
      ) : (
        <>
          <ul className="grid gap-4 lg:grid-cols-2">
            {documents.map((doc) => {
              const relatedValidations = workspace.validationItems.filter((item) => item.documentId === doc.id);
              return (
                <DocumentCard
                  key={doc.id}
                  doc={doc}
                  stepLabel={resolveDocumentWorkflowStep(doc, workspace)}
                  extractedFields={resolveDocumentFieldLabels(doc.id, workspace)}
                  validation={validationSummary(relatedValidations)}
                  onRemove={() => dispatch({ type: "REMOVE_DOCUMENT", documentId: doc.id })}
                  isBusy={isBusy}
                />
              );
            })}
          </ul>
          <div className="mt-6 text-center">
            <Link
              href={LMNP_ROUTES.documents}
              style={{ ...typography.caption.desktop, color: colors.text.accent, fontWeight: typography.fontWeight.medium }}
            >
              Gérer tous les documents →
            </Link>
          </div>
        </>
      )}
    </section>
  );
}
