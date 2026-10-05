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
import type { DeclarationDraft, Property } from "../types";
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
  // F013 v2 (V2.2) — rapprochement des loyers du bien (faits + révision + confirmation).
  "rentReconciliationV2",
  "amortissementAssistant",
  "amortissementConfirmedAt",
  // R2B.2a — crédit et faits d'acquisition propres au bien (décision PO R2B.1).
  "creditFinancing",
  "creditGptSession",
  "creditDocumentId",
  "propertyBackgroundExtraction",
  // R2B.2b — verrous de champs issus des documents du bien (tunnels Logement / Crédit : acte, prêt).
  "governedFields",
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

/**
 * R2B.2a — les charges d'un dossier mono historique mêlent possiblement des charges réellement communes : leur nature
 * n'est pas connue. Après ADD_PROPERTY elles restent sur A, intactes, mais marquées à revoir — jamais ventilées.
 */
export type ChargesNatureReview = { status: "needs_review"; reason: "legacy_mono_charges_nature_unknown" };

/** La vérité du rattachement documentaire reste `documents[].propertyId` : aucune liste de documents ici. */
export type BienDraft = Partial<Pick<DeclarationDraft, BienDraftField>> & {
  propertyId: string;
  suiviAmortissementsDifferes?: SuiviAmortissementsDifferes;
  chargesNatureReview?: ChargesNatureReview;
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
  return { propertyId, completedSteps: [] };
}

function hasLegacyBienData(draft: DeclarationDraft | undefined): boolean {
  return draft !== undefined && BIEN_DRAFT_FIELDS.some((field) => draft[field] !== undefined);
}

/** Projection pure d'un draft historique à plat vers le BienDraft du bien unique. Seules les valeurs présentes. */
function projectLegacyMonoBien(workspace: BienWorkspace, propertyId: string): BienDraft {
  const draft = workspace.declarationDraft;
  const bien: BienDraft = {
    propertyId,
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
  | "legacy_charges_nature_unreviewed"
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
  if (view.mode === "scoped" && Object.values(view.biens).some((bien) => bien.chargesNatureReview?.status === "needs_review")) {
    reasons.push("legacy_charges_nature_unreviewed");
  }
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

// ---------------------------------------------------------------------------
// R2B.2a — fondation d'écriture (dormante : seul ADD_PROPERTY fait passer un dossier en mode scopé).
// ---------------------------------------------------------------------------

/**
 * Champs du Tunnel A historique. Après migration ils restent GELÉS à la racine (aucune perte de donnée legacy), mais
 * le Tunnel A est bloqué en mode scopé : toute mutation de ces champs y est refusée.
 */
export const TUNNEL_A_FROZEN_FIELDS = [
  "logementDocumentId",
  "logementWorkspaceForm",
  "creditWorkspaceForm",
  "creditUserValidatedFields",
  "amortissementExistingActivity",
  "amortissementContinuityDocumentIds",
  "amortissementTravauxDocumentIds",
  "amortissementMobilierDocumentIds",
  "amortissementDocumentIds",
  "amortissementVentilation",
  "amortissementExtractedInvoices",
  "revenusDocumentIds",
  "revenusExtraction",
  "chargesDocumentIds",
  "chargesCrossStepRecoveryEnabled",
  "chargesExtraction",
  "chargesAmortizationDecisions",
  "amortissementFromCharges",
  // R2B.2b — progression du parcours documentaire Tunnel A (lue uniquement par ce parcours).
  "documentStepsCompleted",
] as const satisfies readonly (keyof DeclarationDraft)[];

const BIEN_FIELD_SET: ReadonlySet<string> = new Set(BIEN_DRAFT_FIELDS);
const TUNNEL_A_FIELD_SET: ReadonlySet<string> = new Set(TUNNEL_A_FROZEN_FIELDS);

export function isBienDraftField(key: string): key is BienDraftField {
  return BIEN_FIELD_SET.has(key);
}

export function isTunnelAFrozenField(key: string): boolean {
  return TUNNEL_A_FIELD_SET.has(key);
}

export function isBienStep(stepId: string): boolean {
  return STEP_SET.has(stepId);
}

type F009StateLike = {
  step?: string;
  dateMiseEnService?: string;
  confirmed?: Record<string, unknown>;
  inputs?: Record<string, Record<string, string> | undefined>;
};

/** F009 porte-t-il encore une représentation de la date de mise en service (propre au bien) ? */
function f009CarriesServiceDate(state: F009StateLike | undefined): boolean {
  return state !== undefined && (
    state.dateMiseEnService !== undefined || state.confirmed?.dateMiseEnService !== undefined || state.inputs?.service_date !== undefined
  );
}

/** Une saisie F009 de la date est en cours et diffère de la date retenue : la migrer la perdrait. */
function f009ServiceDatePending(state: F009StateLike | undefined, retained: string | undefined): boolean {
  if (!state) return false;
  if (state.step === "service_date") return true;
  if (state.dateMiseEnService !== undefined && state.dateMiseEnService !== retained) return true;
  const typed = state.inputs?.service_date?.date;
  return typed !== undefined && typed !== retained;
}

/** Retire de l'état F009 toute représentation de la date de mise en service ; le reste est conservé. */
function withoutF009ServiceDate<T>(state: T): T {
  const next = { ...(state as F009StateLike) };
  delete next.dateMiseEnService;
  if (next.confirmed) {
    const confirmed = { ...next.confirmed };
    delete confirmed.dateMiseEnService;
    next.confirmed = confirmed;
  }
  if (next.inputs) {
    const inputs = { ...next.inputs };
    delete inputs.service_date;
    next.inputs = inputs;
  }
  return next as T;
}

export type OptionFraisAcquisition = NonNullable<DeclarationDraft["optionFraisAcquisition"]>;

/**
 * Option frais d'acquisition du bien historique, lue telle quelle dans l'état F010 : choix courant, sinon choix
 * historique déjà traité. Deux sources contradictoires → `contradiction` (jamais un choix automatique).
 */
function legacyAcquisitionOption(draft: DeclarationDraft):
  | { kind: "none" }
  | { kind: "found"; choix: OptionFraisAcquisition["choix"] }
  | { kind: "contradiction" } {
  const state = draft.logementAssistantState;
  const current = state?.choixTraitementFrais;
  const historical = state?.fraisAcquisitionHistoriques?.traitement;
  if (current !== undefined && historical !== undefined && current !== historical) return { kind: "contradiction" };
  const choix = current ?? historical;
  return choix === undefined ? { kind: "none" } : { kind: "found", choix };
}

function hasChargesData(bien: BienDraft, draft: DeclarationDraft): boolean {
  return bien.chargesAssistant !== undefined || bien.chargesAssistantState !== undefined ||
    bien.chargesConfirmedAt !== undefined || draft.chargesExtraction !== undefined;
}

type AddPropertyWorkspace = Pick<PersistedWorkspace, "properties" | "fiscalYear" | "documents" | "declarationDraft">;

export type AddPropertyFailure =
  | "fiscal_year_locked"
  | "invalid_property"
  | "property_exists"
  | "pending_service_date_change"
  | "acquisition_option_ambiguous"
  | "invariant_violation"
  | BienDraftFailure
  | "not_mono"
  | "unsupported_scope";

/**
 * ADD_PROPERTY — transition ATOMIQUE et pure. Legacy mono A → scopé A + B : A garde exactement ses valeurs (déplacées,
 * jamais copiées), l'option frais devient globale, la date de mise en service quitte F009, les charges de A sont
 * marquées à revoir, les documents sans bien sont rattachés à A (seul bien jusqu'ici), B démarre vide. Scopé : ajout
 * de B seul. Toute précondition non remplie → échec, rien n'est produit.
 */
export function addPropertyToWorkspace<W extends AddPropertyWorkspace>(
  workspace: W,
  property: Property,
): { ok: true; workspace: W } | { ok: false; reason: AddPropertyFailure } {
  const fiscalYear = workspace.fiscalYear;
  if (fiscalYear.status === "closed" || fiscalYear.paidAt || fiscalYear.transmittedAt) {
    return { ok: false, reason: "fiscal_year_locked" };
  }
  if (typeof property?.id !== "string" || !property.id.trim()) return { ok: false, reason: "invalid_property" };
  if (workspace.properties.some((item) => item.id === property.id) || fiscalYear.propertyIds.includes(property.id)) {
    return { ok: false, reason: "property_exists" };
  }

  const view = readBienDrafts(workspace);
  if (view.mode === "unresolved") return { ok: false, reason: view.reason };
  if (view.mode !== "legacy_mono" && view.mode !== "scoped") return { ok: false, reason: "unsupported_scope" };
  const current = workspace.declarationDraft ?? { completedSteps: [] };

  let draft: DeclarationDraft;
  let documents = workspace.documents;
  if (view.mode === "legacy_mono") {
    const [existingId] = Object.keys(view.biens);
    if (existingId === undefined) return { ok: false, reason: "not_mono" };
    const f009 = current.activiteAssistantState as F009StateLike | undefined;
    if (f009ServiceDatePending(f009, current.dateMiseEnService)) return { ok: false, reason: "pending_service_date_change" };
    const option = legacyAcquisitionOption(current);
    if (option.kind === "contradiction") return { ok: false, reason: "acquisition_option_ambiguous" };

    const migrated = migrateLegacyMonoToBiens(workspace);
    if (!migrated.ok) return { ok: false, reason: migrated.reason === "already_scoped" ? "unsupported_scope" : migrated.reason };
    const existing = migrated.draft.biens![existingId]!;
    const reviewed: BienDraft = hasChargesData(existing, current)
      ? { ...existing, chargesNatureReview: { status: "needs_review", reason: "legacy_mono_charges_nature_unknown" } }
      : existing;
    draft = {
      ...migrated.draft,
      ...(f009 ? { activiteAssistantState: withoutF009ServiceDate(current.activiteAssistantState) } : {}),
      ...(option.kind === "found" ? { optionFraisAcquisition: { choix: option.choix, sourcePropertyId: existingId } } : {}),
      biens: { ...migrated.draft.biens, [existingId]: reviewed },
    };
    // Mono historique : un document sans bien appartenait déterministement au seul bien (contrat R1) — sauf le
    // document d'activité (lien F009 explicite `inpiDocumentId`), qui reste commun à l'exercice.
    documents = workspace.documents.map((document) =>
      document.propertyId === undefined && document.id !== current.inpiDocumentId ? { ...document, propertyId: existingId } : document);
  } else {
    draft = { ...current };
  }

  draft = { ...draft, biens: { ...draft.biens, [property.id]: createBienDraft(property.id) } };
  for (const field of CONSOLIDATED_FIELDS) delete draft[field];
  const next: W = {
    ...workspace,
    properties: [...workspace.properties, property],
    documents,
    fiscalYear: { ...fiscalYear, propertyIds: [...fiscalYear.propertyIds, property.id], declarationGeneratedAt: undefined },
    declarationDraft: draft,
  };
  if (scopedInvariantViolation(next) !== null) return { ok: false, reason: "invariant_violation" };
  return { ok: true, workspace: next };
}

/** Vue « à plat » (exercice + ce bien) d'un dossier scopé, pour réutiliser telles quelles les règles historiques. */
export function scopedBienView(draft: DeclarationDraft, propertyId: string): DeclarationDraft | undefined {
  const bien = draft.biens?.[propertyId];
  return bien ? exerciseViewOfBien(draft, bien) : undefined;
}

/**
 * Inverse de `scopedBienView` : redistribue une vue modifiée — champs du bien et étapes du bien → `biens[propertyId]`,
 * le reste → racine. Les autres biens sont repris à l'identique (même référence).
 */
export function scatterBienView(scopedDraft: DeclarationDraft, propertyId: string, view: DeclarationDraft): DeclarationDraft {
  const previous = scopedDraft.biens?.[propertyId];
  const bien: BienDraft = {
    propertyId,
    completedSteps: view.completedSteps.filter((step) => STEP_SET.has(step)),
    ...(previous?.suiviAmortissementsDifferes ? { suiviAmortissementsDifferes: previous.suiviAmortissementsDifferes } : {}),
    ...(previous?.chargesNatureReview ? { chargesNatureReview: previous.chargesNatureReview } : {}),
  };
  const root: DeclarationDraft = { ...view, completedSteps: view.completedSteps.filter((step) => !STEP_SET.has(step)) };
  for (const field of BIEN_DRAFT_FIELDS) {
    if (view[field] !== undefined) Object.assign(bien, { [field]: view[field] });
    delete root[field];
  }
  return { ...root, biens: { ...scopedDraft.biens, [propertyId]: bien } };
}

/** Choix de traitement des frais portés par l'état F010 d'un bien (choix courant et choix historique N+1). */
export function acquisitionChoicesOf(bien: BienDraft): Array<"integration" | "deduction"> {
  const state = bien.logementAssistantState;
  return [state?.choixTraitementFrais, state?.fraisAcquisitionHistoriques?.traitement]
    .filter((choix): choix is "integration" | "deduction" => choix !== undefined);
}

export type ScopedInvariantViolation =
  | "not_scoped"
  | "flat_bien_field"
  | "f009_service_date"
  | "credit_document_scope"
  | "acquisition_option_divergence"
  | "foreign_revenue_session";

/**
 * Invariant ABSOLU d'un dossier scopé : lisible en mode scopé (aucun conflit, biens connus de l'exercice), aucun champ
 * du bien à plat, aucune date de mise en service dans F009, chaque document de prêt rattaché à SON bien.
 */
export function scopedInvariantViolation(workspace: BienWorkspace): ScopedInvariantViolation | null {
  const draft = workspace.declarationDraft;
  if (!draft?.biens || readBienDrafts(workspace).mode !== "scoped") return "not_scoped";
  if (BIEN_DRAFT_FIELDS.some((field) => draft[field] !== undefined)) return "flat_bien_field";
  if (f009CarriesServiceDate(draft.activiteAssistantState as F009StateLike | undefined)) return "f009_service_date";
  // Option frais globale (une seule vérité) : établie → aucun choix de bien ne la contredit ; non établie → deux
  // biens confirmés ne peuvent pas porter deux choix différents.
  const option = draft.optionFraisAcquisition;
  const confirmedChoices = new Set<string>();
  for (const bien of Object.values(draft.biens)) {
    const choices = acquisitionChoicesOf(bien);
    if (option && choices.some((choix) => choix !== option.choix)) return "acquisition_option_divergence";
    if (bien.logementConfirmedAt !== undefined || bien.logementAmortissement !== undefined) choices.forEach((choix) => confirmedChoices.add(choix));
  }
  if (confirmedChoices.size > 1) return "acquisition_option_divergence";
  for (const [propertyId, bien] of Object.entries(draft.biens)) {
    // La session de revenus d'un bien ne représente que ce bien.
    if ((bien.revenueGptSession?.properties ?? []).some((session) => session.propertyId !== undefined && session.propertyId !== propertyId)) {
      return "foreign_revenue_session";
    }
    if (bien.creditDocumentId === undefined) continue;
    const document = workspace.documents.find((item) => item.id === bien.creditDocumentId);
    // Référence historique vers un document supprimé : aucune attribution à contredire (REMOVE_DOCUMENT ne l'efface pas).
    if (!document) continue;
    const scope = resolveDocumentScope(workspace, document);
    if (scope.kind !== "property" || scope.propertyId !== propertyId) return "credit_document_scope";
  }
  return null;
}
