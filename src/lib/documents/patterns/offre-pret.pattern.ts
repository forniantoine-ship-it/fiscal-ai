import type { DocumentPattern } from "./pattern.types";

export const OFFRE_PRET_PATTERN: DocumentPattern = {
  id: "pattern.offre_pret",
  documentType: "offre_pret",
  label: "Offre de prêt / attestation crédit",
  version: "1.0.0",
  tunnels: ["credit_immobilier"],
  matchThreshold: 0.45,
  signals: [
    {
      id: "offre_pret.loan_terms",
      weight: 0.35,
      keywords: ["offre de prêt", "prêt immobilier", "emprunt", "crédit", "taux", "durée"],
      fileNameKeywords: ["pret", "prêt", "emprunt", "credit", "offre"],
    },
    {
      id: "offre_pret.bank",
      weight: 0.2,
      keywords: ["banque", "établissement prêteur", "coût total du crédit", "taeg"],
    },
    {
      id: "offre_pret.interest",
      weight: 0.25,
      keywords: ["intérêts", "mensualité", "amortissement", "capital restant dû"],
      regex: [/\btableau\s+d'amortissement\b/i],
    },
  ],
};
