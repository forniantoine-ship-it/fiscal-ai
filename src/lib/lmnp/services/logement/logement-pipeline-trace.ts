/**
 * Mandatory end-to-end runtime checkpoints for the logement semantic extraction pipeline.
 * TRACE ONLY — no extraction or hydration logic.
 *
 * Filter browser/server console with: [logement-debug]
 */

export type LogementPipelineDebugStage =
  | "corpus_resolved"
  | "intent_resolved"
  | "gpt_request"
  | "gpt_raw_response"
  | "canonical_normalization"
  | "hydration_mapping"
  | "prefill_state_update";

export function logLogementPipelineDebug(
  stage: LogementPipelineDebugStage,
  payload: Record<string, unknown>,
): void {
  console.log("[logement-debug]", { stage, timestamp: new Date().toISOString(), ...payload });
}

/** Serialize full payloads — avoids console depth truncation on nested GPT JSON. */
export function serializeLogementDebugPayload(value: unknown): string {
  try {
    return JSON.stringify(value, (_key, v) => (typeof v === "bigint" ? v.toString() : v));
  } catch {
    return String(value);
  }
}

export function logLogementPipelineDebugFull(
  stage: LogementPipelineDebugStage,
  payload: Record<string, unknown>,
): void {
  const serialized = Object.fromEntries(
    Object.entries(payload).map(([key, value]) => {
      if (
        key === "rawGptResponse" ||
        key === "rawGptJson" ||
        key === "fullPayload" ||
        key === "canonicalFieldsBeforeNormalization"
      ) {
        return [key, serializeLogementDebugPayload(value)];
      }
      return [key, value];
    }),
  );
  console.log("[logement-debug]", { stage, timestamp: new Date().toISOString(), ...serialized });
}

export function extractCanonicalFieldsBeforeNormalization(raw: unknown): Record<string, unknown> {
  if (!raw || typeof raw !== "object") return {};
  const source = raw as Record<string, unknown>;
  if (source.canonicalFields && typeof source.canonicalFields === "object") {
    return { ...(source.canonicalFields as Record<string, unknown>) };
  }
  return { ...source };
}

export function computeDroppedCanonicalFields(params: {
  before: Record<string, unknown>;
  after: Record<string, unknown>;
  intent: string;
}): Array<{ key: string; rawValue: unknown; canonicalKey: string; reason: string }> {
  const dropped: Array<{ key: string; rawValue: unknown; canonicalKey: string; reason: string }> =
    [];

  for (const [key, value] of Object.entries(params.before)) {
    if (key === "documentIntent" || key === "rawDocumentTerms") continue;
    if (value == null) continue;

    const canonicalKey = key;
    const normalizedValue = params.after[canonicalKey];
    if (normalizedValue !== undefined) continue;

    let reason = "normalization_returned_undefined";
    if (value === null) reason = "gpt_returned_null";
    else if (typeof value === "string" && !value.trim()) reason = "empty_string";
    else if (Array.isArray(value) && value.length === 0) reason = "empty_array";

    dropped.push({ key, rawValue: value, canonicalKey, reason });
  }

  return dropped;
}

export function countEmptyLogementFormFields(
  values: Record<string, unknown>,
): { emptyFieldCount: number; fieldStates: Record<string, boolean> } {
  const fieldStates: Record<string, boolean> = {};
  let emptyFieldCount = 0;

  for (const [key, value] of Object.entries(values)) {
    const isEmpty = value == null || (typeof value === "string" && !value.trim());
    fieldStates[key] = isEmpty;
    if (isEmpty) emptyFieldCount += 1;
  }

  return { emptyFieldCount, fieldStates };
}
