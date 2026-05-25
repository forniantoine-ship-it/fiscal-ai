import type { CSSProperties } from "react";

import { colors } from "@/design-system/theme/colors";
import { gradients } from "@/design-system/theme/gradients";
import { radius } from "@/design-system/theme/radius";
import { spacing } from "@/design-system/theme/spacing";
import { typography } from "@/design-system/theme/typography";

interface AppLoadingSkeletonProps {
  message?: string;
}

function PulseBlock({
  className = "",
  style,
}: {
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <div
      className={`animate-pulse ${className}`}
      style={{
        backgroundColor: colors.surface.secondary,
        borderRadius: radius.md,
        ...style,
      }}
    />
  );
}

export function AppLoadingSkeleton({ message }: AppLoadingSkeletonProps) {
  return (
    <div
      className="relative min-h-screen"
      style={{
        backgroundColor: colors.background.app,
        backgroundImage: gradients.app.background,
        backgroundAttachment: "fixed",
        backgroundSize: "cover",
      }}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{ backgroundImage: gradients.app.centerLight }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-y-0 left-0 w-[38%] max-w-lg"
        style={{ backgroundImage: gradients.app.diffusionLeft }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-y-0 right-0 w-[38%] max-w-lg"
        style={{ backgroundImage: gradients.app.diffusionRight }}
      />
      <div className="relative">
      <div
        style={{
          borderBottom: `1px solid ${colors.border.subtle}`,
          paddingInline: spacing.scale[6],
          paddingBlock: spacing.scale[4],
        }}
      >
        <div className="mx-auto flex max-w-7xl items-center justify-between">
          <div className="space-y-2">
            <PulseBlock style={{ height: "16px", width: "128px" }} />
            <PulseBlock style={{ height: "12px", width: "192px" }} />
          </div>
          <PulseBlock
            className="rounded-full"
            style={{ height: "36px", width: "36px" }}
          />
        </div>
      </div>

      <div className="mx-auto flex max-w-7xl">
        <aside
          className="hidden shrink-0 sm:block"
          style={{
            width: "224px",
            borderRight: `1px solid ${colors.border.subtle}`,
            padding: spacing.scale[4],
          }}
        >
          <div className="space-y-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <PulseBlock key={i} style={{ height: "36px" }} />
            ))}
          </div>
        </aside>

        <main className="flex-1" style={{ padding: spacing.scale[8] }}>
          <PulseBlock style={{ height: "32px", width: "256px" }} />
          <PulseBlock
            className="mt-3"
            style={{ height: "16px", width: "384px", maxWidth: "100%" }}
          />
          <PulseBlock
            className="mt-8"
            style={{ height: "160px", borderRadius: radius.xl }}
          />
          <div className="mt-4 grid gap-4 sm:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <PulseBlock key={i} style={{ height: "96px", borderRadius: radius.lg }} />
            ))}
          </div>
        </main>
      </div>

      {message ? (
        <p
          className="fixed bottom-6 left-1/2 z-10 -translate-x-1/2"
          style={{
            ...typography.caption.desktop,
            color: colors.text.secondary,
            padding: `${spacing.scale[2]} ${spacing.scale[4]}`,
            borderRadius: radius.full,
            border: `1px solid ${colors.border.subtle}`,
            backgroundColor: colors.surface.primary,
            boxShadow: "0 4px 24px rgba(28, 25, 23, 0.06)",
          }}
        >
          {message}
        </p>
      ) : null}
      <p className="sr-only">{message ?? "Chargement de votre dossier…"}</p>
      </div>
    </div>
  );
}
