"use client";

import { Button } from "@/design-system/components/Button";
import { Card } from "@/design-system/components/Card";
import { colors } from "@/design-system/theme/colors";
import { spacing } from "@/design-system/theme/spacing";
import { typography } from "@/design-system/theme/typography";
import type { FeedbackMessage } from "./FeedbackProvider";

const KIND_STYLES = {
  success: {
    border: colors.success.border,
    background: colors.success.surface,
    title: colors.success.DEFAULT,
  },
  error: {
    border: colors.error.border,
    background: colors.error.surface,
    title: colors.error.DEFAULT,
  },
  info: {
    border: colors.border.selected,
    background: colors.surface.selected,
    title: colors.text.accent,
  },
} as const;

interface FeedbackToastStackProps {
  messages: FeedbackMessage[];
  onDismiss: (id: string) => void;
}

export function FeedbackToastStack({ messages, onDismiss }: FeedbackToastStackProps) {
  if (messages.length === 0) return null;

  return (
    <div
      className="pointer-events-none fixed bottom-4 right-4 z-[100] flex w-full max-w-sm flex-col gap-2 px-4 sm:px-0"
      aria-live="polite"
    >
      {messages.map((message) => {
        const palette = KIND_STYLES[message.kind];

        return (
          <Card
            key={message.id}
            className="pointer-events-auto !p-4"
            style={{
              border: `1px solid ${palette.border}`,
              backgroundColor: palette.background,
            }}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p style={{ ...typography.body.desktop, color: palette.title, fontWeight: typography.fontWeight.medium }}>
                  {message.title}
                </p>
                {message.description ? (
                  <p
                    className="mt-1"
                    style={{ ...typography.caption.desktop, color: colors.text.secondary, lineHeight: typography.lineHeight.relaxed }}
                  >
                    {message.description}
                  </p>
                ) : null}
                {message.href ? (
                  <Button href={message.href} variant="ghost" className="!mt-2 !min-h-0 !px-0 !py-1">
                    Voir →
                  </Button>
                ) : null}
              </div>
              <button
                type="button"
                onClick={() => onDismiss(message.id)}
                style={{ ...typography.caption.desktop, color: colors.text.muted }}
                aria-label="Fermer"
              >
                ×
              </button>
            </div>
          </Card>
        );
      })}
    </div>
  );
}
