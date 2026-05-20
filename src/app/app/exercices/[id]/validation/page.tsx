"use client";

import { ValidationInbox } from "@/components/lmnp/validation/ValidationInbox";
import { PageHeader } from "@/components/lmnp/shared/PageHeader";

export default function ValidationPage() {
  return (
    <div>
      <PageHeader
        title="Validation"
        description="Documents analysés, champs extraits par l'IA — approuvez, corrigez ou rejetez. Chaque validation enregistre une ligne dans votre dossier."
      />
      <ValidationInbox />
    </div>
  );
}
