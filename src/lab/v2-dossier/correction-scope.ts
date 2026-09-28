import type { RealWorkspaceLoad } from "./real-workspace";
import type { PersistedWorkspace } from "@/lib/lmnp/store/persistence";

/** Identifiers only: no business value or document data is transported in the URL. */
export type V3CorrectionScope = {
  dossierId: string;
  fiscalYearId: string;
  year: number;
  propertyId: string;
};

export type ScopeQuery =
  | { kind: "none" }
  | { kind: "invalid" }
  | { kind: "scope"; scope: V3CorrectionScope };

const OWNER_ROUTES = new Set([
  "/assistants/activite", "/assistants/logement", "/assistants/financement",
  "/assistants/revenus", "/assistants/charges", "/assistants/amortissements",
]);
const SCOPE_KEYS = ["dossierId", "fiscalYearId", "year", "propertyId"] as const;

function readScope(params: URLSearchParams, marker: string): ScopeQuery {
  if (!params.has(marker)) return { kind: "none" };
  if (params.getAll(marker).length !== 1 || params.get(marker) !== "1") return { kind: "invalid" };
  const values = SCOPE_KEYS.map(key => params.getAll(key));
  if (values.some(value => value.length !== 1 || !value[0]?.trim())) return { kind: "invalid" };
  const [dossierId, fiscalYearId, rawYear, propertyId] = values.map(value => value[0]!);
  if (!/^\d{4}$/.test(rawYear)) return { kind: "invalid" };
  return { kind: "scope", scope: { dossierId, fiscalYearId, year: Number(rawYear), propertyId } };
}

export function readV3CorrectionQuery(pathname: string, params: URLSearchParams): ScopeQuery {
  if (!OWNER_ROUTES.has(pathname)) return { kind: "none" };
  return readScope(params, "v3Correction");
}

export function readV3ReturnQuery(params: URLSearchParams): ScopeQuery {
  return readScope(params, "v3Return");
}

export function scopeFromRealWorkspace(load: RealWorkspaceLoad): V3CorrectionScope | null {
  if (load.status !== "ready" || !load.serverScopeVerified) return null;
  const { workspace, dossierId, fiscalYear } = load;
  const year = workspace.fiscalYear;
  if (year.dossierId !== dossierId || year.year !== fiscalYear || year.status === "closed" ||
      !year.id || year.propertyIds.length !== 1 || workspace.properties.length !== 1 ||
      workspace.properties[0]?.id !== year.propertyIds[0]) return null;
  return { dossierId, fiscalYearId: year.id, year: fiscalYear, propertyId: year.propertyIds[0]! };
}

export function sameCorrectionScope(expected: V3CorrectionScope, actual: V3CorrectionScope | null): boolean {
  return actual !== null && expected.dossierId === actual.dossierId &&
    expected.fiscalYearId === actual.fiscalYearId && expected.year === actual.year &&
    expected.propertyId === actual.propertyId;
}

export function scopeMatchesWorkspace(expected: V3CorrectionScope, workspace: PersistedWorkspace): boolean {
  const year = workspace.fiscalYear;
  return year.dossierId === expected.dossierId && year.id === expected.fiscalYearId &&
    year.year === expected.year && year.status !== "closed" &&
    year.propertyIds.length === 1 && year.propertyIds[0] === expected.propertyId &&
    workspace.properties.length === 1 && workspace.properties[0]?.id === expected.propertyId;
}

function scopeParams(scope: V3CorrectionScope): URLSearchParams {
  return new URLSearchParams({
    dossierId: scope.dossierId, fiscalYearId: scope.fiscalYearId,
    year: String(scope.year), propertyId: scope.propertyId,
  });
}

/** Only callers holding R8's resolved REAL workspace may construct this route. */
export function v3OwnerCorrectionHref(ownerRoute: string, load: RealWorkspaceLoad): string | null {
  const scope = scopeFromRealWorkspace(load);
  if (!scope || !OWNER_ROUTES.has(ownerRoute)) return null;
  const params = scopeParams(scope);
  params.set("v3Correction", "1");
  return `${ownerRoute}?${params}`;
}

export type ConfirmedSave = { status: "confirmed"; revision: number } | { status: "failed"; reason: string };

/** Full document navigation to this fixed local route forces R8 to read again. */
export function v3ReturnHref(input: {
  scope: V3CorrectionScope;
  currentScope: V3CorrectionScope;
  changed: boolean;
  save?: ConfirmedSave;
}): string | null {
  if (!sameCorrectionScope(input.scope, input.currentScope)) return null;
  if (input.changed && (input.save?.status !== "confirmed" || !Number.isSafeInteger(input.save.revision) || input.save.revision < 1)) return null;
  const params = scopeParams(input.scope);
  params.set("v3Return", "1");
  return `/lab/v2-dossier/real?${params}`;
}
