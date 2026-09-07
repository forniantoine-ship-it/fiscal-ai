/**
 * B-FAMILY-3 — extrait de `patrimonial-intake.ts` (aucun changement de
 * comportement) pour casser une dépendance circulaire : `patrimonial-intake.ts`
 * importe désormais `ventilation-tiers-intake.ts`, qui a besoin de cette
 * fonction — la garder dans `patrimonial-intake.ts` aurait créé un cycle
 * (`patrimonial-intake.ts` → `ventilation-tiers-intake.ts` → `patrimonial-intake.ts`),
 * fragile selon l'ordre de chargement des modules (constaté : `ReferenceError:
 * Cannot access '...' before initialization` selon quel fichier de test est
 * le point d'entrée). Module sans aucune dépendance, ne peut plus jamais
 * participer à un cycle.
 *
 * Toujours ré-exportée par `patrimonial-intake.ts` pour ne rien changer aux
 * imports existants (`patrimonial-intake.test.ts` notamment).
 */

/**
 * Convertit une saisie utilisateur en montant explicite.
 *
 * `""` (ou uniquement des espaces) → `undefined` (INCONNU, jamais 0).
 * Une chaîne non numérique → `undefined` également (saisie invalide traitée
 * comme non renseignée, jamais une valeur inventée).
 *
 * INTERDIT partout où une déclaration utilisateur est construite :
 * `Number(raw)` seul, ou `Number(raw) || 0` — `Number("")` vaut `0` en
 * JavaScript, ce qui transformerait silencieusement un champ jamais rempli
 * en déclaration explicite de zéro. Ce point est le seul endroit du module
 * où cette conversion doit avoir lieu.
 */
export function parseMontantSaisi(raw: string): number | undefined {
  const trimmed = raw.trim();
  if (trimmed === "") return undefined;
  const value = Number(trimmed);
  return Number.isFinite(value) ? value : undefined;
}
