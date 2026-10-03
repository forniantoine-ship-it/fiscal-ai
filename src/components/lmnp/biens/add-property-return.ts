import { scopeMatchesWorkspace, v3ReturnHref, type ConfirmedSave, type V3CorrectionScope } from "@/lab/v2-dossier/correction-scope";
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
