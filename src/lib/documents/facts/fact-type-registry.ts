/**
 * Minimal FactType registry for Activité / INPI extraction (Phase 4).
 * Vocabulary is open-ended; this registry documents the types used today.
 */

export const FACT_TYPE_REGISTRY = {
  "person.name.family": {
    label: "Nom de famille",
    namespace: "person",
  },
  "person.name.given": {
    label: "Prénom",
    namespace: "person",
  },
  "registry.siren": {
    label: "SIREN",
    namespace: "registry",
  },
  "registry.siret": {
    label: "SIRET",
    namespace: "registry",
  },
  "contact.email": {
    label: "Email",
    namespace: "contact",
  },
  "contact.phone": {
    label: "Téléphone",
    namespace: "contact",
  },
  "address.headquarters": {
    label: "Adresse du siège",
    namespace: "address",
  },
  "address.establishment": {
    label: "Adresse de l'établissement",
    namespace: "address",
  },
  "address.personal": {
    label: "Adresse personnelle",
    namespace: "address",
  },
  "address.line": {
    label: "Ligne d'adresse",
    namespace: "address",
  },
  "address.postal_code": {
    label: "Code postal",
    namespace: "address",
  },
  "address.city": {
    label: "Ville",
    namespace: "address",
  },
  "address.country": {
    label: "Pays",
    namespace: "address",
  },
  "registry.ape_code": {
    label: "Code APE",
    namespace: "registry",
  },
  "registry.immatriculation_date": {
    label: "Date d'immatriculation",
    namespace: "registry",
  },
  "registry.activity_start_date": {
    label: "Date de début d'activité",
    namespace: "registry",
  },
  "registry.legal_form": {
    label: "Forme juridique",
    namespace: "registry",
  },
  "registry.main_activity_label": {
    label: "Activité principale",
    namespace: "registry",
  },
  "registry.company_nature": {
    label: "Nature de l'entreprise",
    namespace: "registry",
  },
  "establishment.type": {
    label: "Type d'établissement",
    namespace: "establishment",
  },
  "establishment.status": {
    label: "Statut de l'établissement",
    namespace: "establishment",
  },
  "establishment.activity_start_date": {
    label: "Date de début d'activité (établissement)",
    namespace: "establishment",
  },
  "establishment.closure_date": {
    label: "Date de fermeture (établissement)",
    namespace: "establishment",
  },
} as const;

export type FactType = keyof typeof FACT_TYPE_REGISTRY;

export const ACTIVITE_GPT_FACT_TYPES = [
  "person.name.family",
  "person.name.given",
  "registry.siren",
  "contact.email",
  "contact.phone",
  "address.headquarters",
  "address.establishment",
] as const satisfies readonly FactType[];

export const ACTIVITE_REGISTRY_FACT_TYPES = [
  "registry.siret",
  "registry.ape_code",
  "registry.immatriculation_date",
  "registry.activity_start_date",
  "registry.legal_form",
  "registry.main_activity_label",
] as const satisfies readonly FactType[];

export function isFactType(value: string): value is FactType {
  return value in FACT_TYPE_REGISTRY;
}
