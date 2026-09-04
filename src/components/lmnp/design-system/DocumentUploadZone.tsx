"use client";

import { UploadZone } from "@/design-system/components/UploadZone";

interface DocumentUploadZoneProps {
  onFiles: (files: File[], meta?: { supabaseDocumentIds: string[] }) => void;
  hint?: string;
}

export function DocumentUploadZone({
  onFiles,
  hint = "PDF ou images — l'analyse démarre automatiquement",
}: DocumentUploadZoneProps) {
  return <UploadZone onFiles={onFiles} hint={hint} />;
}
