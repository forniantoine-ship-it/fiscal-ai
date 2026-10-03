import type { FiscalResult } from "../f006/types";
import { round2 } from "./types";

/**
 * SAV-032 — neutralisation du résultat LMNP non professionnel dans la 2033-B-SD (domaine supporté : LMNP exclusif,
 * réel simplifié, IR). Module PUR de projection déclarative : aucun calcul fiscal nouveau, aucune lecture d'assistant.
 *
 *   `resultatFiscalAvantDeficits` (F-006) = résultat LMNP après plafond 39 C et ARD consommés, AVANT déficits antérieurs
 *     → grandeur MÉTIER : alimente 2031 7a (si > 0). Ce n'est PAS la ligne 352/354 du Cerfa.
 *   E = resultatFiscalAvantDeficits + amortReportesUtilises   (= resultatAvantAmort − amortDeduct)
 *
 *   E < 0  : 330 = −E + totalNonDeductible ; 350 vide ; 7b = deficitNouveau
 *   E ≥ 0  : 330 = totalNonDeductible (si > 0) ; 350 = E (si > 0, ARD consommés inclus : jamais une seconde déduction) ;
 *            7a = resultatFiscalAvantDeficits (si > 0)
 *   352 = 370 = 0 imprimés (colonne 1) ; 354 et 372 vides.
 *
 * Les déficits antérieurs n'apparaissent ni en 330, ni en 350, ni en 352/354, ni en 370/372 (SAV-032).
 *
 * Sans `resultatFiscalAvantDeficits` (FiscalResult antérieur à P0-39C, ordre de calcul SAV-027), E n'est pas
 * reconstituable : `UNAVAILABLE`, jamais une valeur inventée.
 */
export type NonProNeutralisation =
  | { status: "UNAVAILABLE"; raison: string }
  | {
      status: "AVAILABLE";
      /** E — résultat avant ARD consommés et avant déficits antérieurs. */
      e: number;
      /** Ligne 330 (réintégration) ; 0 = non imprimée. */
      ligne330: number;
      /** Ligne 350 (déduction) ; 0 = non imprimée. */
      ligne350: number;
      /** 2031 7a (résultat avant imputation des déficits antérieurs, bénéfice) ; 0 = non imprimée. */
      case7a: number;
      /** 2031 7b (déficit) ; 0 = non imprimée. */
      case7b: number;
    };

export function resolveNonProNeutralisation(
  fr: Pick<FiscalResult, "resultatFiscalAvantDeficits" | "amortReportesUtilises" | "deficitNouveau" | "charges">,
): NonProNeutralisation {
  const avantDeficits = fr.resultatFiscalAvantDeficits;
  if (typeof avantDeficits !== "number" || !Number.isFinite(avantDeficits)) {
    return {
      status: "UNAVAILABLE",
      raison:
        "FiscalResult.resultatFiscalAvantDeficits est absent (snapshot antérieur à P0-39C, ordre de calcul SAV-027) : la neutralisation SAV-032 n'est pas reconstituable depuis les autres champs.",
    };
  }
  const aRD = Number.isFinite(fr.amortReportesUtilises) ? fr.amortReportesUtilises : 0;
  const nonDeductible = Number.isFinite(fr.charges?.totalNonDeductible) ? fr.charges.totalNonDeductible : 0;
  const e = round2(avantDeficits + aRD);

  const ligne330 = round2(Math.max(-e, 0) + nonDeductible);
  const ligne350 = round2(Math.max(e, 0));
  const case7a = round2(Math.max(avantDeficits, 0));
  const case7b = round2(Math.max(fr.deficitNouveau, 0));
  return { status: "AVAILABLE", e, ligne330, ligne350, case7a, case7b };
}
