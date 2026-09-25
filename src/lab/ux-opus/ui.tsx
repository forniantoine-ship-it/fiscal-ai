"use client";

import { type CSSProperties, type ReactNode, useEffect, useRef } from "react";

import { colors } from "@/design-system/theme/colors";
import { gradients } from "@/design-system/theme/gradients";

import { type Provenance, eur } from "./model";

// Jetons repris du design system Fiscal AI (aucune nouvelle palette).
export const tokens = {
  "--o-bg": colors.background.cream,
  "--o-surface": colors.surface.primary,
  "--o-sand": colors.surface.secondary,
  "--o-sand-2": colors.surface.tertiary,
  "--o-line": colors.border.default,
  "--o-line-soft": colors.border.subtle,
  "--o-ink": colors.text.primary,
  "--o-ink-2": colors.text.secondary,
  "--o-ink-3": colors.text.tertiary,
  "--o-ink-4": colors.text.muted,
  "--o-accent": colors.orange[500],
  "--o-accent-strong": colors.orange[600],
  "--o-accent-text": colors.text.accent,
  "--o-accent-soft": colors.orange[50],
  "--o-accent-soft-2": colors.orange[100],
  "--o-accent-line": colors.orange[200],
  "--o-ok": colors.success.DEFAULT,
  "--o-ok-soft": colors.success.light,
  "--o-ok-line": colors.success.border,
  "--o-warn": colors.warning.DEFAULT,
  "--o-warn-soft": colors.warning.light,
  "--o-warn-line": colors.warning.border,
  "--o-err": colors.error.DEFAULT,
  "--o-err-soft": colors.error.light,
  "--o-err-line": colors.error.border,
  "--o-cta": gradients.button.primary,
} as CSSProperties;

export const serif = "font-[family-name:var(--font-display)] font-normal tracking-[-0.02em]";

// ─── Icônes ──────────────────────────────────────────────────────────────────

const ICONS = {
  check: "M5 12.5l4.2 4.2L19 7",
  alert: "M12 8v5m0 3.5v.01M10.3 3.9L2.6 17.5A2 2 0 004.3 20.5h15.4a2 2 0 001.7-3l-7.7-13.6a2 2 0 00-3.4 0z",
  doc: "M7 3h7l5 5v12a1 1 0 01-1 1H7a1 1 0 01-1-1V4a1 1 0 011-1zm7 0v5h5M9 13h6M9 17h6",
  arrow: "M5 12h14m-6-6l6 6-6 6",
  back: "M19 12H5m6 6l-6-6 6-6",
  chevron: "M9 6l6 6-6 6",
  close: "M6 6l12 12M18 6L6 18",
  clock: "M12 7v5l3 2m6-2a9 9 0 11-18 0 9 9 0 0118 0z",
  spark: "M12 3v4m0 10v4M3 12h4m10 0h4M6 6l2.5 2.5m7 7L18 18M6 18l2.5-2.5m7-7L18 6",
  upload: "M12 16V4m0 0l-5 5m5-5l5 5M4 16v3a1 1 0 001 1h14a1 1 0 001-1v-3",
  eye: "M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12zm10 3a3 3 0 100-6 3 3 0 000 6z",
  split: "M8 4v16M16 4v16M4 8h4m8 0h4M4 16h4m8 0h4",
  question: "M9.1 9a3 3 0 015.8 1c0 2-3 3-3 3m.1 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z",
  choice: "M12 3l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.4 6.8 19.1l1-5.8L3.5 9.2l5.9-.9L12 3z",
  plus: "M12 5v14M5 12h14",
  pause: "M9 5v14M15 5v14",
  history: "M3 12a9 9 0 109-9 9.7 9.7 0 00-6.7 2.7L3 8m0-5v5h5m4-1v5l4 2",
  shield: "M12 3l8 3v6c0 4.5-3.4 8.3-8 9-4.6-.7-8-4.5-8-9V6l8-3z",
  mail: "M4 6h16v12H4zM4 7l8 6 8-6",
  copy: "M9 9h10v10H9zM5 15V5h10",
  refresh: "M20 11a8 8 0 10-2.3 5.7M20 4v7h-7",
} as const;

export type IconName = keyof typeof ICONS;

export function Icon({ name, className = "h-4 w-4" }: { name: IconName; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d={ICONS[name]} />
    </svg>
  );
}

// ─── Boutons ─────────────────────────────────────────────────────────────────

type ButtonProps = {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  className?: string;
  type?: "button" | "submit";
  ariaLabel?: string;
};

export function PrimaryButton({ children, onClick, disabled, className = "", type = "button", ariaLabel }: ButtonProps) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel}
      className={`inline-flex min-h-[48px] items-center justify-center gap-2 rounded-full bg-[image:var(--o-cta)] px-6 text-[15px] font-medium text-white shadow-[0_6px_18px_-6px_rgba(214,107,40,0.55)] transition hover:brightness-[1.04] active:brightness-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--o-accent)] disabled:cursor-not-allowed disabled:opacity-45 disabled:shadow-none ${className}`}
    >
      {children}
    </button>
  );
}

export function SecondaryButton({ children, onClick, disabled, className = "", ariaLabel }: ButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel}
      className={`inline-flex min-h-[44px] items-center justify-center gap-2 rounded-full border border-[var(--o-line)] bg-[var(--o-surface)] px-5 text-[14px] font-medium text-[var(--o-ink-2)] transition hover:border-[#DAD3C8] hover:text-[var(--o-ink)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--o-accent)] disabled:opacity-45 ${className}`}
    >
      {children}
    </button>
  );
}

export function TextButton({ children, onClick, className = "", ariaLabel }: ButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      className={`inline-flex items-center gap-1.5 rounded-md text-[14px] font-medium text-[var(--o-accent-text)] underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--o-accent)] ${className}`}
    >
      {children}
    </button>
  );
}

// ─── Textes ──────────────────────────────────────────────────────────────────

export function Eyebrow({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <p className={`text-[12px] font-medium uppercase tracking-[0.14em] text-[var(--o-ink-3)] ${className}`}>{children}</p>;
}

export function Money({ value, signed = false, className = "" }: { value: number; signed?: boolean; className?: string }) {
  const rounded = Math.round(value) || 0;
  const text = signed && rounded > 0 ? `+ ${eur(rounded)}` : signed && rounded < 0 ? `− ${eur(-rounded)}` : eur(rounded);
  return <span className={`tabular-nums whitespace-nowrap ${className}`}>{text}</span>;
}

// ─── Provenance ──────────────────────────────────────────────────────────────

export function provLabel(prov: Provenance, docName: (id: string) => string): { text: string; tone: "ok" | "neutral" | "accent" | "warn" } {
  switch (prov.kind) {
    case "read":
      return prov.docIds.length > 1
        ? { text: `Recoupé · ${prov.docIds.length} documents`, tone: "ok" }
        : { text: `Lu · ${docName(prov.docIds[0])}`, tone: "neutral" };
    case "computed":
      return { text: prov.note ? `Calculé · ${prov.note}` : "Calculé", tone: "neutral" };
    case "answer":
      return { text: "Votre réponse", tone: "accent" };
    case "corrected":
      return { text: prov.note ? `Corrigé par vous · ${prov.note}` : "Corrigé par vous", tone: "accent" };
    case "default":
      return { text: `Choix par défaut · ${prov.note}`, tone: "neutral" };
    case "carried":
      return { text: `Repris · ${prov.from}`, tone: "ok" };
    case "estimated":
      return { text: `Provisoire · ${prov.note}`, tone: "warn" };
    case "missing":
      return { text: "Manquant", tone: "warn" };
  }
}

const TONE: Record<"ok" | "neutral" | "accent" | "warn", string> = {
  ok: "border-[var(--o-ok-line)] bg-[var(--o-ok-soft)] text-[var(--o-ok)]",
  neutral: "border-[var(--o-line)] bg-[var(--o-sand)] text-[var(--o-ink-2)]",
  accent: "border-[var(--o-accent-line)] bg-[var(--o-accent-soft)] text-[var(--o-accent-text)]",
  warn: "border-[var(--o-warn-line)] bg-[var(--o-warn-soft)] text-[var(--o-warn)]",
};

export function ProvBadge({
  prov,
  docName,
  onOpenDoc,
}: {
  prov: Provenance;
  docName: (id: string) => string;
  onOpenDoc?: (id: string) => void;
}) {
  const { text, tone } = provLabel(prov, docName);
  const docIds = prov.kind === "read" ? prov.docIds : [];
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11.5px] leading-5 ${TONE[tone]}`}>
        {tone === "ok" && <Icon name="check" className="h-3 w-3" />}
        {text}
      </span>
      {onOpenDoc &&
        docIds.map((id) => (
          <button
            key={id}
            type="button"
            onClick={() => onOpenDoc(id)}
            className="inline-flex items-center gap-1 rounded-full px-1.5 text-[11.5px] leading-5 text-[var(--o-accent-text)] underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-[var(--o-accent)]"
            aria-label={`Voir la source : ${docName(id)}`}
          >
            <Icon name="eye" className="h-3 w-3" />
            {docIds.length > 1 ? docName(id) : "source"}
          </button>
        ))}
    </span>
  );
}

export function StatusMark({ status }: { status: "ok" | "attention" | "info" }) {
  if (status === "ok")
    return (
      <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-[var(--o-ok-soft)] text-[var(--o-ok)]" aria-label="Compris">
        <Icon name="check" className="h-3.5 w-3.5" />
      </span>
    );
  if (status === "attention")
    return (
      <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-[var(--o-accent-soft-2)] text-[var(--o-accent-strong)]" aria-label="Besoin de vous">
        <Icon name="question" className="h-3.5 w-3.5" />
      </span>
    );
  return (
    <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-[var(--o-sand)] text-[var(--o-ink-3)]" aria-label="Information">
      <Icon name="history" className="h-3.5 w-3.5" />
    </span>
  );
}

// ─── Niveau « Comprendre » ───────────────────────────────────────────────────

export function Explain({ summary, children, defaultOpen = false }: { summary: string; children: ReactNode; defaultOpen?: boolean }) {
  return (
    <details open={defaultOpen} className="group rounded-2xl border border-[var(--o-line-soft)] bg-[var(--o-bg)] px-4 py-3 [&_summary::-webkit-details-marker]:hidden">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-[14px] font-medium text-[var(--o-ink-2)] focus-visible:outline-2 focus-visible:outline-[var(--o-accent)]">
        <span className="inline-flex items-center gap-2">
          <Icon name="question" className="h-4 w-4 text-[var(--o-accent-text)]" />
          {summary}
        </span>
        <Icon name="chevron" className="h-4 w-4 transition group-open:rotate-90" />
      </summary>
      <div className="pt-3 text-[14px] leading-6 text-[var(--o-ink-2)]">{children}</div>
    </details>
  );
}

// ─── Panneau latéral (niveau « Vérifier ») ───────────────────────────────────

export function Drawer({
  title,
  eyebrow,
  onClose,
  children,
  footer,
}: {
  title: string;
  eyebrow?: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);

  useEffect(() => {
    closeRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    panelRef.current?.focus();
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeRef.current();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", onKey);
    };
  }, []);

  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label={title}>
      <button type="button" aria-label="Fermer" onClick={onClose} className="absolute inset-0 bg-[rgba(28,25,23,0.28)] backdrop-blur-[2px] motion-safe:animate-[fiscal-fade-in_200ms_ease-out]" />
      <div
        ref={panelRef}
        tabIndex={-1}
        className="absolute inset-x-0 bottom-0 top-[5vh] flex flex-col overflow-hidden rounded-t-[28px] bg-[var(--o-surface)] shadow-[0_-20px_60px_-20px_rgba(28,25,23,0.35)] outline-none motion-safe:animate-[fiscal-fade-in_260ms_ease-out] md:inset-y-0 md:left-auto md:right-0 md:top-0 md:w-[min(620px,100%)] md:rounded-none md:rounded-l-[28px]"
      >
        <div className="flex items-start justify-between gap-4 border-b border-[var(--o-line-soft)] px-5 pb-4 pt-5 md:px-8 md:pt-7">
          <div className="min-w-0">
            {eyebrow && <Eyebrow>{eyebrow}</Eyebrow>}
            <h2 className={`${serif} mt-1 text-[26px] leading-tight text-[var(--o-ink)] md:text-[30px]`}>{title}</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-[var(--o-line)] text-[var(--o-ink-2)] hover:text-[var(--o-ink)] focus-visible:outline-2 focus-visible:outline-[var(--o-accent)]"
            aria-label="Fermer le panneau"
          >
            <Icon name="close" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto overscroll-contain px-5 py-6 md:px-8">{children}</div>
        {footer && <div className="border-t border-[var(--o-line-soft)] bg-[var(--o-bg)] px-5 py-4 md:px-8">{footer}</div>}
      </div>
    </div>
  );
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-[24px] border border-[var(--o-line-soft)] bg-[var(--o-surface)] shadow-[0_1px_2px_rgba(28,25,23,0.04),0_12px_32px_-18px_rgba(28,25,23,0.18)] ${className}`}>
      {children}
    </div>
  );
}

export function Pill({ children, tone = "neutral" }: { children: ReactNode; tone?: "ok" | "neutral" | "accent" | "warn" }) {
  return <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[12px] font-medium leading-5 ${TONE[tone]}`}>{children}</span>;
}
