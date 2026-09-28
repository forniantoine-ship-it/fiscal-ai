import type { RealWorkspaceLoad } from "./real-workspace";
import type { PersistedWorkspace } from "@/lib/lmnp/store/persistence";

/**
 * F009 (activité) is legitimately owned before any Property exists — see
 * f009-completeness.test.ts, which reaches "completed" with zero properties.
 * Every other owner (F010–F014) operates on the property itself or its
 * exercise-scoped output and always requires exactly one resolved property.
 */
export type V3PropertyScope = { kind: "required"; propertyId: string } | { kind: "not_applicable" };

/** Identifiers only: no business value or document data is transported in the URL. */
export type V3CorrectionScope = {
  dossierId: string;
  fiscalYearId: string;
  year: number;
  property: V3PropertyScope;
};

export type ScopeQuery =
  | { kind: "none" }
  | { kind: "invalid" }
  | { kind: "scope"; scope: V3CorrectionScope };

/**
 * Single source of truth for which owner routes need a resolved property.
 * Guards entry generically (any workspace-dependent owner screen), not only
 * a "correction" of an existing fact — /documents hosts the validation/
 * finalization step (R13.1) under the same pre-provider gate.
 */
export const OWNER_ROUTES: Readonly<Record<string, boolean>> = {
  "/assistants/activite": false,
  "/assistants/logement": true,
  "/assistants/financement": true,
  "/assistants/revenus": true,
  "/assistants/charges": true,
  "/assistants/amortissements": true,
  "/documents": true,
};

function propertyScopeFor(propertyIds: readonly string[], properties: readonly { id: string }[]): V3PropertyScope | null {
  if (propertyIds.length === 0 && properties.length === 0) return { kind: "not_applicable" };
  if (propertyIds.length === 1 && properties.length === 1 && properties[0]?.id === propertyIds[0]) {
    return { kind: "required", propertyId: propertyIds[0]! };
  }
  return null; // ambiguous or mismatched — the whole scope stays unresolved, for every owner.
}

function propertyScopeEqual(expected: V3PropertyScope, actual: V3PropertyScope): boolean {
  // F009 never checks property identity — it does not own or depend on one.
  if (expected.kind === "not_applicable") return true;
  return actual.kind === "required" && actual.propertyId === expected.propertyId;
}

function parseScopeParams(
  params: URLSearchParams,
  requiresProperty: boolean | null,
): { dossierId: string; fiscalYearId: string; year: number; property: V3PropertyScope } | "invalid" {
  const baseKeys = ["dossierId", "fiscalYearId", "year"] as const;
  const values = baseKeys.map(key => params.getAll(key));
  if (values.some(value => value.length !== 1 || !value[0]?.trim())) return "invalid";
  const [dossierId, fiscalYearId, rawYear] = values.map(value => value[0]!);
  if (!/^\d{4}$/.test(rawYear)) return "invalid";
  const propertyValues = params.getAll("propertyId");
  if (propertyValues.length > 1) return "invalid";
  const hasProperty = propertyValues.length === 1 && Boolean(propertyValues[0]?.trim());
  if (propertyValues.length === 1 && !hasProperty) return "invalid"; // present but empty
  // requiresProperty === null: return-path, no owner route to consult — accept whichever
  // shape the original correction scope round-trips (see v3ReturnHref/scopeParams).
  const wantsProperty = requiresProperty ?? hasProperty;
  if (wantsProperty !== hasProperty) return "invalid";
  const property: V3PropertyScope = hasProperty ? { kind: "required", propertyId: propertyValues[0]! } : { kind: "not_applicable" };
  return { dossierId, fiscalYearId, year: Number(rawYear), property };
}

function readScope(params: URLSearchParams, marker: string, requiresProperty: boolean | null): ScopeQuery {
  if (!params.has(marker)) return { kind: "none" };
  if (params.getAll(marker).length !== 1 || params.get(marker) !== "1") return { kind: "invalid" };
  const parsed = parseScopeParams(params, requiresProperty);
  if (parsed === "invalid") return { kind: "invalid" };
  return { kind: "scope", scope: parsed };
}

export function readV3CorrectionQuery(pathname: string, params: URLSearchParams): ScopeQuery {
  if (!(pathname in OWNER_ROUTES)) return { kind: "none" };
  return readScope(params, "v3Correction", OWNER_ROUTES[pathname]!);
}

export function readV3ReturnQuery(params: URLSearchParams): ScopeQuery {
  return readScope(params, "v3Return", null);
}

export function scopeFromRealWorkspace(load: RealWorkspaceLoad): V3CorrectionScope | null {
  if (load.status !== "ready" || !load.serverScopeVerified) return null;
  const { workspace, dossierId, fiscalYear } = load;
  const year = workspace.fiscalYear;
  if (year.dossierId !== dossierId || year.year !== fiscalYear || year.status === "closed" || !year.id) return null;
  const property = propertyScopeFor(year.propertyIds, workspace.properties);
  if (!property) return null;
  return { dossierId, fiscalYearId: year.id, year: fiscalYear, property };
}

export function sameCorrectionScope(expected: V3CorrectionScope, actual: V3CorrectionScope | null): boolean {
  return actual !== null && expected.dossierId === actual.dossierId &&
    expected.fiscalYearId === actual.fiscalYearId && expected.year === actual.year &&
    propertyScopeEqual(expected.property, actual.property);
}

export function scopeMatchesWorkspace(expected: V3CorrectionScope, workspace: PersistedWorkspace): boolean {
  const year = workspace.fiscalYear;
  if (year.dossierId !== expected.dossierId || year.id !== expected.fiscalYearId ||
      year.year !== expected.year || year.status === "closed") return false;
  if (expected.property.kind === "not_applicable") return true;
  const actual = propertyScopeFor(year.propertyIds, workspace.properties);
  return actual !== null && propertyScopeEqual(expected.property, actual);
}

function scopeParams(scope: V3CorrectionScope): URLSearchParams {
  const params = new URLSearchParams({
    dossierId: scope.dossierId, fiscalYearId: scope.fiscalYearId, year: String(scope.year),
  });
  if (scope.property.kind === "required") params.set("propertyId", scope.property.propertyId);
  return params;
}

/** Route-scoped: clips property identity out of the URL for owners that don't need it. */
export function v3CorrectionHrefForResolvedScope(ownerRoute: string, scope: V3CorrectionScope | null): string | null {
  const requiresProperty = OWNER_ROUTES[ownerRoute];
  if (!scope || requiresProperty === undefined) return null;
  if (requiresProperty && scope.property.kind !== "required") return null;
  const routeScope: V3CorrectionScope = requiresProperty ? scope : { ...scope, property: { kind: "not_applicable" } };
  const params = scopeParams(routeScope);
  params.set("v3Correction", "1");
  return `${ownerRoute}?${params}`;
}

/** Only callers holding R8's resolved REAL workspace may construct this route. */
export function v3OwnerCorrectionHref(ownerRoute: string, load: RealWorkspaceLoad): string | null {
  return v3CorrectionHrefForResolvedScope(ownerRoute, scopeFromRealWorkspace(load));
}

export type ConfirmedSave = { status: "confirmed"; revision: number } | { status: "failed"; reason: string };

/** Full document navigation to this fixed local route forces R8 to read again. */
export function v3ReturnHref(input: {
  scope: V3CorrectionScope;
  scopeStillMatches: boolean;
  changed: boolean;
  save?: ConfirmedSave;
}): string | null {
  if (!input.scopeStillMatches) return null;
  if (input.changed && (input.save?.status !== "confirmed" || !Number.isSafeInteger(input.save.revision) || input.save.revision < 1)) return null;
  const params = scopeParams(input.scope);
  params.set("v3Return", "1");
  return `/lab/v2-dossier/real?${params}`;
}
