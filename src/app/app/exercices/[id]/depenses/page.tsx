"use client";

import { LedgerTabView } from "@/components/lmnp/tabs/LedgerTabView";
import { PageHeader } from "@/components/lmnp/shared/PageHeader";

export default function DepensesPage() {
  return (
    <div>
      <PageHeader
        title="Dépenses"
        description="Charges déductibles de votre activité locative meublée."
      />
      <LedgerTabView
        tab="depenses"
        title="Dépenses"
        description="Taxe foncière, assurance, charges… Les factures approuvées alimentent automatiquement cet onglet."
      />
    </div>
  );
}
