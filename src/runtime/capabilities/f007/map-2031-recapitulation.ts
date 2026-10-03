import type { FiscalResult } from "../f006/types";
import type { CerfaCase } from "./types";
import { round2 } from "./types";
import { resolveNonProNeutralisation } from "./nonpro-neutralisation";

/**
 * TRF-0034 / 2031-SD — section C Récapitulation des éléments d'imposition.
 * Report depuis FiscalResult (TRF-0032) — aucun recalcul fiscal.
 *
 * Historique : la ligne 1 « Résultat fiscal » est définie par le Cerfa 2031-SD lui-même comme le REPORT de la case 370
 * ou 372 du 2033-B-SD (« report XN ou XO du 2058-A-SD ou 370 ou 372 du 2033-B-SD ») — jamais une case indépendante qui
 * recopierait `resultatFiscal`/`deficitNouveau`. Un déficit LMNP non professionnel ne passe jamais par le circuit
 * générique 370/372/ligne 1 (CGI art. 156-I-1° bis, AX-016) : il est neutralisé en 330 dans la 2033-B (SAV-032) et porté
 * par le circuit dédié 7a/7b (I_7A/I_7B).
 */
/**
 * SAV-032 / TRF-0034 1.1 — neutralisation du résultat LMNP non professionnel (domaine LMNP exclusif, IR) :
 *   - ligne 1 « Résultat fiscal » = report de 370/372 de la 2033-B : 0 en colonne 1 (comme le dossier témoin accepté,
 *     dont la ligne 1 porte « 0 » et la ligne 4 « 0 »), colonne 2 vide ;
 *   - 7a = `resultatFiscalAvantDeficits` (résultat AVANT imputation des déficits antérieurs, cadre I de la 2031 Bis) ;
 *   - 7b = `deficitNouveau`.
 * Sans `resultatFiscalAvantDeficits` (FiscalResult antérieur à P0-39C), ni la ligne 1 ni 7a ne sont reconstituables :
 * elles restent absentes (jamais une valeur inventée) ; 7b reste reportée.
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

  const neutralisation = resolveNonProNeutralisation(fiscalResult);

  if (neutralisation.status === "AVAILABLE") {
    cases.push({
      caseId: "C_L1_COL1",
      label: "Résultat fiscal — Bénéfice (col. 1)",
      value: 0,
      trace: {
        ...frTrace,
        path: "report de la case 370 du 2033-B-SD après neutralisation du résultat non professionnel (= 0)",
        ksArtifacts: ["SAV-032", "TRF-0032", "TRF-0034"],
      },
    });
    if (neutralisation.case7a > 0) {
      cases.push({
        caseId: "I_7A",
        label: "BIC non professionnels — Bénéfice (case 7a)",
        value: neutralisation.case7a,
        trace: {
          ...frTrace,
          path: "resultatFiscalAvantDeficits (avant imputation des déficits antérieurs)",
          ksArtifacts: ["SAV-032", "SAV-030", "TRF-0032", "TRF-0034"],
        },
      });
    }
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
