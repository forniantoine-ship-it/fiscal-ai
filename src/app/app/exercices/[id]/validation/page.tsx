"use client";

import { ValidationInbox } from "@/components/lmnp/validation/ValidationInbox";
import { PageHeader } from "@/components/lmnp/shared/PageHeader";

export default function ValidationPage() {
  return (
    <div>
      <PageHeader
        title="Confirmer les montants"
        description="L'IA a lu vos documents. Rien n'est enregistré tant que vous n'avez pas cliqué « C'est correct » ou corrigé."
      />
      <ValidationInbox />
    </div>
  );
}
