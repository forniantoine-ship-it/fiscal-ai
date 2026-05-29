/**
 * Upload context / journey tunnel where a document is expected.
 * Drives pattern priors, validation rules, and human-review routing.
 */

import type { DocumentType } from "./document-type";

export const DOCUMENT_TUNNELS = [
  "inpi",
  "logement",
  "credit_immobilier",
  "bail",
  "taxe_fonciere",
  "assurance",
  "factures_travaux",
  "factures_mobilier",
  "charges",
  "revenus",
  "generic",
] as const;

export type DocumentTunnel = (typeof DOCUMENT_TUNNELS)[number];

export function isDocumentTunnel(value: unknown): value is DocumentTunnel {
  return typeof value === "string" && (DOCUMENT_TUNNELS as readonly string[]).includes(value);
}

/** Default document type prior when classification is inconclusive. */
export const TUNNEL_DOCUMENT_TYPE_PRIOR: Partial<Record<DocumentTunnel, DocumentType>> = {
  inpi: "inpi",
  logement: "p0i",
  credit_immobilier: "offre_pret",
  factures_travaux: "facture_travaux",
  factures_mobilier: "facture_mobilier",
};
