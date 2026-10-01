/**
 * R1 — BienDraft : données d'un exercice propres à UN bien, regroupées sous `draft.biens[propertyId]`.
 *
 * Le bien est l'unité de calcul ; l'activité est l'unité de déclaration. Restent au niveau exercice : F009 / activité
 * (dont la date de début d'activité), les charges réellement communes, l'option frais d'acquisition (globale), et toutes
 * les sorties consolidées (fiscalResult, RFS, liasse, déclaration, bilan).
 *
 * Compatibilité : un dossier historique mono-bien (champs à plat, sans `biens`) est LU comme un BienDraft unique par
 * projection pure — aucune écriture, aucune copie, aucune valeur inventée. `draft.biens` n'a encore aucun écrivain en
 * production : les fonctions d'écriture ci-dessous sont des contrats purs, testés, pour le lot suivant.
 */
import { buildDownstreamInvalidationPatch } from "../services/dossier/declaration-draft-invalidation";
import type { PersistedWorkspace } from "../store/persistence";
import type { DeclarationDraft } from "../types";
import { resolveDocumentScope, resolveExerciseScope, resolvePropertyScope, type PropertyScopeFailure } from "./property-scope";

/** Champs F010–F014 propres au bien, avec leurs types d'origine (aucune duplication). */
export const BIEN_DRAFT_FIELDS = [
  "dateMiseEnService",
  "logementAssistantState",
  "logementAmortissement",
  "logementConfirmedAt",
  "financementAssistantState",
  "financementCharges",
  "creditConfirmedAt",
  "creditDeclaredNoneAt",
  "chargesAssistantState",
  "chargesAssistant",
  "chargesConfirmedAt",
  "revenueGptSession",
  "revenusAssistant",
  "revenusConfirmedAt",
  "amortissementAssistant",
  "amortissementConfirmedAt",
] as const satisfies readonly (keyof DeclarationDraft)[];

export type BienDraftField = (typeof BIEN_DRAFT_FIELDS)[number];

/** Étapes de parcours propres au bien (les autres — activité, validation… — restent au niveau exercice). */
export const BIEN_STEP_IDS = [
  "logement",
  "logement-assistant",
  "credit",
  "financement-assistant",
  "charges",
  "charges-assistant",
  "revenus",
  "revenus-assistant",
  "amortissement",
  "amortissement-assistant",
] as const;

/** Sorties consolidées : invalidées au niveau exercice, jamais portées par un bien. */
const CONSOLIDATED_FIELDS = ["fiscalResult", "rfs", "liasseResult", "liasseRfs"] as const satisfies readonly (keyof DeclarationDraft)[];

/**
 * Traçabilité par bien des amortissements différés (R0.6.1). Aucun montant n'est jamais déduit ni réparti ici :
 * `etabli` n'est posé que sur une source explicite ; la consommation future par bien reste fiscalement non établie.
 */
export type SuiviAmortissementsDifferes =
  | { status: "non_etabli"; raison: string }
  | { status: "etabli"; exercice: number; fractionEcartee: number; source: string };

export type BienDraft = Partial<Pick<DeclarationDraft, BienDraftField>> & {
  propertyId: string;
  suiviAmortissementsDifferes?: SuiviAmortissementsDifferes;
  documentIds: string[];
  completedSteps: string[];
};

export type BienDraftFailure = PropertyScopeFailure | "legacy_and_scoped_conflict" | "unknown_bien";

export type BienDraftsView =
  | { mode: "none" }
  | { mode: "legacy_mono"; biens: Record<string, BienDraft> }
  | { mode: "scoped"; biens: Record<string, BienDraft> }
  | { mode: "unresolved"; reason: BienDraftFailure };

type BienWorkspace = Pick<PersistedWorkspace, "properties" | "fiscalYear" | "documents" | "declarationDraft">;

const STEP_SET: ReadonlySet<string> = new Set(BIEN_STEP_IDS);

export function createBienDraft(propertyId: string): BienDraft {
  return { propertyId, documentIds: [], completedSteps: [] };
}

function hasLegacyBienData(draft: DeclarationDraft | undefined): boolean {
  return draft !== undefined && BIEN_DRAFT_FIELDS.some((field) => draft[field] !== undefined);
}

function documentIdsFor(workspace: BienWorkspace, propertyId: string): string[] {
  return workspace.documents
    .filter((document) => {
      const scope = resolveDocumentScope(workspace, document);
      return scope.kind === "property" && scope.propertyId === propertyId;
    })
    .map((document) => document.id);
}

/** Projection pure d'un draft historique à plat vers le BienDraft du bien unique. Seules les valeurs présentes. */
function projectLegacyMonoBien(workspace: BienWorkspace, propertyId: string): BienDraft {
  const draft = workspace.declarationDraft;
  const bien: BienDraft = {
    propertyId,
    documentIds: documentIdsFor(workspace, propertyId),
    completedSteps: (draft?.completedSteps ?? []).filter((step) => STEP_SET.has(step)),
  };
  for (const field of BIEN_DRAFT_FIELDS) {
    const value = draft?.[field];
    if (value !== undefined) Object.assign(bien, { [field]: value });
  }
  return bien;
}

/** Lecture des BienDraft de l'exercice. Pure : n'écrit jamais, ne persiste jamais `biens`. Fail-closed. */
export function readBienDrafts(workspace: BienWorkspace): BienDraftsView {
  const draft = workspace.declarationDraft;
  const scope = resolveExerciseScope(workspace);
  if (draft?.biens !== undefined) {
    if (hasLegacyBienData(draft)) return { mode: "unresolved", reason: "legacy_and_scoped_conflict" };
    if (scope.kind === "inconsistent") return { mode: "unresolved", reason: "inconsistent_scope" };
    const known = new Set(workspace.fiscalYear.propertyIds);
    const valid = Object.entries(draft.biens).every(([key, bien]) => known.has(key) && bien.propertyId === key);
    if (!valid) return { mode: "unresolved", reason: "unknown_bien" };
    return { mode: "scoped", biens: draft.biens };
  }
  switch (scope.kind) {
    case "mono":
      return { mode: "legacy_mono", biens: { [scope.propertyId]: projectLegacyMonoBien(workspace, scope.propertyId) } };
    case "none":
      return hasLegacyBienData(draft) ? { mode: "unresolved", reason: "no_property" } : { mode: "none" };
    case "multi":
      return hasLegacyBienData(draft) ? { mode: "unresolved", reason: "ambiguous" } : { mode: "scoped", biens: {} };
    case "inconsistent":
      return { mode: "unresolved", reason: "inconsistent_scope" };
  }
}

export type BienDraftResult =
  | { ok: true; bien: BienDraft; source: "legacy_mono" | "scoped" }
  | { ok: false; reason: BienDraftFailure };

/** BienDraft d'un bien. `propertyId` absent : résolu seulement en mono-bien, jamais vers le premier bien. */
export function getBienDraft(workspace: BienWorkspace, propertyId?: string | null): BienDraftResult {
  const resolution = resolvePropertyScope(workspace, propertyId);
  if (!resolution.ok) return { ok: false, reason: resolution.reason };
  const view = readBienDrafts(workspace);
  if (view.mode === "unresolved") return { ok: false, reason: view.reason };
  if (view.mode === "none") return { ok: false, reason: "no_property" };
  const bien = view.biens[resolution.propertyId];
  return bien ? { ok: true, bien, source: view.mode } : { ok: false, reason: "unknown_bien" };
}

export type BienDraftWrite =
  | { ok: true; draft: DeclarationDraft }
  | { ok: false; reason: BienDraftFailure | "already_scoped" | "not_mono" };

/**
 * Migration pure et idempotente d'un dossier mono historique vers `draft.biens` : les champs du bien sont DÉPLACÉS
 * (jamais copiés) sous le bien unique. Non appelée à l'hydratation ; réservée à un écrivain explicite.
 */
export function migrateLegacyMonoToBiens(workspace: BienWorkspace): BienDraftWrite {
  const draft = workspace.declarationDraft ?? { completedSteps: [] };
  const view = readBienDrafts(workspace);
  if (view.mode === "scoped") return { ok: true, draft };
  if (view.mode === "unresolved") return { ok: false, reason: view.reason };
  if (view.mode !== "legacy_mono") return { ok: false, reason: "not_mono" };
  const next: DeclarationDraft = {
    ...draft,
    completedSteps: draft.completedSteps.filter((step) => !STEP_SET.has(step)),
    biens: view.biens,
  };
  for (const field of BIEN_DRAFT_FIELDS) delete next[field];
  return { ok: true, draft: next };
}

export type BienPatch = Partial<Pick<DeclarationDraft, BienDraftField>>;

export type BienPatchResult =
  | { ok: true; draft: DeclarationDraft; consolidatedOutputsStale: boolean }
  | { ok: false; reason: BienDraftFailure | "not_scoped" };

/**
 * Écriture d'une donnée propre à UN bien, avec ses invalidations intra-bien (règles existantes Lot 4, inchangées).
 * Les autres biens ne sont jamais touchés ; seules les sorties consolidées de l'exercice peuvent être invalidées.
 */
export function applyBienPatch(workspace: BienWorkspace, propertyId: string, patch: BienPatch): BienPatchResult {
  const resolution = resolvePropertyScope(workspace, propertyId);
  if (!resolution.ok) return { ok: false, reason: resolution.reason };
  const view = readBienDrafts(workspace);
  if (view.mode === "unresolved") return { ok: false, reason: view.reason };
  if (view.mode !== "scoped") return { ok: false, reason: "not_scoped" };
  const current = view.biens[propertyId];
  if (!current) return { ok: false, reason: "unknown_bien" };

  const invalidation = buildDownstreamInvalidationPatch(current as unknown as DeclarationDraft, patch);
  const bienInvalidation: Partial<BienDraft> = {};
  const consolidatedInvalidation: Partial<DeclarationDraft> = {};
  for (const [key, value] of Object.entries(invalidation)) {
    if ((CONSOLIDATED_FIELDS as readonly string[]).includes(key)) Object.assign(consolidatedInvalidation, { [key]: value });
    else Object.assign(bienInvalidation, { [key]: value });
  }
  const nextBien: BienDraft = { ...current, ...patch, ...bienInvalidation, propertyId };
  const changed = (Object.keys(patch) as BienDraftField[]).some(
    (key) => JSON.stringify(current[key]) !== JSON.stringify(patch[key]),
  );
  const draft = workspace.declarationDraft!;
  return {
    ok: true,
    draft: { ...draft, ...consolidatedInvalidation, biens: { ...view.biens, [propertyId]: nextBien } },
    consolidatedOutputsStale: changed || Object.keys(invalidation).length > 0,
  };
}

/**
 * Vue « à plat » d'UN bien scopé : champs de l'exercice + champs de CE bien. Composition de champs DISJOINTS (en mode
 * scopé, aucun champ de bien n'existe à plat — sinon conflit), jamais un repli : un champ absent du bien reste absent.
 */
function exerciseViewOfBien(draft: DeclarationDraft, bien: BienDraft): DeclarationDraft {
  const view: DeclarationDraft = { ...draft, completedSteps: [...new Set([...draft.completedSteps, ...bien.completedSteps])] };
  delete view.biens;
  for (const field of BIEN_DRAFT_FIELDS) {
    if (bien[field] !== undefined) Object.assign(view, { [field]: bien[field] });
  }
  return view;
}

export type BienReadFailure = "no_property" | "ambiguous" | "inconsistent" | "conflict" | "unknown_property";

/**
 * R2A — lecture d'un bien pour les lecteurs propriétaires. `view` a la forme d'un DeclarationDraft :
 * - legacy mono : le draft historique LUI-MÊME (même objet, aucune copie) ;
 * - scopé : exercice + `draft.biens[propertyId]`, jamais un champ de bien à plat.
 * En multi-bien, les champs hors BIEN_DRAFT_FIELDS de `view` restent ceux de l'exercice (non attribuables au bien).
 * Pure : ne mute ni ne persiste rien ; ne choisit jamais le premier bien.
 */
export type BienRead =
  | { status: "resolved"; propertyId: string; source: "legacy_mono" | "scoped"; bien: BienDraft; view: DeclarationDraft | undefined }
  | { status: BienReadFailure; reason: BienDraftFailure };

const READ_FAILURES: Record<BienDraftFailure, BienReadFailure> = {
  no_property: "no_property",
  ambiguous: "ambiguous",
  inconsistent_scope: "inconsistent",
  legacy_and_scoped_conflict: "conflict",
  unknown_property: "unknown_property",
  not_in_fiscal_year: "unknown_property",
  unknown_bien: "unknown_property",
};

export function resolveBienDraftForRead(workspace: BienWorkspace, requestedPropertyId?: string | null): BienRead {
  const result = getBienDraft(workspace, requestedPropertyId);
  if (!result.ok) return { status: READ_FAILURES[result.reason], reason: result.reason };
  const view = result.source === "legacy_mono"
    ? workspace.declarationDraft
    : exerciseViewOfBien(workspace.declarationDraft ?? { completedSteps: [] }, result.bien);
  return { status: "resolved", propertyId: result.bien.propertyId, source: result.source, bien: result.bien, view };
}

export type ConsolidationBlock =
  | "no_property"
  | "multi_property_consolidation_not_supported"
  | "unattributed_documents"
  | BienDraftFailure;

/**
 * Contrat de consolidation : UNE déclaration pour l'activité, jamais une par bien. `draft` est la vue à plat lue par
 * F006/F007 inchangés. Plusieurs biens : bloqué tant que la consolidation multi-bien (et TRF-0035) n'existe pas.
 */
export type ConsolidationInput =
  | { kind: "single_declaration"; fiscalYearId: string; propertyIds: string[]; draft: DeclarationDraft }
  | { kind: "blocked"; reasons: ConsolidationBlock[] };

export function resolveConsolidationInput(workspace: BienWorkspace): ConsolidationInput {
  const reasons: ConsolidationBlock[] = [];
  if (workspace.documents.some((document) => resolveDocumentScope(workspace, document).kind === "unresolved")) {
    reasons.push("unattributed_documents");
  }
  const view = readBienDrafts(workspace);
  const draft = workspace.declarationDraft ?? { completedSteps: [] };
  let single: ConsolidationInput | undefined;
  if (view.mode === "unresolved") reasons.unshift(view.reason);
  else if (view.mode === "none") reasons.unshift("no_property");
  else if (view.mode === "legacy_mono") {
    single = { kind: "single_declaration", fiscalYearId: workspace.fiscalYear.id, propertyIds: Object.keys(view.biens), draft };
  } else {
    const entries = Object.values(view.biens);
    if (entries.length !== 1 || workspace.fiscalYear.propertyIds.length !== 1) {
      reasons.unshift(entries.length === 0 && workspace.fiscalYear.propertyIds.length === 0 ? "no_property" : "multi_property_consolidation_not_supported");
    } else {
      const bien = entries[0]!;
      single = { kind: "single_declaration", fiscalYearId: workspace.fiscalYear.id, propertyIds: [bien.propertyId], draft: exerciseViewOfBien(draft, bien) };
    }
  }
  if (reasons.length > 0 || !single) return { kind: "blocked", reasons };
  return single;
}
