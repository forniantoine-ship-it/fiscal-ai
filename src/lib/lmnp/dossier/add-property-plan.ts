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
import { resolveMultiPropertyEntryAdmission, type MultiPropertyDomainReason } from "./multi-property-domain";

export const PROPERTY_LABEL_MAX_LENGTH = 80;

export type AddPropertyRefusal = "edition_not_enabled" | "invalid_label" | "domain_unsupported" | AddPropertyFailure;

export type AddPropertyPlan =
  | { ok: true; property: Property; /** Le bien créé devient le bien actif. */ activePropertyId: string }
  | { ok: false; reason: AddPropertyRefusal; /** Présent pour `domain_unsupported` : motifs stables de la garde de domaine. */ domainReasons?: MultiPropertyDomainReason[] };

type PlanWorkspace = Pick<PersistedWorkspace, "properties" | "fiscalYear" | "documents" | "declarationDraft">;

export type AddPropertyEligibility =
  | { status: "eligible" }
  | { status: "edition_not_enabled" }
  | { status: "unsupported"; reasons: MultiPropertyDomainReason[] };

/**
 * Peut-on proposer l'ajout d'un bien ? Capacité d'ÉDITION d'abord (activation produit), puis admission de domaine à l'entrée en multi
 * (garde unique, motifs connus avant génération) : un dossier manifestement hors domaine n'entre jamais, par l'interface normale, dans un
 * mode multi irréversible.
 */
export function resolveAddPropertyEligibility(workspace: PlanWorkspace, options: { capabilities?: MultiPropertyCapabilities } = {}): AddPropertyEligibility {
  if (!isMultiPropertyCapabilityOpen("edition", options.capabilities)) return { status: "edition_not_enabled" };
  const admission = resolveMultiPropertyEntryAdmission(workspace);
  return admission.allowed ? { status: "eligible" } : { status: "unsupported", reasons: admission.reasons };
}

export function planAddProperty(
  workspace: PlanWorkspace,
  input: { label: string },
  options: { capabilities?: MultiPropertyCapabilities; newId?: () => string } = {},
): AddPropertyPlan {
  const eligibility = resolveAddPropertyEligibility(workspace, { capabilities: options.capabilities });
  if (eligibility.status === "edition_not_enabled") return { ok: false, reason: "edition_not_enabled" };
  if (eligibility.status === "unsupported") return { ok: false, reason: "domain_unsupported", domainReasons: eligibility.reasons };
  const label = input.label.trim();
  if (!label || label.length > PROPERTY_LABEL_MAX_LENGTH) return { ok: false, reason: "invalid_label" };
  const property: Property = { id: (options.newId ?? (() => crypto.randomUUID()))(), label, address: "", city: "", postalCode: "" };
  const preview = addPropertyToWorkspace(workspace, property);
  return preview.ok ? { ok: true, property, activePropertyId: property.id } : { ok: false, reason: preview.reason };
}

