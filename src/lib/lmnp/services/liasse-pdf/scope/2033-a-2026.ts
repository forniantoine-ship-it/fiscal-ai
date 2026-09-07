/**
 * Périmètre du vertical slice P1-PDF-02-C/2B — 2033-A-SD / millésime 2026.
 *
 * Aucune règle fiscale : seulement la couverture PDF autorisée.
 *
 * Chantier 2B — bloc Amortissements (F4-A/B/C/D) : 016/042/066/070/074/082/094
 * (feuilles individuelles) et 048/098/112 (totaux) sortent de l'interdiction —
 * calibrées indépendamment (PyMuPDF, chantier 2A) contre
 * `assets/2026/2033-sd.pdf`. Les cases interdites restantes (110/180/044/096/176)
 * restent hors registre et hors publication : aucune gate fiable n'existe
 * encore pour elles côté moteur (voir `lignes-simples.ts`).
 */
export const CERFA_2033A_REGISTRY_CASE_IDS = [
  "016",
  "028",
  "030",
  "042",
  "048",
  "066",
  "070",
  "074",
  "082",
  "084",
  "086",
  "094",
  "098",
  "112",
  "120",
  "134",
  "136",
  "137",
  "142",
  "156",
] as const;

export type Cerfa2033ARegistryCaseId = (typeof CERFA_2033A_REGISTRY_CASE_IDS)[number];

export const CERFA_2033A_FORBIDDEN_CASE_IDS = [
  "110",
  "180",
  "044",
  "096",
  "176",
] as const;

export type Cerfa2033AColumn = "Brut" | "Amortissements-Provisions" | "NET";

export const CERFA_2033A_SLICE_COLUMNS: Readonly<Record<Cerfa2033ARegistryCaseId, Cerfa2033AColumn>> = {
  "016": "Amortissements-Provisions",
  "028": "Brut",
  "030": "Amortissements-Provisions",
  "042": "Amortissements-Provisions",
  "048": "Amortissements-Provisions",
  "066": "Amortissements-Provisions",
  "070": "Amortissements-Provisions",
  "074": "Amortissements-Provisions",
  "082": "Amortissements-Provisions",
  "084": "Brut",
  "086": "Amortissements-Provisions",
  "094": "Amortissements-Provisions",
  "098": "Amortissements-Provisions",
  "112": "Amortissements-Provisions",
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
