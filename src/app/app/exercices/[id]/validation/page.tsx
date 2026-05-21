"use client";

import { ValidationInbox } from "@/components/lmnp/validation/ValidationInbox";
import { PageHeader } from "@/components/lmnp/shared/PageHeader";

export default function ValidationPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Générer ma déclaration"
        description="Récapitulatif des montants validés par l’IA et par vous, prêts pour votre déclaration LMNP."
      />
      <ValidationInbox />
    </div>
  );
}
