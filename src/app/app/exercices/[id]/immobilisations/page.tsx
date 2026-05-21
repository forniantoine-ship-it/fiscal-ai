"use client";

import { TAB_COPY } from "@/lib/lmnp/constants/copilot-copy";
import { StepPageShell } from "@/components/lmnp/journey/StepPageShell";
import { LedgerTabView } from "@/components/lmnp/tabs/LedgerTabView";
import { PageHeader } from "@/components/lmnp/shared/PageHeader";

export default function ImmobilisationsPage() {
  return (
    <StepPageShell>
      <PageHeader
        title={TAB_COPY.immobilisations.title}
        description={TAB_COPY.immobilisations.description}
      />
      <LedgerTabView tab="immobilisations" title={TAB_COPY.immobilisations.title} description="" />
    </StepPageShell>
  );
}
