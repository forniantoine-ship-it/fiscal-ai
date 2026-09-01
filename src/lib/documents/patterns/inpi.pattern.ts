import type { DocumentPattern } from "./pattern.types";

export const INPI_PATTERN: DocumentPattern = {
  id: "pattern.inpi",
  documentType: "inpi",
  label: "Extrait INPI / Kbis / SIREN",
  version: "1.0.0",
  tunnels: ["inpi"],
  matchThreshold: 0.45,
  signals: [
    {
      id: "inpi.keywords",
      weight: 0.35,
      keywords: ["inpi", "kbis", "siren", "siret", "rcs", "extrait", "registre"],
      fileNameKeywords: ["inpi", "kbis", "siren", "siret"],
    },
    {
      id: "inpi.legal_form",
      weight: 0.2,
      keywords: ["lmnp", "loueur", "meublé", "meuble", "micro-bic", "bic"],
    },
    {
      id: "inpi.siren_format",
      weight: 0.25,
      regex: [/\bsiren\s*:?\s*\d{3}\s?\d{3}\s?\d{3}\b/i, /\bsiret\s*:?\s*\d{14}\b/i],
    },
  ],
};
