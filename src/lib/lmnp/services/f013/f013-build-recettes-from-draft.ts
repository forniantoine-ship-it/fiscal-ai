import type { RevenusAssistantOutput } from "@/lib/lmnp/types/domain";
import type { RecettesExerciceResult } from "@/runtime";

/**
 * P0-B — reconstruction de `result.recettes` (reprise après rechargement)
 * extraite en fonction pure, testable sans rendre le composant. Transporte
 * `revenuTheorique` (persisté comme simple `number`, montantAttendu),
 * auparavant perdu à cette frontière et invisible à l'affichage après reprise.
 *
 * Seul `montantAttendu` est réellement persisté — `loyerMensuel`/`moisVacance`/
 * `baseCalcul` n'ont pas de source ici et ne sont pas réellement utilisés par
 * l'affichage (ResultSummary ne lit que `.montantAttendu`) : ils sont neutres,
 * jamais inventés comme s'ils étaient recalculés.
 */
export function buildRecettesFromRevenusAssistant(
  revenusAssistant: RevenusAssistantOutput,
): RecettesExerciceResult {
  return {
    exerciceFiscal: revenusAssistant.exerciceFiscal,
    totalRecettes: revenusAssistant.totalRecettes,
    loyersEncaisses: revenusAssistant.loyersEncaisses,
    indemnitesAssurance: revenusAssistant.indemnitesAssurance,
    recettesPlateforme: revenusAssistant.recettesPlateforme,
    ajustementsJanDec: revenusAssistant.ajustementsJanDec,
    moisLocationEffectifs: revenusAssistant.moisLocationEffectifs,
    revenuTheorique:
      revenusAssistant.revenuTheorique !== undefined
        ? {
            montantAttendu: revenusAssistant.revenuTheorique,
            loyerMensuel: 0,
            moisLocationEffectifs: revenusAssistant.moisLocationEffectifs,
            moisVacance: 0,
            baseCalcul: "reconstruit depuis le draft persisté (reprise)",
          }
        : undefined,
    lignes: [],
    deltaExplique: 0,
  };
}
