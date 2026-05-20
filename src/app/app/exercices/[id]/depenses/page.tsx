"use client";

import { TAB_COPY } from "@/lib/lmnp/constants/copilot-copy";
import { LedgerTabView } from "@/components/lmnp/tabs/LedgerTabView";
import { PageHeader } from "@/components/lmnp/shared/PageHeader";

export default function DepensesPage() {
  return (
    <div>
      <PageHeader title={TAB_COPY.depenses.title} description={TAB_COPY.depenses.description} />
      <LedgerTabView tab="depenses" title={TAB_COPY.depenses.title} description="" />
    </div>
  );
}
