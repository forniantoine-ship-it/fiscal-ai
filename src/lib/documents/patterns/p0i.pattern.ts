import type { DocumentPattern } from "./pattern.types";

/** P0I — pièce logement / acte d'acquisition (tunnel logement). */
export const P0I_PATTERN: DocumentPattern = {
  id: "pattern.p0i",
  documentType: "p0i",
  label: "Acte notarié / pièce logement",
  version: "1.0.0",
  tunnels: ["logement"],
  matchThreshold: 0.45,
  signals: [
    {
      id: "p0i.notary",
      weight: 0.35,
      keywords: ["notaire", "acte authentique", "acquisition", "vente", "cadastre"],
      fileNameKeywords: ["acte", "notaire", "acquisition", "vente"],
    },
    {
      id: "p0i.property",
      weight: 0.25,
      keywords: ["appartement", "maison", "parcelle", "lot", "copropriété", "surface"],
    },
    {
      id: "p0i.price",
      weight: 0.2,
      regex: [/\bprix\s+(?:de\s+)?vente\b/i, /\bmontant\s+total\b/i],
    },
  ],
};
