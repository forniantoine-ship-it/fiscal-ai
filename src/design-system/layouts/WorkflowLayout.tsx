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

const WORKFLOW_STEPS = [
  { id: "dashboard", label: "Tableau de bord", path: "" },
  { id: "activite", label: "Mon activité", path: "activite" },
  { id: "logement", label: "Logement", path: "etape/logement" },
  { id: "credit", label: "Crédit", path: "emprunts" },
  { id: "amortissements", label: "Amortissements & travaux", path: "immobilisations" },
  { id: "revenus", label: "Revenus", path: "recettes" },
  { id: "charges", label: "Charges", path: "depenses" },
  { id: "validation", label: "Validation", path: "validation" },
] as const;

export type WorkflowStepId = (typeof WORKFLOW_STEPS)[number]["id"];
export type WorkflowStepState = "completed" | "in_progress" | "incomplete";
export type AutosaveStatus = "saved" | "saving" | "error" | "idle";

export type WorkflowAction = {
  label: string;
  href?: string;
  onClick?: () => void;
  disabled?: boolean;
};

export type WorkflowLayoutProps = {
  children: ReactNode;
  exerciceId: string;
  declarationYear: number | string;
  autosaveStatus?: AutosaveStatus;
  userName?: string;
  userInitials?: string;
  /** Per-step completion state — discreet, non-stressful indicators */
  stepStatuses?: Partial<Record<WorkflowStepId, WorkflowStepState>>;
  /** Sticky bottom primary action (Continuer, Confirmer…) */
  primaryAction?: WorkflowAction;
  /** Optional secondary action (Enregistrer, Retour…) */
  secondaryAction?: WorkflowAction;
  /** Hide the bottom action bar entirely */
  hideActionBar?: boolean;
};

function navHref(exerciceId: string, path: string) {
  const base = `/app/exercices/${exerciceId}`;
  return path ? `${base}/${path}` : base;
}

function isNavActive(pathname: string, exerciceId: string, path: string) {
  const href = navHref(exerciceId, path);
  if (path === "") {
    return pathname === href || pathname === `${href}/`;
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

function FiscalMark() {
  return (
    <Link href="/app" className="inline-flex items-center gap-2.5" style={{ textDecoration: "none" }}>
      <span
        aria-hidden
        className="inline-flex h-8 w-8 items-center justify-center"
        style={{
          borderRadius: radius.sm,
          backgroundImage: gradients.button.primary,
          boxShadow: shadows.button.primary,
          color: colors.text.inverse,
          fontFamily: typography.fontFamily.sans,
          fontSize: typography.fontSize.sm,
          fontWeight: typography.fontWeight.medium,
        }}
      >
        F
      </span>
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
    </Link>
  );
}

function AutosaveIndicator({ status }: { status: AutosaveStatus }) {
  if (status === "idle") return null;

  const copy =
    status === "saved"
      ? "Enregistré"
      : status === "saving"
        ? "Enregistrement…"
        : "Erreur de sauvegarde";

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
      if (!menuRef.current?.contains(event.target as Node)) setOpen(false);
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
        aria-label="Menu utilisateur"
        onClick={() => setOpen((value) => !value)}
        className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center sm:min-w-0"
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
          className="inline-flex h-9 w-9 items-center justify-center sm:h-8 sm:w-8"
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
          }}
        >
          {[
            { label: "Mon compte", href: "/app/compte" },
            { label: "Paramètres", href: "/app/parametres" },
            { label: "Déconnexion", href: "/connexion" },
          ].map((item) => (
            <Link
              key={item.href}
              href={item.href}
              role="menuitem"
              onClick={() => setOpen(false)}
              className="block"
              style={{
                ...typography.navigation.desktop,
                color: colors.text.secondary,
                padding: `${spacing.scale[3]} ${spacing.scale[3]}`,
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

function StepStateDot({ state }: { state: WorkflowStepState }) {
  if (state === "completed") {
    return (
      <span
        aria-hidden
        className="inline-block shrink-0 rounded-full"
        style={{
          width: "6px",
          height: "6px",
          backgroundColor: colors.success.muted,
          opacity: 0.85,
        }}
      />
    );
  }

  if (state === "in_progress") {
    return (
      <span
        aria-hidden
        className="inline-block shrink-0 rounded-full"
        style={{
          width: "6px",
          height: "6px",
          backgroundColor: colors.orange[400],
          opacity: 0.9,
        }}
      />
    );
  }

  return (
    <span
      aria-hidden
      className="inline-block shrink-0 rounded-full"
      style={{
        width: "6px",
        height: "6px",
        border: `1px solid ${colors.border.default}`,
        backgroundColor: "transparent",
        opacity: 0.7,
      }}
    />
  );
}

function WorkflowStepNav({
  exerciceId,
  pathname,
  stepStatuses,
}: {
  exerciceId: string;
  pathname: string;
  stepStatuses: Partial<Record<WorkflowStepId, WorkflowStepState>>;
}) {
  const activeRef = useRef<HTMLLIElement>(null);

  useEffect(() => {
    activeRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "nearest",
      inline: "center",
    });
  }, [pathname]);

  return (
    <nav
      aria-label="Étapes du dossier LMNP"
      className="mx-auto w-full overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      style={{
        maxWidth: spacing.container.default,
        paddingInline: GUTTER,
      }}
    >
      <ul
        className="flex min-w-max items-center"
        style={{
          gap: spacing.scale[6],
          paddingBottom: spacing.scale[4],
          borderBottom: `1px solid ${colors.border.subtle}`,
        }}
      >
        {WORKFLOW_STEPS.map((step) => {
          const active = isNavActive(pathname, exerciceId, step.path);
          const href = navHref(exerciceId, step.path);
          const state = stepStatuses[step.id] ?? "incomplete";

          return (
            <li
              key={step.id}
              ref={active ? activeRef : undefined}
              className="relative"
            >
              <Link
                href={href}
                className="inline-flex min-h-[44px] items-center"
                style={{
                  gap: spacing.scale[2],
                  ...(active ? typography.workflow.active : typography.workflow.desktop),
                  color: active ? colors.text.primary : colors.text.tertiary,
                  paddingBottom: spacing.scale[3],
                  whiteSpace: "nowrap",
                  transition: motions.workflow.step,
                }}
                aria-current={active ? "page" : undefined}
                onMouseEnter={(event) => {
                  if (!active) event.currentTarget.style.color = colors.text.secondary;
                }}
                onMouseLeave={(event) => {
                  if (!active) event.currentTarget.style.color = colors.text.tertiary;
                }}
              >
                <StepStateDot state={active ? "in_progress" : state} />
                {step.label}
              </Link>
              {active ? (
                <span
                  aria-hidden
                  className="absolute left-0 right-0"
                  style={{
                    bottom: "-1px",
                    height: "2px",
                    borderRadius: radius.full,
                    backgroundColor: colors.orange[500],
                    opacity: 0.85,
                    transition: motions.workflow.indicator,
                  }}
                />
              ) : null}
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

function WorkflowActionButton({
  action,
  variant = "primary",
}: {
  action: WorkflowAction;
  variant?: "primary" | "secondary";
}) {
  const [hovered, setHovered] = useState(false);
  const [pressed, setPressed] = useState(false);
  const isPrimary = variant === "primary";

  const sharedStyle = {
    ...typography.button.desktop,
    borderRadius: radius.full,
    padding: `${spacing.scale[3]} ${spacing.scale[8]}`,
    minHeight: "44px",
    display: "inline-flex" as const,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    whiteSpace: "nowrap" as const,
    transition: motions.hover.button,
    opacity: action.disabled ? 0.5 : 1,
    pointerEvents: action.disabled ? ("none" as const) : ("auto" as const),
  };

  const primaryStyle = {
    ...sharedStyle,
    color: colors.text.inverse,
    backgroundImage: pressed
      ? gradients.button.primaryPressed
      : hovered
        ? gradients.button.primaryHover
        : gradients.button.primary,
    boxShadow: hovered ? shadows.button.primaryHover : shadows.button.primary,
  };

  const secondaryStyle = {
    ...sharedStyle,
    color: colors.text.secondary,
    backgroundColor: hovered ? colors.surface.interactive : "transparent",
    border: `1px solid ${hovered ? colors.border.strong : colors.border.default}`,
  };

  const style = isPrimary ? primaryStyle : secondaryStyle;

  if (action.href && !action.disabled) {
    return (
      <Link
        href={action.href}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => {
          setHovered(false);
          setPressed(false);
        }}
        onMouseDown={() => setPressed(true)}
        onMouseUp={() => setPressed(false)}
        style={style}
      >
        {action.label}
      </Link>
    );
  }

  return (
    <button
      type="button"
      disabled={action.disabled}
      onClick={action.onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => {
        setHovered(false);
        setPressed(false);
      }}
      onMouseDown={() => setPressed(true)}
      onMouseUp={() => setPressed(false)}
      style={style}
    >
      {action.label}
    </button>
  );
}

function WorkflowActionBar({
  primaryAction,
  secondaryAction,
}: {
  primaryAction: WorkflowAction;
  secondaryAction?: WorkflowAction;
}) {
  return (
    <div
      className="sticky bottom-0 z-40"
      style={{
        borderTop: `1px solid ${colors.border.subtle}`,
        backgroundColor: "rgba(250, 248, 245, 0.88)",
        backdropFilter: "blur(20px) saturate(1.1)",
        WebkitBackdropFilter: "blur(20px) saturate(1.1)",
        boxShadow: shadows.card.inset,
        transition: motions.modal.overlay,
      }}
    >
      <div
        className="mx-auto flex w-full flex-col-reverse items-stretch justify-between gap-3 sm:flex-row sm:items-center"
        style={{
          maxWidth: spacing.container.default,
          paddingInline: GUTTER,
          paddingBlock: spacing.scale[4],
        }}
      >
        {secondaryAction ? (
          <WorkflowActionButton action={secondaryAction} variant="secondary" />
        ) : (
          <span className="hidden sm:block" />
        )}
        <WorkflowActionButton action={primaryAction} variant="primary" />
      </div>
    </div>
  );
}

export function WorkflowLayout({
  children,
  exerciceId,
  declarationYear,
  autosaveStatus = "idle",
  userName,
  userInitials,
  stepStatuses = {},
  primaryAction,
  secondaryAction,
  hideActionBar = false,
}: WorkflowLayoutProps) {
  const pathname = usePathname();
  const showActionBar = !hideActionBar && primaryAction;

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
        className="pointer-events-none absolute inset-y-0 left-0 w-1/4 opacity-70"
        style={{ backgroundImage: gradients.app.diffusionLeft }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-y-0 right-0 w-1/4 opacity-70"
        style={{ backgroundImage: gradients.app.diffusionRight }}
      />

      <div className="relative flex min-h-screen flex-col">
        <header
          style={{
            borderBottom: `1px solid ${colors.border.subtle}`,
            backgroundColor: "rgba(250, 248, 245, 0.82)",
            backdropFilter: "blur(16px)",
            WebkitBackdropFilter: "blur(16px)",
          }}
        >
          <div
            className="mx-auto flex w-full items-center justify-between"
            style={{
              maxWidth: spacing.container.default,
              paddingInline: GUTTER,
              paddingBlock: spacing.scale[5],
            }}
          >
            <FiscalMark />
            <div className="flex items-center" style={{ gap: spacing.scale[3] }}>
              <span
                className="hidden sm:inline"
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

          <WorkflowStepNav
            exerciceId={exerciceId}
            pathname={pathname}
            stepStatuses={stepStatuses}
          />
        </header>

        <main
          className="mx-auto w-full flex-1"
          style={{
            maxWidth: spacing.container.content,
            paddingInline: GUTTER,
            paddingTop: spacing.workflow.headerToContent,
            paddingBottom: showActionBar
              ? spacing.scale[6]
              : spacing.section.gap,
            transition: motions.page.enter,
          }}
        >
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: spacing.section.blockGap,
              transition: motions.workflow.content,
            }}
          >
            {children}
          </div>
        </main>

        {showActionBar ? (
          <WorkflowActionBar
            primaryAction={primaryAction}
            secondaryAction={secondaryAction}
          />
        ) : null}
      </div>
    </div>
  );
}

export default WorkflowLayout;
