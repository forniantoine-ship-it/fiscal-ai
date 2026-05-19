"use client";

import { LedgerTabView } from "@/components/lmnp/tabs/LedgerTabView";
import { PageHeader } from "@/components/lmnp/shared/PageHeader";

export default function RecettesPage() {
  return (
    <div>
      <PageHeader
        title="Recettes"
        description="Tout ce que vous avez encaissé — principalement vos loyers."
      />
      <LedgerTabView tab="recettes" title="Recettes" description="" />
    </div>
  );
}
