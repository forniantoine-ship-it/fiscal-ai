"use client";

import { TAB_COPY } from "@/lib/lmnp/constants/copilot-copy";
import { StepPageShell } from "@/components/lmnp/journey/StepPageShell";
import { LedgerTabView } from "@/components/lmnp/tabs/LedgerTabView";
import { PageHeader } from "@/components/lmnp/shared/PageHeader";

export default function RecettesPage() {
  return (
    <StepPageShell>
      <PageHeader title={TAB_COPY.recettes.title} description={TAB_COPY.recettes.description} />
      <LedgerTabView tab="recettes" title={TAB_COPY.recettes.title} description="" />
    </StepPageShell>
  );
}
