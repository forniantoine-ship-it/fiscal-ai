/**
 * MB-MULTI-UX-1 (ADR-011 §6) — attestations d'ACTIVITÉ du multi-bien. Module PUR.
 *
 * Le modèle ne sait détecter ni une situation SSI hors périmètre, ni une détention indirecte, ni une charge commune : aucune
 * détection fiscale n'est inventée. L'utilisateur atteste séparément trois faits ; chaque réponse est persistée avec son
 * horodatage et la VERSION du libellé affiché (auditable). Aucune réponse = « non attestée » = refus (fail-closed).
 *
 *   ssi            — l'activité reste dans le LMNP pris en charge, hors situation SSI hors périmètre ;
 *   directHolding  — les logements sont détenus directement dans le périmètre pris en charge ;
 *   noCommonCharges — aucune charge n'est commune à plusieurs biens.
 *
 * Ces libellés sont factuels : ils ne sont ni un conseil fiscal ni une qualification juridique.
 */

export type MultiPropertyAttestationKind = "ssi" | "directHolding" | "noCommonCharges";

export const MULTI_PROPERTY_ATTESTATION_KINDS: readonly MultiPropertyAttestationKind[] = ["ssi", "directHolding", "noCommonCharges"];

/** Version des libellés : à incrémenter si un libellé change (les anciennes réponses restent auditables). */
export const MULTI_PROPERTY_ATTESTATION_WORDING_VERSION = "2026-10-03.1";

export type MultiPropertyAttestationAnswer = "confirmed" | "declared_out_of_domain";

export type MultiPropertyAttestationRecord = {
  answer: MultiPropertyAttestationAnswer;
  /** ISO 8601. */
  at: string;
  wordingVersion: string;
};

export type MultiPropertyAttestations = Partial<Record<MultiPropertyAttestationKind, MultiPropertyAttestationRecord>>;

/** État lu par la garde de domaine : `absent` n'est jamais assimilé à une confirmation. */
export type MultiPropertyAttestationState = "confirmed" | "declared_out_of_domain" | "absent";

export const MULTI_PROPERTY_ATTESTATION_WORDING: Readonly<Record<MultiPropertyAttestationKind, { label: string; confirm: string; decline: string }>> = {
  ssi: {
    label: "Régime LMNP pris en charge",
    confirm:
      "Je confirme que cette activité de location meublée reste dans le régime LMNP pris en charge par L'Assistant du Réel et ne relève pas d'une situation soumise aux cotisations sociales des indépendants hors du périmètre actuellement pris en charge.",
    decline: "Mon activité relève d'une situation hors de ce périmètre.",
  },
  directHolding: {
    label: "Détention directe des logements",
    confirm: "Je confirme que les logements de ce dossier sont détenus directement dans le périmètre actuellement pris en charge.",
    decline: "Mes logements ne sont pas détenus directement dans ce périmètre.",
  },
  noCommonCharges: {
    label: "Aucune charge commune",
    confirm: "Je confirme qu'aucune charge de ce dossier n'est commune à plusieurs biens : chaque charge se rattache à un seul bien.",
    decline: "Certaines charges sont communes à plusieurs biens.",
  },
};

export function resolveMultiPropertyAttestation(
  attestations: MultiPropertyAttestations | undefined,
  kind: MultiPropertyAttestationKind,
): MultiPropertyAttestationState {
  const answer = attestations?.[kind]?.answer;
  return answer === "confirmed" || answer === "declared_out_of_domain" ? answer : "absent";
}

export function resolveAllMultiPropertyAttestations(
  attestations: MultiPropertyAttestations | undefined,
): Record<MultiPropertyAttestationKind, MultiPropertyAttestationState> {
  return {
    ssi: resolveMultiPropertyAttestation(attestations, "ssi"),
    directHolding: resolveMultiPropertyAttestation(attestations, "directHolding"),
    noCommonCharges: resolveMultiPropertyAttestation(attestations, "noCommonCharges"),
  };
}

/** Nouvelle valeur du champ de brouillon après une réponse (les autres attestations sont conservées telles quelles). */
export function recordMultiPropertyAttestation(
  current: MultiPropertyAttestations | undefined,
  kind: MultiPropertyAttestationKind,
  answer: MultiPropertyAttestationAnswer,
  now: string,
): MultiPropertyAttestations {
  return { ...(current ?? {}), [kind]: { answer, at: now, wordingVersion: MULTI_PROPERTY_ATTESTATION_WORDING_VERSION } };
}
