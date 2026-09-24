/**
 * Reprise externe — la convention historique de prorata n'est pas exigée
 * quand l'ouverture est déjà ancrée par le cumul documenté.
 *
 * Absence conservée. Aucun jours_reels / mensuel / annuel_plein inventé.
 */

import type { CandidateHistoricalAsset } from "./asset-candidates";
import { isCandidateAbsent, isCandidatePresent } from "./candidate-value";

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

/**
 * Blocages indépendants du prorata : même avec une convention client,
 * l'Opening reste impossible (fail-closed documentaire).
 */
export function hasProrataIndependentHardBlock(asset: CandidateHistoricalAsset): boolean {
  if (isCandidateAbsent(asset.cumulOuverture) || !isCandidatePresent(asset.cumulOuverture)) {
    return true;
  }
  if (isCandidatePresent(asset.method) && asset.method.value !== "lineaire") {
    return true;
  }
  if (isCandidatePresent(asset.durationYears)) {
    const duration = asset.durationYears.value;
    if (!Number.isInteger(duration) || duration <= 0) return true;
  } else if (isCandidateAbsent(asset.durationYears)) {
    return true;
  }
  if (!isCandidatePresent(asset.startDate) || asset.startDate.value.trim() === "") {
    return true;
  }
  if (!isCandidatePresent(asset.coutBrut)) return true;
  if (
    isCandidatePresent(asset.coutBrut) &&
    isCandidatePresent(asset.cumulOuverture) &&
    asset.cumulOuverture.value > asset.coutBrut.value
  ) {
    return true;
  }
  return false;
}

/**
 * Ancrage possible dès qu'une classification amortissable est connue —
 * inutile de demander un prorata qui sera omis ensuite.
 */
export function wouldOmitHistoricalProrataOnceClassified(
  asset: CandidateHistoricalAsset,
): boolean {
  if (!isCandidatePresent(asset.coutBrut)) return false;
  if (!isCandidatePresent(asset.cumulOuverture)) return false;
  if (asset.cumulOuverture.value > asset.coutBrut.value) return false;
  if (!isCandidatePresent(asset.startDate) || asset.startDate.value.trim() === "") return false;
  if (!isCandidatePresent(asset.durationYears)) return false;
  const duration = asset.durationYears.value;
  if (!Number.isInteger(duration) || duration <= 0) return false;
  if (!isCandidatePresent(asset.method) || asset.method.value !== "lineaire") return false;
  if (isCandidatePresent(asset.nonAmortizable) && asset.nonAmortizable.value === true) {
    return false;
  }
  return true;
}

/**
 * Poser une question client uniquement si sa réponse peut réellement
 * permettre de poursuivre. Sinon : exception / revue, pas de leurre.
 */
export function shouldAskClientForProrata(asset: CandidateHistoricalAsset): boolean {
  if (isCandidatePresent(asset.prorataConvention)) return false;
  if (canOmitHistoricalProrata(asset)) return false;
  if (hasProrataIndependentHardBlock(asset)) return false;
  if (
    isCandidateAbsent(asset.classification) &&
    wouldOmitHistoricalProrataOnceClassified(asset)
  ) {
    return false;
  }
  return true;
}
