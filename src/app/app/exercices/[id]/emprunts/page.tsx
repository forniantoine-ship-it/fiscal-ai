"use client";

import { TAB_COPY } from "@/lib/lmnp/constants/copilot-copy";
import { StepPageShell } from "@/components/lmnp/journey/StepPageShell";
import { LedgerTabView } from "@/components/lmnp/tabs/LedgerTabView";
import { PageHeader } from "@/components/lmnp/shared/PageHeader";

export default function EmpruntsPage() {
  return (
    <StepPageShell>
      <PageHeader title={TAB_COPY.emprunts.title} description={TAB_COPY.emprunts.description} />
      <LedgerTabView tab="emprunts" title={TAB_COPY.emprunts.title} description="" />
    </StepPageShell>
  );
}
