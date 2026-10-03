/**
 * MB-MULTI-UX-1 — état « domaine » d'un dossier multi-bien pour l'AFFICHAGE, SANS calcul fiscal ni génération (F-006 n'est pas
 * appelé : ARD généré / 39 C ne sont vérifiés qu'à la génération). Aucune règle ici : le verdict vient de l'évaluateur unique
 * (`evaluateMultiPropertyDomain`) alimenté par les faits du workspace et par les blocages des seams de consolidation par bien
 * (dates de mise en service, charges communes, prêt partagé, documents non attribués).
 */
import type { PersistedWorkspace } from "../store/persistence";
import {
  collectPropertyFiscalContributions,
  consolidateFiscalContributions,
  type FiscalConsolidationBlock,
  type PropertyEntryMode,
} from "./fiscal-consolidation";
import {
  evaluateMultiPropertyDomain,
  multiPropertyDomainFactsFromWorkspace,
  type MultiPropertyDomainReason,
} from "./multi-property-domain";
import { readBienDrafts } from "./bien-draft";

type ReadinessWorkspace = Pick<PersistedWorkspace, "properties" | "fiscalYear" | "documents" | "declarationDraft">;

export type MultiPropertyDomainReadiness =
  | { status: "not_multi" }
  | { status: "supported" }
  | { status: "unsupported"; reasons: MultiPropertyDomainReason[] };

export function resolveMultiPropertyDomainReadiness(workspace: ReadinessWorkspace): MultiPropertyDomainReadiness {
  const view = readBienDrafts(workspace);
  const seamBlocks: FiscalConsolidationBlock[] = [];
  if (view.mode === "scoped") {
    // Origine native par défaut (même règle que la génération sans indice de reprise) ; un indice de reprise est un motif de domaine.
    const entryModes: Record<string, PropertyEntryMode> = {};
    for (const propertyId of workspace.fiscalYear.propertyIds) entryModes[propertyId] = "native";
    const collection = collectPropertyFiscalContributions(workspace, { entryModes });
    if (collection.status === "blocked") seamBlocks.push(...collection.reasons);
    else seamBlocks.push(...consolidateFiscalContributions(collection.activity, collection.contributions).blockingReasons);
  }
  const base = multiPropertyDomainFactsFromWorkspace(workspace);
  const verdict = evaluateMultiPropertyDomain({
    ...base,
    seamBlocks: [...(base.seamBlocks ?? []), ...seamBlocks.map((block) => ({ code: block.code, ...(block.propertyId !== undefined ? { propertyId: block.propertyId } : {}) }))],
  });
  return verdict.status === "NOT_MULTI" ? { status: "not_multi" } : verdict.status === "SUPPORTED" ? { status: "supported" } : { status: "unsupported", reasons: verdict.reasons };
}
