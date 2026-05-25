"use client";

import Link from "next/link";

import { Card } from "@/design-system/components/Card";
import { colors } from "@/design-system/theme/colors";
import { gradients } from "@/design-system/theme/gradients";
import { motions } from "@/design-system/theme/motions";
import { radius } from "@/design-system/theme/radius";
import { spacing } from "@/design-system/theme/spacing";
import { typography } from "@/design-system/theme/typography";
import type { AssistantBrief, LmnpDocument } from "@/lib/lmnp/types";
import { LMNP_ROUTES } from "@/lib/lmnp/routes";
import { useLmnp } from "@/lib/lmnp/store";
import type { AutosaveStatus } from "@/design-system/layouts/DashboardLayout";

const DOC_STATUS: Record<LmnpDocument["status"], string> = {
  uploaded: "En attente d'analyse",
  processing: "Analyse en cours",
  analyzed: "Analysé",
  failed: "Échec de lecture",
};

function PanelTitle({ children }: { children: React.ReactNode }) {
  return (
    <p
      style={{
        ...typography.caption.desktop,
        color: colors.text.muted,
        letterSpacing: typography.letterSpacing.label,
        textTransform: "uppercase",
        marginBottom: spacing.scale[3],
      }}
    >
      {children}
    </p>
  );
}

function autosaveCopy(status: AutosaveStatus) {
  if (status === "saved") return { label: "Dossier enregistré", color: colors.success.DEFAULT };
  if (status === "saving") return { label: "Enregistrement en cours…", color: colors.orange[500] };
  if (status === "error") return { label: "Erreur de sauvegarde", color: colors.error.DEFAULT };
  return null;
}

export function DashboardAutosavePanel() {
  const { autosaveStatus } = useLmnp();
  const copy = autosaveCopy(autosaveStatus);
  if (!copy) return null;

  return (
    <Card variant="muted" className="!py-4">
      <PanelTitle>Sauvegarde</PanelTitle>
      <div className="flex items-center gap-2">
        <span
          className="inline-block h-2 w-2 rounded-full"
          style={{
            backgroundColor: copy.color,
            animation: autosaveStatus === "saving" ? motions.analyzing.pulse : undefined,
          }}
        />
        <span style={{ ...typography.body.desktop, color: colors.text.secondary }}>{copy.label}</span>
      </div>
    </Card>
  );
}

export function DashboardAiRecommendationPanel({
  assistant,
  href,
  cta,
}: {
  assistant: AssistantBrief;
  href: string;
  cta: string;
}) {
  return (
    <Card
      interactive
      style={{
        backgroundImage: [
          `radial-gradient(ellipse 80% 60% at 100% 0%, ${colors.orange[100]} 0%, transparent 65%)`,
          gradients.card.interactive,
        ].join(", "),
      }}
    >
      <PanelTitle>Recommandation IA</PanelTitle>
      <p style={{ ...typography.cardTitle.desktop, color: colors.text.primary }}>{assistant.headline}</p>
      {assistant.insights.length > 0 ? (
        <ul className="mt-3 space-y-2">
          {assistant.insights.map((insight) => (
            <li
              key={insight.id}
              className="flex items-center gap-2"
              style={{ ...typography.caption.desktop, color: colors.text.secondary }}
            >
              <span
                aria-hidden
                style={{
                  width: "6px",
                  height: "6px",
                  borderRadius: radius.full,
                  backgroundColor:
                    insight.tone === "success"
                      ? colors.success.DEFAULT
                      : insight.tone === "pending"
                        ? colors.warning.DEFAULT
                        : colors.text.accent,
                }}
              />
              {insight.text}
            </li>
          ))}
        </ul>
      ) : null}
      <Link
        href={href}
        className="mt-4 inline-block"
        style={{ ...typography.caption.desktop, color: colors.text.accent, fontWeight: typography.fontWeight.medium }}
      >
        {cta} →
      </Link>
    </Card>
  );
}

export function DashboardFiscalInsightsPanel({ insights }: { insights: string[] }) {
  const merged = insights.filter(Boolean);
  if (merged.length === 0) return null;

  return (
    <Card variant="muted">
      <PanelTitle>Signaux fiscaux</PanelTitle>
      <ul className="space-y-2">
        {merged.map((text) => (
          <li
            key={text}
            style={{
              ...typography.body.desktop,
              color: colors.text.secondary,
              padding: spacing.scale[3],
              borderRadius: radius.md,
              backgroundColor: colors.surface.inset,
            }}
          >
            {text}
          </li>
        ))}
      </ul>
    </Card>
  );
}

export function DashboardRecentDocumentsPanel({
  documents,
}: {
  documents: { id: string; fileName: string; status: string }[];
}) {
  if (documents.length === 0) return null;

  return (
    <Card variant="muted">
      <PanelTitle>Documents récents</PanelTitle>
      <ul className="space-y-2">
        {documents.map((doc) => (
          <li
            key={doc.id}
            className="flex items-start justify-between gap-3"
            style={{
              padding: spacing.scale[3],
              borderRadius: radius.md,
              border: `1px solid ${colors.border.subtle}`,
              backgroundColor: colors.surface.primary,
            }}
          >
            <span className="min-w-0 truncate" style={{ ...typography.body.desktop, color: colors.text.primary }}>
              {doc.fileName}
            </span>
            <span
              className="shrink-0"
              style={{
                ...typography.caption.desktop,
                color:
                  doc.status === "analyzed"
                    ? colors.success.DEFAULT
                    : doc.status === "failed"
                      ? colors.error.DEFAULT
                      : colors.text.muted,
              }}
            >
              {DOC_STATUS[doc.status as LmnpDocument["status"]] ?? doc.status}
            </span>
          </li>
        ))}
      </ul>
      <Link
        href={LMNP_ROUTES.documents}
        className="mt-4 inline-block"
        style={{ ...typography.caption.desktop, color: colors.text.accent }}
      >
        Voir tous les documents →
      </Link>
    </Card>
  );
}

export function DashboardRecentActivityPanel() {
  const { workspace } = useLmnp();

  const activity = [
    ...workspace.declaration.recentDocuments.map((doc) => ({
      id: `doc-${doc.id}`,
      title: doc.fileName,
      meta: DOC_STATUS[doc.status as LmnpDocument["status"]] ?? doc.status,
    })),
    ...workspace.validationItems
      .filter((item) => item.reviewedAt && item.status !== "pending")
      .sort((a, b) => (b.reviewedAt ?? "").localeCompare(a.reviewedAt ?? ""))
      .slice(0, 3)
      .map((item) => ({
        id: `val-${item.id}`,
        title: item.label,
        meta: item.status === "approved" ? "Confirmé" : item.status === "corrected" ? "Corrigé" : "Ignoré",
      })),
  ].slice(0, 5);

  if (activity.length === 0) return null;

  return (
    <Card>
      <PanelTitle>Activité récente</PanelTitle>
      <ul className="space-y-2">
        {activity.map((entry) => (
          <li
            key={entry.id}
            className="flex items-center justify-between gap-3"
            style={{
              padding: `${spacing.scale[2]} ${spacing.scale[3]}`,
              borderRadius: radius.md,
              backgroundColor: colors.surface.secondary,
            }}
          >
            <span className="min-w-0 truncate" style={{ ...typography.body.desktop, color: colors.text.primary }}>
              {entry.title}
            </span>
            <span style={{ ...typography.caption.desktop, color: colors.text.muted }}>{entry.meta}</span>
          </li>
        ))}
      </ul>
    </Card>
  );
}
