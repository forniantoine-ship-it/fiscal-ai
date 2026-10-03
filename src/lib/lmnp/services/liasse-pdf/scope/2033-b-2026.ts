/**
 * Périmètre explicite du vertical slice P1-PDF-01 — 2033-B-SD / millésime 2026.
 *
 * Ce fichier documente QUelles cases le produit Fiscal AI peut rendre sur le
 * Cerfa officiel. Il ne contient AUCUNE règle fiscale : seulement la
 * classification de couverture du slice courant.
 *
 * Distinction obligatoire (mission P1-PDF-01) :
 * - REQUIRED_FOR_SCOPE : si le mapper la produit, le PDF DOIT la rendre (registry + gate).
 * - OPTIONAL : le mapper peut la produire ou non selon les données (ex. 242, 244, 312).
 * - OUT_OF_SCOPE : jamais produite volontairement — absence ≠ zéro, jamais une erreur gate.
 * - NOT_PRODUCED : le mapper documente explicitement l'absence (casesNonAlimentees).
 */
export type CerfaCaseScopeStatus =
  | "REQUIRED_FOR_SCOPE"
  | "OPTIONAL"
  | "OUT_OF_SCOPE"
  | "NOT_PRODUCED";

export type Cerfa2033BScopeEntry = {
  caseId: string;
  status: CerfaCaseScopeStatus;
  note: string;
};

/** Cases calibrées dans le registre visuel et couvertes par le vertical slice. */
export const CERFA_2033B_REGISTRY_CASE_IDS = [
  "218",
  "232",
  "242",
  "244",
  "254",
  "264",
  "270",
  "294",
  "300",
  "310",
  "312",
  "314",
  "318",
  "330",
  "350",
  "352",
  "370",
  "372",
] as const;

export type Cerfa2033BRegistryCaseId = (typeof CERFA_2033B_REGISTRY_CASE_IDS)[number];

export const CERFA_2033B_SCOPE_2026: readonly Cerfa2033BScopeEntry[] = [
  { caseId: "218", status: "REQUIRED_FOR_SCOPE", note: "Toujours produite (recettes.total)." },
  { caseId: "232", status: "REQUIRED_FOR_SCOPE", note: "Toujours produite (recettes.total)." },
  { caseId: "242", status: "OPTIONAL", note: "Produite seulement si rfs.emprunts est défini." },
  { caseId: "244", status: "OPTIONAL", note: "Produite seulement si detailParCategorie.taxe_fonciere est présente." },
  { caseId: "254", status: "REQUIRED_FOR_SCOPE", note: "Toujours produite (amortCalcule)." },
  { caseId: "264", status: "REQUIRED_FOR_SCOPE", note: "Toujours produite (formule composite)." },
  { caseId: "270", status: "REQUIRED_FOR_SCOPE", note: "Toujours produite (232 − 264)." },
  { caseId: "294", status: "REQUIRED_FOR_SCOPE", note: "Toujours produite (chargesFinancement ou Σ emprunts)." },
  { caseId: "300", status: "REQUIRED_FOR_SCOPE", note: "Toujours produite (perteExceptionnelle, y compris 0 réel)." },
  { caseId: "310", status: "REQUIRED_FOR_SCOPE", note: "Toujours produite (résultat comptable)." },
  { caseId: "312", status: "OPTIONAL", note: "Produite si resultatComptable > 0." },
  { caseId: "314", status: "OPTIONAL", note: "Produite si resultatComptable < 0." },
  { caseId: "318", status: "REQUIRED_FOR_SCOPE", note: "Toujours produite (MOUVEMENT ANNUEL amortNonDeduitExercice = amortCalcule − amortDeduct ; distinct du STOCK FINAL amortReporte)." },
  { caseId: "330", status: "OPTIONAL", note: "Produite si max(−E, 0) + totalNonDeductible > 0 (SAV-032 : neutralisation du déficit LMNP non professionnel + charges non déductibles)." },
  { caseId: "350", status: "OPTIONAL", note: "Produite seulement si E > 0 (SAV-032 : bénéfice LMNP non professionnel déduit, ARD consommés inclus ; vide sinon, comme le dossier témoin accepté)." },
  { caseId: "352", status: "REQUIRED_FOR_SCOPE", note: "Toujours produite (0 par neutralisation SAV-032, colonne 1) dès que resultatFiscalAvantDeficits est établi." },
  { caseId: "370", status: "REQUIRED_FOR_SCOPE", note: "Toujours produite (0 par neutralisation SAV-032, colonne 1) dès que resultatFiscalAvantDeficits est établi." },
  { caseId: "372", status: "OPTIONAL", note: "Jamais produite par le mapper LMNP (SAV-032 : vide) ; position calibrée conservée." },
  { caseId: "354", status: "NOT_PRODUCED", note: "Vide en neutralisation LMNP (SAV-032) — jamais imprimée ; absente du registre : toute production serait bloquée (fail-closed)." },
  { caseId: "322", status: "OUT_OF_SCOPE", note: "Provisions — hors périmètre produit actuel." },
  { caseId: "324", status: "OUT_OF_SCOPE", note: "Impôts non déductibles — hors périmètre mapper actuel." },
  { caseId: "249", status: "OUT_OF_SCOPE", note: "Crédit-bail immobilier — hors périmètre LMNP actuel." },
  { caseId: "251", status: "OUT_OF_SCOPE", note: "Crédit-bail immobilier — hors périmètre LMNP actuel." },
  { caseId: "356", status: "OUT_OF_SCOPE", note: "Report en arrière IS — non applicable IR." },
  { caseId: "360", status: "OUT_OF_SCOPE", note: "Déficits antérieurs IS — non applicable IR." },
];

export function scopeStatusFor2033BCase(caseId: string): Cerfa2033BScopeEntry | undefined {
  return CERFA_2033B_SCOPE_2026.find((entry) => entry.caseId === caseId);
}
