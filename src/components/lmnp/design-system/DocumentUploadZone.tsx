"use client";

import { UploadZone } from "@/design-system/components/UploadZone";
import type { DocumentRole } from "@/lib/lmnp/dossier/document-fiscal-origin";

interface DocumentUploadZoneProps {
  onFiles: (
    files: File[],
    meta?: { supabaseDocumentIds: string[]; filePaths: string[] },
  ) => void;
  fiscalYear: number;
  dossierId: string | null | undefined;
  documentRole?: DocumentRole;
  propertyId?: string;
  hint?: string;
}

export function DocumentUploadZone({
  onFiles,
  fiscalYear,
  dossierId,
  documentRole,
  propertyId,
  hint = "PDF ou images — l'analyse démarre automatiquement",
}: DocumentUploadZoneProps) {
  return (
    <UploadZone
      onFiles={onFiles}
      fiscalYear={fiscalYear}
      dossierId={dossierId}
      documentRole={documentRole}
      propertyId={propertyId}
      hint={hint}
    />
  );
}
