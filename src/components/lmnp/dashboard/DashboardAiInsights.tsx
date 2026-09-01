"use client";

import { Card } from "@/design-system/components/Card";
import { colors } from "@/design-system/theme/colors";
import { gradients } from "@/design-system/theme/gradients";
import { shadows } from "@/design-system/theme/shadows";
import { typography } from "@/design-system/theme/typography";
import { useLmnp } from "@/lib/lmnp/store";
import type { AssistantInsightTone } from "@/lib/lmnp/types";
import type { DashboardWorkspace } from "@/components/lmnp/dashboard/dashboard-workflow-model";

type InsightCard = {
  id: string;
  title: string;
  body: string;
  tone: "accent" | "success" | "warning" | "neutral";
};

function toneStyles(tone: InsightCard["tone"]) {
  if (tone === "success") {
    return {
      border: colors.success.border,
      glow: colors.success.surface,
      dot: colors.success.DEFAULT,
    };
  }
  if (tone === "warning") {
    return {
      border: colors.warning.border,
      glow: colors.warning.surface,
      dot: colors.warning.DEFAULT,
    };
  }
  if (tone === "accent") {
    return {
      border: colors.border.selected,
      glow: colors.surface.selected,
      dot: colors.orange[500],
    };
  }
  return {
    border: colors.border.subtle,
    glow: colors.surface.secondary,
    dot: colors.text.muted,
  };
}

function assistantTone(tone: AssistantInsightTone): InsightCard["tone"] {
  if (tone === "success") return "success";
  if (tone === "pending") return "warning";
  return "accent";
}

function buildInsightCards(workspace: DashboardWorkspace): InsightCard[] {
  const cards: InsightCard[] = [];
  const seen = new Set<string>();

  const push = (card: InsightCard) => {
    const key = `${card.title}:${card.body}`;
    if (seen.has(key)) return;
    seen.add(key);
    cards.push(card);
  };

  for (const insight of workspace.assistant.insights) {
    push({
      id: insight.id,
      title: "Signal IA",
      body: insight.text,
      tone: assistantTone(insight.tone),
    });
  }

  for (const text of workspace.declaration.insights) {
    push({
      id: `decl-${text}`,
      title: "Observation fiscale",
      body: text,
      tone: text.toLowerCase().includes("confirmer") ? "warning" : "accent",
    });
  }

  const loan = workspace.documents.find(
    (doc) =>
      (doc.documentType === "loan_interest_certificate" || doc.category === "emprunt") &&
      doc.status === "analyzed",
  );
  if (loan) {
    push({
      id: "loan-detected",
      title: "Crédit détecté",
      body: "Intérêts d'emprunt repérés — prêts pour vos charges financières.",
      tone: "success",
    });
  }

  const expenseDocs = workspace.documents.filter(
    (doc) => doc.category === "charges" && doc.status === "analyzed",
  ).length;
  if (expenseDocs > 0) {
    push({
      id: "charges-detected",
      title: "Charges repérées",
      body: `${expenseDocs} pièce${expenseDocs > 1 ? "s" : ""} utile${expenseDocs > 1 ? "s" : ""} pour vos charges d'exploitation.`,
      tone: "success",
    });
  }

  if (workspace.ledgerEntries.some((entry) => entry.domain === "amortization")) {
    push({
      id: "amort-ready",
      title: "Amortissements prêts",
      body: "Des immobilisations sont prêtes à intégrer dans votre liasse.",
      tone: "success",
    });
  }

  const openAlerts = workspace.alerts.filter((alert) => alert.status === "open" && alert.severity !== "info");
  for (const alert of openAlerts.slice(0, 2)) {
    push({
      id: alert.id,
      title: alert.severity === "blocking" ? "Incohérence" : "Point d'attention",
      body: alert.message,
      tone: "warning",
    });
  }

  return cards.slice(0, 6);
}

export function DashboardAiInsights() {
  const { workspace } = useLmnp();
  const cards = buildInsightCards(workspace as DashboardWorkspace);
  if (cards.length === 0) return null;

  return (
    <section>
      <h2
        className="mb-2"
        style={{
          fontFamily: typography.fontFamily.display,
          fontWeight: typography.fontWeight.regular,
          fontSize: typography.fontSize["2xl"],
          color: colors.text.primary,
        }}
      >
        Ce que l&apos;IA observe
      </h2>
      <p className="mb-5 max-w-2xl" style={{ ...typography.body.desktop, color: colors.text.secondary }}>
        Des signaux discrets pour vous guider — jamais une liste comptable.
      </p>
      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map((card) => {
          const palette = toneStyles(card.tone);
          return (
            <li key={card.id}>
              <Card
                variant="muted"
                style={{
                  height: "100%",
                  borderColor: palette.border,
                  backgroundImage: [
                    `radial-gradient(ellipse 80% 60% at 100% 0%, ${palette.glow} 0%, transparent 70%)`,
                    gradients.card.elevated,
                  ].join(", "),
                  boxShadow: shadows.card.default,
                }}
              >
                <div className="flex items-start gap-3">
                  <span
                    aria-hidden
                    className="mt-1 inline-block h-2 w-2 shrink-0 rounded-full"
                    style={{ backgroundColor: palette.dot }}
                  />
                  <div>
                    <p
                      style={{
                        ...typography.caption.desktop,
                        color: colors.text.muted,
                        letterSpacing: typography.letterSpacing.label,
                        textTransform: "uppercase",
                      }}
                    >
                      {card.title}
                    </p>
                    <p className="mt-2" style={{ ...typography.body.desktop, color: colors.text.secondary }}>
                      {card.body}
                    </p>
                  </div>
                </div>
              </Card>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
