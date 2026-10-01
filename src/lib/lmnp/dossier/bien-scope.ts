/**
 * R2B.2b — scope du bien actif pour les chemins de production (panels F010–F014, Tunnel A).
 *
 * Fonctions pures, sans écriture : elles CONSOMMENT les primitives R1/R2A (résolveur de scope, lecture BienDraft) et
 * ne choisissent jamais un bien implicitement. Legacy mono : le brouillon historique est rendu tel quel (même objet),
 * le bien actif n'est qu'une étiquette pour les écritures. Scopé : la vue « exercice + bien actif », ou un blocage.
 */
import type { LmnpAction } from "../store/reducer";
import type { DeclarationDraft } from "../types";
import { resolveBienDraftForRead, type BienDraftFailure } from "./bien-draft";
import { resolveMonoPropertyId, resolvePropertyScope } from "./property-scope";

type ScopeWorkspace = Parameters<typeof resolveBienDraftForRead>[0];

/** Forme minimale du scope V3 de correction (`V3CorrectionScope.property`). */
type CorrectionScopeLike = { property: { kind: "required"; propertyId: string } | { kind: "not_applicable" } } | null | undefined;

/**
 * Bien actif : 1. bien explicite du scope V3 (vérifié) ; 2. sinon bien unique d'un exercice mono cohérent ; 3. sinon
 * aucun. Un scope explicite invalide ne retombe JAMAIS sur le bien unique.
 */
export function resolveActivePropertyId(correctionScope: CorrectionScopeLike, workspace: ScopeWorkspace): string | undefined {
  if (correctionScope?.property.kind === "required") {
    const resolution = resolvePropertyScope(workspace, correctionScope.property.propertyId);
    return resolution.ok ? resolution.propertyId : undefined;
  }
  return resolveMonoPropertyId(workspace);
}

export type BienScope =
  | { status: "ready"; mode: "legacy"; propertyId: string | undefined; draft: DeclarationDraft }
  | { status: "ready"; mode: "scoped"; propertyId: string; draft: DeclarationDraft }
  | { status: "blocked"; reason: "no_active_property" | BienDraftFailure | "unresolved" };

/** Scope d'un panel de domaine du bien. Aucune vue à plat de repli en mode scopé. */
export function bienScopeFor(workspace: ScopeWorkspace, activePropertyId: string | undefined): BienScope {
  if (workspace.declarationDraft?.biens === undefined) {
    // Même brouillon que `selectWorkspace` (jamais absent) : legacy strictement inchangé.
    return { status: "ready", mode: "legacy", propertyId: activePropertyId, draft: workspace.declarationDraft ?? { completedSteps: [] } };
  }
  if (!activePropertyId) return { status: "blocked", reason: "no_active_property" };
  const read = resolveBienDraftForRead(workspace, activePropertyId);
  if (read.status !== "resolved") return { status: "blocked", reason: read.reason };
  if (read.source !== "scoped" || !read.view) return { status: "blocked", reason: "unresolved" };
  return { status: "ready", mode: "scoped", propertyId: read.propertyId, draft: read.view };
}

const BIEN_SCOPED_ACTIONS: ReadonlySet<LmnpAction["type"]> = new Set<LmnpAction["type"]>([
  "DECLARATION_PATCH_DRAFT", "CONFIRM_LOGEMENT_PROFILE", "CONFIRM_CREDIT_FINANCING", "DECLARE_NO_CREDIT", "DECLARATION_COMPLETE_STEP",
]);

/** Porte le bien actif sur les actions propres au bien ; sans bien actif, l'action reste inchangée (le reducer tranche). */
export function withActivePropertyId(action: LmnpAction, propertyId: string | undefined): LmnpAction {
  if (!propertyId || !BIEN_SCOPED_ACTIONS.has(action.type) || "propertyId" in action) return action;
  return { ...action, propertyId } as LmnpAction;
}

/** Tunnel A : parcours historique mono, disponible uniquement tant que le dossier n'est pas scopé (décision R2B.1). */
export function isTunnelAAvailable(workspace: { declarationDraft?: DeclarationDraft }): boolean {
  return workspace.declarationDraft?.biens === undefined;
}
