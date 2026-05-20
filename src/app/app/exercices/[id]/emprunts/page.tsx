"use client";

import { LedgerTabView } from "@/components/lmnp/tabs/LedgerTabView";
import { PageHeader } from "@/components/lmnp/shared/PageHeader";

export default function EmpruntsPage() {
  return (
    <div>
      <PageHeader
        title="Emprunts"
        description="Seuls les intérêts d'emprunt sont déductibles — pas le remboursement du capital."
      />
      <LedgerTabView
        tab="emprunts"
        title="Emprunts"
        description="Intérêts bancaires issus de vos attestations — validés par l'IA, confirmés par vous."
      />
    </div>
  );
}
