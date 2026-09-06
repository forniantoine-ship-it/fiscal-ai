import { round2 } from "../f010/types";
import type { BilanEquilibreStatus, PatrimonialState } from "./types";

export type TotalCapitauxPropresResolution = { status: "DISPONIBLE"; montant: number } | { status: "BLOQUE"; raison: string };

export type MontantCapitauxPropresPatrimoniaux =
  | { status: "DISPONIBLE"; montant: number }
  | { status: "INCONNU"; raison: string };

/**
 * Source UNIQUE du montant des capitaux propres patrimoniaux pour le
 * sous-modèle suivi (120 + 134 + 136 + 137 ; 124/126/130/131/132/140
 * structurellement non applicables EI, hors formule).
 *
 * Consommée à l'identique par :
 *  - `checkBilanEquilibre` (passif vérifié) ;
 *  - `resolveTotalCapitauxPropres` (publication Cerfa 142).
 *
 * Ne consulte JAMAIS `checkBilanEquilibre` — aucune circularité.
 * Ne devine jamais 137 par différence actif/passif.
 *
 * Correction R-01 (audit P0→P1-B.4) : avant, `checkBilanEquilibre` omettait
 * 137 alors que 142 l'incluait — un EQUILIBRE pouvait coexister avec un 142
 * publié supérieur au passif vérifié.
 */
export function montantCapitauxPropresPatrimoniaux(patrimoine: PatrimonialState): MontantCapitauxPropresPatrimoniaux {
  if (patrimoine.subventionsInvestissement.status === "INCONNU") {
    return { status: "INCONNU", raison: patrimoine.subventionsInvestissement.raison };
  }
  // DECLARE / NUL_CONFIRME / NON_APPLICABLE portent tous un `montant` explicite
  // (0 pour NUL_CONFIRME / NON_APPLICABLE) — jamais un défaut silencieux.
  const montant = round2(
    (patrimoine.compteExploitant.clotureN ?? 0) +
      (patrimoine.ran.valeur ?? 0) +
      patrimoine.resultatComptable +
      patrimoine.subventionsInvestissement.montant,
  );
  return { status: "DISPONIBLE", montant };
}

/**
 * Résout la case 142 (Total I — Capitaux propres).
 *
 * Gate en deux temps, tous deux nécessaires :
 *  1. `equilibreStatus === "EQUILIBRE"` — jugement de `checkBilanEquilibre()`,
 *     lequel utilise déjà `montantCapitauxPropresPatrimoniaux` (donc 137).
 *  2. montant disponible (137 non INCONNU) — même source que le check.
 */
export function resolveTotalCapitauxPropres(
  patrimoine: PatrimonialState,
  equilibreStatus: BilanEquilibreStatus,
  equilibreReasons: string[],
): TotalCapitauxPropresResolution {
  if (equilibreStatus !== "EQUILIBRE") {
    return {
      status: "BLOQUE",
      raison: `Bilan non intégralement équilibré/fiable (statut : ${equilibreStatus}) — ${equilibreReasons.join(" ")} Aucun total n'est jamais produit partiellement.`,
    };
  }
  const capitaux = montantCapitauxPropresPatrimoniaux(patrimoine);
  if (capitaux.status === "INCONNU") {
    return { status: "BLOQUE", raison: capitaux.raison };
  }
  return { status: "DISPONIBLE", montant: capitaux.montant };
}
