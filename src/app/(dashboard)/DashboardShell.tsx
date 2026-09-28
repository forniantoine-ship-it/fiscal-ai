"use client";

import { Suspense, type ReactNode } from "react";
import { usePathname } from "next/navigation";

import { FeedbackProvider } from "@/components/lmnp/shared/FeedbackProvider";
import { DashboardLayout } from "@/design-system/layouts/DashboardLayout";
import { DossierProvider } from "@/lib/lmnp/dossier";
import { LmnpProvider, useLmnp } from "@/lib/lmnp/store";
import { V3CorrectionEntryGate } from "@/components/lmnp/app-shell/V3CorrectionEntryGate";

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
    <Suspense fallback={<div role="status">Chargement du parcours…</div>}>
      <V3CorrectionEntryGate>
        <DossierProvider>
          <LmnpProvider>
            <FeedbackProvider>
              <DashboardLayoutBridge>{children}</DashboardLayoutBridge>
            </FeedbackProvider>
          </LmnpProvider>
        </DossierProvider>
      </V3CorrectionEntryGate>
    </Suspense>
  );
}
