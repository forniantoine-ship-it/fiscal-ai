import type {
  FieldWriteDecision,
  GovernedFieldExtractedBy,
  GovernedFieldMetadata,
  GovernedFieldPriorityTier,
  GovernedFieldStore,
} from "./types/governed-field";
import {
  canonicalFieldKey,
  getFieldOwner,
  type CanonicalFieldKey,
  type FiscalTunnel,
} from "./tunnel-field-ownership";

export type IngestExtractionParams = {
  store: GovernedFieldStore;
  sourceTunnel: FiscalTunnel;
  sourceDocument: string;
  extractedBy: GovernedFieldExtractedBy;
  payload: Record<string, unknown>;
  now?: string;
};

export type IngestExtractionResult = {
  store: GovernedFieldStore;
  applied: CanonicalFieldKey[];
  skipped: Array<{ field: CanonicalFieldKey; decision: FieldWriteDecision }>;
};

function nowIso(): string {
  return new Date().toISOString();
}

function isEmptyValue(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value === "string") return !value.trim();
  return false;
}

export { isEmptyValue };

/** Priority: 1 = manual, 2 = authoritative, 3 = cross-tunnel, 4 = raw GPT same-tunnel. */
export function getFieldPriorityTier(meta: GovernedFieldMetadata): GovernedFieldPriorityTier {
  if (meta.manuallyValidated) return 1;
  if (!meta.crossTunnelInferred) return 2;
  if (meta.crossTunnelInferred) return 3;
  return 4;
}

function isAuthoritative(meta: GovernedFieldMetadata): boolean {
  return !meta.crossTunnelInferred && meta.sourceTunnel === meta.ownershipTunnel;
}

function buildIncomingMetadata(params: {
  field: CanonicalFieldKey;
  value: unknown;
  sourceTunnel: FiscalTunnel;
  sourceDocument: string;
  extractedBy: GovernedFieldExtractedBy;
  now: string;
}): GovernedFieldMetadata {
  const ownershipTunnel = getFieldOwner(params.field)!;
  const crossTunnelInferred = params.sourceTunnel !== ownershipTunnel;

  console.log("[field-ownership]", {
    field: params.field,
    sourceTunnel: params.sourceTunnel,
    ownershipTunnel,
    crossTunnelInferred,
  });

  return {
    value: params.value,
    sourceTunnel: params.sourceTunnel,
    sourceDocument: params.sourceDocument,
    extractedBy: params.extractedBy,
    ownershipTunnel,
    manuallyValidated: false,
    updatedAt: params.now,
    crossTunnelInferred,
  };
}

/**
 * Resolves whether an incoming extraction may update the governed store.
 * Implements Rules A (empty prefill), B (authoritative overwrite), C (user lock).
 */
export function resolveFieldWriteDecision(
  field: CanonicalFieldKey,
  existing: GovernedFieldMetadata | undefined,
  incoming: GovernedFieldMetadata,
): FieldWriteDecision {
  if (existing?.manuallyValidated) {
    console.log("[user-validated-lock]", {
      field,
      sourceTunnel: incoming.sourceTunnel,
    });
    return "blocked_user_validated";
  }

  if (!existing) {
    return incoming.crossTunnelInferred ? "apply_empty" : "apply_authoritative";
  }

  if (isAuthoritative(incoming) && existing.crossTunnelInferred) {
    console.log("[field-overwrite]", {
      field,
      previousSource: existing.sourceTunnel,
      newSource: incoming.sourceTunnel,
      reason: "authoritative_over_cross_tunnel",
    });
    return "apply_overwrite_cross_tunnel";
  }

  if (isAuthoritative(incoming) && !existing.manuallyValidated) {
    const existingTier = getFieldPriorityTier(existing);
    const incomingTier = getFieldPriorityTier(incoming);
    if (incomingTier <= existingTier) {
      console.log("[field-overwrite]", {
        field,
        previousSource: existing.sourceTunnel,
        newSource: incoming.sourceTunnel,
        reason: "authoritative_replacement",
      });
      return "apply_authoritative";
    }
  }

  if (incoming.crossTunnelInferred && isEmptyValue(existing.value)) {
    console.log("[cross-tunnel-prefill]", {
      field: incoming.ownershipTunnel,
      sourceTunnel: incoming.sourceTunnel,
      ownershipTunnel: incoming.ownershipTunnel,
    });
    return "apply_empty";
  }

  return "skip_lower_priority";
}

export function shouldApplyWriteDecision(decision: FieldWriteDecision): boolean {
  return (
    decision === "apply_empty" ||
    decision === "apply_overwrite_cross_tunnel" ||
    decision === "apply_authoritative"
  );
}

/**
 * Ingests a raw extraction payload into the governed field store.
 * Unknown keys are ignored; aliases are normalized to canonical keys.
 */
export function ingestExtractionIntoStore(params: IngestExtractionParams): IngestExtractionResult {
  const now = params.now ?? nowIso();
  const store: GovernedFieldStore = { ...params.store };
  const applied: CanonicalFieldKey[] = [];
  const skipped: IngestExtractionResult["skipped"] = [];

  for (const [rawKey, rawValue] of Object.entries(params.payload)) {
    if (isEmptyValue(rawValue)) continue;

    const field = canonicalFieldKey(rawKey);
    if (!field) continue;

    const owner = getFieldOwner(field);
    if (!owner) continue;

    const incoming = buildIncomingMetadata({
      field,
      value: rawValue,
      sourceTunnel: params.sourceTunnel,
      sourceDocument: params.sourceDocument,
      extractedBy: params.extractedBy,
      now,
    });

    const existing = store[field];
    const decision = resolveFieldWriteDecision(field, existing, incoming);

    if (!shouldApplyWriteDecision(decision)) {
      skipped.push({ field, decision });
      continue;
    }

    store[field] = incoming;
    applied.push(field);

    if (decision === "apply_empty" && incoming.crossTunnelInferred) {
      console.log("[cross-tunnel-prefill]", {
        field,
        value: rawValue,
        sourceTunnel: params.sourceTunnel,
        ownershipTunnel: owner,
      });
    }
  }

  return { store, applied, skipped };
}

/** Marks a field as manually validated — blocks future automatic overwrites (Rule C). */
export function lockGovernedField(
  store: GovernedFieldStore,
  field: CanonicalFieldKey,
  value: unknown,
  now?: string,
): GovernedFieldStore {
  const existing = store[field];
  const owner = getFieldOwner(field);
  if (!owner) return store;

  const timestamp = now ?? nowIso();
  console.log("[user-validated-lock]", { field, ownershipTunnel: owner });

  return {
    ...store,
    [field]: {
      value,
      sourceTunnel: existing?.sourceTunnel ?? owner,
      sourceDocument: existing?.sourceDocument ?? "user_edit",
      extractedBy: "user",
      ownershipTunnel: owner,
      manuallyValidated: true,
      updatedAt: timestamp,
      crossTunnelInferred: existing?.crossTunnelInferred ?? false,
    },
  };
}

/** Reads governed values for a target ownership tunnel (for silent form prefill). */
export function readGovernedValuesForTunnel(
  store: GovernedFieldStore,
  ownershipTunnel: FiscalTunnel,
): Partial<Record<CanonicalFieldKey, unknown>> {
  const result: Partial<Record<CanonicalFieldKey, unknown>> = {};

  for (const [key, meta] of Object.entries(store) as [CanonicalFieldKey, GovernedFieldMetadata][]) {
    if (meta.ownershipTunnel !== ownershipTunnel) continue;
    if (isEmptyValue(meta.value)) continue;
    result[key] = meta.value;
  }

  return result;
}

/** Whether a form field may receive an automatic governed prefill. */
export function canPrefillFormField(
  store: GovernedFieldStore,
  field: CanonicalFieldKey,
  currentFormValue: unknown,
): boolean {
  const meta = store[field];
  if (meta?.manuallyValidated) return false;
  return isEmptyValue(currentFormValue);
}
