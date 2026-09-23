/**
 * Reprise externe — la convention historique de prorata n'est pas exigée
 * quand l'ouverture est déjà ancrée par le cumul documenté.
 *
 * Absence conservée. Aucun jours_reels / mensuel / annuel_plein inventé.
 */

import type { CandidateHistoricalAsset } from "./asset-candidates";
import { isCandidatePresent } from "./candidate-value";

export function canOmitHistoricalProrata(asset: CandidateHistoricalAsset): boolean {
  if (!isCandidatePresent(asset.coutBrut)) return false;
  if (!isCandidatePresent(asset.cumulOuverture)) return false;
  if (asset.cumulOuverture.value > asset.coutBrut.value) return false;
  if (!isCandidatePresent(asset.startDate) || asset.startDate.value.trim() === "") return false;
  if (!isCandidatePresent(asset.durationYears)) return false;
  const duration = asset.durationYears.value;
  if (!Number.isInteger(duration) || duration <= 0) return false;
  if (!isCandidatePresent(asset.method) || asset.method.value !== "lineaire") return false;
  if (!isCandidatePresent(asset.classification) || asset.classification.value === "terrain") {
    return false;
  }
  if (isCandidatePresent(asset.nonAmortizable) && asset.nonAmortizable.value === true) {
    return false;
  }
  return true;
}
