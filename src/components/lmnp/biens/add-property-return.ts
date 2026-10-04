import { scopeMatchesWorkspace, v3ReturnHref, type ConfirmedSave, type V3CorrectionScope } from "@/lab/v2-dossier/correction-scope";
import { productionOwnerHref } from "@/lib/lmnp/dossier/production-dossier-scope";
import type { PersistedWorkspace } from "@/lib/lmnp/store/persistence";

/**
 * MB-MULTI-UX-1 — retour vers le dossier V3 APRÈS un ajout de bien CONFIRMÉ côté serveur : le scope du retour porte le NOUVEAU bien
 * (bien actif = bien créé). Refusé (`null`) si le scope ne correspond plus au workspace ou si l'enregistrement n'est pas confirmé.
 */
export function buildAddPropertyReturnHref(input: {
  scope: V3CorrectionScope;
  workspace: PersistedWorkspace;
  newPropertyId: string;
  save: ConfirmedSave;
}): string | null {
  const scope: V3CorrectionScope = { ...input.scope, property: { kind: "required", propertyId: input.newPropertyId } };
  return v3ReturnHref({ scope, changed: true, save: input.save, scopeStillMatches: scopeMatchesWorkspace(scope, input.workspace) });
}


/**
 * MB-MULTI-JOURNEY-COMPLETION-2 — issue VÉRIDIQUE d'un ajout de bien, décidée par le seul résultat d'enregistrement serveur.
 *
 *   - enregistrement non confirmé → `unsaved` : jamais de succès ni de redirection (l'utilisateur peut réessayer l'enregistrement) ;
 *   - confirmé, parcours V3 LAB (scope d'URL `v3`/historique) → retour existant vers le dossier V3 sur le nouveau bien ;
 *   - confirmé, parcours de PRODUCTION (sans scope d'URL ou scope `dossier`) → arrivée sur l'assistant Logement du NOUVEAU bien, scope
 *     dérivé du dossier chargé (route de production, aucun /lab) ;
 *   - confirmé mais aucun lien constructible → `saved` : le bien EST enregistré, aucun échec n'est affiché.
 */
export type AddPropertyOutcome = { kind: "navigate"; href: string } | { kind: "saved" } | { kind: "unsaved" };

export function resolveAddPropertyOutcome(input: {
  workspace: PersistedWorkspace;
  scope: V3CorrectionScope | null;
  newPropertyId: string;
  save: ConfirmedSave;
}): AddPropertyOutcome {
  if (input.save.status !== "confirmed") return { kind: "unsaved" };
  const href = input.scope && input.scope.shell !== "dossier"
    ? buildAddPropertyReturnHref({ scope: input.scope, workspace: input.workspace, newPropertyId: input.newPropertyId, save: input.save })
    : productionOwnerHref("/assistants/logement", input.workspace, input.newPropertyId);
  return href ? { kind: "navigate", href } : { kind: "saved" };
}

/**
 * Convertit la révision CONFIRMÉE fournie par le provider (`resolveDeliveryRevision` : vidage de l'autosave, puis révision serveur confirmée,
 * y compris quand rien n'était en attente = déjà persisté) en `ConfirmedSave`. Un état « rien en attente » n'est JAMAIS un échec.
 */
export function toConfirmedSave(result: { status: "ok"; revision: number } | { status: "failed"; reason: string }): ConfirmedSave {
  return result.status === "ok" ? { status: "confirmed", revision: result.revision } : { status: "failed", reason: result.reason };
}
