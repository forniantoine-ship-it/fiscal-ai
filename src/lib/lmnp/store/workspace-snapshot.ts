/**
 * P0 Lot 1 — snapshot v1 serialization frontier.
 *
 * Distinct from LMNP_SCHEMA_VERSION (IndexedDB object-store version).
 * Callers must pass toPersistedWorkspace(...), never a React state object
 * (no fileRegistry / File / Blob / Map).
 */
import type { DeclarationDraft } from "../types";
import type { PersistedWorkspace } from "./persistence";

export const WORKSPACE_SNAPSHOT_SCHEMA_VERSION = 1;

export type WorkspaceSnapshotEnvelope = {
  schemaVersion: number;
  workspace: PersistedWorkspace;
};

export type SerializeFailureReason =
  | "invalid_workspace"
  | "non_finite_number"
  | "unsupported_type";

export type SerializeWorkspaceSnapshotResult =
  | { ok: true; envelope: WorkspaceSnapshotEnvelope }
  | { ok: false; reason: SerializeFailureReason; detail?: string };

export type ParseWorkspaceSnapshotResult =
  | { ok: true; envelope: WorkspaceSnapshotEnvelope }
  | { ok: false; reason: "invalid_payload" | "invalid_workspace" | "unsupported_schema_version"; schemaVersion?: number };

const FORBIDDEN_OBJECT_TAGS = new Set(["[object File]", "[object Blob]", "[object ArrayBuffer]", "[object Map]", "[object Set]"]);

export function toPersistedWorkspace(state: {
  fiscalYear: PersistedWorkspace["fiscalYear"];
  properties: PersistedWorkspace["properties"];
  documents: PersistedWorkspace["documents"];
  extractions: PersistedWorkspace["extractions"];
  validationItems: PersistedWorkspace["validationItems"];
  ledgerEntries: PersistedWorkspace["ledgerEntries"];
  declarationDraft?: DeclarationDraft;
  aiActivityFeed?: PersistedWorkspace["aiActivityFeed"];
  fileRegistry?: unknown;
}): PersistedWorkspace {
  return {
    fiscalYear: state.fiscalYear,
    properties: state.properties,
    documents: state.documents,
    extractions: state.extractions,
    validationItems: state.validationItems,
    ledgerEntries: state.ledgerEntries,
    declarationDraft: state.declarationDraft ?? { completedSteps: [] },
    aiActivityFeed: state.aiActivityFeed,
  };
}

export function isValidPersistedWorkspace(data: unknown): data is PersistedWorkspace {
  if (!data || typeof data !== "object") return false;
  const w = data as PersistedWorkspace;
  return (
    Boolean(w.fiscalYear?.id) &&
    typeof w.fiscalYear.year === "number" &&
    Array.isArray(w.properties) &&
    Array.isArray(w.documents) &&
    Array.isArray(w.extractions) &&
    Array.isArray(w.validationItems) &&
    Array.isArray(w.ledgerEntries)
  );
}

function isForbiddenValue(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value === "number" && !Number.isFinite(value)) return "non_finite_number";
  if (typeof value !== "object") return null;
  const tag = Object.prototype.toString.call(value);
  if (FORBIDDEN_OBJECT_TAGS.has(tag)) return "unsupported_type";
  return null;
}

function walkForbidden(value: unknown, path: string): { reason: SerializeFailureReason; detail: string } | null {
  const direct = isForbiddenValue(value);
  if (direct === "non_finite_number" || direct === "unsupported_type") {
    return { reason: direct, detail: path };
  }
  if (!value || typeof value !== "object") return null;
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i += 1) {
      const nested = walkForbidden(value[i], `${path}[${i}]`);
      if (nested) return nested;
    }
    return null;
  }
  for (const [key, nestedValue] of Object.entries(value as Record<string, unknown>)) {
    if (key === "fileRegistry") {
      return { reason: "unsupported_type", detail: `${path}.${key}` };
    }
    const nested = walkForbidden(nestedValue, `${path}.${key}`);
    if (nested) return nested;
  }
  return null;
}

/**
 * JSON-sanitize: reject NaN/Infinity and non-JSON types instead of letting
 * JSON.stringify coerce them to null / {}.
 */
export function serializeWorkspaceSnapshot(
  workspace: PersistedWorkspace,
): SerializeWorkspaceSnapshotResult {
  const persisted = toPersistedWorkspace(workspace);
  if (!isValidPersistedWorkspace(persisted)) {
    return { ok: false, reason: "invalid_workspace" };
  }
  const forbidden = walkForbidden(persisted, "workspace");
  if (forbidden) {
    return { ok: false, reason: forbidden.reason, detail: forbidden.detail };
  }
  try {
    const envelope: WorkspaceSnapshotEnvelope = {
      schemaVersion: WORKSPACE_SNAPSHOT_SCHEMA_VERSION,
      workspace: persisted,
    };
    const sanitized = JSON.parse(JSON.stringify(envelope)) as WorkspaceSnapshotEnvelope;
    if (!isValidPersistedWorkspace(sanitized.workspace)) {
      return { ok: false, reason: "invalid_workspace" };
    }
    return { ok: true, envelope: sanitized };
  } catch {
    return { ok: false, reason: "invalid_workspace" };
  }
}

export function parseWorkspaceSnapshot(payload: unknown): ParseWorkspaceSnapshotResult {
  if (!payload || typeof payload !== "object") {
    return { ok: false, reason: "invalid_payload" };
  }
  const raw = payload as { schemaVersion?: unknown; workspace?: unknown };
  if (typeof raw.schemaVersion !== "number" || !Number.isInteger(raw.schemaVersion)) {
    return { ok: false, reason: "invalid_payload" };
  }
  if (raw.schemaVersion > WORKSPACE_SNAPSHOT_SCHEMA_VERSION) {
    return { ok: false, reason: "unsupported_schema_version", schemaVersion: raw.schemaVersion };
  }
  if (raw.schemaVersion !== WORKSPACE_SNAPSHOT_SCHEMA_VERSION) {
    return { ok: false, reason: "invalid_payload", schemaVersion: raw.schemaVersion };
  }
  if (!isValidPersistedWorkspace(raw.workspace)) {
    return { ok: false, reason: "invalid_workspace", schemaVersion: raw.schemaVersion };
  }
  return {
    ok: true,
    envelope: {
      schemaVersion: WORKSPACE_SNAPSHOT_SCHEMA_VERSION,
      workspace: raw.workspace,
    },
  };
}
