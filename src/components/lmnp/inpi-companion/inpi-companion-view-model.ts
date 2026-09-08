/**
 * Compagnon INPI — modèle de vue pur (Phase 4.3).
 *
 * Toute la logique de dérivation vit ici, hors de tout composant React, pour
 * que `InpiCompanionPanel.tsx` reste un composant de rendu sans logique
 * fiscale (§ Phase 4.3, "COMPOSANT PRINCIPAL"). Ce module lit des données
 * déjà disponibles côté client (`DeclarationDraft`, `workspace.properties`,
 * le miroir `dossierInpiStatus` de `useLmnp()`) — il n'invente aucune
 * source, n'écrit rien lui-même, et ne duplique aucune valeur métier dans
 * l'état qu'il construit pour `inpiCompanionState`.
 */

import type { DeclarationDraft, Property } from "@/lib/lmnp/types/domain";
import type { InpiStatus } from "@/lib/lmnp/types/dossier";
import {
  resolveInpiCompanionMode,
  resolveNextInpiCompanionStep,
  type InpiCompanionFieldSnapshots,
  type InpiCompanionModeDecision,
  type InpiCompanionStepDecision,
} from "@/runtime/assistants/inpi-companion/engine";
import type {
  InpiCompanionFieldKey,
  InpiCompanionMode,
  InpiCompanionPersistedState,
  InpiCompanionStep,
} from "@/runtime/assistants/inpi-companion/types";

/**
 * Traduit les sources canoniques existantes en "une valeur fiable existe ou
 * non" — jamais "confirmée". `activite` est une inférence produit constante
 * (Fiscal AI n'accompagne que le LMNP réel simplifié en location meublée),
 * jamais lue depuis une source : elle reste toujours 🟠 tant que non
 * confirmée dans le Compagnon. `domiciliation` n'a jamais de source — le
 * moteur (Phase 4.2) l'impose déjà en "missing", `hasReliableValue` y est
 * donc sans effet, gardé à `false` par honnêteté. `documents` se base sur
 * `DeclarationDraft.inpiDocumentId` (déjà écrit par le parcours F009
 * document-first) — `LmnpDocument.documentType`/`DocumentCategory`
 * (domain.ts) ne portent aucune valeur "inpi" : cette catégorie n'existe
 * que dans une taxonomie de classification distincte, non rattachée aux
 * documents du workspace LMNP, donc jamais utilisée ici.
 */
export function deriveInpiCompanionFieldSnapshots(
  draft: DeclarationDraft | undefined,
): InpiCompanionFieldSnapshots {
  return {
    identite: { hasReliableValue: Boolean(draft?.exploitantFirstName && draft?.exploitantLastName) },
    activite: { hasReliableValue: true },
    date_debut: { hasReliableValue: Boolean(draft?.activityStartDate) },
    etablissement: { hasReliableValue: Boolean(draft?.establishmentAddress) },
    siren_siret: { hasReliableValue: Boolean(draft?.siret) },
    regime: { hasReliableValue: Boolean(draft?.activiteAssistantState?.regimeFiscal) },
    domiciliation: { hasReliableValue: false },
    documents: { hasReliableValue: Boolean(draft?.inpiDocumentId) },
  };
}

/** Même formule que `validation-profile.ts` (`properties.length > 1`) — aucune nouvelle source de vérité, juste répliquée ici faute d'accès client à ce module. */
export function resolveIsMultiProperty(properties: readonly Property[]): boolean {
  return properties.length > 1;
}

export type InpiCompanionView = {
  modeDecision: InpiCompanionModeDecision;
  stepDecision: InpiCompanionStepDecision | null;
  fields: InpiCompanionFieldSnapshots;
  isMultiProperty: boolean;
};

export function computeInpiCompanionView(input: {
  draft: DeclarationDraft | undefined;
  properties: readonly Property[];
  dossierInpiStatus: InpiStatus | undefined;
  companionState: InpiCompanionPersistedState | undefined;
}): InpiCompanionView {
  const fields = deriveInpiCompanionFieldSnapshots(input.draft);
  const isMultiProperty = resolveIsMultiProperty(input.properties);
  const modeDecision = resolveInpiCompanionMode({
    dossierInpiStatus: input.dossierInpiStatus,
    companionState: input.companionState,
  });
  const stepDecision = resolveNextInpiCompanionStep({
    mode: modeDecision.mode,
    companionState: input.companionState,
    fields,
    isMultiProperty,
  });
  return { modeDecision, stepDecision, fields, isMultiProperty };
}

/**
 * Valeur à afficher pour un champ — présentation uniquement, jamais une
 * confirmation. `activite`/`domiciliation` n'ont pas de valeur "lue" : la
 * première est une proposition produit constante, la seconde n'a jamais de
 * source (cf. `deriveInpiCompanionFieldSnapshots`).
 */
export function displayValueForField(
  field: InpiCompanionFieldKey,
  draft: DeclarationDraft | undefined,
): string | undefined {
  switch (field) {
    case "identite":
      return draft?.exploitantFirstName && draft?.exploitantLastName
        ? `${draft.exploitantFirstName} ${draft.exploitantLastName}`
        : undefined;
    case "activite":
      return "Location meublée non professionnelle";
    case "date_debut":
      return draft?.activityStartDate;
    case "etablissement":
      return draft?.establishmentAddress
        ? [draft.establishmentAddress, draft.establishmentPostalCode, draft.establishmentCity]
            .filter(Boolean)
            .join(", ")
        : undefined;
    case "siren_siret":
      return draft?.siret;
    case "regime":
      if (draft?.activiteAssistantState?.regimeFiscal === "reel_simplifie") return "Régime réel simplifié";
      if (draft?.activiteAssistantState?.regimeFiscal === "reel_normal") return "Régime réel normal";
      return undefined;
    case "domiciliation":
      return undefined;
    case "documents":
      return undefined;
  }
}

// ─── Construction du prochain inpiCompanionState (pur — la persistance elle-même reste à la charge du composant) ───

function nowIso(): string {
  return new Date().toISOString();
}

export function emptyInpiCompanionState(
  mode: InpiCompanionMode,
  step: InpiCompanionStep,
): InpiCompanionPersistedState {
  return {
    mode,
    step,
    progressStatus: "active",
    history: [],
    confirmedFields: {},
    conflicts: {},
    updatedAt: nowIso(),
  };
}

function withHistory(history: readonly InpiCompanionStep[], step: InpiCompanionStep): InpiCompanionStep[] {
  if (history[history.length - 1] === step) return [...history];
  return [...history, step];
}

/** Le client a confirmé (ou explicitement acté, pour domiciliation) le champ affiché — jamais une valeur métier stockée ici, seulement l'horodatage de confirmation. */
export function withFieldConfirmed(
  state: InpiCompanionPersistedState | undefined,
  mode: InpiCompanionMode,
  step: InpiCompanionStep,
  field: InpiCompanionFieldKey,
): InpiCompanionPersistedState {
  const base = state ?? emptyInpiCompanionState(mode, step);
  const conflicts = { ...base.conflicts };
  delete conflicts[field];
  return {
    ...base,
    mode,
    step,
    progressStatus: "active",
    confirmedFields: { ...base.confirmedFields, [field]: nowIso() },
    conflicts,
    history: withHistory(base.history, step),
    updatedAt: nowIso(),
  };
}

/** Résolution explicite d'un conflit par le client — jamais de sélection automatique. */
export function withConflictResolved(
  state: InpiCompanionPersistedState,
  field: InpiCompanionFieldKey,
): InpiCompanionPersistedState {
  const conflicts = { ...state.conflicts };
  delete conflicts[field];
  return {
    ...state,
    confirmedFields: { ...state.confirmedFields, [field]: nowIso() },
    conflicts,
    updatedAt: nowIso(),
  };
}

/**
 * Départ vers le Guichet unique — signifie UNIQUEMENT que le client a ouvert
 * le site officiel depuis le Compagnon, jamais que la démarche a été
 * commencée/soumise/acceptée (§ 4.3.9).
 */
export function withOfficialSiteOpened(
  state: InpiCompanionPersistedState | undefined,
  mode: InpiCompanionMode,
  step: InpiCompanionStep,
): InpiCompanionPersistedState {
  const base = state ?? emptyInpiCompanionState(mode, step);
  return { ...base, lastOfficialSiteOpenedAt: nowIso(), progressStatus: "active", updatedAt: nowIso() };
}

/** Le client a répondu au bandeau de retour (ou l'a explicitement écarté) — on cesse de le redemander tant qu'un nouveau départ n'a pas eu lieu. */
export function withReturnBannerDismissed(state: InpiCompanionPersistedState): InpiCompanionPersistedState {
  return { ...state, lastOfficialSiteOpenedAt: undefined, updatedAt: nowIso() };
}

/** Le client termine visuellement la préparation (étape "synthese" atteinte) — distingue "en cours" de "prêt", jamais un statut INPI réel. */
export function withPreparationCompleted(state: InpiCompanionPersistedState): InpiCompanionPersistedState {
  return { ...state, progressStatus: "prepared", updatedAt: nowIso() };
}

/** "Recommencer la préparation" — repart à zéro sur la progression du Compagnon uniquement ; ne touche jamais à `Dossier.inpiStatus`. */
export function restartInpiCompanionState(mode: InpiCompanionMode): InpiCompanionPersistedState {
  return emptyInpiCompanionState(mode, "identite");
}

/** Un départ vers INPI a eu lieu et n'a pas encore reçu de réponse du client : c'est le déclencheur du bandeau de retour (§4.3.10). */
export function shouldShowReturnBanner(
  state: InpiCompanionPersistedState | undefined,
  dossierInpiStatusUpdatedAt: string | undefined,
): boolean {
  if (!state?.lastOfficialSiteOpenedAt) return false;
  if (!dossierInpiStatusUpdatedAt) return true;
  return state.lastOfficialSiteOpenedAt > dossierInpiStatusUpdatedAt;
}
