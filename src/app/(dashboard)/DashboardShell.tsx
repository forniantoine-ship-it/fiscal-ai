"use client";

import type { ReactNode } from "react";

import { DashboardLayout } from "@/design-system/layouts/DashboardLayout";
import { LmnpProvider, useLmnp } from "@/lib/lmnp/store";

function DashboardLayoutBridge({ children }: { children: ReactNode }) {
  const { workspace } = useLmnp();

  return (
    <DashboardLayout
      declarationYear={workspace.fiscalYear.year}
      autosaveStatus="saved"
    >
      {children}
    </DashboardLayout>
  );
}

export function DashboardShell({ children }: { children: ReactNode }) {
  return (
    <LmnpProvider>
      <DashboardLayoutBridge>{children}</DashboardLayoutBridge>
    </LmnpProvider>
  );
}
