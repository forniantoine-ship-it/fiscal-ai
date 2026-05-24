"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";

import { colors } from "@/design-system/theme/colors";
import { gradients } from "@/design-system/theme/gradients";
import { motions } from "@/design-system/theme/motions";
import { radius } from "@/design-system/theme/radius";
import { shadows } from "@/design-system/theme/shadows";
import { spacing } from "@/design-system/theme/spacing";
import { typography } from "@/design-system/theme/typography";

const GUTTER = `clamp(${spacing.gutter.mobile}, 4vw, ${spacing.gutter.desktop})`;
const SIDEBAR_WIDTH = "240px";

const SIDEBAR_NAV = [
  { label: "Tableau de bord", href: "/dashboard" },
  { label: "Mon activité", href: "/activite" },
  { label: "Documents", href: "/documents" },
  { label: "Amortissements", href: "/amortissements" },
  { label: "Revenus", href: "/revenus" },
  { label: "Charges", href: "/depenses" },
  { label: "Déclarations", href: "/declarations" },
] as const;

export type AutosaveStatus = "saved" | "saving" | "error" | "idle";

export type DashboardLayoutProps = {
  children: ReactNode;
  declarationYear?: number | string;
  autosaveStatus?: AutosaveStatus;
  userName?: string;
  userInitials?: string;
};

function isNavActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

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

function AutosaveIndicator({ status }: { status: AutosaveStatus }) {
  const copy =
    status === "saved"
      ? "Enregistré"
      : status === "saving"
        ? "Enregistrement…"
        : status === "error"
          ? "Erreur de sauvegarde"
          : "";

  if (status === "idle") return null;

  const dotColor =
    status === "saved"
      ? colors.success.DEFAULT
      : status === "saving"
        ? colors.orange[500]
        : colors.error.DEFAULT;

  return (
    <div
      className="hidden items-center sm:flex"
      style={{ gap: spacing.scale[2], ...typography.caption.desktop, color: colors.text.muted }}
      aria-live="polite"
    >
      <span
        aria-hidden
        className="inline-block h-1.5 w-1.5 rounded-full"
        style={{
          backgroundColor: dotColor,
          animation: status === "saving" ? motions.analyzing.pulse : undefined,
        }}
      />
      {copy}
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
            { label: "Déconnexion", href: "/connexion" },
          ].map((item) => (
            <Link
              key={item.label}
              href={item.href}
              role="menuitem"
              onClick={() => setOpen(false)}
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
  userName,
  userInitials,
  onMenuToggle,
}: {
  declarationYear: number | string;
  autosaveStatus: AutosaveStatus;
  userName?: string;
  userInitials?: string;
  onMenuToggle: () => void;
}) {
  return (
    <div
      className="flex w-full items-center justify-between"
      style={{
        paddingInline: GUTTER,
        paddingBlock: spacing.scale[5],
      }}
    >
      <div className="flex items-center" style={{ gap: spacing.scale[4] }}>
        <button
          type="button"
          className="inline-flex lg:hidden"
          aria-label="Ouvrir le menu"
          onClick={onMenuToggle}
          style={{
            padding: spacing.scale[2],
            borderRadius: radius.md,
            border: `1px solid ${colors.border.subtle}`,
            backgroundColor: colors.surface.primary,
            color: colors.text.secondary,
          }}
        >
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden>
            <path
              d="M2.25 4.5h13.5M2.25 9h13.5M2.25 13.5h13.5"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </svg>
        </button>
        <FiscalMark compact />
      </div>

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
        <AutosaveIndicator status={autosaveStatus} />
        <ProfileMenu userName={userName} userInitials={userInitials} />
      </div>
    </div>
  );
}

function SidebarNav({
  pathname,
  mobileOpen,
  onNavigate,
}: {
  pathname: string;
  mobileOpen: boolean;
  onNavigate: () => void;
}) {
  return (
    <nav
      aria-label="Navigation du dossier"
      className={[
        "fixed inset-y-0 left-0 z-40 flex flex-col lg:static lg:translate-x-0",
        mobileOpen ? "translate-x-0" : "-translate-x-full",
      ].join(" ")}
      style={{
        width: SIDEBAR_WIDTH,
        padding: spacing.scale[4],
        paddingTop: spacing.scale[6],
        borderRight: `1px solid ${colors.border.subtle}`,
        backgroundColor: "rgba(255, 255, 255, 0.72)",
        backdropFilter: "blur(16px)",
        WebkitBackdropFilter: "blur(16px)",
        transition: motions.page.enter,
      }}
    >
      <div className="mb-6 hidden lg:block">
        <FiscalMark />
      </div>

      <ul className="flex flex-col" style={{ gap: spacing.workflow.stepGap }}>
        {SIDEBAR_NAV.map((item) => {
          const active = isNavActive(pathname, item.href);

          return (
            <li key={item.href}>
              <Link
                href={item.href}
                onClick={onNavigate}
                className="relative block"
                style={{
                  ...(active ? typography.workflow.active : typography.navigation.desktop),
                  color: active ? colors.text.primary : colors.text.tertiary,
                  padding: spacing.workflow.stepPadding,
                  paddingLeft: active ? spacing.scale[4] : spacing.workflow.stepPadding,
                  borderRadius: radius.md,
                  backgroundColor: active ? colors.surface.selected : "transparent",
                  border: active ? `1px solid ${colors.border.selected}` : "1px solid transparent",
                  transition: motions.workflow.step,
                }}
                onMouseEnter={(event) => {
                  if (!active) {
                    event.currentTarget.style.backgroundColor = colors.surface.interactive;
                    event.currentTarget.style.color = colors.text.secondary;
                  }
                }}
                onMouseLeave={(event) => {
                  if (!active) {
                    event.currentTarget.style.backgroundColor = "transparent";
                    event.currentTarget.style.color = colors.text.tertiary;
                  }
                }}
              >
                {active ? (
                  <span
                    aria-hidden
                    className="absolute left-0 top-1/2 -translate-y-1/2"
                    style={{
                      width: "3px",
                      height: "60%",
                      borderRadius: radius.full,
                      backgroundColor: colors.orange[500],
                      boxShadow: `0 0 10px ${colors.orange[200]}`,
                    }}
                  />
                ) : null}
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

function DashboardFooter() {
  return (
    <footer
      className="w-full"
      style={{
        paddingInline: GUTTER,
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
  userName,
  userInitials,
}: DashboardLayoutProps) {
  const pathname = usePathname();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  useEffect(() => {
    setMobileNavOpen(false);
  }, [pathname]);

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
        className="pointer-events-none absolute inset-y-0 left-0 w-1/3"
        style={{ backgroundImage: gradients.app.diffusionLeft, opacity: 0.85 }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-y-0 right-0 w-1/3"
        style={{ backgroundImage: gradients.app.diffusionRight, opacity: 0.85 }}
      />

      <div className="relative flex min-h-screen">
        {mobileNavOpen ? (
          <button
            type="button"
            aria-label="Fermer le menu"
            className="fixed inset-0 z-30 bg-black/10 lg:hidden"
            onClick={() => setMobileNavOpen(false)}
          />
        ) : null}

        <SidebarNav
          pathname={pathname}
          mobileOpen={mobileNavOpen}
          onNavigate={() => setMobileNavOpen(false)}
        />

        <div className="flex min-h-screen min-w-0 flex-1 flex-col">
          <header
            style={{
              borderBottom: `1px solid ${colors.border.subtle}`,
              backgroundColor: "rgba(250, 248, 245, 0.78)",
              backdropFilter: "blur(16px)",
              WebkitBackdropFilter: "blur(16px)",
            }}
          >
            <DashboardTopBar
              declarationYear={declarationYear}
              autosaveStatus={autosaveStatus}
              userName={userName}
              userInitials={userInitials}
              onMenuToggle={() => setMobileNavOpen((open) => !open)}
            />
          </header>

          <main
            className="mx-auto w-full flex-1"
            style={{
              maxWidth: spacing.container.default,
              paddingInline: GUTTER,
              paddingTop: spacing.responsive.headerToMain.desktop,
              paddingBottom: spacing.section.gap,
              transition: motions.page.enter,
            }}
          >
            <div style={{ transition: motions.workflow.content }}>{children}</div>
          </main>

          <DashboardFooter />
        </div>
      </div>
    </div>
  );
}

export default DashboardLayout;
