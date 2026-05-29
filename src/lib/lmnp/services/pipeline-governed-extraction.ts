import type { ExtractionResult } from "@/lib/documents/types/extraction-result";
import type { DocumentTunnel } from "@/lib/documents/types/document-tunnel";
import type { FiscalTunnel } from "@/lib/documents/tunnel-field-ownership";
import {
  fiscalTunnelFromUploadContext,
  sourceDocumentLabel,
} from "@/lib/documents/tunnel-field-ownership";
import type { GovernedFieldExtractedBy } from "@/lib/documents/types/governed-field";

import { processGovernedExtraction, type ProcessGovernedExtractionResult } from "./governed-field-prefill";
import type { DeclarationDraft } from "../types";

export type PipelineGovernedExtractionParams = {
  draft?: DeclarationDraft;
  tunnel: DocumentTunnel;
  documentId: string;
  extraction: ExtractionResult;
  extractedBy?: GovernedFieldExtractedBy;
};

/**
 * Maps a completed document pipeline extraction into the governed field store
 * and returns silent cross-tunnel form patches.
 */
export function processPipelineGovernedExtraction(
  params: PipelineGovernedExtractionParams,
): ProcessGovernedExtractionResult {
  const mappedTunnel = fiscalTunnelFromUploadContext({ documentTunnel: params.tunnel });
  const sourceTunnel: FiscalTunnel = mappedTunnel ?? "logement";

  const payload: Record<string, unknown> = {
    ...(params.extraction.data ?? {}),
  };

  for (const field of params.extraction.fields) {
    if (field.value !== undefined && field.value !== null && field.value !== "") {
      payload[field.key] = field.value;
    }
  }

  return processGovernedExtraction({
    draft: params.draft,
    sourceTunnel,
    documentId: params.documentId,
    sourceDocument: sourceDocumentLabel(params.extraction.documentType, params.documentId),
    extractedBy: params.extractedBy ?? "regex",
    payload,
  });
}
