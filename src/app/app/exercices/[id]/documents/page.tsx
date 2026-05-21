"use client";

import { DocumentChecklist } from "@/components/lmnp/documents/DocumentChecklist";
import { DocumentUploadPanel } from "@/components/lmnp/documents/DocumentUploadPanel";
import { PageHeader } from "@/components/lmnp/shared/PageHeader";

export default function DocumentsPage() {
  return (
    <div className="mx-auto max-w-2xl space-y-10">
      <PageHeader
        title="Mes documents"
        description="Déposez simplement vos documents. L’IA analyse et classe automatiquement votre dossier."
      />
      <DocumentUploadPanel />
      <DocumentChecklist />
    </div>
  );
}
