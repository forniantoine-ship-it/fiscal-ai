"use client";

import { useEffect, useState } from "react";

import { Button } from "@/design-system/components/Button";
import { colors } from "@/design-system/theme/colors";
import { gradients } from "@/design-system/theme/gradients";
import { motions } from "@/design-system/theme/motions";
import { radius } from "@/design-system/theme/radius";
import { shadows } from "@/design-system/theme/shadows";
import { spacing } from "@/design-system/theme/spacing";
import { typography } from "@/design-system/theme/typography";
import { formatCurrency } from "@/lib/lmnp/services/charges-profile";
import type { ChargesAmortizationSuggestion } from "@/lib/lmnp/types";

type ChargesAmortizationSuggestionsProps = {
  suggestions: ChargesAmortizationSuggestion[];
  onTransfer: (suggestionId: string) => void;
  onKeepAsCharge: (suggestionId: string) => void;
  transferringId?: string | null;
  transferConfirmedId?: string | null;
};

export function ChargesAmortizationSuggestions({
  suggestions,
  onTransfer,
  onKeepAsCharge,
  transferringId,
  transferConfirmedId,
}: ChargesAmortizationSuggestionsProps) {
  const pending = suggestions.filter((item) => item.status === "pending");
  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    if (pending.length === 0) {
      setRevealed(false);
      return;
    }
    const timer = window.setTimeout(() => setRevealed(true), 480);
    return () => window.clearTimeout(timer);
  }, [pending.length]);

  if (!pending.length) return null;

  return (
    <section
      className="w-full space-y-4 animate-[fiscal-fade-in_450ms_cubic-bezier(0.16,1,0.3,1)_both]"
      style={{ opacity: revealed ? 1 : 0, transition: motions.hover.card }}
    >
      <header className="mx-auto max-w-lg text-center">
        <p
          style={{
            ...typography.caption.desktop,
            color: colors.text.accent,
            letterSpacing: typography.letterSpacing.label,
          }}
        >
          Analyse terminée
        </p>
        <p
          className="mt-2"
          style={{
            fontFamily: typography.fontFamily.display,
            fontSize: typography.fontSize.lg,
            color: colors.text.primary,
          }}
        >
          Suggestions d&apos;amortissement
        </p>
        <p className="mt-2" style={{ ...typography.body.desktop, color: colors.text.secondary }}>
          L&apos;IA a analysé l&apos;ensemble de vos charges et identifie les dépenses dont la nature
          pourrait justifier un amortissement.
        </p>
      </header>

      <div className="space-y-4">
        {pending.map((suggestion, index) => (
          <SuggestionCard
            key={suggestion.id}
            suggestion={suggestion}
            index={index}
            onTransfer={() => onTransfer(suggestion.id)}
            onKeepAsCharge={() => onKeepAsCharge(suggestion.id)}
            isTransferring={transferringId === suggestion.id}
            isConfirmed={transferConfirmedId === suggestion.id}
          />
        ))}
      </div>
    </section>
  );
}

function SuggestionCard({
  suggestion,
  index,
  onTransfer,
  onKeepAsCharge,
  isTransferring,
  isConfirmed,
}: {
  suggestion: ChargesAmortizationSuggestion;
  index: number;
  onTransfer: () => void;
  onKeepAsCharge: () => void;
  isTransferring: boolean;
  isConfirmed: boolean;
}) {
  const sageAccent = "#5c7a6b";

  if (isConfirmed) {
    return (
      <article
        className="mx-auto max-w-xl animate-[fiscal-fade-in_450ms_cubic-bezier(0.16,1,0.3,1)_both]"
        style={{
          borderRadius: radius.lg,
          border: `1px solid ${sageAccent}33`,
          backgroundColor: colors.surface.primary,
          boxShadow: shadows.card.default,
          padding: spacing.card.md,
          textAlign: "center",
          animationDelay: `${index * 80}ms`,
        }}
      >
        <p
          style={{
            fontFamily: typography.fontFamily.display,
            fontSize: typography.fontSize.lg,
            color: sageAccent,
          }}
        >
          Ajouté aux amortissements
        </p>
        <p className="mt-2" style={{ ...typography.caption.desktop, color: colors.text.secondary }}>
          {suggestion.label} — disponible dans l&apos;étape Amortissements
        </p>
      </article>
    );
  }

  return (
    <article
      className="mx-auto max-w-xl animate-[fiscal-fade-in_450ms_cubic-bezier(0.16,1,0.3,1)_both]"
      style={{
        borderRadius: radius.lg,
        border: `1px solid ${colors.border.subtle}`,
        boxShadow: shadows.card.default,
        padding: spacing.card.md,
        backgroundImage: [
          `radial-gradient(ellipse 90% 60% at 100% 0%, ${colors.orange[100]}55 0%, transparent 55%)`,
          `radial-gradient(ellipse 70% 50% at 0% 100%, ${sageAccent}18 0%, transparent 50%)`,
          gradients.card.elevated,
        ].join(", "),
        animationDelay: `${index * 120}ms`,
      }}
    >
      <p
        style={{
          fontFamily: typography.fontFamily.display,
          fontSize: typography.fontSize.lg,
          color: colors.text.primary,
        }}
      >
        {suggestion.label}
      </p>
      <p className="mt-2" style={{ ...typography.body.desktop, color: colors.text.secondary }}>
        Cette dépense pourrait être amortie selon sa nature.
      </p>
      <p className="mt-1" style={{ ...typography.caption.desktop, color: colors.text.muted }}>
        {suggestion.natureSummary}
      </p>

      <ul className="mt-4 space-y-1.5">
        <li style={{ ...typography.body.desktop, color: colors.text.secondary }}>
          → {suggestion.amortCategory}
        </li>
        <li style={{ ...typography.body.desktop, color: colors.text.secondary }}>
          → Durée suggérée : {suggestion.durationYears} ans
        </li>
        <li style={{ ...typography.body.desktop, color: colors.text.secondary }}>
          → {formatCurrency(suggestion.amount)}
        </li>
      </ul>

      <div className="mt-6 flex flex-col items-stretch gap-3 sm:flex-row sm:justify-center">
        <Button onClick={onTransfer} disabled={isTransferring}>
          {isTransferring ? "Ajout en cours…" : "Ajouter aux amortissements"}
        </Button>
        <Button variant="secondary" onClick={onKeepAsCharge} disabled={isTransferring}>
          Conserver en charge
        </Button>
      </div>
    </article>
  );
}
