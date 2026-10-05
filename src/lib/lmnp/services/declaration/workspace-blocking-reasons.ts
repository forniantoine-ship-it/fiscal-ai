/**
 * R2C.3c2b — modèle STRUCTURÉ des raisons de blocage d'un workspace + routage code → domaine. Module PUR et dormant.
 *
 * Une raison n'est jamais un simple texte : `code`, `propertyId` (jamais inventé, jamais réduit à un suffixe de message),
 * `field`, `domain`, `scope`, `recoverable`. `domain` réutilise les identifiants canoniques d'étape (`DossierStepId` :
 * activite = F009, logement = F010, credit = F011, charges = F012, revenus = F013, amortissement = F014) ; `workspace`
 * désigne ce qui ne relève d'aucun assistant (invariants du dossier, ouverture/continuation, documents). Aucune URL d'interface
 * ici : la navigation est un choix de la couche UX (3c2d).
 *
 * `recoverable` n'est vrai que si une interface existe aujourd'hui pour corriger la cause. Toute raison, résoluble ou non, bloque
 * la génération technique ET l'activation utilisateur : le modèle exprime la différence de résolubilité, jamais un blocage « souple ».
 */
import type { Anomaly } from "@/runtime";
import type { DossierStepId } from "../validation-profile";

export type BlockingDomain = DossierStepId | "workspace";
export type BlockingScope = "global" | "property";

/** Raison brute telle que produite par le service workspace (`WorkspaceBlockingReason`). */
export type RawBlockingReason = { code: string; propertyId?: string; field?: string; message?: string };

export type StructuredBlockingReason = {
  code: string;
  /** `property` si et seulement si le producteur connaît le bien ; sinon `global` (aucun propertyId inventé). */
  scope: BlockingScope;
  propertyId?: string;
  field?: string;
  domain: BlockingDomain;
  /** Domaines liés (ex. une date de bien antérieure au début d'activité relève de F010 ET de F009). */
  relatedDomains?: readonly DossierStepId[];
  /** Une interface existe-t-elle aujourd'hui pour corriger cette cause ? */
  recoverable: boolean;
  /** `false` : code absent de la table — fail-closed (domaine `workspace`, non résoluble). */
  known: boolean;
  /** Message existant du producteur, préservé tel quel. */
  message?: string;
};

type Route =
  | { domain: BlockingDomain; recoverable: boolean; related?: readonly DossierStepId[] }
  /** Domaine déduit du champ fiscal en cause (anomalies de validation F-006 / F-007). */
  | { byField: true };

const NOT_RECOVERABLE = false;

/**
 * Table EXHAUSTIVE des codes réellement produits (fiscal-consolidation, property-immobilisations, service workspace,
 * resolveConsolidationInput, readBienDrafts / property-scope). Un test verrouille cette exhaustivité sur le code des producteurs.
 */
export const BLOCKING_REASON_ROUTES: Readonly<Record<string, Route>> = {
  // Invariants du dossier / de la portée de bien (état invalide : aucune interface de correction).
  no_property: { domain: "workspace", recoverable: NOT_RECOVERABLE },
  ambiguous: { domain: "workspace", recoverable: NOT_RECOVERABLE },
  unknown_property: { domain: "workspace", recoverable: NOT_RECOVERABLE },
  not_in_fiscal_year: { domain: "workspace", recoverable: NOT_RECOVERABLE },
  inconsistent_scope: { domain: "workspace", recoverable: NOT_RECOVERABLE },
  unknown_bien: { domain: "workspace", recoverable: NOT_RECOVERABLE },
  legacy_and_scoped_conflict: { domain: "workspace", recoverable: NOT_RECOVERABLE },
  missing_bien: { domain: "workspace", recoverable: NOT_RECOVERABLE },
  duplicate_property: { domain: "workspace", recoverable: NOT_RECOVERABLE },
  exercise_mismatch: { domain: "workspace", recoverable: NOT_RECOVERABLE },
  non_finite_amount: { domain: "workspace", recoverable: NOT_RECOVERABLE },
  foreign_property_asset: { domain: "workspace", recoverable: NOT_RECOVERABLE },
  multi_property_consolidation_not_supported: { domain: "workspace", recoverable: NOT_RECOVERABLE },
  // Documents : aucune interface d'attribution aujourd'hui.
  unattributed_documents: { domain: "workspace", recoverable: NOT_RECOVERABLE },
  // Ouverture / continuation scalaire : R2C.5.
  exercise_opening_not_attributable: { domain: "workspace", recoverable: NOT_RECOVERABLE },
  // Origine du bien (acquisition) : non persistée avant la persistance d'origine ; reprise sans ouverture : R2C.5.
  entry_mode_unknown: { domain: "logement", recoverable: NOT_RECOVERABLE },
  missing_entry_mode: { domain: "logement", recoverable: NOT_RECOVERABLE },
  takeover_without_opening: { domain: "logement", recoverable: NOT_RECOVERABLE },
  opening_conflict: { domain: "amortissement", recoverable: NOT_RECOVERABLE },
  IMMOBILISATIONS_CONTINUITY_RECONCILIATION_FAILED: { domain: "amortissement", recoverable: NOT_RECOVERABLE },
  // F010 — logement (plan d'amortissement, date de mise en service).
  service_date_missing: { domain: "logement", recoverable: true },
  service_date_before_activity_start: { domain: "logement", recoverable: true, related: ["activite"] },
  property_immobilisations_not_established: { domain: "logement", recoverable: true },
  duplicate_asset_key: { domain: "logement", recoverable: NOT_RECOVERABLE },
  // F011 — crédit.
  credit_state_unknown: { domain: "credit", recoverable: true },
  credit_state_ambiguous: { domain: "credit", recoverable: true },
  duplicate_loan_key: { domain: "credit", recoverable: NOT_RECOVERABLE },
  unsupported_shared_loan: { domain: "credit", recoverable: NOT_RECOVERABLE },
  // F012 — charges.
  taxe_fonciere_integrity_unresolved: { domain: "charges", recoverable: true },
  charges_nature_needs_review: { domain: "charges", recoverable: NOT_RECOVERABLE },
  legacy_charges_nature_unreviewed: { domain: "charges", recoverable: NOT_RECOVERABLE },
  common_charges_not_supported: { domain: "charges", recoverable: NOT_RECOVERABLE },
  // INT-4.1 — charge d'activité / CFE collectée mais illisible par le proxy historique : refus plutôt qu'omission.
  exact_only_charges_not_supported_by_legacy_proxy: { domain: "charges", recoverable: NOT_RECOVERABLE },
  // F014 — amortissements (R2C.4 : 39C par bien, ARD).
  dotation_missing: { domain: "amortissement", recoverable: true },
  multi_property_historical_ard_not_supported: { domain: "amortissement", recoverable: NOT_RECOVERABLE },
  multi_property_39c_allocation_not_supported: { domain: "amortissement", recoverable: NOT_RECOVERABLE },
  // Anomalies de validation (F-006 / F-007) : domaine déduit du champ en cause.
  property_input_invalid: { byField: true },
  generation_anomaly: { byField: true },
  // Blocage sans raison détaillée du producteur : jamais « bloqué » sans explication.
  generation_blocked: { domain: "workspace", recoverable: NOT_RECOVERABLE },
};

/** Domaine d'assistant d'un champ fiscal (préfixes des anomalies de `validateFiscalInputs` / `validateLiasseInputs`). */
export function domainOfField(field: string | undefined): DossierStepId | undefined {
  if (!field) return undefined;
  if (/^(identite|siret|siren|denomination)/.test(field)) return "activite";
  if (/^(dateMiseEnService|logementAmortissement)/.test(field)) return "logement";
  if (/^(financementCharges|creditFinancing)/.test(field)) return "credit";
  if (/^chargesAssistant/.test(field)) return "charges";
  if (/^revenusAssistant/.test(field)) return "revenus";
  if (/^amortissementAssistant/.test(field)) return "amortissement";
  return undefined;
}

export function classifyBlockingReason(raw: RawBlockingReason): StructuredBlockingReason {
  const route = Object.hasOwn(BLOCKING_REASON_ROUTES, raw.code) ? BLOCKING_REASON_ROUTES[raw.code] : undefined;
  let domain: BlockingDomain = "workspace";
  let recoverable = false;
  let related: readonly DossierStepId[] | undefined;
  if (route && "byField" in route) {
    const fieldDomain = domainOfField(raw.field);
    domain = fieldDomain ?? "workspace";
    recoverable = fieldDomain !== undefined;
  } else if (route) {
    domain = route.domain;
    recoverable = route.recoverable;
    related = route.related;
  }
  return {
    code: raw.code,
    scope: raw.propertyId !== undefined ? "property" : "global",
    ...(raw.propertyId !== undefined ? { propertyId: raw.propertyId } : {}),
    ...(raw.field !== undefined ? { field: raw.field } : {}),
    domain,
    ...(related ? { relatedDomains: related } : {}),
    recoverable,
    known: route !== undefined,
    ...(raw.message !== undefined ? { message: raw.message } : {}),
  };
}

/** Anomalie bloquante d'un chemin sans `blockingReasons` (mono historique, F-006 / liasse) → raison structurée routée par champ. */
export function classifyAnomaly(anomaly: Pick<Anomaly, "field" | "message">): StructuredBlockingReason {
  return classifyBlockingReason({
    code: "generation_anomaly",
    ...(anomaly.field ? { field: anomaly.field } : {}),
    ...(anomaly.message ? { message: anomaly.message } : {}),
  });
}

const compare = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/** Déduplique et trie de façon déterministe (indépendant de l'ordre des biens et de l'ordre de production). */
export function normalizeBlockingReasons(reasons: readonly StructuredBlockingReason[]): StructuredBlockingReason[] {
  const seen = new Set<string>();
  const unique = reasons.filter((reason) => {
    const key = [reason.code, reason.propertyId ?? "", reason.field ?? "", reason.message ?? ""].join("\u0000");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return unique.sort(
    (a, b) =>
      compare(a.propertyId ?? "", b.propertyId ?? "") ||
      compare(a.code, b.code) ||
      compare(a.field ?? "", b.field ?? "") ||
      compare(a.message ?? "", b.message ?? ""),
  );
}
