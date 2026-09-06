import { round2 } from "../f010/types";
import type { TiersInputs, TiersPosteInput, TiersPosteResolution, TiersResolution } from "./types";

/**
 * Résout les postes de tiers (créances/dettes, cases 068/072/166/172/175
 * selon la nature) — correction P0-1 (NO SILENT ZERO).
 *
 * Avant cette correction, `tiers?.creances ?? 0` et `tiers?.dettes ?? 0`
 * transformaient silencieusement une absence de saisie en un montant nul,
 * ce qui pouvait produire un bilan déclaré EQUILIBRE alors qu'une créance ou
 * une dette réelle n'avait simplement pas été renseignée. Trois statuts
 * désormais explicites, jamais coalescés :
 *  - DECLARE      : montant fourni par l'utilisateur, retenu tel quel.
 *  - NUL_CONFIRME : l'utilisateur a confirmé l'absence de ce poste — 0 est
 *                   alors une réponse positive à une question posée, pas
 *                   une valeur par défaut.
 *  - INCONNU      : aucune réponse (y compris `tiers` entièrement absent de
 *                   `BilanInputs`, ou `{}`) — bloque la génération, ne
 *                   devient jamais 0.
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
