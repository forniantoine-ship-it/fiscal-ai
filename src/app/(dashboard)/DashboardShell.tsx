"use client";

import type { ReactNode } from "react";

import { FeedbackProvider } from "@/components/lmnp/shared/FeedbackProvider";
import { DashboardLayout } from "@/design-system/layouts/DashboardLayout";
import { LmnpProvider, useLmnp } from "@/lib/lmnp/store";

function DashboardLayoutBridge({ children }: { children: ReactNode }) {
  const { workspace, autosaveStatus } = useLmnp();

  return (
    <DashboardLayout
      declarationYear={workspace.fiscalYear.year}
      autosaveStatus={autosaveStatus}
    >
      {children}
    </DashboardLayout>
  );
}

export function DashboardShell({ children }: { children: ReactNode }) {
  return (
    <LmnpProvider>
      <FeedbackProvider>
        <DashboardLayoutBridge>{children}</DashboardLayoutBridge>
      </FeedbackProvider>
    </LmnpProvider>
  );
}
