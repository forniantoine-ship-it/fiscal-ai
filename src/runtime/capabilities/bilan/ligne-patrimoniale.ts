import { round2 } from "../f010/types";
import type { LignePatrimonialeInput, LignePatrimonialeResolution } from "./types";

/**
 * Résolution générique d'une ligne patrimoniale à 4 états — correction P1-A
 * (audit indépendant, asymétrie 142/137). Abstraction réutilisable au-delà
 * de la case 137 : toute ligne Cerfa qui n'est pas structurellement hors
 * périmètre par nature (ces faits-là restent des constantes codées, jamais
 * ce resolver) mais dépend d'une confirmation par dossier peut s'appuyer sur
 * cette fonction plutôt que dupliquer sa logique.
 *
 * Absence de saisie (`input` `undefined`, ou `{ status: "INCONNU" }`) ⇒
 * TOUJOURS `INCONNU` — jamais transformé en `NUL_CONFIRME` ni en
 * `NON_APPLICABLE` par défaut. Ces deux statuts n'existent que sur
 * confirmation explicite.
 */
export function resolveLignePatrimoniale(input: LignePatrimonialeInput | undefined, label: string): LignePatrimonialeResolution {
  if (input === undefined || input.status === "INCONNU") {
    return {
      status: "INCONNU",
      raison: `${label} : aucune information permettant de confirmer l'absence ou le montant — bloque la génération tant qu'un statut explicite n'est pas fourni.`,
    };
  }
  if (input.status === "NUL_CONFIRME") {
    return { status: "NUL_CONFIRME", montant: 0, raison: `${label} : absence explicitement confirmée par l'utilisateur.` };
  }
  if (input.status === "NON_APPLICABLE") {
    return { status: "NON_APPLICABLE", montant: 0, raison: `${label} : non applicable pour ce dossier.` };
  }
  const montant = round2(input.montant);
  return { status: "DECLARE", montant, raison: `${label} : montant déclaré (${montant} €).` };
}
