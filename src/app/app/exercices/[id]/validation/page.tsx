"use client";

import { ValidationInbox } from "@/components/lmnp/validation/ValidationInbox";
import { DossierProgressCard } from "@/components/lmnp/shared/DossierProgressCard";
import { PageHeader } from "@/components/lmnp/shared/PageHeader";

export default function ValidationPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Validation"
        description="Champs extraits par l'IA — approuvez, corrigez ou rejetez. Le tableau de bord se met à jour à chaque décision."
      />
      <DossierProgressCard compact />
      <ValidationInbox />
    </div>
  );
}
