"use client";

import { type ReactNode } from "react";
import { usePathname } from "next/navigation";

import { FeedbackProvider } from "@/components/lmnp/shared/FeedbackProvider";
import { DashboardLayout } from "@/design-system/layouts/DashboardLayout";
import { DossierProvider } from "@/lib/lmnp/dossier";
import { LmnpProvider, useLmnp } from "@/lib/lmnp/store";

function DashboardLayoutBridge({ children }: { children: ReactNode }) {
  const { workspace, autosaveStatus, persistenceUserId } = useLmnp();
  const pathname = usePathname();
  const chapterJourney = pathname === "/dashboard";

  return (
    <DashboardLayout
      declarationYear={workspace.fiscalYear.year}
      autosaveStatus={autosaveStatus}
      persistenceUserId={persistenceUserId}
      chapterJourney={chapterJourney}
    >
      {children}
    </DashboardLayout>
  );
}

export function DashboardShell({ children }: { children: ReactNode }) {
  return (
    <DossierProvider>
      <LmnpProvider>
        <FeedbackProvider>
          <DashboardLayoutBridge>{children}</DashboardLayoutBridge>
        </FeedbackProvider>
      </LmnpProvider>
    </DossierProvider>
  );
}
