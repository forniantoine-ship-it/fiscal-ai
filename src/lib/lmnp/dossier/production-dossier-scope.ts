/**
 * MB-MULTI-JOURNEY-COMPLETION-2 — scope de PRODUCTION du parcours multi-bien. Module PUR, sans I/O.
 *
 * Le parcours de production réutilise les écrans propriétaires existants (« Mes biens », assistants par bien, documents, validation) avec
 * le MÊME contrat de scope que le parcours V3 (`v3Correction=1` + dossier / exercice / bien). Seul change le point d'ancrage : le scope est
 * dérivé du dossier DÉJÀ chargé par le fournisseur (jamais d'un paramètre libre), puis revérifié côté serveur par la porte d'entrée
 * (`V3CorrectionEntryGate` → `loadRealWorkspace`, propriété et exercice). Le retour pointe vers une route de PRODUCTION (shell `dossier`),
 * jamais vers /lab : aucun drapeau LAB n'est nécessaire.
 *
 * Aucune règle métier ici : le bien actif reste explicite (jamais « le premier bien » en multi) et le domaine reste jugé par la garde unique.
 */
import { propertyScopeFor, v3CorrectionHrefForResolvedScope, type V3CorrectionScope } from "@/lab/v2-dossier/correction-scope";
import type { PersistedWorkspace } from "../store/persistence";

/**
 * Validation / paiement : étape d'ACTIVITÉ, sans bien. Route non scopée, identique pour le mono et le multi : elle charge le dossier du
 * fournisseur, et c'est aussi la route de retour de Stripe (`/documents?step=validation&fy=…`).
 */
export const PRODUCTION_VALIDATION_HREF = "/documents?step=validation";

type ScopeWorkspace = Pick<PersistedWorkspace, "properties" | "fiscalYear">;

/** Scope dérivé du dossier chargé. `null` : dossier non identifié, exercice clos, ou bien demandé inconnu / ambigu (jamais inventé). */
export function deriveProductionScope(workspace: ScopeWorkspace, selectedPropertyId?: string): V3CorrectionScope | null {
  const year = workspace.fiscalYear;
  if (!year?.id || !year.dossierId || year.status === "closed") return null;
  const property = propertyScopeFor(year.propertyIds, workspace.properties, selectedPropertyId);
  if (!property) return null;
  return { dossierId: year.dossierId, fiscalYearId: year.id, year: year.year, property, shell: "dossier" };
}

/** Lien de production vers un écran propriétaire (bien requis ou non selon la route), ou `null` si le scope ne peut pas être établi. */
export function productionOwnerHref(ownerRoute: string, workspace: ScopeWorkspace, propertyId?: string): string | null {
  return v3CorrectionHrefForResolvedScope(ownerRoute, deriveProductionScope(workspace, propertyId));
}
