/**
 * Périmètre du premier vertical slice P1-PDF-02-C — 2033-A-SD / millésime 2026.
 *
 * Aucune règle fiscale : seulement la couverture PDF autorisée. Les cases
 * interdites (030/086/112/…) restent hors registre et hors publication,
 * même si le mapper fiscal les produit encore (divergences P1-PDF-02-B).
 */
export const CERFA_2033A_REGISTRY_CASE_IDS = [
  "028",
  "030",
  "084",
  "086",
  "120",
  "134",
  "136",
  "137",
  "142",
  "156",
] as const;

export type Cerfa2033ARegistryCaseId = (typeof CERFA_2033A_REGISTRY_CASE_IDS)[number];

export const CERFA_2033A_FORBIDDEN_CASE_IDS = [
  "112",
  "110",
  "180",
  "044",
  "048",
  "096",
  "098",
  "176",
] as const;

export type Cerfa2033AColumn = "Brut" | "Amortissements-Provisions" | "NET";

export const CERFA_2033A_SLICE_COLUMNS: Readonly<Record<Cerfa2033ARegistryCaseId, Cerfa2033AColumn>> = {
  "028": "Brut",
  "030": "Amortissements-Provisions",
  "084": "Brut",
  "086": "Amortissements-Provisions",
  "120": "NET",
  "134": "NET",
  "136": "NET",
  "137": "NET",
  "142": "NET",
  "156": "NET",
};

export function isAuthorized2033ASliceCase(caseId: string): caseId is Cerfa2033ARegistryCaseId {
  return (CERFA_2033A_REGISTRY_CASE_IDS as readonly string[]).includes(caseId);
}
