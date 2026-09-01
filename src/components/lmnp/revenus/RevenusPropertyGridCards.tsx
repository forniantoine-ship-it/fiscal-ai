"use client";

import { useEffect } from "react";
import { Button } from "@/design-system/components/Button";
import { RevenusAnnualGrid } from "@/components/lmnp/revenus/RevenusAnnualGrid";
import {
  RevenusIsolatedTransactionsPanel,
  RevenusLowConfidencePanel,
} from "@/components/lmnp/revenus/RevenusLowConfidencePanel";
import { colors } from "@/design-system/theme/colors";
import { motions } from "@/design-system/theme/motions";
import { typography } from "@/design-system/theme/typography";
import { formatCurrency } from "@/lib/lmnp/services/revenus-profile";
import { patchPropertyRows, patchSessionUi, validateLowConfidenceTransaction } from "@/lib/lmnp/services/revenue-gpt-ui-prefill";
import {
  inferSessionRenderOrigin,
  logRevenueGridSource,
  logRevenueRenderOrigin,
  traceGridRowOrigins,
} from "@/lib/lmnp/services/revenus-runtime-trace";
import type { RevenueGptSession } from "@/lib/lmnp/types";

type RevenusPropertyGridCardsProps = {
  session: RevenueGptSession;
  fiscalYear: number;
  cardStyle: React.CSSProperties;
  onSessionChange: (session: RevenueGptSession) => void;
  onConfirm: () => void;
  showConfirm?: boolean;
};

export function RevenusPropertyGridCards({
  session,
  fiscalYear,
  cardStyle,
  onSessionChange,
  onConfirm,
  showConfirm = true,
}: RevenusPropertyGridCardsProps) {
  const expandedIds = new Set(session.ui?.expandedPropertyIds ?? []);

  function toggleProperty(propertyId: string) {
    const next = new Set(expandedIds);
    if (next.has(propertyId)) next.delete(propertyId);
    else next.add(propertyId);
    onSessionChange(
      patchSessionUi(session, { expandedPropertyIds: [...next] }),
    );
  }

  function updatePropertyRows(propertyId: string, rows: RevenueGptSession["properties"][0]["rows"]) {
    onSessionChange(patchPropertyRows(session, propertyId, rows));
  }

  function validateTransaction(propertyId: string, transactionId: string) {
    onSessionChange(validateLowConfidenceTransaction(session, propertyId, transactionId, fiscalYear));
  }

  useEffect(() => {
    logRevenueGridSource(
      session.meta?.gridSource ??
        (session.mode === "manual"
          ? "user_manual"
          : inferSessionRenderOrigin(session) === "mock_pipeline"
            ? "mock_lines"
            : "ocr_lines"),
      {
        component: "RevenusPropertyGridCards",
        propertyCount: session.properties.length,
      },
    );
    logRevenueRenderOrigin(inferSessionRenderOrigin(session), {
      component: "RevenusPropertyGridCards",
      propertyCount: session.properties.length,
    });
    for (const property of session.properties) {
      const rowOrigins = traceGridRowOrigins(property, fiscalYear);
      const populated = rowOrigins.filter((row) => row.origins.length > 0);
      if (populated.length > 0) {
        console.log("[revenue-render-origin]", {
          component: "RevenusPropertyGridCards.grid",
          propertyId: property.id,
          populatedMonths: populated.length,
          sample: populated.slice(0, 3),
        });
      }
    }
  }, [session, fiscalYear]);

  return (
    <div className="w-full space-y-4">
      {session.properties.map((property, index) => {
        const expanded = expandedIds.has(property.id);
        const annualRevenue = property.rows.reduce(
          (sum, row) => sum + row.loyers + row.autresRevenus,
          0,
        );
        const annualCharges = property.rows.reduce((sum, row) => sum + row.charges, 0);
        const rentCount = property.rows.filter(
          (row) => row.loyers > 0 || row.autresRevenus > 0,
        ).length;

        return (
          <section
            key={property.id}
            className="w-full animate-[fiscal-fade-in_450ms_cubic-bezier(0.16,1,0.3,1)_both]"
            style={{
              ...cardStyle,
              textAlign: "left",
              animationDelay: `${index * 120}ms`,
            }}
          >
            <button
              type="button"
              className="flex w-full items-start justify-between gap-4 text-left"
              onClick={() => toggleProperty(property.id)}
              aria-expanded={expanded}
            >
              <div className="min-w-0 flex-1">
                <p
                  style={{
                    fontFamily: typography.fontFamily.display,
                    fontSize: typography.fontSize.lg,
                    color: colors.text.primary,
                  }}
                >
                  {property.label}
                </p>
                <p className="mt-2" style={{ ...typography.body.desktop, color: colors.text.secondary }}>
                  {formatCurrency(annualRevenue)} · {rentCount} mois renseigné
                  {rentCount > 1 ? "s" : ""}
                </p>
                {annualCharges > 0 ? (
                  <p className="mt-1" style={{ ...typography.caption.desktop, color: colors.error.DEFAULT }}>
                    {formatCurrency(annualCharges)} de charges
                  </p>
                ) : null}
              </div>
              <span
                aria-hidden
                style={{
                  ...typography.caption.desktop,
                  color: colors.text.accent,
                  transform: expanded ? "rotate(180deg)" : "rotate(0deg)",
                  transition: motions.hover.card,
                }}
              >
                ▾
              </span>
            </button>

            {!expanded ? (
              <div className="mt-6 flex justify-center">
                <Button variant="secondary" onClick={() => toggleProperty(property.id)}>
                  Voir la grille mensuelle
                </Button>
              </div>
            ) : (
              <div className="mt-6">
                <p
                  className="mb-4"
                  style={{ ...typography.caption.desktop, color: colors.text.muted }}
                >
                  Montants suggérés par l&apos;IA — modifiez librement chaque mois.
                </p>
                <RevenusAnnualGrid
                  property={property}
                  onRowsChange={(rows) => updatePropertyRows(property.id, rows)}
                />
                <RevenusIsolatedTransactionsPanel
                  transactions={property.isolatedTransactions ?? []}
                />
                <RevenusLowConfidencePanel
                  transactions={property.lowConfidenceTransactions ?? []}
                  onValidate={(transactionId) => validateTransaction(property.id, transactionId)}
                />
              </div>
            )}
          </section>
        );
      })}

      {showConfirm ? (
        <div className="flex justify-center pt-2">
          <Button onClick={onConfirm}>Confirmer</Button>
        </div>
      ) : null}
    </div>
  );
}
