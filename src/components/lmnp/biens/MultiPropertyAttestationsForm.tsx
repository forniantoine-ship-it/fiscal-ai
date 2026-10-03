"use client";

import {
  MULTI_PROPERTY_ATTESTATION_KINDS,
  MULTI_PROPERTY_ATTESTATION_WORDING,
  resolveAllMultiPropertyAttestations,
  type MultiPropertyAttestationAnswer,
  type MultiPropertyAttestationKind,
  type MultiPropertyAttestations,
} from "@/lib/lmnp/dossier/multi-property-attestations";

/**
 * MB-MULTI-UX-1 — attestations d'activité, une question par fait (jamais un booléen unique). Présentation pure : la réponse est
 * transmise telle quelle (`onAnswer`), le dépôt (horodatage, version du libellé) est fait par `recordMultiPropertyAttestation`.
 */
export function MultiPropertyAttestationsForm({
  attestations,
  onAnswer,
}: {
  attestations: MultiPropertyAttestations | undefined;
  onAnswer: (kind: MultiPropertyAttestationKind, answer: MultiPropertyAttestationAnswer) => void;
}) {
  const states = resolveAllMultiPropertyAttestations(attestations);
  return (
    <section aria-label="Attestations de l'activité" className="flex flex-col gap-4 rounded-lg border p-4">
      <h2 className="text-base font-medium">Vérifications sur votre activité</h2>
      <p className="text-sm text-ink-muted">Ces réponses sont enregistrées avec leur date. Elles ne constituent pas un conseil fiscal.</p>
      {MULTI_PROPERTY_ATTESTATION_KINDS.map((kind) => {
        const wording = MULTI_PROPERTY_ATTESTATION_WORDING[kind];
        const state = states[kind];
        return (
          <fieldset key={kind} className="flex flex-col gap-2" data-attestation={kind} data-state={state}>
            <legend className="text-sm font-medium">{wording.label}</legend>
            <label className="flex items-start gap-2 text-sm">
              <input type="radio" name={`attestation-${kind}`} checked={state === "confirmed"} onChange={() => onAnswer(kind, "confirmed")} />
              <span>{wording.confirm}</span>
            </label>
            <label className="flex items-start gap-2 text-sm">
              <input type="radio" name={`attestation-${kind}`} checked={state === "declared_out_of_domain"} onChange={() => onAnswer(kind, "declared_out_of_domain")} />
              <span>{wording.decline}</span>
            </label>
            {state === "absent" ? <p className="text-xs text-ink-muted">Réponse attendue.</p> : null}
          </fieldset>
        );
      })}
    </section>
  );
}
