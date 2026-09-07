/**
 * Périmètre du vertical slice P1-PDF-02-C/2B/2D-C/2D-E3 — 2033-A-SD / millésime 2026.
 *
 * Aucune règle fiscale : seulement la couverture PDF autorisée.
 *
 * Chantier 2B — bloc Amortissements (F4-A/B/C/D) : 016/042/066/070/074/082/094
 * (feuilles individuelles) et 048/098/112 (totaux) sortent de l'interdiction —
 * calibrées indépendamment (PyMuPDF, chantier 2A) contre
 * `assets/2026/2033-sd.pdf`.
 *
 * Chantier 2D-C — totaux 044 (Brut), 096 (Brut) et 176 (NET, Dettes)
 * sortent à leur tour de l'interdiction : câblés côté moteur au chantier
 * 2D-B via `gateTotal044ActifImmobiliseBrut`/`gateTotal096AvecVentilation`/
 * `gateTotal176AvecVentilation` (chantier 2C), calibrés indépendamment
 * (PyMuPDF, chantier 2D-A).
 *
 * Chantier 2D-E3 — totaux généraux 110 (Brut) et 180 (NET, total passif)
 * sortent à leur tour de l'interdiction : câblés côté moteur au chantier
 * 2D-E2 via `gateTotal110`/`gateTotal180` (chantier 2D-E1), calibrés
 * indépendamment (PyMuPDF, chantier 2D-D). Plus aucune case n'est
 * structurellement interdite dans ce registre.
 *
 * Chantier P1-B2 — 5 lignes Brut/NET collectées par P1-B1 (064/080/092/174/
 * 175) sortent à leur tour de l'interdiction : le runtime les projetait déjà
 * dans `Form2033A.cases` depuis le chantier G2 (`projectCaseAmortFeuilleFromLigne`),
 * seule cette liste les empêchait d'atteindre le PDF. Calibrées
 * indépendamment (pdfjs+pdf-lib, `independent-grid-oracle.ts`), voir le
 * commentaire du registre `registry/2033-a/2026.ts` pour le détail de la
 * méthode. Aucune modification du runtime ni des gates 096/176.
 *
 * Chantier B-FAMILY-4 — 5 lignes famille B collectées par B-FAMILY-2/3
 * (068/072/164/166/172) sortent à leur tour de l'interdiction : le runtime
 * les résolvait déjà via `resolveVentilationTiers`/`map-2033a.ts` (source
 * unique `ventilationTiers`, jamais de repli `lignesSimples` — voir l'audit
 * P1-B), seule cette liste les empêchait d'atteindre le PDF. Calibrées
 * indépendamment (pdfjs+pdf-lib, `independent-grid-oracle.ts`), voir le
 * commentaire du registre `registry/2033-a/2026.ts` pour le détail de la
 * méthode. Aucune modification du runtime ni des gates 096/176.
 */
export const CERFA_2033A_REGISTRY_CASE_IDS = [
  "016",
  "028",
  "030",
  "042",
  "044",
  "048",
  "064",
  "066",
  "068",
  "070",
  "072",
  "074",
  "080",
  "082",
  "084",
  "086",
  "092",
  "094",
  "096",
  "098",
  "110",
  "112",
  "120",
  "134",
  "136",
  "137",
  "142",
  "156",
  "164",
  "166",
  "172",
  "174",
  "175",
  "176",
  "180",
] as const;

export type Cerfa2033ARegistryCaseId = (typeof CERFA_2033A_REGISTRY_CASE_IDS)[number];

export const CERFA_2033A_FORBIDDEN_CASE_IDS = [] as const;

export type Cerfa2033AColumn = "Brut" | "Amortissements-Provisions" | "NET";

export const CERFA_2033A_SLICE_COLUMNS: Readonly<Record<Cerfa2033ARegistryCaseId, Cerfa2033AColumn>> = {
  "016": "Amortissements-Provisions",
  "028": "Brut",
  "030": "Amortissements-Provisions",
  "042": "Amortissements-Provisions",
  "044": "Brut",
  "048": "Amortissements-Provisions",
  "064": "Brut",
  "066": "Amortissements-Provisions",
  "068": "Brut",
  "070": "Amortissements-Provisions",
  "072": "Brut",
  "074": "Amortissements-Provisions",
  "080": "Brut",
  "082": "Amortissements-Provisions",
  "084": "Brut",
  "086": "Amortissements-Provisions",
  "092": "Brut",
  "094": "Amortissements-Provisions",
  "096": "Brut",
  "098": "Amortissements-Provisions",
  "110": "Brut",
  "112": "Amortissements-Provisions",
  "120": "NET",
  "134": "NET",
  "136": "NET",
  "137": "NET",
  "142": "NET",
  "156": "NET",
  "164": "NET",
  "166": "NET",
  "172": "NET",
  "174": "NET",
  "175": "NET",
  "176": "NET",
  "180": "NET",
};

export function isAuthorized2033ASliceCase(caseId: string): caseId is Cerfa2033ARegistryCaseId {
  return (CERFA_2033A_REGISTRY_CASE_IDS as readonly string[]).includes(caseId);
}
