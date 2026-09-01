import type {
  AiActivityEvent,
  AiActivityStep,
  AiActivitySeverity,
  AiActivityImpact,
  AiActivityType,
} from "@/lib/lmnp/types/ai-activity";

function makeId(): string {
  return typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2);
}

function now(): string {
  return new Date().toISOString();
}

function makeEvent(
  step: AiActivityStep,
  entityId: string,
  entityLabel: string,
  type: AiActivityType,
  severity: AiActivitySeverity,
  impact: AiActivityImpact,
  title: string,
  description: string,
  options?: Partial<Pick<AiActivityEvent, "relatedDocumentIds" | "metadata" | "resolutionState">>,
): AiActivityEvent {
  return {
    id: makeId(),
    step,
    entityId,
    entityLabel,
    type,
    severity,
    impact,
    title,
    description,
    createdAt: now(),
    resolutionState: options?.resolutionState,
    relatedDocumentIds: options?.relatedDocumentIds,
    metadata: options?.metadata,
  };
}

// ─── Scenario A — Document already known (no new business data extracted) ────

/**
 * Emitted when a document is successfully processed but contains no new data.
 * Examples: duplicate loan offer, signature page, already-known amortization.
 * This event must ALWAYS be emitted — no upload may end silently.
 */
export function makeDocumentNoChangeEvent(
  step: AiActivityStep,
  entityId: string,
  entityLabel: string,
  documentId: string,
  description = "Ce document concerne un prêt déjà analysé. Aucune nouvelle donnée n'a été ajoutée au financement.",
): AiActivityEvent {
  return makeEvent(
    step,
    entityId,
    entityLabel,
    "document_no_change",
    "info",
    "none",
    "Informations déjà connues",
    description,
    { relatedDocumentIds: [documentId] },
  );
}

// ─── Scenario A (legacy) — Document ignored / unclassified ───────────────────

export function makeDocumentIgnoredEvent(
  step: AiActivityStep,
  entityId: string,
  entityLabel: string,
  documentId: string,
  description = "Ce document concerne un financement déjà analysé. Aucune nouvelle donnée n'a été ajoutée.",
): AiActivityEvent {
  return makeEvent(
    step,
    entityId,
    entityLabel,
    "document_ignored",
    "info",
    "none",
    "Informations déjà connues",
    description,
    { relatedDocumentIds: [documentId] },
  );
}

// ─── Scenario B — Document enriched ──────────────────────────────────────────

export function makeDocumentEnrichedEvent(
  step: AiActivityStep,
  entityId: string,
  entityLabel: string,
  documentId: string,
  title: string,
  description: string,
  metadata?: AiActivityEvent["metadata"],
): AiActivityEvent {
  return makeEvent(step, entityId, entityLabel, "document_enriched", "success", "major", title, description, {
    relatedDocumentIds: [documentId],
    metadata,
  });
}

// ─── Scenario C — Conflict detected ──────────────────────────────────────────

export function makeConflictDetectedEvent(
  step: AiActivityStep,
  entityId: string,
  entityLabel: string,
  documentId: string,
  conflictingFields: string[],
  previousValues: Record<string, unknown>,
  nextValues: Record<string, unknown>,
  description = "Le document importé contient des informations différentes de celles déjà enregistrées.",
): AiActivityEvent {
  return makeEvent(
    step,
    entityId,
    entityLabel,
    "conflict_detected",
    "warning",
    "major",
    "Informations différentes détectées",
    description,
    {
      relatedDocumentIds: [documentId],
      resolutionState: "pending",
      metadata: { conflictingFields, previousValues, nextValues },
    },
  );
}

// ─── Scenario D — Entity merge ────────────────────────────────────────────────

export function makeEntityMergeEvent(
  step: AiActivityStep,
  entityId: string,
  entityLabel: string,
  documentIds: string[],
  description = "L'IA a identifié que ces documents concernaient le même financement.",
): AiActivityEvent {
  return makeEvent(
    step,
    entityId,
    entityLabel,
    "entity_merge",
    "info",
    "minor",
    "Documents regroupés",
    description,
    { relatedDocumentIds: documentIds },
  );
}

// ─── Scenario E — Manual override ────────────────────────────────────────────

export function makeManualOverrideEvent(
  step: AiActivityStep,
  entityId: string,
  entityLabel: string,
  title: string,
  description: string,
  previousValues?: Record<string, unknown>,
  nextValues?: Record<string, unknown>,
): AiActivityEvent {
  return makeEvent(
    step,
    entityId,
    entityLabel,
    "manual_override",
    "info",
    "minor",
    title,
    description,
    { metadata: { previousValues, nextValues } },
  );
}

// ─── Scenario F — Validation ──────────────────────────────────────────────────

export function makeValidationEvent(
  step: AiActivityStep,
  entityId: string,
  entityLabel: string,
  description = "Les informations du financement sont cohérentes entre les différents documents importés.",
): AiActivityEvent {
  return makeEvent(
    step,
    entityId,
    entityLabel,
    "validation",
    "success",
    "none",
    "Cohérence vérifiée",
    description,
  );
}

// ─── Scenario G — Risk warning ────────────────────────────────────────────────

export function makeRiskWarningEvent(
  step: AiActivityStep,
  entityId: string,
  entityLabel: string,
  title: string,
  description: string,
  documentIds?: string[],
): AiActivityEvent {
  return makeEvent(
    step,
    entityId,
    entityLabel,
    "risk_warning",
    "warning",
    "minor",
    title,
    description,
    { relatedDocumentIds: documentIds },
  );
}

// ─── Scenario H — Analysis failed ────────────────────────────────────────────

export function makeAnalysisFailedEvent(
  step: AiActivityStep,
  entityId: string,
  entityLabel: string,
  documentId: string,
  description = "Le document importé est trop peu lisible pour être analysé correctement.",
): AiActivityEvent {
  return makeEvent(
    step,
    entityId,
    entityLabel,
    "analysis_failed",
    "warning",
    "none",
    "Analyse impossible",
    description,
    { relatedDocumentIds: [documentId] },
  );
}

// ─── Recommendation ──────────────────────────────────────────────────────────

export function makeRecommendationEvent(
  step: AiActivityStep,
  entityId: string,
  entityLabel: string,
  title: string,
  description: string,
): AiActivityEvent {
  return makeEvent(step, entityId, entityLabel, "recommendation", "info", "minor", title, description);
}
