import type { ActiviteFieldKey } from "@/components/lmnp/activite/ActiviteProfileFields";

import type { FactType } from "./fact-type-registry";

/**
 * Activité fact projection — explicit business mapping matrix.
 *
 * The projection layer NEVER mutates fact status. It only decides whether a fact
 * is relevant for an Activité form field, should stay document-only, or is missing.
 */

export type ActiviteProjectionCategory =
  | "form_field"
  | "relevant_not_displayed"
  | "document_only"
  | "missing_user_input"
  | "proposed_confirmation";

export type ActiviteFactProjectionRule = {
  factTypes: readonly FactType[];
  formFields?: readonly ActiviteFieldKey[];
  category: ActiviteProjectionCategory;
  /** Human-readable business rule for audits and tests. */
  rule: string;
};

/** Scalar identity and contact fields — direct 1:1 mapping (unscoped facts only). */
export const ACTIVITE_SCALAR_PROJECTION_RULES = [
  {
    factTypes: ["person.name.family"],
    formFields: ["lastName"],
    category: "form_field",
    rule: "person.name.family → Activité.lastName",
  },
  {
    factTypes: ["person.name.given"],
    formFields: ["firstName"],
    category: "form_field",
    rule: "person.name.given → Activité.firstName",
  },
  {
    factTypes: ["registry.siren"],
    formFields: ["siren"],
    category: "form_field",
    rule: "registry.siren → Activité.siren (EXTRACTED or PROPOSED, status preserved)",
  },
  {
    factTypes: ["contact.email"],
    formFields: ["email"],
    category: "form_field",
    rule: "contact.email → Activité.email",
  },
  {
    factTypes: ["contact.phone"],
    formFields: ["telephone"],
    category: "form_field",
    rule: "contact.phone → Activité.telephone",
  },
] as const satisfies readonly ActiviteFactProjectionRule[];

/**
 * Personal address — explicit `address.personal` EXTRACTED only (Cas 1).
 */
export const ACTIVITE_PERSONAL_ADDRESS_RULE: ActiviteFactProjectionRule = {
  factTypes: ["address.personal"],
  formFields: ["personalAddress", "personalCity", "personalPostalCode"],
  category: "form_field",
  rule: "address.personal EXTRACTED + evidence OCR explicite → Activité.personal* (EXTRACTED, sans confirmation)",
};

/**
 * Siège social — document-only, never Activité.personalAddress.
 */
export const ACTIVITE_HEADQUARTERS_ADDRESS_RULE: ActiviteFactProjectionRule = {
  factTypes: ["address.headquarters"],
  formFields: ["personalAddress", "personalCity", "personalPostalCode"],
  category: "document_only",
  rule: "address.headquarters → document_only — NEVER Activité.personalAddress (siège ≠ domicile personnel)",
};

/**
 * Establishment address — only the principal active establishment is projected to the form.
 * Secondary or closed establishments stay in the facts layer only.
 */
export const ACTIVITE_ESTABLISHMENT_ADDRESS_RULE: ActiviteFactProjectionRule = {
  factTypes: ["address.establishment", "address.line", "address.postal_code", "address.city"],
  formFields: ["establishmentAddress", "establishmentCity", "establishmentPostalCode"],
  category: "form_field",
  rule:
    "address.establishment (établissement Principal actif uniquement) → Activité.establishment* en PROPOSED + confirmation",
};

/** Registry / establishment metadata kept for future use — not shown in current Activité form. */
export const ACTIVITE_DOCUMENT_ONLY_FACT_TYPES = [
  "registry.siret",
  "registry.ape_code",
  "registry.immatriculation_date",
  "registry.activity_start_date",
  "registry.legal_form",
  "registry.main_activity_label",
  "registry.company_nature",
  "establishment.type",
  "establishment.status",
  "establishment.activity_start_date",
  "establishment.closure_date",
  "address.headquarters",
  "address.country",
] as const satisfies readonly FactType[];

/** Parsed address sub-facts from headquarters — document-only (support siège, not form). */
export const ACTIVITE_HEADQUARTERS_DERIVED_TYPES = [
  "address.line",
  "address.postal_code",
  "address.city",
  "address.country",
] as const satisfies readonly FactType[];

export const ACTIVITE_FORM_FIELD_KEYS = [
  "lastName",
  "firstName",
  "siren",
  "email",
  "telephone",
  "personalAddress",
  "personalCity",
  "personalPostalCode",
  "establishmentAddress",
  "establishmentCity",
  "establishmentPostalCode",
] as const satisfies readonly ActiviteFieldKey[];
