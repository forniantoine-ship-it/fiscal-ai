"use client";

import Link from "next/link";

import { Button } from "@/design-system/components/Button";
import { colors } from "@/design-system/theme/colors";
import { typography } from "@/design-system/theme/typography";
import type { DashboardWorkflowStepId } from "@/components/lmnp/dashboard/dashboard-workflow-model";
import { resolveWorkflowProgressionCta } from "@/components/lmnp/dashboard/workflow-progression";
import { LMNP_ROUTES } from "@/lib/lmnp/routes";

type WorkflowProgressionActionsProps = {
  currentStepId: DashboardWorkflowStepId;
};

export function WorkflowPageBackLink() {
  return (
    <div className="flex w-full justify-center">
      <Link
        href={LMNP_ROUTES.dashboard}
        style={{
          ...typography.caption.desktop,
          color: colors.text.muted,
          textDecoration: "underline",
          textUnderlineOffset: "3px",
        }}
      >
        Retour au tableau de bord
      </Link>
    </div>
  );
}

export function WorkflowProgressionActions({ currentStepId }: WorkflowProgressionActionsProps) {
  const progression = resolveWorkflowProgressionCta(currentStepId);
  if (!progression) return null;

  return (
    <div className="flex w-full flex-col items-center gap-4 animate-[fiscal-fade-in_450ms_cubic-bezier(0.16,1,0.3,1)_both]">
      <Button href={progression.continueHref}>{progression.continueLabel}</Button>
      <Link
        href={LMNP_ROUTES.dashboard}
        style={{
          ...typography.caption.desktop,
          color: colors.text.muted,
          textDecoration: "underline",
          textUnderlineOffset: "3px",
        }}
      >
        Retour au tableau de bord
      </Link>
    </div>
  );
}
