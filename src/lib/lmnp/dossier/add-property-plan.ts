/**
 * MB-MULTI-UX-1 — plan PUR d'ajout d'un bien. UNE seule implémentation de la transition : `addPropertyToWorkspace` (R2B.2a,
 * mono → bien A scopé + bien B, atomique) ; ce module ne fait que (1) refuser tant que la capacité d'ÉDITION multi est fermée,
 * (2) fabriquer le `Property` (identifiant stable, nom saisi, aucune donnée copiée d'un autre bien) et (3) PRÉVISUALISER la
 * transition pour refuser avant tout dispatch. Le bien créé devient le bien actif (décision ADR-011 §6).
 */
import type { PersistedWorkspace } from "../store/persistence";
import type { Property } from "../types";
import { addPropertyToWorkspace, type AddPropertyFailure } from "./bien-draft";
import { isMultiPropertyCapabilityOpen, type MultiPropertyCapabilities } from "./multi-property-activation";

export const PROPERTY_LABEL_MAX_LENGTH = 80;

export type AddPropertyRefusal = "edition_not_enabled" | "invalid_label" | AddPropertyFailure;

export type AddPropertyPlan =
  | { ok: true; property: Property; /** Le bien créé devient le bien actif. */ activePropertyId: string }
  | { ok: false; reason: AddPropertyRefusal };

type PlanWorkspace = Pick<PersistedWorkspace, "properties" | "fiscalYear" | "documents" | "declarationDraft">;

export function planAddProperty(
  workspace: PlanWorkspace,
  input: { label: string },
  options: { capabilities?: MultiPropertyCapabilities; newId?: () => string } = {},
): AddPropertyPlan {
  if (!isMultiPropertyCapabilityOpen("edition", options.capabilities)) return { ok: false, reason: "edition_not_enabled" };
  const label = input.label.trim();
  if (!label || label.length > PROPERTY_LABEL_MAX_LENGTH) return { ok: false, reason: "invalid_label" };
  const property: Property = { id: (options.newId ?? (() => crypto.randomUUID()))(), label, address: "", city: "", postalCode: "" };
  const preview = addPropertyToWorkspace(workspace, property);
  return preview.ok ? { ok: true, property, activePropertyId: property.id } : { ok: false, reason: preview.reason };
}
