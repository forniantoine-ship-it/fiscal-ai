"use client";

import { Suspense, type ReactNode } from "react";
import { usePathname } from "next/navigation";

import { FeedbackProvider } from "@/components/lmnp/shared/FeedbackProvider";
import { DashboardLayout } from "@/design-system/layouts/DashboardLayout";
import { DossierProvider } from "@/lib/lmnp/dossier";
import { LmnpProvider, useLmnp } from "@/lib/lmnp/store";
import { ProductionPropertiesEntry } from "@/components/lmnp/biens/ProductionPropertiesEntry";
import { V3CorrectionEntryGate } from "@/components/lmnp/app-shell/V3CorrectionEntryGate";
import { V3CorrectionReturnBar } from "@/components/lmnp/app-shell/V3CorrectionReturnBar";
import { ExplicitDossierScopeGate } from "@/components/lmnp/app-shell/ExplicitDossierScopeGate";
import { useV3CorrectionReturn } from "@/components/lmnp/app-shell/useV3CorrectionReturn";
import { useV3CorrectionScope } from "@/lab/v2-dossier/correction-context";
import { selectAssistantShell } from "@/lab/v3-dossier/assistant-shell-model";
import { V3AssistantShell, V3ReturnControl } from "@/lab/v3-dossier/V3AssistantShell";

/** « Retour à mon dossier » de la coque V3 : même mécanisme de sauvegarde confirmée que la barre de retour. */
function V3ShellReturn() {
  const { available, status, run } = useV3CorrectionReturn();
  return <V3ReturnControl available={available} status={status} onReturn={() => void run()} />;
}

function DashboardLayoutBridge({ children }: { children: ReactNode }) {
  const { workspace, autosaveStatus, persistenceUserId } = useLmnp();
  const pathname = usePathname();
  const scope = useV3CorrectionScope();
  const chapterJourney = pathname === "/dashboard";

  // R15.1 — V3 shell only for a verified V3 scope on one of the six owner assistants; anything else is unchanged.
  const shell = selectAssistantShell(scope, pathname);
  if (shell.kind === "v3-assistant") {
    return (
      <V3AssistantShell
        title={shell.title}
        year={workspace.fiscalYear.year}
        autosaveStatus={autosaveStatus}
        persistenceUserId={persistenceUserId}
        returnControl={<V3ShellReturn />}
      >
        {children}
      </V3AssistantShell>
    );
  }

  return (
    <DashboardLayout
      declarationYear={workspace.fiscalYear.year}
      autosaveStatus={autosaveStatus}
      persistenceUserId={persistenceUserId}
      chapterJourney={chapterJourney}
    >
      <V3CorrectionReturnBar />
      <ProductionPropertiesEntry />
      {children}
    </DashboardLayout>
  );
}

export function DashboardShell({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={<div role="status">Chargement du parcours…</div>}>
      <V3CorrectionEntryGate>
        <ExplicitDossierScopeGate>{dossier => (
          <DossierProvider explicitDossier={dossier}>
            <LmnpProvider explicitDossier={dossier}>
              <FeedbackProvider>
                <DashboardLayoutBridge>{children}</DashboardLayoutBridge>
              </FeedbackProvider>
            </LmnpProvider>
          </DossierProvider>
        )}</ExplicitDossierScopeGate>
      </V3CorrectionEntryGate>
    </Suspense>
  );
}
