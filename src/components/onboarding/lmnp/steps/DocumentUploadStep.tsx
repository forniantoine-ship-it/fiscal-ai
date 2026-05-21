"use client";

import { DocumentDropZone } from "../DocumentDropZone";
import type { UploadedDocument } from "../types";

interface DocumentUploadStepProps {
  documents: UploadedDocument[];
  onDocumentsAdd: (docs: UploadedDocument[]) => void;
  onDocumentRemove: (id: string) => void;
}

export function DocumentUploadStep({
  documents,
  onDocumentsAdd,
  onDocumentRemove,
}: DocumentUploadStepProps) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold tracking-tight text-stone-900 sm:text-2xl">
          Téléversement des pièces justificatives
        </h2>
        <p className="mt-2 text-sm text-stone-600">
          Ajoutez vos documents LMNP. Ils seront analysés par OCR à l&apos;étape suivante pour
          pré-remplir votre déclaration.
        </p>
      </div>

      <DocumentDropZone
        documents={documents}
        onDocumentsAdd={onDocumentsAdd}
        onDocumentRemove={onDocumentRemove}
      />

      <div className="rounded-xl border border-stone-200 bg-stone-100/80 p-4">
        <p className="text-xs font-medium text-stone-500">Documents recommandés</p>
        <ul className="mt-2 grid gap-1 text-xs text-stone-600 sm:grid-cols-2">
          <li className="flex items-center gap-2">
            <span className="text-accent">•</span> Bail meublé signé
          </li>
          <li className="flex items-center gap-2">
            <span className="text-accent">•</span> Relevés de loyers 2025
          </li>
          <li className="flex items-center gap-2">
            <span className="text-accent">•</span> Taxe foncière
          </li>
          <li className="flex items-center gap-2">
            <span className="text-accent">•</span> Factures charges & travaux
          </li>
        </ul>
      </div>
    </div>
  );
}
