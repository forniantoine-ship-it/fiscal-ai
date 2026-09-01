import type { DocumentPattern } from "./pattern.types";

export const FACTURE_TRAVAUX_PATTERN: DocumentPattern = {
  id: "pattern.facture_travaux",
  documentType: "facture_travaux",
  label: "Facture travaux / rénovation",
  version: "1.0.0",
  tunnels: ["factures_travaux", "charges"],
  matchThreshold: 0.4,
  signals: [
    {
      id: "travaux.keywords",
      weight: 0.35,
      keywords: ["travaux", "rénovation", "entretien", "réparation", "artisan", "devis"],
      fileNameKeywords: ["travaux", "renovation", "artisan"],
    },
    {
      id: "travaux.invoice",
      weight: 0.25,
      keywords: ["facture", "tva", "ht", "ttc", "siret", "tva intracommunautaire"],
      regex: [/\bfacture\s+n[°o]?\s*\d+/i],
    },
    {
      id: "travaux.deductible_hint",
      weight: 0.15,
      keywords: ["amélioration", "agencement", "isolation", "plomberie", "électricité"],
    },
  ],
};
