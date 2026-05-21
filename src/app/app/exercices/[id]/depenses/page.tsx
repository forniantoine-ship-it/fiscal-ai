"use client";

import { TAB_COPY } from "@/lib/lmnp/constants/copilot-copy";
import { StepPageShell } from "@/components/lmnp/journey/StepPageShell";
import { LedgerTabView } from "@/components/lmnp/tabs/LedgerTabView";
import { PageHeader } from "@/components/lmnp/shared/PageHeader";

export default function DepensesPage() {
  return (
    <StepPageShell>
      <PageHeader title={TAB_COPY.depenses.title} description={TAB_COPY.depenses.description} />
      <LedgerTabView tab="depenses" title={TAB_COPY.depenses.title} description="" />
    </StepPageShell>
  );
}
