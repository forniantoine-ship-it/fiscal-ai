export type AiActivitySeverity = "info" | "success" | "warning" | "blocking";

export type AiActivityImpact = "none" | "minor" | "major";

export type AiActivityType =
  | "document_no_change"
  | "document_ignored"
  | "document_enriched"
  | "conflict_detected"
  | "conflict_resolved"
  | "manual_override"
  | "recommendation"
  | "validation"
  | "risk_warning"
  | "entity_merge"
  | "analysis_failed";

export type AiActivityStep =
  | "financement"
  | "charges"
  | "amortissement"
  | "revenus"
  | "fiscalite";

export type AiActivityResolutionState = "pending" | "resolved" | "dismissed";

export interface AiActivityEvent {
  id: string;
  step: AiActivityStep;
  entityId: string;
  entityLabel: string;
  severity: AiActivitySeverity;
  impact: AiActivityImpact;
  type: AiActivityType;
  title: string;
  description: string;
  relatedDocumentIds?: string[];
  createdAt: string;
  resolvedAt?: string;
  resolutionState?: AiActivityResolutionState;
  metadata?: {
    previousValues?: Record<string, unknown>;
    nextValues?: Record<string, unknown>;
    conflictingFields?: string[];
    /** One-line business summary shown inline in the card, e.g. "Intérêts 2025 mis à jour : 1 387 €" */
    businessSummary?: string;
  };
}
