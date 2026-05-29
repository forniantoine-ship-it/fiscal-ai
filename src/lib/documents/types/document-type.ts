/**
 * Canonical document families for the intelligence pipeline.
 * Distinct from workspace `LmnpDocument.documentType` and AI classifier enums —
 * this is the tunnel-oriented taxonomy used by patterns, extractors, and learning.
 */

export const PIPELINE_DOCUMENT_TYPES = [
  "inpi",
  "p0i",
  "offre_pret",
  "facture_travaux",
  "facture_mobilier",
  "unknown",
] as const;

export type DocumentType = (typeof PIPELINE_DOCUMENT_TYPES)[number];

export function isPipelineDocumentType(value: unknown): value is DocumentType {
  return (
    typeof value === "string" &&
    (PIPELINE_DOCUMENT_TYPES as readonly string[]).includes(value)
  );
}
