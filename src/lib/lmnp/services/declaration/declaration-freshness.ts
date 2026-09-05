/**
 * P0-2a — Vérité immédiate de la liasse.
 *
 * Ne remplace JAMAIS la dernière génération réellement produite (`declarationDraft
 * .fiscalResult/liasseResult/rfs/liasseRfs`, "B") par un aperçu recalculé — B reste
 * B, toujours affiché et téléchargeable tel quel. Ce module répond uniquement à
 * "cette génération est-elle encore cohérente avec le dossier actuel ?", un
 * booléen de présentation, jamais une valeur fiscale.
 *
 * Réutilise `resolveDeclarationGenerationGate()` (P0-1, déjà la source de vérité
 * du drift, déjà consommée par `canCloseFiscalYear()`) — aucune seconde liste de
 * champs, aucun recalcul indépendant. `gate.canGenerate === true` après une
 * génération signifie exactement "les données actuelles ne correspondent plus à
 * la dernière génération" : c'est exactement le signal qu'un utilisateur non
 * technique doit voir traduit simplement.
 */
import { resolveDeclarationGenerationGate } from "./declaration-generation-gate";
import type { DeclarationDraft, FiscalYear, Property } from "../../types/domain";

export function resolveDeclarationOutOfDate(input: {
  fiscalYear: FiscalYear;
  declarationDraft: DeclarationDraft | undefined;
  properties: Property[];
}): boolean {
  const { fiscalYear, declarationDraft, properties } = input;

  // Rien n'a encore été généré : pas de "B" à comparer, donc jamais "périmé"
  // au sens de ce signal (l'écran affiche déjà un autre message dans ce cas).
  if (!fiscalYear.declarationGeneratedAt) return false;

  const gate = resolveDeclarationGenerationGate({
    draft: declarationDraft,
    properties,
    fiscalYear: fiscalYear.year,
    paid: Boolean(fiscalYear.paidAt),
    generated: true,
  });

  return gate.canGenerate;
}
