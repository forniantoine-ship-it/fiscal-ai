/**
 * MB-MULTI-UX-1 (ADR-011 §6) — attestations d'ACTIVITÉ du multi-bien. Module PUR.
 *
 * Le modèle ne sait détecter ni une situation SSI hors périmètre, ni une détention indirecte, ni une charge commune : aucune
 * détection fiscale n'est inventée. L'utilisateur atteste séparément trois faits ; chaque réponse est persistée avec son
 * horodatage et la VERSION du libellé affiché (auditable). Aucune réponse = « non attestée » = refus (fail-closed).
 *
 *   ssi            — l'activité reste dans le LMNP pris en charge, hors situation SSI hors périmètre ;
 *   directHolding  — les logements sont détenus directement dans le périmètre pris en charge ;
 *   noCommonCharges — aucune charge n'est à répartir entre plusieurs biens (INT-5 ; auparavant : « aucune charge commune »).
 *
 * Ces libellés sont factuels : ils ne sont ni un conseil fiscal ni une qualification juridique.
 */

export type MultiPropertyAttestationKind = "ssi" | "directHolding" | "noCommonCharges";

export const MULTI_PROPERTY_ATTESTATION_KINDS: readonly MultiPropertyAttestationKind[] = ["ssi", "directHolding", "noCommonCharges"];

/** Version des libellés : à incrémenter si un libellé change (les anciennes réponses restent auditables). */
export const MULTI_PROPERTY_ATTESTATION_WORDING_VERSION = "2026-10-05.exact-1";

/** Version du libellé « aucune charge commune » antérieure à l'INT-5 (réponses anciennes : toujours auditables). */
export const LEGACY_NO_COMMON_CHARGES_WORDING_VERSION = "2026-10-03.1";

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
  // INT-5 : sémantique « aucune charge à répartir entre les biens » (une charge qui concerne l'ensemble de l'activité, comme la
  // comptabilité, n'exige aucune répartition). Une charge commune B ou non qualifiée reste hors domaine.
  noCommonCharges: {
    label: "Aucune charge à répartir entre les biens",
    confirm:
      "Je confirme qu'aucune charge de ce dossier n'est à répartir entre plusieurs biens : chaque charge se rattache à un seul bien, ou concerne l'ensemble de mon activité sans répartition (par exemple ma comptabilité).",
    decline: "Certaines charges sont à répartir entre plusieurs biens.",
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

// ---------------------------------------------------------------------------
// INT-4.1 — sémantique EXACTE (dormante) de « noCommonCharges »
// ---------------------------------------------------------------------------
//
// Ancienne idée (productive, inchangée) : aucune charge n'est commune à plusieurs biens.
// Nouvelle idée (domaine exact, futur) : aucune charge ne EXIGE UNE RÉPARTITION entre les biens. Une charge qui concerne
// l'ensemble de l'activité et qui est définitivement `ACTIVITY` (ex. la comptabilité) n'exige aucune répartition : elle est
// portée au niveau de l'activité (ADR-011 §11). Une charge commune B (ou non qualifiée) reste hors domaine.
//
// INT-5 : le libellé productif affiché est désormais celui de la sémantique exacte (même clé `noCommonCharges`, version de
// libellé distincte). `resolveMultiPropertyAttestation` lit toujours confirmed / declared_out_of_domain comme avant ; la lecture
// fine ci-dessous (ancien refus ambigu à reposer) est consommée par le domaine exact.

/** Version du libellé de la sémantique exacte ; une réponse posée sous cette version n'est jamais lue comme l'ancienne. */
export const NO_ALLOCATION_CHARGES_WORDING_VERSION = MULTI_PROPERTY_ATTESTATION_WORDING_VERSION;

export const NO_ALLOCATION_CHARGES_WORDING = MULTI_PROPERTY_ATTESTATION_WORDING.noCommonCharges;

/**
 * - `confirmed` : aucune charge exigeant une répartition (nouvelle réponse, OU ancienne confirmation « aucune charge commune »
 *   qui l'implique a fortiori) ;
 * - `declared_requires_allocation` : réponse négative posée sous le libellé exact → hors domaine ;
 * - `legacy_declared_common` : ancien « certaines charges sont communes » : ambigu (peut ne viser qu'une charge d'activité) →
 *   à reposer sous le nouveau libellé, jamais interprété ;
 * - `absent` : non attesté = refus (fail-closed).
 */
export type NoAllocationChargesState = "confirmed" | "declared_requires_allocation" | "legacy_declared_common" | "absent";

export function resolveNoAllocationChargesAttestation(attestations: MultiPropertyAttestations | undefined): NoAllocationChargesState {
  const record = attestations?.noCommonCharges;
  if (record === undefined) return "absent";
  if (record.answer === "confirmed") return "confirmed";
  if (record.answer === "declared_out_of_domain") return record.wordingVersion === NO_ALLOCATION_CHARGES_WORDING_VERSION ? "declared_requires_allocation" : "legacy_declared_common";
  return "absent";
}

/** Réponse posée sous le NOUVEAU libellé (écriture dormante : aucun appelant productif). */
export function recordNoAllocationChargesAttestation(
  current: MultiPropertyAttestations | undefined,
  answer: MultiPropertyAttestationAnswer,
  now: string,
): MultiPropertyAttestations {
  return { ...(current ?? {}), noCommonCharges: { answer, at: now, wordingVersion: NO_ALLOCATION_CHARGES_WORDING_VERSION } };
}
