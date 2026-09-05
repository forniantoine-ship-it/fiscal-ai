import type { FiscalResult } from "../f006/types";
import type { CerfaCase } from "./types";
import { round2 } from "./types";

/**
 * TRF-0034 / 2031-SD — section C Récapitulation des éléments d'imposition.
 * Report direct depuis FiscalResult (TRF-0032) — aucun recalcul fiscal.
 *
 * Correction P0 fiscale (audit indépendant Cursor/Grok, confirmée) — la
 * ligne "1. Résultat fiscal" (C_L1_COL1/COL2) est explicitement définie par
 * le Cerfa 2031-SD lui-même comme le REPORT de la case 370 ou 372 du
 * 2033-B-SD (texte imprimé sur le formulaire officiel : "Bénéfice col. 1,
 * Déficit col.2 (report XN ou XO du 2058-A-SD ou 370 ou 372 du
 * 2033-B-SD)") — ce n'est PAS une case indépendante qui recopierait
 * `resultatFiscal`/`deficitNouveau` par coïncidence de valeur. AVANT cette
 * correction, `TRF-0034` (tel qu'écrit) faisait de C_L1_COL2 une copie
 * conforme de I_7B (même condition `deficitNouveau > 0`, même valeur) — ce
 * qui dupliquait à tort le déficit LMNP non professionnel sur une ligne
 * généraliste qui ne doit refléter QUE ce que porte 370/372 du 2033-B-SD
 * (voir `map-2033b.ts`, où 372 ne lit plus jamais `deficitNouveau` non plus,
 * pour la même raison de fond : CGI art. 156-I-1° bis / AX-016 — un déficit
 * LMNP non professionnel ne s'impute ni ne se reporte via le circuit
 * générique 370/372/C_L1, seulement via le circuit dédié 7a/7b (I_7A/I_7B,
 * INCHANGÉES).
 *
 * `TRF-0034` (Knowledge System, statut "approved") reste écrite avec
 * l'ancienne formule ("Résultat fiscal — Déficit : reportée depuis
 * déficit_nouveau si positif") — cette Transformation approuvée nécessite
 * une mise à jour de gouvernance pour refléter la correction ci-dessous
 * (C_L1_COL2 = report de 372, pas lecture directe de `deficitNouveau`) ;
 * cette mission ne modifie pas le document KS lui-même (décision du Product
 * Owner requise), seulement le code, qui doit désormais être fiscalement
 * correct même si le texte KS n'est pas encore mis à jour en conséquence.
 */
export function map2031RecapitulationCases(fiscalResult: FiscalResult): CerfaCase[] {
  const cases: CerfaCase[] = [];
  const frTrace = {
    source: "FiscalResult" as const,
    ksArtifacts: ["TRF-0032", "TRF-0034"],
  };

  // "AB" (recettes.total) retiré — le 2031-SD 2026 ne comporte aucune case
  // "Production vendue" ; cette rubrique (n° 218) appartient au 2033-B-SD,
  // déjà correctement alimentée par map-2033b.ts. Voir audit fiscal sourcé
  // (Notice DGFiP 2033-NOT-SD 2026, Cerfa 50448#28, p.8/23).

  if (fiscalResult.resultatFiscal > 0) {
    cases.push({
      caseId: "C_L1_COL1",
      label: "Résultat fiscal — Bénéfice (col. 1)",
      value: round2(fiscalResult.resultatFiscal),
      trace: { ...frTrace, path: "resultatFiscal", ksArtifacts: ["TRF-0032", "TRF-0034"] },
    });
  }

  // Correction P0 fiscale — C_L1_COL2 ne lit plus `deficitNouveau` : elle
  // reporte désormais la même définition que 372 du 2033-B-SD
  // (`resultatFiscal < 0`, jamais vrai avec le F-006 actuel — voir
  // map-2033b.ts pour le raisonnement complet). Le déficit LMNP non
  // professionnel reste visible sur cette même page via I_7B, INCHANGÉE.
  if (fiscalResult.resultatFiscal < 0) {
    cases.push({
      caseId: "C_L1_COL2",
      label: "Résultat fiscal — Déficit (col. 2)",
      value: round2(Math.abs(fiscalResult.resultatFiscal)),
      trace: { ...frTrace, path: "resultatFiscal", ksArtifacts: ["TRF-0032", "TRF-0034"] },
    });
  }

  if (fiscalResult.resultatFiscal > 0) {
    cases.push({
      caseId: "I_7A",
      label: "BIC non professionnels — Bénéfice (case 7a)",
      value: round2(fiscalResult.resultatFiscal),
      trace: { ...frTrace, path: "resultatFiscal", ksArtifacts: ["TRF-0032", "TRF-0034"] },
    });
  }

  if (fiscalResult.deficitNouveau > 0) {
    cases.push({
      caseId: "I_7B",
      label: "BIC non professionnels — Déficit (case 7b)",
      value: round2(fiscalResult.deficitNouveau),
      trace: { ...frTrace, path: "deficitNouveau", ksArtifacts: ["TRF-0031", "TRF-0032", "TRF-0034"] },
    });
  }

  return cases;
}
