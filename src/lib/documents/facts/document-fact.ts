import type { ConfidenceScore } from "@/lib/documents/types/confidence-score";
import type { FieldSource } from "@/runtime/contracts/FieldSource";

import type { FactType } from "./fact-type-registry";

export const DOCUMENT_FACT_SCHEMA_VERSION = "1.0.0";

export type FactStatus = "extracted" | "proposed" | "missing";

export type FactOrigin = "document" | "deduction" | "user" | "product" | "merge" | "gpt";

export type FactScope = "company" | "establishment";

export type FactEvidence = {
  snippet: string;
  page?: number;
};

export type DocumentFact = {
  id: string;
  type: FactType;
  value?: string;
  normalizedValue?: string;
  status: FactStatus;
  origin: FactOrigin;
  fieldSource?: FieldSource;
  documentId: string;
  /** Stable key for multi-occurrence facts (e.g. SIRET). */
  entityId?: string;
  scope?: FactScope;
  evidence?: FactEvidence;
  confidence?: ConfidenceScore;
  derivedFrom?: string[];
  derivationRule?: string;
  requiresConfirmation: boolean;
  rejectedValue?: string;
  /** When a lower-trust fact conflicts with an extracted deterministic fact. */
  conflictWith?: string[];
  extractorId?: string;
  observedAt: string;
  schemaVersion: string;
};

export type CreateDocumentFactInput = {
  id?: string;
  type: FactType;
  documentId: string;
  value?: string;
  normalizedValue?: string;
  status: FactStatus;
  origin: FactOrigin;
  fieldSource?: FieldSource;
  entityId?: string;
  scope?: FactScope;
  evidence?: FactEvidence;
  confidence?: ConfidenceScore;
  derivedFrom?: string[];
  derivationRule?: string;
  requiresConfirmation?: boolean;
  rejectedValue?: string;
  conflictWith?: string[];
  extractorId?: string;
  observedAt?: string;
  schemaVersion?: string;
};

export function createFactId(type: FactType, documentId: string, suffix?: string): string {
  const base = `${documentId}:${type}`;
  return suffix ? `${base}:${suffix}` : base;
}

export function createDocumentFact(input: CreateDocumentFactInput): DocumentFact {
  return {
    id: input.id ?? createFactId(input.type, input.documentId),
    type: input.type,
    value: input.value,
    normalizedValue: input.normalizedValue,
    status: input.status,
    origin: input.origin,
    fieldSource: input.fieldSource,
    documentId: input.documentId,
    entityId: input.entityId,
    scope: input.scope,
    evidence: input.evidence,
    confidence: input.confidence,
    derivedFrom: input.derivedFrom,
    derivationRule: input.derivationRule,
    requiresConfirmation: input.requiresConfirmation ?? input.status === "proposed",
    rejectedValue: input.rejectedValue,
    conflictWith: input.conflictWith,
    extractorId: input.extractorId,
    observedAt: input.observedAt ?? new Date().toISOString(),
    schemaVersion: input.schemaVersion ?? DOCUMENT_FACT_SCHEMA_VERSION,
  };
}

export function missingDocumentFact(
  type: FactType,
  documentId: string,
  options?: { rejectedValue?: string; origin?: FactOrigin },
): DocumentFact {
  return createDocumentFact({
    type,
    documentId,
    status: "missing",
    origin: options?.origin ?? "document",
    rejectedValue: options?.rejectedValue,
    requiresConfirmation: false,
  });
}
