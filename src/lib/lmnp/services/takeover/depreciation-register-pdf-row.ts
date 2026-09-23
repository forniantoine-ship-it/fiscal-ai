/**
 * Lot 5.4-A — contrat lignes PDF registre d'amortissements.
 *
 * Vision lit les cellules telles qu'imprimées (chaînes brutes) — jamais de
 * parsing/calcul côté Vision. Le parsing (montants, dates, méthode) reste
 * déterministe, dans extract-depreciation-register-pdf.ts, en réutilisant
 * les parseurs Lot 4C.1 (parseRegisterAmount / parseRegisterStartDate).
 *
 * Générique par construction : aucun champ ni libellé propre à un cabinet
 * ou à un document précis. Une colonne absente de l'image reste absente ici.
 */

/**
 * "asset"        — ligne immobilisation candidate à l'ouverture.
 * "exit"         — sortie explicite (mise au rebut, cession...) — jamais
 *                   promue en CandidateHistoricalAsset, cf. politique sortie.
 * "subtotal"     — sous-total documentaire (ex. par compte/plan comptable).
 * "total"        — total documentaire (ex. Total / Total Sorties / Total Hors Sorties).
 * "unrecognized" — ligne détectée mais non classifiable — jamais ignorée silencieusement.
 */
export type DepreciationRegisterPdfRowType =
  | "asset"
  | "exit"
  | "subtotal"
  | "total"
  | "unrecognized";

export type DepreciationRegisterPdfRow = {
  rowType: DepreciationRegisterPdfRowType;
  pageNumber: number;
  /** Référence documentaire (numéro immobilisation), telle qu'imprimée. */
  assetRef?: string;
  /** Désignation, telle qu'imprimée. */
  label?: string;
  acquisitionDateRaw?: string;
  /** Date de mise en service / début amortissement si distincte de l'acquisition. */
  startDateRaw?: string;
  /** "Valeur entrée" / "Valeur brute" — coût brut. */
  grossCostRaw?: string;
  /** "Amort. début" — cumul d'ouverture (seul champ cumul mappé vers le contrat 4C.1). */
  openingCumulativeRaw?: string;
  /** "Dot. fiscale" — jamais mappée (DOTATION_IGNORED), conservée pour contrôle. */
  dotationRaw?: string;
  /** "Amort. fin" — jamais mappée (CLOSING_CUMULATIVE_IGNORED), conservée pour contrôle. */
  closingCumulativeRaw?: string;
  /** "VNC" — jamais mappée (VNC_IGNORED), conservée pour contrôle. */
  vncRaw?: string;
  /** Mode d'amortissement tel qu'imprimé (ex. "L", "N", "D") — mapping générique borné. */
  methodRaw?: string;
  /** Durée telle qu'imprimée (ex. "05 - 00", "5 ans"). */
  durationRaw?: string;
  /** Uniquement rowType = "exit" — date de sortie si imprimée. */
  exitDateRaw?: string;
  /** Uniquement rowType = "exit" — libellé/motif de sortie tel qu'imprimé. */
  exitLabelRaw?: string;
  /** Uniquement rowType = "subtotal" | "total" — libellé de portée (ex. "Total Hors Sorties"). */
  scopeLabel?: string;
  /** Texte brut source de la ligne — provenance/evidence, jamais réinterprété. */
  rawSnippet: string;
};

export type DepreciationRegisterVisionPageImage = {
  mimeType: "image/png" | "image/jpeg" | "image/webp";
  base64: string;
};

export type DepreciationRegisterVisionPageInput = {
  documentId: string;
  pageNumber: number;
  pageImage: DepreciationRegisterVisionPageImage;
  /** Texte natif de la page si disponible — indice, jamais source d'extraction. */
  pageTextHint?: string;
};

export type DepreciationRegisterVisionPageResult = {
  rows: DepreciationRegisterPdfRow[];
};

/**
 * Contrat injectable — même esprit que TaxPackageLiasseVisionRequester.
 * Implémentation réelle (serveur, appel modèle vision) hors périmètre Lot 5.4-A ;
 * seul le contrat + le pipeline de mapping déterministe sont livrés ici.
 */
export type DepreciationRegisterVisionRequester = (
  input: DepreciationRegisterVisionPageInput,
) => Promise<DepreciationRegisterVisionPageResult>;
