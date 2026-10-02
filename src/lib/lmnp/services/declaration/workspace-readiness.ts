/**
 * R2C.3c2b — READINESS TECHNIQUE d'un workspace. Module PUR et dormant : aucun appelant de production, aucune persistance.
 *
 *   TECHNICAL READINESS  ≠  USER ACTIVATION  ≠  PAYMENT READINESS
 *
 * Deux niveaux, jamais confondus :
 *   A. complétude du dossier — `buildDossierSteps` (confirmations des assistants), évalué PAR VUE : F009 sur la racine (global,
 *      une seule fois), F010–F014 sur `scopedBienView(root, propertyId)` de chaque bien (aucune règle réécrite) ;
 *   B. capacité du moteur workspace à générer — les `blockingReasons` fiscales/techniques du service workspace.
 *
 * Le niveau B n'a qu'une source fiable : l'évaluation PURE du service workspace (certaines raisons — 39C, immobilisations
 * consolidées, liasse — n'existent qu'après F-006). Ce module ne l'importe PAS : l'appelant l'évalue UNE fois et passe le résultat
 * (`generation`). Les raisons antérieures à F-006 (collecte, consolidation) sont peu coûteuses ; F-006 ne tourne que si elles sont
 * toutes levées. Sans `generation`, `technicalReady` est `false` (fail-closed) — jamais « prêt » sans évaluation fiscale.
 *
 * Ce module n'expose aucune capacité de gate (`canGenerate`, `canCheckout`, `canRetryAfterPayment`) et ne dépend d'aucun état
 * d'interface (bien actif). `userActivationEnabled` reflète seulement la constante d'activation de 3c1.
 */
import { scopedBienView } from "../../dossier/bien-draft";
import { isMultiPropertyBlocked, resolveWorkspacePropertyMode, type WorkspacePropertyMode } from "../../dossier/multi-property-activation";
import type { PersistedWorkspace } from "../../store/persistence";
import { buildDossierSteps, type DossierStepId, type DossierStepStatus } from "../validation-profile";
import type { Anomaly } from "@/runtime";
import {
  classifyAnomaly,
  classifyBlockingReason,
  normalizeBlockingReasons,
  type RawBlockingReason,
  type StructuredBlockingReason,
} from "./workspace-blocking-reasons";

/**
 * Forme MINIMALE (structurelle) du résultat d'évaluation du service workspace dont dépend la readiness : le résultat complet
 * (`generated` ou `blocked`) y est assignable. Aucune dépendance de module vers le service — l'évaluation est injectée.
 */
export type WorkspaceGenerationOutcome =
  | { status: "generated" }
  | {
      status: "blocked";
      anomalies?: ReadonlyArray<Pick<Anomaly, "severity" | "field" | "message">>;
      blockingReasons?: readonly RawBlockingReason[];
    };

type ReadinessWorkspace = Pick<PersistedWorkspace, "properties" | "fiscalYear" | "documents" | "declarationDraft">;

/** F010–F014 : propres au bien. F009 (`activite`) est GLOBAL. */
export type PropertyDomainId = Exclude<DossierStepId, "activite">;
export type DomainStatus<D extends DossierStepId> = { domain: D; status: DossierStepStatus };

export type GlobalReadiness = {
  domains: [DomainStatus<"activite">];
  /** F009 complet. Les raisons globales (prêt partagé, ouverture…) sont dans `blockingReasons`. */
  ready: boolean;
};

export type PropertyReadiness = {
  propertyId: string;
  domains: DomainStatus<PropertyDomainId>[];
  missing: PropertyDomainId[];
  /** Domaines complets ET aucune raison de blocage portant ce bien. */
  ready: boolean;
};

export type WorkspaceReadiness = {
  mode: WorkspacePropertyMode["kind"];
  global: GlobalReadiness;
  properties: PropertyReadiness[];
  blockingReasons: StructuredBlockingReason[];
  fiscalEvaluation: "evaluated" | "not_evaluated";
  /** Global F009 prêt + chaque bien prêt + aucune raison + moteur workspace capable de générer. */
  technicalReady: boolean;
  /** Activation utilisateur (constante 3c1). Indépendante de `technicalReady` : un multi techniquement prêt reste `false`. */
  userActivationEnabled: boolean;
};

const PROPERTY_DOMAINS: readonly PropertyDomainId[] = ["logement", "credit", "amortissement", "revenus", "charges"];
const compare = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

function reasonsOfGeneration(generation: WorkspaceGenerationOutcome): StructuredBlockingReason[] {
  if (generation.status !== "blocked") return [];
  const structured = generation.blockingReasons ?? [];
  if (structured.length > 0) return structured.map(classifyBlockingReason);
  const fromAnomalies = (generation.anomalies ?? [])
    .filter((anomaly) => anomaly.severity === "fatal" || anomaly.severity === "error")
    .map(classifyAnomaly);
  // Jamais « bloqué » sans explication structurée.
  return fromAnomalies.length > 0 ? fromAnomalies : [classifyBlockingReason({ code: "generation_blocked" })];
}

export function resolveWorkspaceReadiness(workspace: ReadinessWorkspace, generation?: WorkspaceGenerationOutcome): WorkspaceReadiness {
  const mode = resolveWorkspacePropertyMode(workspace);
  const year = workspace.fiscalYear.year;
  const root = workspace.declarationDraft ?? { completedSteps: [] };
  const flat = mode.kind === "legacy_mono";

  // GLOBAL (F009) : évalué UNE fois, sur la racine.
  const activite = buildDossierSteps(root, year).find((step) => step.id === "activite")!.status;
  const global: GlobalReadiness = { domains: [{ domain: "activite", status: activite }], ready: activite === "complete" };

  const propertyIds = [...new Set([
    ...workspace.fiscalYear.propertyIds,
    ...Object.keys(workspace.declarationDraft?.biens ?? {}),
    ...(workspace.fiscalYear.propertyIds.length === 0 ? workspace.properties.map((property) => property.id) : []),
  ])].sort(compare);

  const blockingReasons = generation ? normalizeBlockingReasons(reasonsOfGeneration(generation)) : [];

  const properties = propertyIds.map((propertyId): PropertyReadiness => {
    // Vue du bien : racine historique à plat en legacy mono ; `scopedBienView` sinon (undefined ⇒ tout incomplet, jamais le bien d'un autre).
    const view = flat ? root : scopedBienView(root, propertyId);
    const steps = buildDossierSteps(view, year);
    const domains = PROPERTY_DOMAINS.map((domain): DomainStatus<PropertyDomainId> => ({
      domain,
      status: steps.find((step) => step.id === domain)!.status,
    }));
    const missing = domains.filter((item) => item.status === "incomplete").map((item) => item.domain);
    const blocked = blockingReasons.some((reason) => reason.propertyId === propertyId);
    return { propertyId, domains, missing, ready: missing.length === 0 && !blocked };
  });

  const evaluated = generation !== undefined;
  const technicalReady =
    evaluated && generation.status === "generated" && global.ready && properties.length > 0 &&
    properties.every((property) => property.ready) && blockingReasons.length === 0;

  return {
    mode: mode.kind,
    global,
    properties,
    blockingReasons,
    fiscalEvaluation: evaluated ? "evaluated" : "not_evaluated",
    technicalReady,
    userActivationEnabled: !isMultiPropertyBlocked(workspace),
  };
}
