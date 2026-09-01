import type { DocumentPattern } from "./pattern.types";

export const FACTURE_MOBILIER_PATTERN: DocumentPattern = {
  id: "pattern.facture_mobilier",
  documentType: "facture_mobilier",
  label: "Facture mobilier / équipement",
  version: "1.0.0",
  tunnels: ["factures_mobilier", "charges"],
  matchThreshold: 0.4,
  signals: [
    {
      id: "mobilier.keywords",
      weight: 0.35,
      keywords: ["mobilier", "meuble", "canapé", "lit", "électroménager", "ameublement"],
      fileNameKeywords: ["mobilier", "meuble", "ikea", "but"],
    },
    {
      id: "mobilier.invoice",
      weight: 0.25,
      keywords: ["facture", "tva", "ht", "ttc"],
      regex: [/\bfacture\s+n[°o]?\s*\d+/i],
    },
    {
      id: "mobilier.retail",
      weight: 0.15,
      keywords: ["livraison", "garantie", "référence", "quantité"],
    },
  ],
};
