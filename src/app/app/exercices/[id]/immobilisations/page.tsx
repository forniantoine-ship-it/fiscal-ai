"use client";

import { LedgerTabView } from "@/components/lmnp/tabs/LedgerTabView";
import { PageHeader } from "@/components/lmnp/shared/PageHeader";

export default function ImmobilisationsPage() {
  return (
    <div>
      <PageHeader
        title="Immobilisations"
        description="Amortissement du bien et du mobilier — montants étalés sur plusieurs années, pas une dépense unique."
      />
      <LedgerTabView tab="immobilisations" title="Immobilisations" description="" />
    </div>
  );
}
