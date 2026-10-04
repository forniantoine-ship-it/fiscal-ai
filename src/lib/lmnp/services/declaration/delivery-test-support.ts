/**
 * MB-MULTI-SERVER-TRUST-2 — SUPPORT DE TEST des routes de livraison (Cerfa, aide 2042-C-PRO). Aucun code de production ne l'importe.
 *
 * Les routes ne lisent plus aucune RFS du corps de requête : elles chargent le snapshot persisté et RECALCULENT. Les tests historiques de
 * CONTENU (rendu PDF, bouclage 2033-B, admission de domaine sur une RFS donnée…) fournissent pourtant une RFS de fixture. Ce support la
 * rejoue comme « la RFS que le pipeline serveur produit » : un snapshot lisible et éligible (`readSnapshot`) et un pipeline injecté
 * (`generate`) qui renvoie cette RFS. Toute la chaîne de production reste exécutée (révision, schéma, mode mono/multi tiré du snapshot,
 * capacités, domaine avant calcul, cohérence mode/RFS, admission de la RFS) — seule la génération est remplacée par la fixture.
 *
 * Ce n'est PAS un chemin client : la fixture n'est jamais transmise dans la requête.
 */
import { isMultiPropertyRfs } from "@/lib/lmnp/dossier/multi-property-activation";
import type { MultiPropertyCapabilities } from "@/lib/lmnp/dossier/multi-property-activation";
import type { DeliveryHandlerDeps } from "@/lib/lmnp/services/declaration/authoritative-delivery";
import type { PersistedWorkspace } from "@/lib/lmnp/store/persistence";
import { workspaceSnapshotSchemaVersion } from "@/lib/lmnp/store/workspace-snapshot";

import { A, B, SPEC_A, T, Y, monoWorkspace, multiWorkspace, oracleBien } from "./multi-property-test-support";

const clone = <V>(value: V): V => JSON.parse(JSON.stringify(value));

/** État persisté par l'écran de validation d'un dossier réellement prêt : antériorité répondue, étapes confirmées. */
export function confirmedWorkspace(workspace: PersistedWorkspace): PersistedWorkspace {
  const ws = clone(workspace);
  const draft = ws.declarationDraft as unknown as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
  (ws.fiscalYear as { priorHistoryDeclaration?: unknown }).priorHistoryDeclaration = { status: "FIRST_REAL_YEAR", declaredAt: T };
  draft.inpiConfirmedAt = T;
  if (!draft.biens) {
    draft.revenusConfirmedAt ??= T;
    if (draft.financementCharges !== undefined) draft.creditConfirmedAt ??= T;
  }
  for (const bien of Object.values<Record<string, unknown>>(draft.biens ?? {})) {
    bien.revenusConfirmedAt ??= T;
    if (bien.financementCharges !== undefined) bien.creditConfirmedAt ??= T;
  }
  return ws;
}

/** Workspace persisté plausible dont le mode (mono / multi) est celui de la RFS de fixture, à l'exercice de cette RFS. */
export function stubWorkspaceForRfs(rfs: unknown): PersistedWorkspace {
  const multi = isMultiPropertyRfs(rfs);
  const base = multi
    ? multiWorkspace({ specs: [[A, oracleBien(6000, 1000, 1000)], [B, oracleBien(5000, 2000, 2000)]] })
    : monoWorkspace(SPEC_A);
  const workspace = confirmedWorkspace(base);
  const exercice = (rfs as { exercice?: unknown } | null)?.exercice;
  workspace.fiscalYear = { ...workspace.fiscalYear, year: typeof exercice === "number" ? exercice : Y } as PersistedWorkspace["fiscalYear"];
  return workspace;
}

export function snapshotRowOf(workspace: PersistedWorkspace, revision = 1) {
  const schemaVersion = workspaceSnapshotSchemaVersion(workspace);
  return { schemaVersion, revision, payload: clone({ schemaVersion, workspace }) };
}

/** Dépendances injectables qui font produire `rfs` par « le pipeline serveur » (voir l'en-tête). */
export function deliveryDepsForRfs(rfs: unknown, workspace: PersistedWorkspace = stubWorkspaceForRfs(rfs)): DeliveryHandlerDeps {
  return {
    readSnapshot: async () => snapshotRowOf(workspace),
    generate: (() => ({ status: "generated", rfs })) as never,
  };
}

type DeliveryHandler = (
  request: Request,
  resolveAccess?: never,
  capabilities?: MultiPropertyCapabilities,
  deps?: DeliveryHandlerDeps,
) => Promise<Response>;

/**
 * Rejoue une requête « historique » (corps portant une RFS de fixture) sur la route : la RFS est RETIRÉE du corps et fournie au pipeline
 * injecté ; `expectedRevision` (contrat obligatoire) est ajouté s'il manque. Avec `defaults` (par défaut), `dossierId` et `fiscalYear`
 * le sont aussi (tests de contenu dont l'accès est un stub) ; les tests d'accès les fournissent eux-mêmes (`defaults: false`).
 * Une requête qui n'est pas un objet JSON est transmise telle quelle (les tests d'entrée invalide restent des tests d'entrée invalide).
 */
export async function callDelivery(
  handler: unknown,
  request: Request,
  resolveAccess: unknown,
  capabilities?: MultiPropertyCapabilities,
  options: { defaults?: boolean } = {},
): Promise<Response> {
  let raw: unknown;
  try {
    raw = await request.clone().json();
  } catch {
    return (handler as DeliveryHandler)(request, resolveAccess as never, capabilities, {});
  }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return (handler as DeliveryHandler)(request, resolveAccess as never, capabilities, {});
  }
  const { rfs, ...rest } = raw as Record<string, unknown>;
  const exercice = (rfs as { exercice?: unknown } | undefined)?.exercice;
  const defaults = options.defaults === false ? {} : { dossierId: "dossier-test", fiscalYear: typeof exercice === "number" ? exercice : Y };
  const body = { ...defaults, expectedRevision: 1, ...rest };
  const forwarded = new Request(request.url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  return (handler as DeliveryHandler)(forwarded, resolveAccess as never, capabilities, deliveryDepsForRfs(rfs));
}
