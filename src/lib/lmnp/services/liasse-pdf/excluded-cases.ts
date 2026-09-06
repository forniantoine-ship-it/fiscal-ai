/**
 * Cases explicitement RETIRÉES du périmètre de génération — jamais
 * approximées. Principe de la mission de sécurisation P0 : "je préfère une
 * case explicitement non supportée à une case approximativement
 * positionnée."
 *
 * Une case listée ici peut être produite par le mapper fiscal (le mapper
 * n'est pas modifié) mais n'est PAS dessinée sur le PDF final — ni bloquée
 * (la génération continue normalement pour toutes les autres cases), ni
 * silencieuse (elle apparaît dans `LiasseGenerationResult.excludedCases`,
 * et un test de non-régression matérialise chaque exclusion).
 *
 * Deux classifications, jamais confondues :
 *  - "GEOMETRIC_UNCERTAINTY" — la position sur le Cerfa officiel n'a pas pu
 *    être établie avec une certitude suffisante malgré une recherche dédiée
 *    (grille vectorielle ambiguë ou absente). Aucune question fiscale.
 *  - "FISCAL_ARBITRATION_REQUIRED" — la position EST connue avec certitude,
 *    mais ce que le mapper fiscal y écrit est en délicatesse avec ce que le
 *    Cerfa officiel semble réellement attendre à cet endroit. Cette mission
 *    ne tranche jamais ce point (hors périmètre : aucune règle fiscale
 *    modifiée) — elle le rend visible et testé, jamais masqué dans le
 *    generator.
 */
import type { CerfaFormId, Millesime } from "./types";

export type ExclusionClassification = "GEOMETRIC_UNCERTAINTY" | "FISCAL_ARBITRATION_REQUIRED";

export type CerfaExcludedCase = {
  form: CerfaFormId;
  millesime: Millesime;
  caseId: string;
  classification: ExclusionClassification;
  reason: string;
};

export const CERFA_EXCLUDED_CASES_2026: readonly CerfaExcludedCase[] = [
  // 300 : RETIRÉE de cette liste (MICRO-JALON implémentation 300) — la
  // justification historique ("aucun séparateur de grille fiable trouvé...
  // les lignes verticales détectées à sa hauteur appartiennent à la ligne
  // 290/347 au-dessus") a été réexaminée par un jalon d'audit dédié et ne
  // résistait pas à une recontre-vérification indépendante (quatre méthodes
  // convergentes : PyMuPDF, parsing direct des opérateurs vectoriels,
  // pdfjs-dist, rendu raster). Sa géométrie est désormais démontrée au même
  // niveau de preuve que 330/350 — voir registry/2033-b/2026.ts et
  // tests/position-oracle.test.ts, describe "case 300". Aucune question
  // fiscale n'a jamais existé pour cette case (perteExceptionnelle,
  // inchangée) : c'était une exclusion purement géométrique, jamais un
  // arbitrage fiscal.
  //
  // 350 : RETIRÉE de cette liste (MICRO-JALON calibration 350) — sa
  // géométrie a été démontrée indépendamment (voir registry/2033-b/2026.ts
  // et tests/position-oracle.test.ts) ; la règle fiscale était déjà
  // verrouillée depuis le jalon précédent. Voir
  // tests/case-350-fiscal-arbitration.test.ts pour l'historique complet
  // (arbitrage fiscal, désormais tranché, puis calibrage géométrique,
  // désormais démontré).
  //
  // Aucune case n'est actuellement exclue pour 2033-B-SD / millésime 2026 —
  // ce tableau reste vide plutôt que supprimé : la structure doit rester
  // prête à accueillir une future exclusion documentée (ex. un nouveau
  // millésime dont une case n'aurait pas encore été calibrée), jamais un
  // repli silencieux vers "aucune exclusion possible".
];

export function isExcludedCase(form: CerfaFormId, millesime: Millesime, caseId: string): CerfaExcludedCase | undefined {
  return CERFA_EXCLUDED_CASES_2026.find(
    (entry) => entry.form === form && entry.millesime === millesime && entry.caseId === caseId,
  );
}
