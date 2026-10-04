/**
 * MB-MULTI-SERVER-TRUST-2 — AUTORITÉ SERVEUR de la livraison (Cerfa, aide 2042-C-PRO).
 *
 * Invariant : le client PEUT DEMANDER une action ; il ne DÉFINIT JAMAIS le résultat fiscal livré.
 *
 *   (authentification, propriété, entitlement payé : `resolveDeliveryAccess`, en amont)
 *   → snapshot PERSISTÉ courant du serveur (jamais un payload du client)
 *   → `expectedRevision` comparée à la révision persistée (409 `workspace_snapshot_stale`)
 *   → schéma supporté, exercice et dossier cohérents
 *   → antériorité (même éligibilité que l'écran de validation, recalculée sur le snapshot)
 *   → capacités multi, puis domaine ADR-011 AVANT calcul (G22 : stock d'ouverture)
 *   → génération consolidée RECALCULÉE côté serveur (`runDeclarationGenerationFromWorkspace`, un seul F-006)
 *   → G21 / domaine après calcul (déjà dans la génération) + admission de la RFS SERVEUR (défense en profondeur)
 *   → RFS serveur renvoyée à la route, qui assemble et rend exclusivement depuis elle.
 *
 * Même architecture pour le mono et le multi : le mode (mono / multi) vient du snapshot serveur, jamais d'un marqueur de la requête.
 * Le paiement n'est PAS lié à une révision : l'entitlement reste « dossier + exercice », régénérable à volonté ; seule la fraîcheur du
 * snapshot consulté est exigée (`expectedRevision`).
 *
 * Résiduel assumé (hors périmètre) : le propriétaire peut mentir dans les faits bruts qu'il persiste (attestations, nombre de biens…).
 * Cette frontière garantit l'absence de falsification par la REQUÊTE, d'état périmé livré par accident et d'application incohérente
 * de la garde de domaine — pas la véracité des déclarations du propriétaire.
 */
import {
  MULTI_PROPERTY_CAPABILITIES,
  isMultiPropertyCapabilityOpen,
  isMultiPropertyRfs,
  isMultiPropertyWorkspace,
  MULTI_PROPERTY_NOT_ENABLED_CODE,
  type MultiPropertyCapabilities,
} from "@/lib/lmnp/dossier/multi-property-activation";
import {
  MULTI_PROPERTY_DOMAIN_REASON_CODES,
  resolveMultiPropertyDeliveryAdmission,
  resolveMultiPropertyGenerationAdmission,
} from "@/lib/lmnp/dossier/multi-property-domain";
import { resolveImmobilisationsContinuityForGeneration } from "@/lib/lmnp/services/dossier/fiscal-year-cycle";
import type { ReadServerSnapshot } from "@/lib/lmnp/services/server-workspace-snapshot";
import { jsonResponse, mapPaymentError, parseFiscalYear } from "@/lib/lmnp/services/payment/payment-http";
import { createDeliveryDeps } from "@/lib/lmnp/services/payment/payment-server";
import type { PersistedWorkspace } from "@/lib/lmnp/store/persistence";
import { parseWorkspaceSnapshot } from "@/lib/lmnp/store/workspace-snapshot";
import type { FiscalRepresentation } from "@/runtime/capabilities/rfs/types";
import {
  resolveExternalOpeningProofFromFiscalYear,
  resolvePersistedExternalTakeoverOpening,
  resolvePriorHistoryEligibility,
} from "./prior-history-eligibility";
import { runDeclarationGenerationFromWorkspace } from "./generation-workspace";

export const EXPECTED_REVISION_REQUIRED_CODE = "expected_revision_required" as const;
export const WORKSPACE_SNAPSHOT_MISSING_CODE = "workspace_snapshot_missing" as const;
export const WORKSPACE_SNAPSHOT_STALE_CODE = "workspace_snapshot_stale" as const;
export const WORKSPACE_SNAPSHOT_UNREADABLE_CODE = "workspace_snapshot_unreadable" as const;

type Generate = typeof runDeclarationGenerationFromWorkspace;

export type AuthoritativeDeliveryDeps = {
  /** Lecture du snapshot PERSISTÉ (service role, après vérification de propriété par l'appelant). */
  readSnapshot: ReadServerSnapshot;
  /** Injection du pipeline de génération (tests : comptage d'appels). Défaut : le pipeline de production, inchangé. */
  generate?: Generate;
  /** Tests uniquement : capacités multi injectées. En production, toujours `MULTI_PROPERTY_CAPABILITIES`. */
  capabilities?: MultiPropertyCapabilities;
};

export type AuthoritativeDelivery = {
  /** RFS recalculée par le serveur — la SEULE autorité de ce qui est livré. */
  rfs: FiscalRepresentation;
  /** Workspace persisté dont la RFS dérive (extras documentaires, date de début d'activité…). */
  workspace: PersistedWorkspace;
  revision: number;
};

export type AuthoritativeDeliveryResult = ({ ok: true } & AuthoritativeDelivery) | { ok: false; response: Response };

const fail = (status: number, body: Record<string, unknown>): { ok: false; response: Response } => ({ ok: false, response: jsonResponse(status, body) });

/** `expectedRevision` : entier ≥ 1, jamais défaut ni coercition (une chaîne n'est pas une révision). */
export function parseExpectedRevision(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) && value >= 1 ? value : null;
}

/** Charge et valide le snapshot persisté courant : jamais un payload du client, jamais de repli. */
async function loadAuthoritativeWorkspace(
  deps: AuthoritativeDeliveryDeps,
  input: { dossierId: string; fiscalYear: number; expectedRevision: number },
): Promise<{ ok: true; workspace: PersistedWorkspace; revision: number } | { ok: false; response: Response }> {
  let row;
  try {
    row = await deps.readSnapshot(input.dossierId, input.fiscalYear);
  } catch (error) {
    console.error("[authoritative-delivery] snapshot read failed", error);
    return fail(503, { error: "Le dossier n'a pas pu être lu. Réessayez dans quelques instants.", code: "workspace_snapshot_unavailable" });
  }
  if (!row) {
    return fail(409, {
      error: "Aucune sauvegarde serveur de ce dossier n'existe pour cet exercice : aucun document ne peut être produit.",
      code: WORKSPACE_SNAPSHOT_MISSING_CODE,
    });
  }
  // Une révision illisible n'est jamais présumée : échec fermé.
  if (!Number.isInteger(row.revision) || (row.revision as number) < 1) {
    return fail(409, { error: "La sauvegarde serveur du dossier est illisible.", code: WORKSPACE_SNAPSHOT_UNREADABLE_CODE });
  }
  const revision = row.revision as number;
  if (revision !== input.expectedRevision) {
    return fail(409, {
      error: "Le dossier a changé depuis l'affichage : rechargez la page puis réessayez.",
      code: WORKSPACE_SNAPSHOT_STALE_CODE,
      expectedRevision: input.expectedRevision,
      currentRevision: revision,
    });
  }
  const parsed = parseWorkspaceSnapshot(row.payload);
  if (!parsed.ok || parsed.envelope.schemaVersion !== row.schemaVersion) {
    return fail(409, { error: "La sauvegarde serveur du dossier est illisible.", code: WORKSPACE_SNAPSHOT_UNREADABLE_CODE });
  }
  const workspace = parsed.envelope.workspace;
  // L'exercice de la ligne est celui demandé ; un payload qui en porte un autre, ou qui se déclare d'un autre dossier, n'est jamais livré.
  if (workspace.fiscalYear.year !== input.fiscalYear) {
    return fail(403, { error: "La déclaration ne correspond pas à l'exercice payé.", code: "fiscal_year_mismatch" });
  }
  const declaredDossier = workspace.fiscalYear.dossierId;
  if (declaredDossier !== undefined && declaredDossier !== null && declaredDossier !== input.dossierId) {
    return fail(409, { error: "La sauvegarde serveur du dossier est illisible.", code: WORKSPACE_SNAPSHOT_UNREADABLE_CODE });
  }
  return { ok: true, workspace, revision };
}

/**
 * Résout la RFS AUTORITATIVE d'une livraison. À appeler APRÈS authentification, propriété et entitlement payé. Ne lit jamais la RFS du
 * client : elle n'est même pas un paramètre.
 */
export async function resolveAuthoritativeDelivery(
  input: { dossierId: unknown; fiscalYear: unknown; expectedRevision: unknown },
  deps: AuthoritativeDeliveryDeps,
): Promise<AuthoritativeDeliveryResult> {
  const dossierId = typeof input.dossierId === "string" && input.dossierId.trim() ? input.dossierId.trim() : null;
  const fiscalYear = parseFiscalYear(input.fiscalYear);
  if (!dossierId || fiscalYear === null) return fail(400, { error: "dossierId et fiscalYear requis.", code: "invalid_request" });
  const expectedRevision = parseExpectedRevision(input.expectedRevision);
  if (expectedRevision === null) {
    return fail(400, { error: "expectedRevision requis (révision du dossier affichée).", code: EXPECTED_REVISION_REQUIRED_CODE });
  }
  const capabilities = deps.capabilities ?? MULTI_PROPERTY_CAPABILITIES;

  const loaded = await loadAuthoritativeWorkspace(deps, { dossierId, fiscalYear, expectedRevision });
  if (!loaded.ok) return loaded;
  const { workspace, revision } = loaded;
  const { fiscalYear: year, properties, declarationDraft: draft } = workspace;

  // Antériorité : MÊME éligibilité que l'écran de validation, recalculée sur l'état persisté (jamais un fait du client).
  const priorHistory = resolvePriorHistoryEligibility(year, resolveExternalOpeningProofFromFiscalYear(year));
  if (!priorHistory.eligible) {
    return fail(403, {
      error: "Pour établir correctement votre déclaration, nous devons reprendre certains éléments de votre comptabilité précédente. Cette reprise n'est pas encore disponible.",
      code: "prior_history_not_eligible",
    });
  }

  // Entrées de génération : exactement celles que l'écran de validation fournit, toutes dérivées de l'état persisté.
  const openingInputs = {
    stocksOuverture: year.stocksOuverture?.stocks,
    continuity: resolveImmobilisationsContinuityForGeneration({
      draft,
      properties,
      propertyIds: year.propertyIds ?? [],
      immobilisationsOuverture: year.immobilisationsOuverture,
      repriseHistoriqueEnContinuite: year.repriseHistoriqueEnContinuite,
      previousFiscalYearId: year.previousFiscalYearId,
      continuiteNativeVerifiee: year.continuiteNativeVerifiee,
    }),
    fiscalYearOpening: resolvePersistedExternalTakeoverOpening(year),
  };

  // Multi : mode établi PAR LE SERVEUR sur le snapshot. Capacités d'abord (activation produit), domaine ADR-011 ensuite (avant calcul).
  const multi = isMultiPropertyWorkspace(workspace);
  if (multi) {
    for (const capability of ["generation", "delivery"] as const) {
      if (!isMultiPropertyCapabilityOpen(capability, capabilities)) {
        return fail(422, { status: "blocked", reason: MULTI_PROPERTY_NOT_ENABLED_CODE });
      }
    }
    const admission = resolveMultiPropertyGenerationAdmission(workspace, openingInputs, capabilities);
    if (!admission.allowed) {
      return fail(422, {
        status: "blocked",
        reason: admission.reason,
        ...(admission.reason === "multi_property_domain_unsupported" ? { domainReasons: admission.domainReasons.map((reason) => reason.code) } : {}),
      });
    }
  }

  // Génération RECALCULÉE : un seul appel au pipeline (un seul F-006 consolidé), jamais une RFS reçue.
  const generate = deps.generate ?? runDeclarationGenerationFromWorkspace;
  const outcome = generate(workspace, {
    stocksOuverture: openingInputs.stocksOuverture,
    bilanInputs: draft?.bilanPatrimonial,
    dispense2033AIntake: draft?.dispense2033A,
    continuity: openingInputs.continuity,
    fiscalYearOpening: openingInputs.fiscalYearOpening,
  });
  if (outcome.status !== "generated") {
    const reasons = (outcome as { blockingReasons?: Array<{ code: string }> }).blockingReasons ?? [];
    const anomalyFields = ((outcome as { anomalies?: Array<{ field?: string }> }).anomalies ?? []).flatMap((anomaly) => (anomaly.field ? [anomaly.field] : []));
    const codes = [...new Set(reasons.length > 0 ? reasons.map((reason) => reason.code) : anomalyFields)];
    const domainCodes = codes.filter((code) => code.startsWith("multi_property_"));
    return fail(422, domainCodes.length > 0 || (multi && codes.length > 0)
      ? { status: "blocked", reason: "multi_property_domain_unsupported", domainReasons: codes }
      : { status: "blocked", reason: "generation_blocked", blockingReasons: codes });
  }
  const rfs = outcome.rfs;

  // Cohérence mode / RFS : une RFS à forme multi pour un dossier mono (ou l'inverse) n'est jamais livrée.
  if (isMultiPropertyRfs(rfs) !== multi) {
    return fail(422, { status: "blocked", reason: "multi_property_domain_unsupported", domainReasons: [MULTI_PROPERTY_DOMAIN_REASON_CODES.domainUnverifiable] });
  }
  if (rfs.exercice !== fiscalYear) {
    return fail(403, { error: "La déclaration ne correspond pas à l'exercice payé.", code: "fiscal_year_mismatch" });
  }
  // Défense en profondeur : admission de la RFS SERVEUR (G21 — ARD généré, ARD consommé, imputation…) par la garde centrale.
  const delivery = resolveMultiPropertyDeliveryAdmission(rfs, capabilities);
  if (!delivery.allowed) {
    return fail(422, {
      status: "blocked",
      reason: delivery.reason,
      ...(delivery.reason === "multi_property_domain_unsupported" ? { domainReasons: delivery.domainReasons.map((reason) => reason.code) } : {}),
    });
  }
  return { ok: true, rfs, workspace, revision };
}

/**
 * Dépendances injectables des handlers de livraison (tests). Production : aucune — lecteur service role, pipeline réel, capacités réelles.
 */
export type DeliveryHandlerDeps = {
  readSnapshot?: ReadServerSnapshot;
  generate?: Generate;
  /**
   * SEAM DE TEST : fournit directement la livraison « autoritative » (équivalent d'une RFS produite par le serveur) pour les tests de
   * contenu PDF qui ne portent pas sur la confiance. Aucune route de production ne le renseigne ; il n'a aucun lien avec le corps de requête.
   */
  resolveAuthoritative?: (input: { dossierId: unknown; fiscalYear: unknown; expectedRevision: unknown }) => Promise<AuthoritativeDeliveryResult>;
};

/** Point d'entrée UNIQUE des deux routes de livraison : jamais d'autre chemin vers une RFS livrable. */
export async function resolveDeliveryAuthority(
  input: { dossierId: unknown; fiscalYear: unknown; expectedRevision: unknown },
  deps: DeliveryHandlerDeps = {},
  capabilities?: MultiPropertyCapabilities,
): Promise<AuthoritativeDeliveryResult> {
  if (deps.resolveAuthoritative) return deps.resolveAuthoritative(input);
  let readSnapshot = deps.readSnapshot;
  if (!readSnapshot) {
    try {
      readSnapshot = createDeliveryDeps().readWorkspaceSnapshot;
    } catch (err) {
      return { ok: false, response: mapPaymentError("delivery-authority", err) };
    }
  }
  return resolveAuthoritativeDelivery(input, { readSnapshot, generate: deps.generate, capabilities });
}
