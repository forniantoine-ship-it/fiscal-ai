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
 * champs, aucun recalcul indépendant. `referenceGenerationStatus === "stale"`
 * (et, de façon équivalente historique, `gate.canGenerate === true` après une
 * génération) signifie exactement "les données actuelles ne correspondent plus à
 * la dernière génération" : c'est exactement le signal qu'un utilisateur non
 * technique doit voir traduit simplement.
 */
import { resolveDeclarationGenerationGate } from "./declaration-generation-gate";
import { resolvePersistedExternalTakeoverOpening } from "./prior-history-eligibility";
import { resolveImmobilisationsContinuityForGeneration } from "../dossier/fiscal-year-cycle";
import { resolveConsolidationInput } from "../../dossier/bien-draft";
import { isMultiPropertyWorkspace, resolveWorkspacePropertyMode } from "../../dossier/multi-property-activation";
import type { LmnpDocument } from "../../types";
import type { DeclarationDraft, FiscalYear, Property } from "../../types/domain";

export function resolveDeclarationOutOfDate(input: {
  fiscalYear: FiscalYear;
  declarationDraft: DeclarationDraft | undefined;
  properties: Property[];
  /**
   * R2C.3c2c — documents du workspace, optionnels (les appelants actuels ne les fournissent pas : comportement inchangé, la
   * vérification d'attribution des documents du preview multi n'a alors rien à examiner).
   */
  documents?: LmnpDocument[];
}): boolean {
  const { fiscalYear, declarationDraft, properties } = input;
  const workspace = { fiscalYear, properties, documents: input.documents ?? [], declarationDraft };

  // Rien n'a encore été généré : pas de "B" à comparer, donc jamais "périmé"
  // au sens de ce signal (l'écran affiche déjà un autre message dans ce cas).
  if (!fiscalYear.declarationGeneratedAt) return false;

  const gate = resolveDeclarationGenerationGate({
    draft: declarationDraft,
    properties,
    fiscalYear: fiscalYear.year,
    paid: Boolean(fiscalYear.paidAt),
    generated: true,
    // P0-1A — même stocksOuverture que la génération réelle, cf.
    // declaration-generation-gate.ts : sans ce champ, ce signal pouvait se
    // déclarer "périmé" à tort pour un exercice en continuité (déficits
    // antérieurs/amortissements reportés non nuls) sans aucune modification.
    stocksOuverture: fiscalYear.stocksOuverture?.stocks,
    // Lot 5 B2 — même continuité immobilisations que la génération finale.
    continuity: resolveImmobilisationsContinuityForGeneration({
      draft: declarationDraft,
      properties,
      propertyIds: fiscalYear.propertyIds,
      immobilisationsOuverture: fiscalYear.immobilisationsOuverture,
      repriseHistoriqueEnContinuite: fiscalYear.repriseHistoriqueEnContinuite,
      previousFiscalYearId: fiscalYear.previousFiscalYearId,
      continuiteNativeVerifiee: fiscalYear.continuiteNativeVerifiee,
    }),
    // Lot 5.3 — même Opening que la génération réelle (évite un faux « stale »
    // après reprise externe). Appelant de dérive : pas de priorHistory ici.
    fiscalYearOpening: resolvePersistedExternalTakeoverOpening(fiscalYear),
    // R2C.3c2c — scoped mono : vue plate canonique ; scoped multi : preview du service workspace (gate).
    workspace,
  });

  // R2C.3c2c — fail-closed UNIQUEMENT pour ce qui ne peut pas être évalué comme un mono : le multi (et un scoped mono refusé par
  // ses invariants). Une déclaration stockée dont le preview est bloqué, incomplet ou absent n'est JAMAIS déclarée « à jour ».
  // Mono / scoped mono : sémantique historique (`stale` seulement ; les autres statuts relèvent du reducer, filet A).
  if (isMultiPropertyWorkspace(workspace) || isScopedMonoRefused(workspace)) {
    return gate.referenceGenerationStatus !== "current";
  }
  return gate.referenceGenerationStatus === "stale";
}

function isScopedMonoRefused(workspace: Parameters<typeof resolveConsolidationInput>[0]): boolean {
  return resolveWorkspacePropertyMode(workspace).kind === "scoped_mono" && resolveConsolidationInput(workspace).kind === "blocked";
}
