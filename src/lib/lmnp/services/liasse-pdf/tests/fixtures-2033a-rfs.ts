/**
 * Fixtures locales au vertical slice PDF 2033-A (P1-PDF-02-E).
 *
 * Deux familles, volontairement séparées :
 *
 * 1. Elsa F-010/F-011 — valeurs déjà démontrées par `rfs-2033a.test.ts`
 *    (dossier de référence). Servent E-1 (028/156) et E-6 (136).
 *
 * 2. Fixture SYNTHÉTIQUE P0 — recopiée de `bilan-map-2033a-integration.test.ts`.
 *    Ce ne sont PAS des données fiscales d'un client. Elles démontrent
 *    uniquement que le transport `assemblePatrimoine → RFS → mapper`
 *    ouvre 084/120/134/137/142 lorsque les BilanInputs existent.
 *
 * `buildDossierTemoinRfs()` n'est pas enrichi (golden masters 2033-B inchangés).
 */
import { assemblePatrimoine } from "@/runtime/capabilities/bilan/assemble-patrimoine";
import type { BilanInputs } from "@/runtime/capabilities/bilan/types";
import type { FiscalResult } from "@/runtime/capabilities/f006/types";
import type { IdentiteDeclarante } from "@/runtime/capabilities/f007/types";
import type { PretFinancementExercice } from "@/runtime/capabilities/f011/types";
import { buildFiscalRepresentation } from "@/runtime/capabilities/rfs/build-fiscal-representation";
import type { FiscalRepresentation, ImmobilisationsRfs } from "@/runtime/capabilities/rfs/types";

/** FiscalResult du dossier témoin — mêmes valeurs que `DOSSIER_TEMOIN_FISCAL_RESULT`. */
const ELSA_FISCAL_RESULT: FiscalResult = {
  exercice: 2025,
  recettes: { total: 5100 },
  charges: {
    totalDeductible: 14963,
    chargesExploitation: 10361,
    chargesFinancement: 4602,
    chargesPreExploitation: 0,
    totalNonDeductible: 99,
  },
  resultatAvantAmort: -9862,
  amortCalcule: 3720,
  amortDeduct: 0,
  amortReporte: 3720,
  amortNonDeduitExercice: 3720,
  amortReportesUtilises: 0,
  resultatFiscal: 0,
  deficitNouveau: 9862,
  deficitsImputes: 0,
  perteExceptionnelle: 0,
  stocks: { deficits: [], amortissementsReportes: 0, deficitsExpires: [] },
  trace: { ksArtifacts: ["TRF-0032"], computedAt: "2026-05-01T00:00:00.000Z", journal: [] },
  status: "computed",
  anomalies: [],
};

const ELSA_IDENTITE: IdentiteDeclarante = {
  siren: "104545108",
  siret: "10454510800011",
  denomination: "BOUVARD ELSA",
};

/** Immobilisations Elsa — `rfs-2033a.test.ts` (Cycle 35). */
export const ELSA_IMMOBILISATIONS: ImmobilisationsRfs = {
  lignes: [
    { label: "Gros œuvre", montant: 37186.1, dureeAnnees: 75, dotationExercice: 372, amortissementsCumules: 372, vnc: 36814.1 },
    { label: "Toiture", montant: 6610.86, dureeAnnees: 30, dotationExercice: 165, amortissementsCumules: 165, vnc: 6445.86 },
    { label: "Étanchéité", montant: 5784.5, dureeAnnees: 20, dotationExercice: 217, amortissementsCumules: 217, vnc: 5567.5 },
    { label: "Installation électrique", montant: 4958.15, dureeAnnees: 25, dotationExercice: 148, amortissementsCumules: 148, vnc: 4810.15 },
    { label: "Installation et agencement", montant: 47235.9, dureeAnnees: 15, dotationExercice: 2327, amortissementsCumules: 2327, vnc: 44908.9 },
    { label: "Mobilier - Pack meubles", montant: 5400.1, dureeAnnees: 7, dotationExercice: 491, amortissementsCumules: 491, vnc: 4909.1 },
  ],
  totalAnnuelExercice: 3720,
  totalBrut: 107175.61,
  valeurTerrain: 17960.39,
};

/** Emprunt Elsa — `rfs-2033a.test.ts` (Cycle 35). */
export const ELSA_EMPRUNT: PretFinancementExercice = {
  pretId: "pret-1",
  typePret: "amortissable",
  interetsEmpruntExercice: 4602,
  interetsPreExploitation: 0,
  assuranceEmpruntExercice: 601,
  assurancePreExploitation: 0,
  capitalRembourseExercice: 496,
  capitalRestantDu31_12: 130256,
  fraisDossierDeductibles: 0,
  garantieDeductible: 1763,
  iraDeductible: 0,
};

/** 107175.61 + 17960.39 — déjà asserté par `rfs-2033a.test.ts`. */
export const ELSA_CASE_028 = 125136;
/** Σ amortissementsCumules — colonne Amortissements-Provisions, pas VNC. */
export const ELSA_CASE_030 = 3720;
/** resultatComptable du témoin : −9862 − 3720 − 99. */
export const ELSA_CASE_136 = -13681;
export const ELSA_CASE_156 = 130256;

/**
 * RFS locale E-1 : FiscalResult témoin + F-010/F-011 Elsa.
 * Pas de patrimoine — 084/120/134/137/142 restent bloquées.
 */
export function buildElsaF010F011Rfs(): FiscalRepresentation {
  return buildFiscalRepresentation({
    fiscalResult: ELSA_FISCAL_RESULT,
    identite: ELSA_IDENTITE,
    immobilisations: ELSA_IMMOBILISATIONS,
    emprunts: [ELSA_EMPRUNT],
  });
}

// ---------------------------------------------------------------------------
// Fixture SYNTHÉTIQUE P0 — pas des données Elsa / pas un dossier client
// Source : `src/runtime/bilan-map-2033a-integration.test.ts`
// ---------------------------------------------------------------------------

export const SYNTHETIC_P0_FISCAL_RESULT: FiscalResult = {
  exercice: 2025,
  recettes: { total: 12000 },
  charges: {
    totalDeductible: 4000,
    chargesExploitation: 4000,
    chargesFinancement: 0,
    chargesPreExploitation: 0,
    totalNonDeductible: 100,
  },
  resultatAvantAmort: 7000,
  amortCalcule: 1500,
  amortDeduct: 1500,
  amortReporte: 0,
  amortNonDeduitExercice: 0,
  amortReportesUtilises: 0,
  resultatFiscal: 5500,
  deficitNouveau: 0,
  deficitsImputes: 0,
  perteExceptionnelle: 0,
  stocks: { deficits: [], amortissementsReportes: 0, deficitsExpires: [] },
  trace: { ksArtifacts: ["TRF-0032"], computedAt: "2026-08-31T00:00:00.000Z", journal: [] },
  status: "computed",
  anomalies: [],
};

export const SYNTHETIC_P0_IMMOBILISATIONS: ImmobilisationsRfs = {
  lignes: [{ label: "Composant", montant: 45000, dureeAnnees: 30, dotationExercice: 1500, amortissementsCumules: 1500, vnc: 43500 }],
  totalAnnuelExercice: 1500,
  totalBrut: 45000,
  valeurTerrain: 15000,
};

export const SYNTHETIC_P0_EMPRUNT: PretFinancementExercice = {
  pretId: "pret-1",
  typePret: "amortissable",
  interetsEmpruntExercice: 800,
  interetsPreExploitation: 0,
  assuranceEmpruntExercice: 100,
  assurancePreExploitation: 0,
  capitalRembourseExercice: 2000,
  capitalRestantDu31_12: 20000,
  fraisDossierDeductibles: 0,
  garantieDeductible: 0,
  iraDeductible: 0,
};

const SYNTHETIC_P0_IDENTITE: IdentiteDeclarante = {
  siren: "104545108",
  siret: "10454510800011",
  denomination: "Fixture synthétique P0 (test, pas un client)",
};

/**
 * BilanInputs de la fixture d'intégration P0 existante.
 * SYNTHÉTIQUE — ne pas présenter comme des valeurs Elsa.
 */
export const SYNTHETIC_P0_BILAN_INPUTS: BilanInputs = {
  tresorerie: { bankMode: "DEDIE", closingCash: 3000 },
  compteExploitant: { ouverture: 37100, apports: 0, prelevements: 1000 },
  ran: { situation: "NATIF" },
  tiers: { creances: { status: "NUL_CONFIRME" }, dettes: { status: "NUL_CONFIRME" } },
  subventionsInvestissement: { status: "NUL_CONFIRME" },
};

/** Montants déjà assertés par `bilan-map-2033a-integration.test.ts`. */
export const SYNTHETIC_P0_CASES = {
  "028": 60000,
  "030": 1500,
  "084": 3000,
  "120": 36100,
  "134": 0,
  "136": 5400,
  "137": 0,
  "142": 41500,
  "156": 20000,
} as const;

export function buildSyntheticP0RfsSansPatrimoine(): FiscalRepresentation {
  return buildFiscalRepresentation({
    fiscalResult: SYNTHETIC_P0_FISCAL_RESULT,
    identite: SYNTHETIC_P0_IDENTITE,
    immobilisations: SYNTHETIC_P0_IMMOBILISATIONS,
    emprunts: [SYNTHETIC_P0_EMPRUNT],
  });
}

/**
 * Transport du patrimoine déjà assemblé via `buildFiscalRepresentation`.
 * `bilanInputs` optionnel pour E4/E5 (137 INCONNU, déséquilibre).
 */
export function buildSyntheticP0RfsAvecPatrimoine(
  bilanInputs: BilanInputs = SYNTHETIC_P0_BILAN_INPUTS,
): FiscalRepresentation {
  const rfsSansPatrimoine = buildSyntheticP0RfsSansPatrimoine();
  const patrimoine = assemblePatrimoine(rfsSansPatrimoine, bilanInputs);
  return buildFiscalRepresentation({
    fiscalResult: rfsSansPatrimoine.fiscalResult,
    identite: rfsSansPatrimoine.identite,
    immobilisations: rfsSansPatrimoine.immobilisations,
    emprunts: rfsSansPatrimoine.emprunts,
    patrimoine,
  });
}
