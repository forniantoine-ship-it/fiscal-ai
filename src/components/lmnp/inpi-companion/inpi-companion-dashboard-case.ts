/**
 * Compagnon INPI — adaptateur mince pour le résumé Dashboard (Phase 4.4.16).
 *
 * Ne recalcule rien : reçoit la décision déjà produite par
 * `computeInpiCompanionView` (donc, transitivement, par le moteur de la
 * Phase 4.2) et se contente de choisir QUEL bloc de copy afficher. Aucune
 * seconde source de vérité, aucun second `resolveInpiStatus()`.
 */

import type { InpiCompanionMode } from "@/runtime/assistants/inpi-companion/types";

export type InpiCompanionDashboardCase =
  | "resumed"
  | "diagnostic"
  | "creation"
  | "poursuite"
  | "attente"
  | "regularisation"
  | "verification";

/**
 * La reprise d'un parcours Compagnon (progression CFA locale) prime sur le
 * wording générique creation/poursuite — jamais confondue avec "la démarche
 * INPI elle-même est commencée" (§4.4.2). Ne s'applique qu'aux modes qui
 * suivent réellement une séquence d'étapes ; les autres modes n'ont jamais
 * `resumed=true` en pratique (rien n'y persiste `inpiCompanionState`).
 */
export function resolveInpiCompanionDashboardCase(modeDecision: {
  mode: InpiCompanionMode;
  resumed: boolean;
}): InpiCompanionDashboardCase {
  if (modeDecision.resumed && (modeDecision.mode === "creation" || modeDecision.mode === "poursuite")) {
    return "resumed";
  }
  return modeDecision.mode;
}
