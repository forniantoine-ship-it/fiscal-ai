import type { ActiviteFieldKey, ActiviteFormValues } from "@/components/lmnp/activite/ActiviteProfileFields";
import {
  ACTIVITE_GPT_PREFILLABLE_FIELDS,
  extractedInpiFieldProvenance,
  missingInpiFieldProvenance,
  proposedDerivedSirenProvenance,
  proposedEstablishmentAddressProvenance,
  proposedFiscalAiFieldProvenance,
  rejectedGptFieldProvenance,
  type ActiviteFieldProvenance,
  type ActiviteFieldProvenanceMap,
} from "@/lib/lmnp/services/activite-field-provenance";

import { resolveFactForType, findFactsByType } from "./activite-gpt-to-facts";
import {
  hasExplicitEstablishmentAddressEvidence,
} from "./activite-address-semantics";
import type { DocumentFact, FactStatus } from "./document-fact";
import type { FactExtractionResult } from "./fact-extraction-result";
import {
  ACTIVITE_DOCUMENT_ONLY_FACT_TYPES,
  ACTIVITE_FORM_FIELD_KEYS,
  ACTIVITE_SCALAR_PROJECTION_RULES,
  type ActiviteProjectionCategory,
} from "./activite-fact-projection-map";
import type { FactType } from "./fact-type-registry";
import { parseAddressComponents } from "./derivation/rules/address-parse";

export type ActiviteProjectionFactRef = {
  factId: string;
  factType: FactType;
  entityId?: string;
  status: FactStatus;
  value?: string;
};

export type ActiviteFormFieldProjection = {
  fieldKey: ActiviteFieldKey;
  value?: string;
  provenance: ActiviteFieldProvenance;
  sourceFacts: ActiviteProjectionFactRef[];
  category: "form_field";
};

export type ActiviteProposedConfirmation = {
  fieldKey?: ActiviteFieldKey;
  fact: ActiviteProjectionFactRef;
};

export type ActiviteFactProjection = {
  formValues: ActiviteFormValues;
  fieldProvenance: ActiviteFieldProvenanceMap;
  formFieldProjections: ActiviteFormFieldProjection[];
  relevantNotDisplayed: ActiviteProjectionFactRef[];
  documentOnly: ActiviteProjectionFactRef[];
  missingUserInput: ActiviteFieldKey[];
  proposedConfirmation: ActiviteProposedConfirmation[];
  acceptedFieldKeys: ActiviteFieldKey[];
  rejectedFieldKeys: ActiviteFieldKey[];
  proposedFieldKeys: ActiviteFieldKey[];
};

function toFactRef(fact: DocumentFact): ActiviteProjectionFactRef {
  return {
    factId: fact.id,
    factType: fact.type,
    entityId: fact.entityId,
    status: fact.status,
    value: fact.value,
  };
}

function isPrincipalEstablishmentType(value: string | undefined): boolean {
  return Boolean(value?.trim() && /principal/i.test(value) && !/secondaire|fermé|ferme/i.test(value));
}

export function isActiveEstablishmentStatus(value: string | undefined): boolean {
  return Boolean(value?.trim() && /^actif$/i.test(value.trim()));
}

function findDerivedAddressFact(
  facts: readonly DocumentFact[],
  sourceFactId: string,
  type: FactType,
): DocumentFact | undefined {
  return facts.find(
    (fact) =>
      fact.type === type &&
      fact.derivationRule === "address_parse" &&
      fact.derivedFrom?.includes(sourceFactId),
  );
}

function findPrimaryActiveEstablishmentAddress(
  facts: readonly DocumentFact[],
): DocumentFact | undefined {
  for (const address of findFactsByType(facts, "address.establishment")) {
    if (!address.entityId) continue;
    const typeFact = resolveFactForType(facts, "establishment.type", {
      entityId: address.entityId,
    });
    const statusFact = resolveFactForType(facts, "establishment.status", {
      entityId: address.entityId,
    });
    if (
      isPrincipalEstablishmentType(typeFact?.value) &&
      isActiveEstablishmentStatus(statusFact?.value)
    ) {
      return address;
    }
  }
  return undefined;
}

function findExplicitUnscopedEstablishmentAddress(
  facts: readonly DocumentFact[],
): DocumentFact | undefined {
  for (const address of findFactsByType(facts, "address.establishment")) {
    if (address.entityId) continue;
    if (!address.value?.trim()) continue;
    if (address.status !== "extracted" && address.status !== "proposed") continue;
    if (!hasExplicitEstablishmentAddressEvidence(address)) continue;
    return address;
  }
  return undefined;
}

function resolveEstablishmentAddressFact(facts: readonly DocumentFact[]): DocumentFact | undefined {
  return findPrimaryActiveEstablishmentAddress(facts) ?? findExplicitUnscopedEstablishmentAddress(facts);
}

function resolveExtractedPersonalAddressFact(
  facts: readonly DocumentFact[],
): DocumentFact | undefined {
  const fact = resolveFactForType(facts, "address.personal", { unscopedOnly: true });
  if (fact?.status !== "extracted" || !fact.value?.trim() || !fact.evidence?.snippet?.trim()) {
    return undefined;
  }
  return fact;
}

function resolveAddressComponents(
  facts: readonly DocumentFact[],
  sourceAddress: DocumentFact,
): {
  address?: string;
  city?: string;
  postalCode?: string;
  sourceFacts: DocumentFact[];
} {
  const line = findDerivedAddressFact(facts, sourceAddress.id, "address.line");
  const postalCode = findDerivedAddressFact(facts, sourceAddress.id, "address.postal_code");
  const city = findDerivedAddressFact(facts, sourceAddress.id, "address.city");

  const sourceFacts = [sourceAddress, line, postalCode, city].filter(
    (entry): entry is DocumentFact => Boolean(entry),
  );

  if (line || postalCode || city) {
    return {
      address: line?.value,
      city: city?.value,
      postalCode: postalCode?.value,
      sourceFacts,
    };
  }

  const parsed = parseAddressComponents(sourceAddress.value ?? "");
  return {
    address: parsed.line ?? sourceAddress.value,
    city: parsed.city,
    postalCode: parsed.postalCode,
    sourceFacts: [sourceAddress],
  };
}

export function buildPrincipalEstablishmentEvidence(
  facts: readonly DocumentFact[],
  establishmentAddress: DocumentFact,
): string {
  if (!establishmentAddress.entityId) {
    return establishmentAddress.evidence?.snippet?.trim() ?? establishmentAddress.value?.trim() ?? "";
  }

  const entityId = establishmentAddress.entityId;
  const typeFact = resolveFactForType(facts, "establishment.type", { entityId });
  const statusFact = resolveFactForType(facts, "establishment.status", { entityId });
  const siretFact = resolveFactForType(facts, "registry.siret", { entityId });

  const parts = [
    establishmentAddress.value?.trim(),
    typeFact?.value ? `Type ${typeFact.value}` : undefined,
    statusFact?.value ? `Statut ${statusFact.value}` : undefined,
    siretFact?.value ? `SIRET ${siretFact.value}` : `SIRET ${entityId}`,
  ].filter(Boolean);

  return parts.join(" · ");
}

function proposedEstablishmentFieldProvenance(
  facts: readonly DocumentFact[],
  establishmentAddress: DocumentFact,
): ActiviteFieldProvenance {
  return proposedEstablishmentAddressProvenance({
    evidence: buildPrincipalEstablishmentEvidence(facts, establishmentAddress),
  });
}

function provenanceFromFact(fact: DocumentFact, fieldKey: ActiviteFieldKey): ActiviteFieldProvenance {
  if (fact.status === "extracted" && fact.value) {
    return extractedInpiFieldProvenance({ evidence: fact.evidence?.snippet });
  }

  if (fact.status === "proposed" && fact.value) {
    if (fieldKey === "siren") {
      return proposedDerivedSirenProvenance({ evidence: fact.evidence?.snippet });
    }
    return proposedFiscalAiFieldProvenance({ evidence: fact.evidence?.snippet });
  }

  if (fact.rejectedValue) {
    return rejectedGptFieldProvenance(fact.rejectedValue);
  }

  return missingInpiFieldProvenance();
}

function resolveScalarField(
  facts: readonly DocumentFact[],
  type: FactType,
): { fact?: DocumentFact; value?: string } {
  const fact = resolveFactForType(facts, type, { unscopedOnly: true });
  if (!fact) return {};

  if ((fact.status === "extracted" || fact.status === "proposed") && fact.value) {
    return { fact, value: fact.value };
  }

  return { fact };
}

function resolveEstablishmentComponents(
  facts: readonly DocumentFact[],
  establishmentAddress: DocumentFact,
): {
  address?: string;
  city?: string;
  postalCode?: string;
  sourceFacts: DocumentFact[];
} {
  return resolveAddressComponents(facts, establishmentAddress);
}

function pushFormFieldProjection(
  projection: ActiviteFactProjection,
  input: {
    fieldKey: ActiviteFieldKey;
    value?: string;
    provenance: ActiviteFieldProvenance;
    sourceFacts: DocumentFact[];
  },
): void {
  projection.formFieldProjections.push({
    fieldKey: input.fieldKey,
    value: input.value,
    provenance: input.provenance,
    sourceFacts: input.sourceFacts.map(toFactRef),
    category: "form_field",
  });

  projection.fieldProvenance[input.fieldKey] = input.provenance;

  if (input.value) {
    (projection.formValues as Record<string, string | undefined>)[input.fieldKey] = input.value;
  }

  if (input.provenance.status === "extracted") {
    projection.acceptedFieldKeys.push(input.fieldKey);
  } else if (input.provenance.status === "proposed") {
    projection.proposedFieldKeys.push(input.fieldKey);
    for (const fact of input.sourceFacts) {
      projection.proposedConfirmation.push({
        fieldKey: input.fieldKey,
        fact: toFactRef(fact),
      });
    }
  } else if (input.provenance.rejectedValue) {
    projection.rejectedFieldKeys.push(input.fieldKey);
  } else {
    projection.missingUserInput.push(input.fieldKey);
  }
}

function categorizeDocumentFacts(
  facts: readonly DocumentFact[],
  projectedFactIds: ReadonlySet<string>,
): {
  documentOnly: ActiviteProjectionFactRef[];
  relevantNotDisplayed: ActiviteProjectionFactRef[];
} {
  const documentOnlyTypes = new Set<FactType>(ACTIVITE_DOCUMENT_ONLY_FACT_TYPES);
  const documentOnly: ActiviteProjectionFactRef[] = [];
  const relevantNotDisplayed: ActiviteProjectionFactRef[] = [];

  for (const fact of facts) {
    if (projectedFactIds.has(fact.id)) continue;

    const ref = toFactRef(fact);

    if (documentOnlyTypes.has(fact.type)) {
      documentOnly.push(ref);
      continue;
    }

    if (fact.type === "address.establishment" && fact.entityId) {
      documentOnly.push(ref);
      continue;
    }

    if (fact.type === "address.establishment" && !fact.entityId && hasExplicitEstablishmentAddressEvidence(fact)) {
      relevantNotDisplayed.push(ref);
      continue;
    }

    if (
      (fact.type === "address.line" ||
        fact.type === "address.postal_code" ||
        fact.type === "address.city" ||
        fact.type === "address.country") &&
      fact.derivedFrom?.length
    ) {
      documentOnly.push(ref);
    }
  }

  return { documentOnly, relevantNotDisplayed };
}

export function projectDocumentFactsToActivite(
  extraction: FactExtractionResult,
): ActiviteFactProjection {
  const facts = extraction.facts;
  const projection: ActiviteFactProjection = {
    formValues: {},
    fieldProvenance: {},
    formFieldProjections: [],
    relevantNotDisplayed: [],
    documentOnly: [],
    missingUserInput: [],
    proposedConfirmation: [],
    acceptedFieldKeys: [],
    rejectedFieldKeys: [],
    proposedFieldKeys: [],
  };

  const projectedFactIds = new Set<string>();

  for (const rule of ACTIVITE_SCALAR_PROJECTION_RULES) {
    const type = rule.factTypes[0]!;
    const fieldKey = rule.formFields![0]!;
    const { fact, value } = resolveScalarField(facts, type);

    if (!fact) {
      projection.fieldProvenance[fieldKey] = missingInpiFieldProvenance();
      projection.missingUserInput.push(fieldKey);
      continue;
    }

    projectedFactIds.add(fact.id);

    if (value) {
      const provenance = provenanceFromFact(fact, fieldKey);
      pushFormFieldProjection(projection, {
        fieldKey,
        value: fieldKey === "siren" ? value.replace(/\D/g, "").slice(0, 9) : value,
        provenance,
        sourceFacts: [fact],
      });
      continue;
    }

    if (fact.rejectedValue) {
      projection.fieldProvenance[fieldKey] = rejectedGptFieldProvenance(fact.rejectedValue);
      projection.rejectedFieldKeys.push(fieldKey);
      continue;
    }

    projection.fieldProvenance[fieldKey] = missingInpiFieldProvenance();
    projection.missingUserInput.push(fieldKey);
  }

  const personalAddress = resolveExtractedPersonalAddressFact(facts);
  if (personalAddress) {
    projectedFactIds.add(personalAddress.id);
    const components = resolveAddressComponents(facts, personalAddress);
    for (const sourceFact of components.sourceFacts) {
      projectedFactIds.add(sourceFact.id);
    }

    const personalFields: Array<{
      fieldKey: ActiviteFieldKey;
      value?: string;
    }> = [
      { fieldKey: "personalAddress", value: components.address },
      { fieldKey: "personalCity", value: components.city },
      { fieldKey: "personalPostalCode", value: components.postalCode },
    ];

    for (const entry of personalFields) {
      if (!entry.value) {
        projection.fieldProvenance[entry.fieldKey] = missingInpiFieldProvenance();
        projection.missingUserInput.push(entry.fieldKey);
        continue;
      }

      pushFormFieldProjection(projection, {
        fieldKey: entry.fieldKey,
        value: entry.value,
        provenance: extractedInpiFieldProvenance({ evidence: personalAddress.evidence?.snippet }),
        sourceFacts: [personalAddress],
      });
    }
  } else {
    for (const fieldKey of ["personalAddress", "personalCity", "personalPostalCode"] as const) {
      projection.fieldProvenance[fieldKey] ??= missingInpiFieldProvenance();
      if (!projection.formFieldProjections.some((entry) => entry.fieldKey === fieldKey)) {
        projection.missingUserInput.push(fieldKey);
      }
    }
  }

  const establishmentAddress = resolveEstablishmentAddressFact(facts);
  if (establishmentAddress?.value) {
    projectedFactIds.add(establishmentAddress.id);
    const components = resolveEstablishmentComponents(facts, establishmentAddress);
    for (const sourceFact of components.sourceFacts) {
      projectedFactIds.add(sourceFact.id);
    }

    const establishmentProvenance = proposedEstablishmentFieldProvenance(facts, establishmentAddress);
    const establishmentFields: Array<{
      fieldKey: ActiviteFieldKey;
      value?: string;
    }> = [
      { fieldKey: "establishmentAddress", value: components.address },
      { fieldKey: "establishmentCity", value: components.city },
      { fieldKey: "establishmentPostalCode", value: components.postalCode },
    ];

    for (const entry of establishmentFields) {
      if (!entry.value) {
        projection.fieldProvenance[entry.fieldKey] = missingInpiFieldProvenance();
        projection.missingUserInput.push(entry.fieldKey);
        continue;
      }

      pushFormFieldProjection(projection, {
        fieldKey: entry.fieldKey,
        value: entry.value,
        provenance: establishmentProvenance,
        sourceFacts: [establishmentAddress],
      });
    }
  } else {
    for (const fieldKey of [
      "establishmentAddress",
      "establishmentCity",
      "establishmentPostalCode",
    ] as const) {
      projection.fieldProvenance[fieldKey] = missingInpiFieldProvenance();
      projection.missingUserInput.push(fieldKey);
    }
  }

  for (const fact of findFactsByType(facts, "address.headquarters")) {
    projectedFactIds.add(fact.id);
    projection.documentOnly.push(toFactRef(fact));
    for (const derived of facts) {
      if (derived.derivedFrom?.includes(fact.id)) {
        projectedFactIds.add(derived.id);
      }
    }
  }

  for (const key of ACTIVITE_GPT_PREFILLABLE_FIELDS) {
    projection.fieldProvenance[key] ??= missingInpiFieldProvenance();
  }

  const categorized = categorizeDocumentFacts(facts, projectedFactIds);
  projection.documentOnly.push(...categorized.documentOnly);
  projection.relevantNotDisplayed.push(...categorized.relevantNotDisplayed);

  projection.missingUserInput = [...new Set(projection.missingUserInput)];
  projection.acceptedFieldKeys = [...new Set(projection.acceptedFieldKeys)];
  projection.rejectedFieldKeys = [...new Set(projection.rejectedFieldKeys)];
  projection.proposedFieldKeys = [...new Set(projection.proposedFieldKeys)];

  return projection;
}

export function projectionCategoryForFactType(type: FactType): ActiviteProjectionCategory {
  if (
    ACTIVITE_SCALAR_PROJECTION_RULES.some((rule) =>
      (rule.factTypes as readonly FactType[]).includes(type),
    )
  ) {
    return "form_field";
  }
  if (type === "address.establishment" || type === "address.personal") return "form_field";
  if ((ACTIVITE_DOCUMENT_ONLY_FACT_TYPES as readonly FactType[]).includes(type)) {
    return "document_only";
  }
  return "relevant_not_displayed";
}

export { ACTIVITE_FORM_FIELD_KEYS };
