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
import { LMNP_ROUTES } from "@/lib/lmnp/routes";
import { useLmnp } from "@/lib/lmnp/store";
import type { LmnpDocument, ValidationItem } from "@/lib/lmnp/types";

const STATUS_LABEL: Record<LmnpDocument["status"], string> = {
  uploaded: "En attente d'analyse",
  processing: "Analyse IA en cours",
  analyzed: "Analysé par l'IA",
  failed: "Échec de lecture",
};

function validationLabel(items: ValidationItem[]) {
  const pending = items.filter((item) => item.status === "pending").length;
  if (pending > 0) return `${pending} montant${pending > 1 ? "s" : ""} à confirmer`;
  if (items.some((item) => item.status === "approved" || item.status === "corrected")) {
    return "Montants validés";
  }
  return null;
}

function DocumentCard({
  doc,
  extractionCount,
  validationText,
  onRemove,
  isBusy,
}: {
  doc: LmnpDocument;
  extractionCount: number;
  validationText: string | null;
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

  return (
    <li
      style={{
        padding: spacing.card.md,
        borderRadius: radius.lg,
        border: `1px solid ${colors.border.subtle}`,
        backgroundImage: gradients.card.elevated,
        boxShadow: shadows.card.default,
        transition: motions.hover.card,
      }}
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <p
            className="truncate"
            style={{
              ...typography.cardTitle.desktop,
              color: colors.text.primary,
              fontFamily: typography.fontFamily.display,
              fontWeight: typography.fontWeight.regular,
            }}
          >
            {doc.fileName}
          </p>
          <p className="mt-2" style={{ ...typography.caption.desktop, color: statusColor }}>
            {STATUS_LABEL[doc.status]}
            {doc.status === "analyzed" && extractionCount > 0
              ? ` · ${extractionCount} montant${extractionCount > 1 ? "s" : ""} extrait${extractionCount > 1 ? "s" : ""}`
              : ""}
          </p>
          {validationText ? (
            <p className="mt-2" style={{ ...typography.caption.desktop, color: colors.text.accent }}>
              {validationText}
            </p>
          ) : null}
          {doc.ocrMeta?.warnings?.[0] ? (
            <p className="mt-2" style={{ ...typography.caption.desktop, color: colors.text.muted }}>
              {doc.ocrMeta.warnings[0]}
            </p>
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

  if (documents.length === 0) {
    return (
      <section>
        <SectionHeader
          title="Vos documents"
          description="Déposez vos pièces — l'IA les lit et prépare votre dossier automatiquement."
        />
        <Card
          variant="muted"
          interactive
          style={{
            backgroundImage: [
              `radial-gradient(ellipse 70% 55% at 100% 0%, ${colors.orange[100]} 0%, transparent 62%)`,
              gradients.card.interactive,
            ].join(", "),
            boxShadow: shadows.card.default,
          }}
        >
          <p style={{ ...typography.body.desktop, color: colors.text.secondary }}>
            Aucun document pour le moment. Commencez par votre extrait INPI ou la pièce suggérée ci-dessus.
          </p>
          <div className="mt-6">
            <Button href={LMNP_ROUTES.documents}>Importer un document</Button>
          </div>
        </Card>
      </section>
    );
  }

  return (
    <section>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
        <SectionHeader
          title="Vos documents"
          description={`${documents.length} pièce${documents.length > 1 ? "s" : ""} dans votre dossier LMNP.`}
        />
        <Link
          href={LMNP_ROUTES.documents}
          style={{ ...typography.caption.desktop, color: colors.text.accent, fontWeight: typography.fontWeight.medium }}
        >
          Gérer les documents →
        </Link>
      </div>
      <ul className="grid gap-4 sm:grid-cols-2">
        {documents.map((doc) => {
          const relatedValidations = workspace.validationItems.filter((item) => item.documentId === doc.id);
          return (
            <DocumentCard
              key={doc.id}
              doc={doc}
              extractionCount={workspace.extractions.filter((e) => e.documentId === doc.id).length}
              validationText={validationLabel(relatedValidations)}
              onRemove={() => dispatch({ type: "REMOVE_DOCUMENT", documentId: doc.id })}
              isBusy={isBusy}
            />
          );
        })}
      </ul>
    </section>
  );
}

function SectionHeader({ title, description }: { title: string; description: string }) {
  return (
    <div>
      <h2
        style={{
          fontFamily: typography.fontFamily.display,
          fontWeight: typography.fontWeight.regular,
          fontSize: typography.fontSize["2xl"],
          color: colors.text.primary,
        }}
      >
        {title}
      </h2>
      <p className="mt-2 max-w-2xl" style={{ ...typography.body.desktop, color: colors.text.secondary }}>
        {description}
      </p>
    </div>
  );
}
