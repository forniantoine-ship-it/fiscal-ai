import type { RealWorkspaceLoad } from "./real-workspace";
import type { PersistedWorkspace } from "@/lib/lmnp/store/persistence";
import { resolveExerciseScope } from "@/lib/lmnp/dossier/property-scope";

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
  /**
   * R15 — which V3 shell to come back to, as an allow-listed marker (never a URL). Absent = the original V2 real route.
   * It carries no authority: scope equality and every security check ignore it.
   */
  shell?: V3Shell;
};

/**
 * `v3` : retour vers le dossier V3 LAB. `dossier` (MB-MULTI-JOURNEY-COMPLETION-2) : retour vers « Mes biens », route de PRODUCTION —
 * le parcours de production n'a jamais besoin d'une route /lab ni du drapeau ENABLE_V3_REAL_TEST_ROUTE.
 */
export type V3Shell = "v3" | "dossier";

const V3_SHELL_RETURN_ROUTES: Readonly<Record<V3Shell, string>> = { v3: "/lab/v3-dossier/real", dossier: "/assistants/biens" };
const V3_SHELLS: ReadonlySet<string> = new Set<V3Shell>(["v3", "dossier"]);
const V2_REAL_ROUTE = "/lab/v2-dossier/real";

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
  // MB-MULTI-UX-1 — « Mes biens » : ajout d'un bien, attestations d'activité, domaine. Propriété d'ACTIVITÉ, jamais d'un bien.
  "/assistants/biens": false,
  // R14.4A — F009's V3-native presentation of the same owner route/engine.
  // Legacy /assistants/activite stays registered and untouched above.
  "/lab/v2-dossier/real/activity": false,
  // MB-MULTI-E2E-LAB-1 — banc LAB « Mes biens » (édition ouverte localement) ; propriété d'activité, jamais d'un bien.
  "/lab/v2-dossier/real/biens": false,
  "/assistants/logement": true,
  "/assistants/financement": true,
  "/assistants/revenus": true,
  "/assistants/charges": true,
  "/assistants/amortissements": true,
  "/documents": true,
  // These legacy screens can mutate the hydrated workspace. A V3 exit must
  // enter through the same exact dossier/year/property gate as an owner.
  "/dashboard": true,
  "/declarations": true,
  "/declarations/historique": true,
};

function scopedRouteRequiresProperty(pathname: string): boolean | undefined {
  return OWNER_ROUTES[pathname] ?? (/^\/declarations\/\d{4}$/.test(pathname) ? true : undefined);
}

/**
 * MB-MULTI-UX-1 — scope du bien. Mono : le bien unique (un `selectedPropertyId` différent le refuse). Multi : JAMAIS le premier bien —
 * `required` seulement pour un bien EXPLICITEMENT sélectionné ET connu de l'exercice ; sans sélection, `not_applicable` (les owners
 * d'activité restent accessibles, tout owner de bien reste fermé : `v3CorrectionHrefForResolvedScope` exige `required`) ; une sélection
 * inconnue / étrangère à l'exercice / ambiguë → `null` (refus). Incohérence liste de biens ↔ exercice → `null`.
 */
export function propertyScopeFor(
  propertyIds: readonly string[],
  properties: readonly { id: string }[],
  selectedPropertyId?: string,
): V3PropertyScope | null {
  const scope = resolveExerciseScope({ properties, fiscalYear: { propertyIds } });
  if (scope.kind === "none") return selectedPropertyId === undefined ? { kind: "not_applicable" } : null;
  if (scope.kind === "mono") {
    return selectedPropertyId === undefined || selectedPropertyId === scope.propertyId ? { kind: "required", propertyId: scope.propertyId } : null;
  }
  if (scope.kind === "multi") {
    if (selectedPropertyId === undefined) return { kind: "not_applicable" };
    return scope.propertyIds.includes(selectedPropertyId) ? { kind: "required", propertyId: selectedPropertyId } : null;
  }
  return null; // inconsistent — the whole scope stays unresolved, for every owner.
}

function propertyScopeEqual(expected: V3PropertyScope, actual: V3PropertyScope): boolean {
  // F009 never checks property identity — it does not own or depend on one.
  if (expected.kind === "not_applicable") return true;
  return actual.kind === "required" && actual.propertyId === expected.propertyId;
}

function parseScopeParams(
  params: URLSearchParams,
  requiresProperty: boolean | null,
): { dossierId: string; fiscalYearId: string; year: number; property: V3PropertyScope; shell?: V3Shell } | "invalid" {
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
  // Optional allow-listed shell marker: exactly one allow-listed value once, or absent. Anything else invalidates the whole scope.
  const shellValues = params.getAll("v3Shell");
  if (shellValues.length > 1 || (shellValues.length === 1 && !V3_SHELLS.has(shellValues[0]!))) return "invalid";
  return { dossierId, fiscalYearId, year: Number(rawYear), property, ...(shellValues.length === 1 ? { shell: shellValues[0] as V3Shell } : {}) };
}

function readScope(params: URLSearchParams, marker: string, requiresProperty: boolean | null): ScopeQuery {
  if (!params.has(marker)) return { kind: "none" };
  if (params.getAll(marker).length !== 1 || params.get(marker) !== "1") return { kind: "invalid" };
  const parsed = parseScopeParams(params, requiresProperty);
  if (parsed === "invalid") return { kind: "invalid" };
  return { kind: "scope", scope: parsed };
}

export function readV3CorrectionQuery(pathname: string, params: URLSearchParams): ScopeQuery {
  const requiresProperty = scopedRouteRequiresProperty(pathname);
  if (requiresProperty === undefined) return { kind: "none" };
  return readScope(params, "v3Correction", requiresProperty);
}

export function readV3ReturnQuery(params: URLSearchParams): ScopeQuery {
  return readScope(params, "v3Return", null);
}

export function scopeFromRealWorkspace(load: RealWorkspaceLoad, selectedPropertyId?: string): V3CorrectionScope | null {
  if (load.status !== "ready" || !load.serverScopeVerified) return null;
  const { workspace, dossierId, fiscalYear } = load;
  const year = workspace.fiscalYear;
  if (year.dossierId !== dossierId || year.year !== fiscalYear || year.status === "closed" || !year.id) return null;
  const property = propertyScopeFor(year.propertyIds, workspace.properties, selectedPropertyId);
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
  const actual = propertyScopeFor(year.propertyIds, workspace.properties, expected.property.propertyId);
  return actual !== null && propertyScopeEqual(expected.property, actual);
}

function scopeParams(scope: V3CorrectionScope): URLSearchParams {
  const params = new URLSearchParams({
    dossierId: scope.dossierId, fiscalYearId: scope.fiscalYearId, year: String(scope.year),
  });
  if (scope.property.kind === "required") params.set("propertyId", scope.property.propertyId);
  if (scope.shell !== undefined) params.set("v3Shell", scope.shell);
  return params;
}

/** Route-scoped: clips property identity out of the URL for owners that don't need it. */
export function v3CorrectionHrefForResolvedScope(ownerRoute: string, scope: V3CorrectionScope | null): string | null {
  const requiresProperty = scopedRouteRequiresProperty(ownerRoute);
  if (!scope || requiresProperty === undefined) return null;
  if (requiresProperty && scope.property.kind !== "required") return null;
  const routeScope: V3CorrectionScope = requiresProperty ? scope : { ...scope, property: { kind: "not_applicable" } };
  const params = scopeParams(routeScope);
  params.set("v3Correction", "1");
  return `${ownerRoute}?${params}`;
}

/** Preserve an owner's existing local query (such as the Documents step) while adding the verified V3 scope. */
export function v3OwnerHrefForResolvedScope(href: string, scope: V3CorrectionScope | null): string | null {
  const url = new URL(href, "http://v3.local");
  if (url.origin !== "http://v3.local" || !href.startsWith("/")) return null;
  const scoped = v3CorrectionHrefForResolvedScope(url.pathname, scope);
  if (!scoped) return null;
  const target = new URL(scoped, url.origin);
  for (const [key, value] of url.searchParams) {
    if (["dossierId", "fiscalYearId", "year", "propertyId", "v3Correction", "v3Return", "v3Shell"].includes(key)) return null;
    target.searchParams.append(key, value);
  }
  return `${target.pathname}${target.search}`;
}

/** Keep the verified scope when an owner navigates to another workspace screen. */
export function v3ScopedNavigationHref(href: string, scope: V3CorrectionScope | null): string | null {
  if (!scope) return href;
  const url = new URL(href, "http://v3.local");
  if (url.origin !== "http://v3.local" || !href.startsWith("/")) return null;
  if (scopedRouteRequiresProperty(url.pathname) !== undefined) return v3OwnerHrefForResolvedScope(href, scope);
  // Public/auth destinations have no workspace authority. Every other unknown
  // destination must wait until it can verify this exact V3 scope.
  if (["/", "/login", "/signup"].includes(url.pathname)) return href;
  return null;
}

/** Only callers holding R8's resolved REAL workspace may construct this route. `selectedPropertyId` is mandatory in a multi-property exercise. */
export function v3OwnerCorrectionHref(ownerRoute: string, load: RealWorkspaceLoad, selectedPropertyId?: string): string | null {
  return v3CorrectionHrefForResolvedScope(ownerRoute, scopeFromRealWorkspace(load, selectedPropertyId));
}

/**
 * MB-MULTI-UX-1 — bien actif demandé par l'URL (`?propertyId=`), source de vérité UNIQUE du bien actif. Une valeur absente est
 * `{ kind: "none" }` ; une valeur vide ou répétée est `invalid` (refus). Il ne porte aucune autorité : il est TOUJOURS revérifié
 * (`scopeFromRealWorkspace` / `propertyScopeFor`) contre le dossier chargé côté serveur.
 */
export type RequestedPropertyQuery = { kind: "none" } | { kind: "invalid" } | { kind: "property"; propertyId: string };
export function readRequestedPropertyId(params: URLSearchParams): RequestedPropertyQuery {
  const values = params.getAll("propertyId");
  if (values.length === 0) return { kind: "none" };
  if (values.length > 1 || !values[0]?.trim()) return { kind: "invalid" };
  return { kind: "property", propertyId: values[0]! };
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
  return `${input.scope.shell ? V3_SHELL_RETURN_ROUTES[input.scope.shell] : V2_REAL_ROUTE}?${params}`;
}
