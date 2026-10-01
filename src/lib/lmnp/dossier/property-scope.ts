/**
 * R1 — résolution CENTRALE du bien (socle multi-bien, invisible).
 *
 * Le bien est l'unité de calcul ; l'activité est l'unité de déclaration. Toute donnée propre à un bien porte un
 * `propertyId` explicite. Ce module ne choisit JAMAIS un bien : il vérifie celui qu'on lui donne, ou résout
 * déterministement le bien unique d'un exercice mono-bien (compatibilité historique). Avec plusieurs biens, une
 * absence de `propertyId` est un échec explicite (fail-closed), jamais le premier bien de la liste.
 */
import type { PersistedWorkspace } from "../store/persistence";
import type { Property } from "../types";

/** Seuls les identifiants comptent pour résoudre un scope : aucune donnée métier n'est lue ici. */
type ScopeWorkspace = { properties: readonly { id: string }[]; fiscalYear: { propertyIds: readonly string[] } };

/** Périmètre de biens de l'exercice. `inconsistent` : la liste des biens et celle de l'exercice divergent. */
export type ExerciseScope =
  | { kind: "none" }
  | { kind: "mono"; propertyId: string }
  | { kind: "multi"; propertyIds: string[] }
  | { kind: "inconsistent" };

export type PropertyScopeFailure =
  | "no_property"
  | "ambiguous"
  | "unknown_property"
  | "not_in_fiscal_year"
  | "inconsistent_scope";

export type PropertyResolution =
  | { ok: true; propertyId: string; via: "explicit" | "mono_legacy" }
  | { ok: false; reason: PropertyScopeFailure };

export function resolveExerciseScope(workspace: ScopeWorkspace): ExerciseScope {
  const propertyIds = workspace.fiscalYear.propertyIds;
  const ids = workspace.properties.map((property) => property.id);
  if (ids.length === 0 && propertyIds.length === 0) return { kind: "none" };
  const unique = new Set(ids);
  const sameSet =
    unique.size === ids.length &&
    new Set(propertyIds).size === propertyIds.length &&
    ids.length === propertyIds.length &&
    propertyIds.every((id) => unique.has(id));
  if (!sameSet) return { kind: "inconsistent" };
  if (ids.length === 1) return { kind: "mono", propertyId: ids[0]! };
  return { kind: "multi", propertyIds: [...propertyIds] };
}

/**
 * `propertyId` explicite : vérifié (bien connu ET rattaché à l'exercice). Absent : résolu vers le bien unique d'un
 * exercice mono-bien, sinon échec explicite.
 */
export function resolvePropertyScope(
  workspace: ScopeWorkspace,
  propertyId?: string | null,
): PropertyResolution {
  const scope = resolveExerciseScope(workspace);
  if (typeof propertyId === "string" && propertyId.trim()) {
    if (!workspace.properties.some((property) => property.id === propertyId)) {
      return { ok: false, reason: "unknown_property" };
    }
    if (!workspace.fiscalYear.propertyIds.includes(propertyId)) {
      return { ok: false, reason: "not_in_fiscal_year" };
    }
    if (scope.kind === "inconsistent") return { ok: false, reason: "inconsistent_scope" };
    return { ok: true, propertyId, via: "explicit" };
  }
  switch (scope.kind) {
    case "mono": return { ok: true, propertyId: scope.propertyId, via: "mono_legacy" };
    case "none": return { ok: false, reason: "no_property" };
    case "multi": return { ok: false, reason: "ambiguous" };
    case "inconsistent": return { ok: false, reason: "inconsistent_scope" };
  }
}

/**
 * Adaptateur des chemins historiques non scopés : le bien unique d'un exercice mono-bien, sinon `undefined`
 * (aucune attribution). Remplace `fiscalYear.propertyIds[0]` / `properties[0]`.
 */
export function resolveMonoPropertyId(workspace: ScopeWorkspace): string | undefined {
  const scope = resolveExerciseScope(workspace);
  return scope.kind === "mono" ? scope.propertyId : undefined;
}

export function resolveMonoProperty(workspace: Pick<PersistedWorkspace, "properties" | "fiscalYear">): Property | undefined {
  const propertyId = resolveMonoPropertyId(workspace);
  return propertyId === undefined ? undefined : workspace.properties.find((property) => property.id === propertyId);
}

/**
 * Portée d'un document. Contrat : `propertyId` (chaîne) = document propre à ce bien ; `null` = document réellement
 * commun ; absent = document historique non attribué, rattaché au bien unique en mono-bien seulement.
 */
export type DocumentScope =
  | { kind: "property"; propertyId: string; via: "explicit" | "mono_legacy" }
  | { kind: "common" }
  | { kind: "unresolved"; reason: PropertyScopeFailure };

export function resolveDocumentScope(
  workspace: ScopeWorkspace & { declarationDraft?: { inpiDocumentId?: string } },
  document: { id?: string; propertyId?: string | null },
): DocumentScope {
  if (document.propertyId === null) return { kind: "common" };
  // R2B.2b — le document d'activité (lien F009 explicite) est commun à l'exercice, jamais propre à un bien.
  if (document.id !== undefined && document.id === workspace.declarationDraft?.inpiDocumentId) return { kind: "common" };
  const resolution = resolvePropertyScope(workspace, document.propertyId);
  return resolution.ok
    ? { kind: "property", propertyId: resolution.propertyId, via: resolution.via }
    : { kind: "unresolved", reason: resolution.reason };
}
