/**
 * R2C.3c1 — barrières de sécurité multi-bien. Module PUR, sans I/O.
 *
 * `MULTI_PROPERTY_USER_ENABLED` représente l'ACTIVATION UTILISATEUR du multi-bien, jamais la capacité technique du
 * moteur (R2C.3b est techniquement capable). Tant qu'elle vaut `false`, un dossier multi ne peut ni payer, ni
 * clôturer, ni créer N+1, ni appeler la transition serveur, ni obtenir un PDF Cerfa. Constante de code : aucune
 * variable d'environnement, aucun flag distant, aucune valeur persistée.
 *
 * Résolveur multi UNIQUE : `scoped != multi`. Un dossier scopé (`declarationDraft.biens`) avec UN seul bien reste un
 * dossier MONO. La résolution de périmètre réutilise `resolveExerciseScope` (R1) ; ce module n'ajoute que le
 * fail-closed (périmètres divergents, `biens` à plus d'une entrée).
 */
import { WORKSPACE_SNAPSHOT_MAX_SCHEMA_VERSION } from "../store/workspace-snapshot";
import { resolveExerciseScope } from "./property-scope";

export const MULTI_PROPERTY_USER_ENABLED = false as const;

/** Code HTTP/métier commun à toutes les barrières. */
export const MULTI_PROPERTY_NOT_ENABLED_CODE = "multi_property_not_enabled" as const;
export const MULTI_PROPERTY_NOT_ENABLED_MESSAGE =
  "Les dossiers comportant plusieurs biens ne sont pas encore ouverts : paiement, clôture et exercice suivant sont indisponibles pour l'instant.";

/** Forme minimale lue : tolérante (payload serveur non validé), seuls les identifiants comptent. */
export type PropertyModeInput = {
  properties?: readonly { id?: unknown }[] | null;
  fiscalYear?: { propertyIds?: readonly unknown[] | null } | null;
  declarationDraft?: { biens?: Record<string, unknown> | null } | null;
};

export type WorkspacePropertyMode =
  | { kind: "none" }
  | { kind: "legacy_mono"; propertyId: string }
  | { kind: "scoped_mono"; propertyId: string }
  | { kind: "scoped_multi"; propertyIds: string[] }
  /** Plusieurs biens SANS `biens` (état à plat) ou périmètres divergents : jamais produit par un flux valide, fail-closed. */
  | { kind: "legacy_multi"; propertyIds: string[] };

const ids = (values: readonly unknown[] | null | undefined): string[] =>
  Array.isArray(values) ? values.filter((value): value is string => typeof value === "string" && value.length > 0) : [];

export function resolveWorkspacePropertyMode(workspace: PropertyModeInput): WorkspacePropertyMode {
  const propertyListIds = ids(workspace.properties?.map((property) => property?.id));
  const yearIds = ids(workspace.fiscalYear?.propertyIds);
  const biens = workspace.declarationDraft?.biens;
  const scoped = biens !== undefined && biens !== null && typeof biens === "object";
  const bienIds = scoped ? Object.keys(biens) : [];
  const distinct = [...new Set([...propertyListIds, ...yearIds, ...bienIds])];

  const scope = resolveExerciseScope({
    properties: propertyListIds.map((id) => ({ id })),
    fiscalYear: { propertyIds: yearIds },
  });
  const multi = scope.kind === "multi" || bienIds.length > 1 || (scope.kind === "inconsistent" && distinct.length > 1);
  if (multi) return scoped ? { kind: "scoped_multi", propertyIds: distinct } : { kind: "legacy_multi", propertyIds: distinct };
  if (distinct.length === 0) return { kind: "none" };
  const propertyId = distinct[0]!;
  return scoped ? { kind: "scoped_mono", propertyId } : { kind: "legacy_mono", propertyId };
}

export function isMultiPropertyWorkspace(workspace: PropertyModeInput): boolean {
  const kind = resolveWorkspacePropertyMode(workspace).kind;
  return kind === "scoped_multi" || kind === "legacy_multi";
}

/** Décision de barrière : multi ET activation utilisateur fermée. */
export function isMultiPropertyBlocked(workspace: PropertyModeInput): boolean {
  return !MULTI_PROPERTY_USER_ENABLED && isMultiPropertyWorkspace(workspace);
}

/**
 * Snapshot serveur (`lmnp_workspace_snapshots`) : `payload` = enveloppe `{ workspace }` ou workspace nu. Absence de
 * snapshot : jamais bloquante. Schéma plus récent que ce client : forme inconnue, fail-closed.
 */
export function isMultiPropertySnapshotRow(row: { schemaVersion?: unknown; payload?: unknown } | null | undefined): boolean {
  if (!row) return false;
  if (typeof row.schemaVersion === "number" && row.schemaVersion > WORKSPACE_SNAPSHOT_MAX_SCHEMA_VERSION) return true;
  return isMultiPropertyPayload(row.payload);
}

/** Payload de workspace transmis ou stocké (enveloppe ou nu). Tolérant : toute forme illisible n'est pas multi. */
export function isMultiPropertyPayload(payload: unknown): boolean {
  if (!payload || typeof payload !== "object") return false;
  const candidate = payload as { workspace?: unknown };
  const workspace = candidate.workspace && typeof candidate.workspace === "object" ? candidate.workspace : payload;
  return isMultiPropertyWorkspace(workspace as PropertyModeInput);
}

/**
 * Marqueur intrinsèque multi d'une RFS : `immobilisationsParBien` défini (contrat R2C.3a/3b : « Mono : absent »).
 * `propertyId` sur les emprunts n'est pas un marqueur (information d'identité, pas de mode).
 */
export function isMultiPropertyRfs(rfs: unknown): boolean {
  if (!rfs || typeof rfs !== "object") return false;
  return Array.isArray((rfs as { immobilisationsParBien?: unknown }).immobilisationsParBien);
}

/** F006 : l'assistant à plat lit le flat draft, faux en multi — il n'est monté qu'en mono (legacy ou scoped). */
export function f006FlatAssistantMountable(workspace: PropertyModeInput): boolean {
  return !isMultiPropertyWorkspace(workspace);
}

/** F014 : `usageNote` est dérivée du FiscalResult GLOBAL ; en multi elle ne concerne pas le bien actif. */
export function f014GlobalUsageNoteApplicable(workspace: PropertyModeInput): boolean {
  return !isMultiPropertyWorkspace(workspace);
}
