"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { humanizeConseillerText } from "@/components/lmnp/dashboard/conseiller-suggestions";
import { resolveDocumentWorkflowStep } from "@/components/lmnp/dashboard/dashboard-workflow-model";
import { Button } from "@/design-system/components/Button";
import { Card } from "@/design-system/components/Card";
import { colors } from "@/design-system/theme/colors";
import { radius } from "@/design-system/theme/radius";
import { shadows } from "@/design-system/theme/shadows";
import { spacing } from "@/design-system/theme/spacing";
import { typography } from "@/design-system/theme/typography";
import { LMNP_ROUTES } from "@/lib/lmnp/routes";
import { useLmnp } from "@/lib/lmnp/store";
import type { LmnpDocument } from "@/lib/lmnp/types";

const thStyle = {
  ...typography.caption.desktop,
  color: colors.text.muted,
  letterSpacing: typography.letterSpacing.label,
  textTransform: "uppercase" as const,
  padding: `${spacing.scale[3]} ${spacing.scale[4]}`,
  textAlign: "left" as const,
  fontWeight: typography.fontWeight.medium,
};

const tdStyle = {
  ...typography.body.desktop,
  color: colors.text.secondary,
  padding: `${spacing.scale[4]} ${spacing.scale[4]}`,
  verticalAlign: "middle" as const,
};

const TRUST_LINES = [
  "Chiffrement de bout en bout",
  "Stockage sécurisé en France",
  "Historique et traçabilité des accès",
] as const;

function TrustIcon() {
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center"
      style={{
        width: "28px",
        height: "28px",
        borderRadius: radius.full,
        backgroundColor: colors.orange[50],
        border: `1px solid ${colors.border.subtle}`,
        color: colors.orange[500],
        fontSize: typography.fontSize.xs,
      }}
      aria-hidden
    >
      ✓
    </span>
  );
}

function LockIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden>
      <rect x="3.5" y="7" width="9" height="6.5" rx="1.5" stroke={colors.text.muted} strokeWidth="1.2" />
      <path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2" stroke={colors.text.muted} strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}

function FileTypeIcon({ mimeType }: { mimeType: string }) {
  const isPdf = mimeType.includes("pdf");
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center"
      style={{
        width: "28px",
        height: "28px",
        borderRadius: radius.sm,
        backgroundColor: isPdf ? colors.orange[50] : colors.surface.secondary,
        color: isPdf ? colors.orange[600] : colors.text.muted,
        fontSize: typography.fontSize["2xs"],
        fontWeight: typography.fontWeight.medium,
      }}
      aria-hidden
    >
      {isPdf ? "PDF" : "DOC"}
    </span>
  );
}

function categoryChipStyle(category: string) {
  const lower = category.toLowerCase();
  if (lower.includes("activité") || lower.includes("activite")) {
    return { color: colors.orange[700], bg: colors.orange[50] };
  }
  if (lower.includes("logement")) {
    return { color: colors.text.accent, bg: colors.surface.selected };
  }
  if (lower.includes("crédit") || lower.includes("credit") || lower.includes("financement")) {
    return { color: colors.warning.DEFAULT, bg: colors.warning.light };
  }
  if (lower.includes("revenu")) {
    return { color: colors.success.DEFAULT, bg: colors.success.surface };
  }
  if (lower.includes("charge")) {
    return { color: colors.text.secondary, bg: colors.surface.secondary };
  }
  if (lower.includes("amortissement")) {
    return { color: colors.orange[600], bg: colors.orange[100] };
  }
  return { color: colors.text.secondary, bg: colors.surface.secondary };
}

function formatUploadDate(iso: string): string {
  try {
    return new Intl.DateTimeFormat("fr-FR", {
      day: "numeric",
      month: "short",
      year: "numeric",
    }).format(new Date(iso));
  } catch {
    return "—";
  }
}

function documentStatusLabel(status: LmnpDocument["status"]): {
  label: string;
  color: string;
  dot: string;
} {
  if (status === "analyzed") {
    return { label: "Importé", color: colors.success.DEFAULT, dot: colors.success.DEFAULT };
  }
  return { label: "En attente", color: colors.orange[600], dot: colors.orange[500] };
}

function DocumentActionsMenu({
  documentId,
  disabled,
  onDelete,
}: {
  documentId: string;
  disabled: boolean;
  onDelete: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button
        type="button"
        aria-label="Actions"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        style={{
          ...typography.body.desktop,
          color: colors.text.muted,
          background: "none",
          border: "none",
          cursor: "pointer",
          padding: spacing.scale[2],
        }}
      >
        ···
      </button>
      {open ? (
        <div
          className="absolute right-0 z-10 min-w-[140px]"
          style={{
            marginTop: spacing.scale[1],
            borderRadius: radius.md,
            border: `1px solid ${colors.border.subtle}`,
            backgroundColor: colors.surface.primary,
            boxShadow: shadows.card.hover,
            padding: spacing.scale[2],
          }}
        >
          <Link
            href={LMNP_ROUTES.documents}
            onClick={() => setOpen(false)}
            style={{
              display: "block",
              ...typography.caption.desktop,
              color: colors.text.accent,
              padding: `${spacing.scale[2]} ${spacing.scale[3]}`,
              textDecoration: "none",
            }}
          >
            Voir
          </Link>
          <button
            type="button"
            disabled={disabled}
            onClick={() => {
              onDelete(documentId);
              setOpen(false);
            }}
            style={{
              display: "block",
              width: "100%",
              textAlign: "left",
              ...typography.caption.desktop,
              color: colors.text.muted,
              background: "none",
              border: "none",
              cursor: disabled ? "default" : "pointer",
              padding: `${spacing.scale[2]} ${spacing.scale[3]}`,
              opacity: disabled ? 0.5 : 1,
            }}
          >
            Supprimer
          </button>
        </div>
      ) : null}
    </div>
  );
}

export function VaultSection() {
  const { workspace, dispatch } = useLmnp();
  const documents = useMemo(
    () => [...workspace.documents].sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt)),
    [workspace.documents],
  );
  const isBusy = workspace.documents.some((doc) => doc.status === "processing");

  return (
    <div
      className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(220px,280px)_1fr]"
      style={{ marginLeft: spacing.scale[9], paddingLeft: spacing.scale[6] }}
    >
      <div>
        <p
          style={{
            ...typography.body.desktop,
            color: colors.text.secondary,
            lineHeight: typography.lineHeight.relaxed,
            marginBottom: spacing.scale[6],
          }}
        >
          Tous vos documents sont chiffrés et conservés en France.
        </p>
        <ul className="flex flex-col" style={{ gap: spacing.scale[4] }}>
          {TRUST_LINES.map((line) => (
            <li key={line} className="flex items-center gap-3">
              <TrustIcon />
              <span style={{ ...typography.body.desktop, color: colors.text.secondary }}>{line}</span>
            </li>
          ))}
        </ul>
      </div>

      <Card className="!p-0 overflow-hidden" style={{ borderRadius: radius.xl, boxShadow: shadows.card.hover }}>
        <div
          className="flex flex-wrap items-center justify-between gap-3"
          style={{
            padding: `${spacing.scale[5]} ${spacing.scale[6]}`,
            borderBottom: `1px solid ${colors.border.subtle}`,
            backgroundColor: colors.surface.secondary,
          }}
        >
          <p style={{ ...typography.body.desktop, color: colors.text.primary, fontWeight: typography.fontWeight.medium }}>
            {documents.length} document{documents.length === 1 ? "" : "s"}
          </p>
          <Button variant="secondary" href={LMNP_ROUTES.documents}>
            Ajouter un document +
          </Button>
        </div>

        {documents.length === 0 ? (
          <div className="px-6 py-12 text-center">
            <p style={{ ...typography.body.desktop, color: colors.text.secondary }}>
              Aucun document pour le moment. Ajoutez votre premier justificatif quand vous êtes prêt.
            </p>
            <div className="mt-6 flex justify-center">
              <Button href={LMNP_ROUTES.documents}>Ajouter un document +</Button>
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] border-collapse">
              <thead>
                <tr style={{ borderBottom: `1px solid ${colors.border.subtle}` }}>
                  <th style={thStyle}>Nom du document</th>
                  <th style={thStyle}>Catégorie</th>
                  <th style={thStyle}>Date</th>
                  <th style={thStyle}>Statut</th>
                  <th style={{ ...thStyle, textAlign: "right" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {documents.map((doc) => {
                  const category = resolveDocumentWorkflowStep(doc, workspace);
                  const chip = categoryChipStyle(category);
                  const status = documentStatusLabel(doc.status);

                  return (
                    <tr key={doc.id} style={{ borderBottom: `1px solid ${colors.border.subtle}` }}>
                      <td style={tdStyle}>
                        <div className="flex min-w-0 items-center gap-3">
                          <FileTypeIcon mimeType={doc.mimeType} />
                          <span
                            className="truncate"
                            style={{ color: colors.text.primary, maxWidth: "220px" }}
                            title={doc.fileName}
                          >
                            {doc.fileName}
                          </span>
                        </div>
                      </td>
                      <td style={tdStyle}>
                        <span
                          style={{
                            ...typography.caption.desktop,
                            color: chip.color,
                            backgroundColor: chip.bg,
                            borderRadius: radius.full,
                            padding: `${spacing.scale[1]} ${spacing.scale[3]}`,
                            whiteSpace: "nowrap",
                          }}
                        >
                          {category}
                        </span>
                      </td>
                      <td style={tdStyle}>{formatUploadDate(doc.uploadedAt)}</td>
                      <td style={tdStyle}>
                        <span className="inline-flex items-center gap-2">
                          <span
                            className="inline-block rounded-full"
                            style={{ width: "6px", height: "6px", backgroundColor: status.dot }}
                          />
                          <span style={{ color: status.color }}>{status.label}</span>
                        </span>
                      </td>
                      <td style={{ ...tdStyle, textAlign: "right" }}>
                        <DocumentActionsMenu
                          documentId={doc.id}
                          disabled={isBusy && doc.status === "processing"}
                          onDelete={(id) => dispatch({ type: "REMOVE_DOCUMENT", documentId: id })}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <div
          className="flex items-center justify-center gap-2"
          style={{
            padding: `${spacing.scale[4]} ${spacing.scale[6]}`,
            borderTop: documents.length > 0 ? `1px solid ${colors.border.subtle}` : undefined,
          }}
        >
          <LockIcon />
          <p style={{ ...typography.caption.desktop, color: colors.text.muted }}>
            {humanizeConseillerText("Vos documents sont stockés en toute sécurité.")}
          </p>
        </div>
      </Card>
    </div>
  );
}
