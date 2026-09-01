"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";

import { colors } from "@/design-system/theme/colors";
import { dashboardAtmosphereLayers } from "@/design-system/theme/app-atmosphere";
import { gradients } from "@/design-system/theme/gradients";
import { motions } from "@/design-system/theme/motions";
import { radius } from "@/design-system/theme/radius";
import { shadows } from "@/design-system/theme/shadows";
import { spacing } from "@/design-system/theme/spacing";
import { typography } from "@/design-system/theme/typography";

import {
  createDashboardLayoutCssVariables,
  DASHBOARD_GUTTER,
} from "@/design-system/layouts/dashboard-layout-variables";
import { signOutWithSession } from "@/lib/lmnp/auth/auth-session";
import { resolveAutosaveDisplay } from "@/lib/lmnp/store/workspace-autosave-display";

export {
  createDashboardLayoutCssVariables,
  DASHBOARD_GUTTER,
  getDashboardHeaderHeightExpression,
} from "@/design-system/layouts/dashboard-layout-variables";

export type AutosaveStatus = "saved" | "saving" | "error" | "idle";

export type DashboardLayoutProps = {
  children: ReactNode;
  declarationYear?: number | string;
  autosaveStatus?: AutosaveStatus;
  persistenceUserId?: string | null;
  userName?: string;
  userInitials?: string;
  /**
   * Parcours chapitres plein écran (/dashboard) : le footer est rendu
   * à la fin du scroll chapitres, pas dans le shell global.
   */
  chapterJourney?: boolean;
};

function FiscalMark({ compact = false }: { compact?: boolean }) {
  return (
    <Link href="/dashboard" className="inline-flex items-center gap-2.5" style={{ textDecoration: "none" }}>
      <span
        aria-hidden
        className="inline-flex items-center justify-center"
        style={{
          width: compact ? "28px" : "32px",
          height: compact ? "28px" : "32px",
          borderRadius: radius.sm,
          backgroundImage: gradients.button.primary,
          boxShadow: shadows.button.primary,
          color: colors.text.inverse,
          fontFamily: typography.fontFamily.sans,
          fontSize: compact ? typography.fontSize.xs : typography.fontSize.sm,
          fontWeight: typography.fontWeight.medium,
        }}
      >
        F
      </span>
      {!compact ? (
        <span
          style={{
            fontFamily: typography.fontFamily.display,
            fontSize: typography.fontSize.lg,
            lineHeight: typography.lineHeight.title,
            letterSpacing: typography.letterSpacing.title,
            fontWeight: typography.fontWeight.regular,
            color: colors.text.primary,
          }}
        >
          Fiscal AI
        </span>
      ) : null}
    </Link>
  );
}

function AutosaveIndicator({
  status,
  persistenceUserId = null,
}: {
  status: AutosaveStatus;
  persistenceUserId?: string | null;
}) {
  const display = resolveAutosaveDisplay(status, persistenceUserId ?? null);
  if (!display) return null;

  const dotColor =
    display.tone === "saved"
      ? colors.success.DEFAULT
      : display.tone === "saving"
        ? colors.orange[500]
        : colors.error.DEFAULT;

  return (
    <div
      className={
        display.tone === "error" && !persistenceUserId
          ? "flex items-center"
          : "hidden items-center sm:flex"
      }
      style={{ gap: spacing.scale[2], ...typography.caption.desktop, color: colors.text.muted }}
      aria-live="polite"
    >
      <span
        aria-hidden
        className="inline-block h-1.5 w-1.5 rounded-full"
        style={{
          backgroundColor: dotColor,
          animation: display.tone === "saving" ? motions.analyzing.pulse : undefined,
        }}
      />
      {display.label}
    </div>
  );
}

function ProfileMenu({
  userName = "Mon compte",
  userInitials = "FA",
}: {
  userName?: string;
  userInitials?: string;
}) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    const onEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onEscape);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onEscape);
    };
  }, [open]);

  return (
    <div ref={menuRef} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="inline-flex items-center"
        style={{
          gap: spacing.scale[3],
          padding: spacing.scale[1],
          paddingLeft: spacing.scale[2],
          borderRadius: radius.full,
          border: `1px solid ${colors.border.subtle}`,
          backgroundColor: colors.surface.primary,
          boxShadow: shadows.card.default,
          transition: motions.hover.icon,
        }}
      >
        <span
          className="hidden sm:inline"
          style={{ ...typography.navigation.desktop, color: colors.text.secondary }}
        >
          {userName}
        </span>
        <span
          aria-hidden
          className="inline-flex h-8 w-8 items-center justify-center"
          style={{
            borderRadius: radius.full,
            backgroundColor: colors.surface.secondary,
            color: colors.text.secondary,
            ...typography.caption.desktop,
            fontWeight: typography.fontWeight.medium,
          }}
        >
          {userInitials}
        </span>
      </button>

      {open ? (
        <div
          role="menu"
          className="absolute right-0 z-50 min-w-[200px]"
          style={{
            top: `calc(100% + ${spacing.scale[2]})`,
            padding: spacing.scale[2],
            borderRadius: radius.lg,
            border: `1px solid ${colors.border.subtle}`,
            backgroundColor: colors.surface.primary,
            boxShadow: shadows.modal.dropdown,
            transition: motions.modal.popover,
          }}
        >
          {[
            { label: "Mon compte", href: "/dashboard" },
            { label: "Paramètres", href: "/dashboard" },
            { label: "Déconnexion", href: "/login" },
          ].map((item) => (
            <Link
              key={item.label}
              href={item.href}
              role="menuitem"
              onClick={(event) => {
                setOpen(false);
                if (item.label !== "Déconnexion") return;
                event.preventDefault();
                void signOutWithSession().then(() => {
                  window.location.assign("/login");
                });
              }}
              className="block"
              style={{
                ...typography.navigation.desktop,
                color: colors.text.secondary,
                padding: `${spacing.scale[2]} ${spacing.scale[3]}`,
                borderRadius: radius.md,
                transition: motions.hover.nav,
              }}
              onMouseEnter={(event) => {
                event.currentTarget.style.backgroundColor = colors.surface.interactive;
                event.currentTarget.style.color = colors.text.primary;
              }}
              onMouseLeave={(event) => {
                event.currentTarget.style.backgroundColor = "transparent";
                event.currentTarget.style.color = colors.text.secondary;
              }}
            >
              {item.label}
            </Link>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function DashboardTopBar({
  declarationYear,
  autosaveStatus,
  persistenceUserId,
  userName,
  userInitials,
}: {
  declarationYear: number | string;
  autosaveStatus: AutosaveStatus;
  persistenceUserId?: string | null;
  userName?: string;
  userInitials?: string;
}) {
  return (
    <div
      className="flex w-full items-center justify-between"
      style={{
        paddingInline: DASHBOARD_GUTTER,
        paddingBlock: spacing.scale[5],
      }}
    >
      <FiscalMark />

      <div className="flex items-center" style={{ gap: spacing.scale[4] }}>
        <span
          style={{
            ...typography.caption.desktop,
            color: colors.text.tertiary,
            letterSpacing: typography.letterSpacing.label,
            padding: `${spacing.scale[2]} ${spacing.scale[3]}`,
            borderRadius: radius.full,
            backgroundColor: colors.surface.secondary,
          }}
        >
          Exercice {declarationYear}
        </span>
        <AutosaveIndicator status={autosaveStatus} persistenceUserId={persistenceUserId} />
        <ProfileMenu userName={userName} userInitials={userInitials} />
      </div>
    </div>
  );
}

export function DashboardFooter() {
  return (
    <footer
      className="w-full"
      style={{
        paddingInline: DASHBOARD_GUTTER,
        paddingTop: spacing.scale[8],
        paddingBottom: spacing.scale[6],
      }}
    >
      <div
        className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center"
        style={{
          paddingTop: spacing.scale[6],
          borderTop: `1px solid ${colors.border.subtle}`,
        }}
      >
        <p style={{ ...typography.caption.desktop, color: colors.text.muted }}>
          Fiscal AI · Accompagnement LMNP
        </p>
        <div className="flex items-center" style={{ gap: spacing.scale[6] }}>
          <Link
            href="/dashboard"
            style={{ ...typography.caption.desktop, color: colors.text.muted, transition: motions.hover.nav }}
          >
            Aide
          </Link>
          <Link
            href="/dashboard"
            style={{ ...typography.caption.desktop, color: colors.text.muted, transition: motions.hover.nav }}
          >
            Support
          </Link>
        </div>
      </div>
    </footer>
  );
}

export function DashboardLayout({
  children,
  declarationYear = new Date().getFullYear() - 1,
  autosaveStatus = "idle",
  persistenceUserId = null,
  userName,
  userInitials,
  chapterJourney = false,
}: DashboardLayoutProps) {
  return (
    <div
      className="relative min-h-screen"
      style={{
        backgroundColor: "#FFF8F0",
        backgroundImage: gradients.dashboard.background,
        backgroundAttachment: "fixed",
        backgroundSize: "cover",
      }}
    >
      {dashboardAtmosphereLayers().map((layer) => (
        <div key={layer.id} aria-hidden className={layer.className} style={layer.style} />
      ))}

      <div
        className="relative flex flex-col"
        style={{
          ...createDashboardLayoutCssVariables(),
          ...(chapterJourney
            ? { height: "100dvh", overflow: "hidden" }
            : { minHeight: "100vh" }),
        }}
      >
        <header
          style={{
            borderBottom: `1px solid ${colors.border.subtle}`,
            backgroundColor: "rgba(251, 248, 243, 0.84)",
            backdropFilter: "blur(16px)",
            WebkitBackdropFilter: "blur(16px)",
          }}
        >
          <DashboardTopBar
            declarationYear={declarationYear}
            autosaveStatus={autosaveStatus}
            persistenceUserId={persistenceUserId}
            userName={userName}
            userInitials={userInitials}
          />
        </header>

        <main
          className="mx-auto flex w-full min-h-0 flex-1 flex-col"
          style={{
            maxWidth: spacing.container.default,
            paddingInline: DASHBOARD_GUTTER,
            paddingTop: spacing.responsive.headerToMain.desktop,
            paddingBottom: chapterJourney ? 0 : spacing.section.gap,
            transition: motions.page.enter,
            overflow: chapterJourney ? "hidden" : undefined,
          }}
        >
          <div className="min-h-0 flex-1" style={{ transition: motions.workflow.content }}>
            {children}
          </div>
        </main>

        {!chapterJourney ? <DashboardFooter /> : null}
      </div>
    </div>
  );
}

export default DashboardLayout;
