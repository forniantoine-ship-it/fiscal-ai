"use client";

import Link from "next/link";

import { Card } from "@/design-system/components/Card";
import { colors } from "@/design-system/theme/colors";
import { gradients } from "@/design-system/theme/gradients";
import { radius } from "@/design-system/theme/radius";
import { shadows } from "@/design-system/theme/shadows";
import { spacing } from "@/design-system/theme/spacing";
import { typography } from "@/design-system/theme/typography";
import {
  resolveDocumentAiStatus,
  resolveDocumentCorrectionState,
  resolveDocumentFieldLabels,
  resolveDocumentValidationState,
  resolveDocumentWorkflowStep,
} from "@/components/lmnp/dashboard/dashboard-workflow-model";
import { LMNP_ROUTES } from "@/lib/lmnp/routes";
import { useLmnp } from "@/lib/lmnp/store";

const thStyle = {
  ...typography.caption.desktop,
  color: colors.text.muted,
  letterSpacing: typography.letterSpacing.label,
  textTransform: "uppercase" as const,
  padding: `${spacing.scale[4]} ${spacing.scale[3]}`,
  textAlign: "left" as const,
  fontWeight: typography.fontWeight.medium,
};

const tdStyle = {
  ...typography.body.desktop,
  color: colors.text.secondary,
  padding: `${spacing.scale[4]} ${spacing.scale[3]}`,
  verticalAlign: "top" as const,
};

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
          }}
        >
          DOCUMENTS IMPORTÉS
        </p>
        <p className="mx-auto mt-3 max-w-2xl" style={{ ...typography.body.desktop, color: colors.text.secondary }}>
          Tous les documents déposés et analysés par l&apos;IA.
        </p>
      </div>

      <Card
        className="!p-0 overflow-hidden"
        style={{
          borderRadius: radius.xl,
          boxShadow: shadows.card.hover,
          backgroundImage: gradients.card.elevated,
        }}
      >
        {documents.length === 0 ? (
          <div className="px-6 py-12 text-center">
            <p style={{ ...typography.body.desktop, color: colors.text.secondary }}>
              Aucun document importé pour le moment.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-[960px] w-full border-collapse">
              <thead>
                <tr style={{ borderBottom: `1px solid ${colors.border.subtle}`, backgroundColor: colors.surface.secondary }}>
                  <th style={thStyle}>Document</th>
                  <th style={thStyle}>Étape liée</th>
                  <th style={thStyle}>Statut IA</th>
                  <th style={thStyle}>Champs extraits</th>
                  <th style={thStyle}>Corrections</th>
                  <th style={thStyle}>Validation</th>
                  <th style={thStyle}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {documents.map((doc) => {
                  const validations = workspace.validationItems.filter((item) => item.documentId === doc.id);
                  const fields = resolveDocumentFieldLabels(doc.id, workspace);
                  const aiStatus = resolveDocumentAiStatus(doc);
                  const validation = resolveDocumentValidationState(validations);
                  const corrections = resolveDocumentCorrectionState(validations);

                  return (
                    <tr
                      key={doc.id}
                      style={{ borderBottom: `1px solid ${colors.border.subtle}` }}
                    >
                      <td style={tdStyle}>
                        <p
                          className="max-w-[220px] truncate"
                          style={{ color: colors.text.primary, fontFamily: typography.fontFamily.display }}
                        >
                          {doc.fileName}
                        </p>
                      </td>
                      <td style={tdStyle}>{resolveDocumentWorkflowStep(doc, workspace)}</td>
                      <td style={{ ...tdStyle, color: aiStatus === "Extraction terminée" ? colors.success.DEFAULT : colors.text.secondary }}>
                        {aiStatus}
                      </td>
                      <td style={tdStyle}>
                        {fields.length > 0 ? (
                          <div className="flex flex-wrap gap-1.5">
                            {fields.map((field) => (
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
                        ) : (
                          "—"
                        )}
                      </td>
                      <td style={{ ...tdStyle, color: corrections !== "Aucune" ? colors.text.accent : colors.text.secondary }}>
                        {corrections}
                      </td>
                      <td style={{ ...tdStyle, color: validation === "Validé" ? colors.success.DEFAULT : validation === "À corriger" ? colors.text.accent : colors.text.secondary }}>
                        {validation}
                      </td>
                      <td style={tdStyle}>
                        <div className="flex items-center gap-3">
                          <Link
                            href={LMNP_ROUTES.documents}
                            style={{ ...typography.caption.desktop, color: colors.text.accent }}
                          >
                            Voir
                          </Link>
                          <button
                            type="button"
                            onClick={() => dispatch({ type: "REMOVE_DOCUMENT", documentId: doc.id })}
                            disabled={isBusy && doc.status === "processing"}
                            style={{ ...typography.caption.desktop, color: colors.text.muted }}
                          >
                            Supprimer
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </section>
  );
}
