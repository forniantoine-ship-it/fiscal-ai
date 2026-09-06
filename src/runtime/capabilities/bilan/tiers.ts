import { round2 } from "../f010/types";
import type { TiersInputs, TiersPosteInput, TiersPosteResolution, TiersResolution } from "./types";

/**
 * Résout les buckets agrégés P0 `creances` / `dettes` — correction P0-1
 * (NO SILENT ZERO).
 *
 * IMPORTANT (P1-B.3) : ces deux montants sont des AGRÉGATS OPAQUES pour le
 * contrôle d'équilibre du sous-modèle patrimonial. Ils ne portent AUCUNE
 * nature économique et ne sont PAS équivalents à une case Cerfa :
 *   tiers.creances ≠ 068 (ni 064, ni 072, ni 092)
 *   tiers.dettes   ≠ 175 (ni 164, ni 166, ni 172, ni 174)
 * La ventilation case-level vit dans `ventilation-tiers.ts`. Ne jamais
 * projeter silencieusement ces buckets vers le 2033-A.
 *
 * Avant P0-1, `tiers?.creances ?? 0` / `tiers?.dettes ?? 0` transformaient
 * silencieusement une absence de saisie en montant nul. Trois statuts
 * désormais explicites, jamais coalescés :
 *  - DECLARE      : montant fourni, retenu tel quel (agrégat, pas une case).
 *  - NUL_CONFIRME : absence confirmée — 0 est une réponse positive.
 *  - INCONNU      : aucune réponse — bloque, ne devient jamais 0.
 */
function resolvePoste(input: TiersPosteInput | undefined, label: string): TiersPosteResolution {
  if (input === undefined || input.status === "INCONNU") {
    return {
      status: "INCONNU",
      raison: `${label} : aucune information — une absence de saisie ne signifie jamais "0" ; génération bloquée tant qu'un statut explicite (déclaré ou nul confirmé) n'est pas fourni.`,
    };
  }
  if (input.status === "NUL_CONFIRME") {
    return { status: "NUL_CONFIRME", montant: 0, raison: `${label} : absence confirmée explicitement par l'utilisateur (0 est une réponse positive, pas une valeur par défaut).` };
  }
  const montant = round2(input.montant);
  return { status: "DECLARE", montant, raison: `${label} : montant déclaré explicitement (${montant} €).` };
}

export function resolveTiers(inputs?: TiersInputs): TiersResolution {
  return {
    creances: resolvePoste(inputs?.creances, "Créances de tiers"),
    dettes: resolvePoste(inputs?.dettes, "Dettes de tiers"),
  };
}
