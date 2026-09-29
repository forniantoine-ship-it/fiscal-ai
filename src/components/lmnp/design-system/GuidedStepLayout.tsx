"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { MinimalProgress } from "./MinimalProgress";
import { PrimaryButton } from "./PrimaryButton";
import { SecondaryButton } from "./SecondaryButton";

interface GuidedStepLayoutProps {
  stepIndex: number;
  totalSteps: number;
  title: string;
  subtitle?: string;
  insight?: string;
  children: ReactNode;
  backHref: string;
  nextHref?: string;
  nextLabel?: string;
  onNext?: () => void;
  nextDisabled?: boolean;
  dashboardHref: string;
}

export function GuidedStepLayout({
  stepIndex,
  totalSteps,
  title,
  subtitle,
  insight,
  children,
  backHref,
  nextHref,
  nextLabel = "Continuer",
  onNext,
  nextDisabled,
  dashboardHref,
}: GuidedStepLayoutProps) {
  const percent = Math.round((stepIndex / totalSteps) * 100);

  return (
    <div className="mx-auto max-w-lg animate-fade-in px-4 py-12 sm:py-16">
      <Link
        href={dashboardHref}
        className="text-[12px] text-ink-faint transition-colors hover:text-ink-soft"
      >
        ← Déclaration
      </Link>

      <MinimalProgress
        percent={percent}
        label={`Étape ${stepIndex} sur ${totalSteps}`}
        className="mt-10"
      />

      <header className="mt-12">
        <h1 className="text-2xl font-normal leading-snug tracking-tight text-ink">{title}</h1>
        {subtitle && (
          <p className="mt-3 text-[15px] leading-relaxed text-ink-muted">{subtitle}</p>
        )}
        {insight && <p className="mt-4 text-[12px] text-ink-muted">{insight}</p>}
      </header>

      <div className="mt-10">{children}</div>

      <footer className="mt-14 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <SecondaryButton href={backHref}>Retour</SecondaryButton>
        {nextHref ? (
          <PrimaryButton href={nextDisabled ? undefined : nextHref}>{nextLabel}</PrimaryButton>
        ) : (
          <PrimaryButton onClick={onNext} disabled={nextDisabled}>
            {nextLabel}
          </PrimaryButton>
        )}
      </footer>
    </div>
  );
}
