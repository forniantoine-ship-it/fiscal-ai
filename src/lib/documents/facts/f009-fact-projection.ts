import {
  extractedInpiFieldProvenance,
  missingInpiFieldProvenance,
  type ActiviteFieldProvenance,
} from "@/lib/lmnp/services/activite-field-provenance";

import { resolveFactForType, findFactsByType } from "./activite-gpt-to-facts";
import { isActiveEstablishmentStatus, projectDocumentFactsToActivite } from "./activite-fact-projection";
import type { DocumentFact } from "./document-fact";
import type { FactExtractionResult } from "./fact-extraction-result";

/**
 * F009 (Activité assistant) fact projection.
 *
 * `registry.siret`, `registry.activity_start_date` and `registry.immatriculation_date`
 * are extracted by the existing deterministic INPI/RNE extractor but are classified
 * `document_only` by the Tunnel A projection (activite-fact-projection.ts) — never
 * shown to the user there. This module reads the SAME already-produced facts and
 * projects them for F009's own field set instead. It does not extract, OCR, or
 * ground anything new — see F009 spec §10 "Convergence Tunnel A → Tunnel B".
 *
 * The 6 profile fields (nom/prénom/email/téléphone/adresses) are NOT re-derived from
 * facts here — they are pulled straight from `projectDocumentFactsToActivite`
 * (Tunnel A's own projection), reusing its extraction pairing and its provenance
 * verbatim. This module only adds the two fields Tunnel A deliberately never
 * projects (SIRET, date de début d'activité) and formats the two addresses as a
 * single display line for F009's simpler one-field-per-address review model.
 */

export type F009SiretCandidate = {
  siret: string;
  entityId: string;
  establishmentType?: string;
  evidence?: string;
};

export type F009DocumentProjection = {
  /** Resolved SIRET, set only when exactly one active establishment is found. */
  siret?: string;
  siretProvenance: ActiviteFieldProvenance;
  siretAmbiguous: boolean;
  siretCandidates: F009SiretCandidate[];

  /** Resolved date de début d'activité (ISO yyyy-mm-dd), undefined if absent or ambiguous. */
  activityStartDate?: string;
  activityStartDateProvenance: ActiviteFieldProvenance;
  /** registry.activity_start_date, normalized, present even when ambiguous (for the chooser UI). */
  activityStartDateRaw?: string;
  /** registry.immatriculation_date, normalized — cross-check signal, never a separate confirmable field. */
  immatriculationDateRaw?: string;
  datesAmbiguous: boolean;

  // --- Profile fields, reused verbatim from Tunnel A's own projection ---
  lastName?: string;
  lastNameProvenance: ActiviteFieldProvenance;
  firstName?: string;
  firstNameProvenance: ActiviteFieldProvenance;
  email?: string;
  emailProvenance: ActiviteFieldProvenance;
  telephone?: string;
  telephoneProvenance: ActiviteFieldProvenance;
  /** Single display line combining address + postal code + city (spec: "adresse personnelle", one field). */
  personalAddress?: string;
  personalAddressProvenance: ActiviteFieldProvenance;
  /** City/postal code carried alongside for `declarationDraft`, not independently confirmable in F009. */
  personalAddressCity?: string;
  personalAddressPostalCode?: string;
  establishmentAddress?: string;
  establishmentAddressProvenance: ActiviteFieldProvenance;
  establishmentAddressCity?: string;
  establishmentAddressPostalCode?: string;
};

/** Combines address line + postal code + city into one display/edit string. */
/** Combines address line + postal code + city into one display/edit string. Exported so the
 * manual profile form (F009ActiviteAssistantPanel) can build the same canonical shape as the
 * document path, instead of a parallel address representation. */
export function formatAddressLine(address?: string, postalCode?: string, city?: string): string | undefined {
  const cityLine = [postalCode, city].filter((part) => part?.trim()).join(" ");
  const parts = [address, cityLine].filter((part) => part && part.trim());
  return parts.length > 0 ? parts.join(", ") : undefined;
}

/**
 * Reverses `formatAddressLine` given the already-known city/postal code, so a
 * previously-combined address can be re-split into its editable line when the
 * manual profile form is reopened (GO_BACK, or resumed on a fresh mount).
 * Deterministic because the join format is authored by this same module — not a
 * free-text parse.
 */
export function extractAddressLine(combined?: string, postalCode?: string, city?: string): string {
  if (!combined) return "";
  const suffix = [postalCode, city].filter((part) => part?.trim()).join(" ");
  const marker = suffix ? `, ${suffix}` : "";
  if (marker && combined.endsWith(marker)) {
    return combined.slice(0, -marker.length);
  }
  return combined;
}

/** INPI/RNE dates are always emitted as DD/MM/YYYY by the deterministic extractor. */
function normalizeFrenchDateToIso(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  const match = raw.trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!match) return undefined;
  const [, day, month, year] = match;
  return `${year}-${month}-${day}`;
}

function findActiveSiretCandidates(facts: readonly DocumentFact[]): F009SiretCandidate[] {
  const candidates: F009SiretCandidate[] = [];

  for (const siretFact of findFactsByType(facts, "registry.siret")) {
    if (!siretFact.entityId || !siretFact.value) continue;

    const statusFact = resolveFactForType(facts, "establishment.status", {
      entityId: siretFact.entityId,
    });
    if (!isActiveEstablishmentStatus(statusFact?.value)) continue;

    const typeFact = resolveFactForType(facts, "establishment.type", {
      entityId: siretFact.entityId,
    });

    candidates.push({
      siret: siretFact.value,
      entityId: siretFact.entityId,
      establishmentType: typeFact?.value,
      evidence: siretFact.evidence?.snippet,
    });
  }

  return candidates;
}

function projectSiret(facts: readonly DocumentFact[]): {
  siret?: string;
  siretProvenance: ActiviteFieldProvenance;
  siretAmbiguous: boolean;
  siretCandidates: F009SiretCandidate[];
} {
  const candidates = findActiveSiretCandidates(facts);

  if (candidates.length === 1) {
    const [only] = candidates;
    return {
      siret: only.siret,
      siretProvenance: extractedInpiFieldProvenance({ evidence: only.evidence }),
      siretAmbiguous: false,
      siretCandidates: candidates,
    };
  }

  if (candidates.length > 1) {
    return {
      siretProvenance: missingInpiFieldProvenance(),
      siretAmbiguous: true,
      siretCandidates: candidates,
    };
  }

  return {
    siretProvenance: missingInpiFieldProvenance(),
    siretAmbiguous: false,
    siretCandidates: [],
  };
}

function projectActivityStartDate(facts: readonly DocumentFact[]): {
  activityStartDate?: string;
  activityStartDateProvenance: ActiviteFieldProvenance;
  activityStartDateRaw?: string;
  immatriculationDateRaw?: string;
  datesAmbiguous: boolean;
} {
  const activityStartFact = resolveFactForType(facts, "registry.activity_start_date", {
    unscopedOnly: true,
  });
  const immatriculationFact = resolveFactForType(facts, "registry.immatriculation_date", {
    unscopedOnly: true,
  });

  const activityStartDateRaw = normalizeFrenchDateToIso(activityStartFact?.value);
  const immatriculationDateRaw = normalizeFrenchDateToIso(immatriculationFact?.value);

  if (!activityStartDateRaw) {
    return {
      activityStartDateProvenance: missingInpiFieldProvenance(),
      activityStartDateRaw,
      immatriculationDateRaw,
      datesAmbiguous: false,
    };
  }

  const datesAmbiguous = Boolean(
    immatriculationDateRaw && immatriculationDateRaw !== activityStartDateRaw,
  );

  if (datesAmbiguous) {
    return {
      activityStartDateProvenance: missingInpiFieldProvenance(),
      activityStartDateRaw,
      immatriculationDateRaw,
      datesAmbiguous: true,
    };
  }

  return {
    activityStartDate: activityStartDateRaw,
    activityStartDateProvenance: extractedInpiFieldProvenance({
      evidence: activityStartFact?.evidence?.snippet,
    }),
    activityStartDateRaw,
    immatriculationDateRaw,
    datesAmbiguous: false,
  };
}

export function projectDocumentFactsToF009(
  extraction: FactExtractionResult,
): F009DocumentProjection {
  const facts = extraction.facts;
  const siret = projectSiret(facts);
  const dates = projectActivityStartDate(facts);

  // Reuses Tunnel A's own projection — same facts, same pairing rules, same
  // provenance — rather than re-deriving these 6 fields from raw facts here.
  const { formValues, fieldProvenance } = projectDocumentFactsToActivite(extraction);

  return {
    ...siret,
    ...dates,
    lastName: formValues.lastName,
    lastNameProvenance: fieldProvenance.lastName ?? missingInpiFieldProvenance(),
    firstName: formValues.firstName,
    firstNameProvenance: fieldProvenance.firstName ?? missingInpiFieldProvenance(),
    email: formValues.email,
    emailProvenance: fieldProvenance.email ?? missingInpiFieldProvenance(),
    telephone: formValues.telephone,
    telephoneProvenance: fieldProvenance.telephone ?? missingInpiFieldProvenance(),
    personalAddress: formatAddressLine(
      formValues.personalAddress,
      formValues.personalPostalCode,
      formValues.personalCity,
    ),
    personalAddressProvenance: fieldProvenance.personalAddress ?? missingInpiFieldProvenance(),
    personalAddressCity: formValues.personalCity,
    personalAddressPostalCode: formValues.personalPostalCode,
    establishmentAddress: formatAddressLine(
      formValues.establishmentAddress,
      formValues.establishmentPostalCode,
      formValues.establishmentCity,
    ),
    establishmentAddressProvenance: fieldProvenance.establishmentAddress ?? missingInpiFieldProvenance(),
    establishmentAddressCity: formValues.establishmentCity,
    establishmentAddressPostalCode: formValues.establishmentPostalCode,
  };
}
