import { round2 } from "../f010/types";
import type { RanInputs, RanResolution } from "./types";

/**
 * Résout la case 134 (Report à nouveau) — trois situations produit (contrat
 * P0 §9), jamais une convention comptable générale imposée par le code :
 *
 *  - NATIF             : dossier Fiscal AI natif (aucun exercice antérieur
 *                        suivi ailleurs) → 134 = 0, aucun RAN artificiel.
 *  - IMPORTE           : dossier historique — le RAN doit être fourni
 *                        explicitement, jamais déduit.
 *  - REPRISE_HISTORIQUE: reprise de continuité — la valeur de la structure
 *                        de reprise est conservée telle quelle.
 *
 * INTERDICTIONS (contrat P0 §9/§23), jamais implémentées ici ni ailleurs :
 * 134 ne doit jamais être le déficit fiscal, l'ARD, ni recevoir le résultat
 * fiscal ou comptable par un mécanisme automatique généralisé à toute EI —
 * seul `resolve-ouverture-n-plus-1.ts` applique l'affectation N→N+1 décrite
 * au contrat, jamais cette fonction.
 */
export function resolveRan(inputs: RanInputs): RanResolution {
  if (inputs.situation === "NATIF") {
    return { disponible: true, valeur: 0, raison: "Dossier Fiscal AI natif (C1) : 134 = 0, aucun RAN artificiel." };
  }

  if (inputs.importedRAN === undefined) {
    return {
      disponible: false,
      raison:
        inputs.situation === "IMPORTE"
          ? "Dossier historique importé (C2) : aucun montant de report à nouveau fourni — jamais supposé nul par défaut pour un dossier qui n'est pas natif."
          : "Reprise historique (C3) : la structure de reprise ne porte pas encore de valeur de report à nouveau — 134 reste indisponible tant qu'elle n'est pas explicitement conservée.",
    };
  }

  return {
    disponible: true,
    valeur: round2(inputs.importedRAN),
    raison:
      inputs.situation === "IMPORTE"
        ? `Dossier historique importé (C2), montant fourni (source : ${inputs.source ?? "non précisée"}).`
        : "Reprise historique (C3) : valeur conservée telle quelle depuis la structure de reprise fournie, jamais reconstruite.",
  };
}
