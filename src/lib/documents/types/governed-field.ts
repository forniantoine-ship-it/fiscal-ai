import type { FiscalTunnel } from "../tunnel-field-ownership";
import type { CanonicalFieldKey } from "../tunnel-field-ownership";

/** How a governed field value was produced. */
export type GovernedFieldExtractedBy = "gpt" | "regex" | "derived" | "manual" | "user";

/**
 * Metadata attached to every stored extracted field.
 * Single source of truth for ownership, provenance, and overwrite policy.
 */
export type GovernedFieldMetadata = {
  value: unknown;
  sourceTunnel: FiscalTunnel;
  /** Document id or pipeline document type */
  sourceDocument: string;
  extractedBy: GovernedFieldExtractedBy;
  ownershipTunnel: FiscalTunnel;
  manuallyValidated: boolean;
  updatedAt: string;
  /** True when sourceTunnel !== ownershipTunnel */
  crossTunnelInferred: boolean;
};

export type GovernedFieldStore = Partial<Record<CanonicalFieldKey, GovernedFieldMetadata>>;

export type FieldWriteDecision =
  | "apply_empty"
  | "apply_overwrite_cross_tunnel"
  | "apply_authoritative"
  | "blocked_user_validated"
  | "skip_lower_priority";

export type GovernedFieldPriorityTier = 1 | 2 | 3 | 4;
