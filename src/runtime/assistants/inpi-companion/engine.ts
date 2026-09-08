/**
 * Compagnon INPI — moteur de décision minimal (Phase 4.2).
 *
 * Pur, déterministe, sans React/navigateur/réseau/chatbot/INPI/paiement/
 * génération fiscale. Répond uniquement à : « avec la situation actuelle du
 * dossier et la progression sauvegardée du Compagnon, quelle est la
 * prochaine étape pertinente ? »
 *
 * Distinction gardée visible partout dans ce fichier :
 *   valeur présente ≠ valeur confirmée dans le Compagnon ≠ information
 *   officiellement enregistrée à l'INPI.
 *
 * Réutilise le vocabulaire de provenance existant (`ActiviteFieldStatus`,
 * import de type uniquement — `activite-field-provenance.ts` n'est ni
 * modifié ni exécuté ici) plutôt que d'inventer un second système 🟢🟠🔴.
 */

import type { InpiStatus } from "@/lib/lmnp/types/dossier";
import type { ActiviteFieldStatus } from "@/lib/lmnp/services/activite-field-provenance";

import {
  shouldResumeInpiCompanion,
  type InpiCompanionConflict,
  type InpiCompanionFieldKey,
  type InpiCompanionMode,
  type InpiCompanionPersistedState,
  type InpiCompanionStep,
} from "./types";

/** Ordre des étapes du parcours CRÉATION/POURSUITE. `synthese` n'y figure pas : c'est la destination, jamais un champ à confirmer. */
export const INPI_COMPANION_STEP_ORDER: readonly InpiCompanionFieldKey[] = [
  "identite",
  "activite",
  "date_debut",
  "etablissement",
  "siren_siret",
  "regime",
  "domiciliation",
  "documents",
];

/** Seuls ces modes suivent une séquence d'étapes ; les autres affichent un écran dédié (voir Phase 3). */
const STEP_BASED_MODES: ReadonlySet<InpiCompanionMode> = new Set(["creation", "poursuite"]);

/**
 * Mapping GELÉ (Phase 3 + Phase 4.2) — ne pas modifier sans revalidation
 * produit explicite.
 */
const INPI_STATUS_TO_MODE: Record<InpiStatus, InpiCompanionMode> = {
  not_started: "creation",
  preparing: "creation",
  in_progress: "poursuite",
  modification_in_progress: "poursuite",
  submitted: "attente",
  regularization_required: "regularisation",
  registered: "verification",
};

function deriveModeFromDossierInpiStatus(status: InpiStatus | undefined): InpiCompanionMode {
  // `undefined` n'est jamais traité comme "not_started" : absence de statut
  // connu ≠ statut "pas commencé" déclaré (cf. Phase 3, scénario 15).
  if (status === undefined) return "diagnostic";
  return INPI_STATUS_TO_MODE[status];
}

/** Étape d'entrée neutre pour un mode fraîchement résolu (non repris). Sans portée hors des modes à étapes — les autres modes affichent leur propre écran, indépendant de ce champ. */
const FRESH_ENTRY_STEP: InpiCompanionStep = "identite";

export type ResolveInpiCompanionModeInput = {
  dossierInpiStatus: InpiStatus | undefined;
  companionState: InpiCompanionPersistedState | undefined;
};

export type InpiCompanionModeDecision = {
  mode: InpiCompanionMode;
  step: InpiCompanionStep;
  /** true si mode/step proviennent de la reprise du Compagnon, jamais recalculés depuis Dossier.inpiStatus dans ce cas. */
  resumed: boolean;
};

/**
 * 4.2.1 — Résolution du mode.
 * Ordre de décision GELÉ : (A) reprise d'un parcours Compagnon inachevé
 * prioritaire, sans jamais interpréter `Dossier.inpiStatus` dans ce cas ;
 * (B) sinon, mapping direct depuis `Dossier.inpiStatus`.
 */
export function resolveInpiCompanionMode(
  input: ResolveInpiCompanionModeInput,
): InpiCompanionModeDecision {
  if (shouldResumeInpiCompanion(input.companionState)) {
    const state = input.companionState as InpiCompanionPersistedState;
    return { mode: state.mode, step: state.step, resumed: true };
  }
  return {
    mode: deriveModeFromDossierInpiStatus(input.dossierInpiStatus),
    step: FRESH_ENTRY_STEP,
    resumed: false,
  };
}

/** 4.2.2 — Conflit transverse : jamais un mode, un simple constat. */
export function hasInpiCompanionConflicts(
  companionState: InpiCompanionPersistedState | undefined,
): boolean {
  return Boolean(companionState && Object.keys(companionState.conflicts).length > 0);
}

function firstConflictField(
  companionState: InpiCompanionPersistedState | undefined,
): InpiCompanionFieldKey | undefined {
  if (!companionState) return undefined;
  for (const field of INPI_COMPANION_STEP_ORDER) {
    if (companionState.conflicts[field]) return field;
  }
  return undefined;
}

/**
 * Un champ dont le moteur ne doit JAMAIS proposer de valeur, quelle que soit
 * la donnée disponible — décision qui appartient uniquement au client
 * (Phase 3, "🔴 pur"). Imposé par le moteur lui-même plutôt que confié à la
 * discipline de l'appelant.
 */
function isNeverInferableField(field: InpiCompanionFieldKey): boolean {
  return field === "domiciliation";
}

export type InpiCompanionFieldSnapshot = {
  /** Une valeur existe dans une source jugée suffisamment fiable (DeclarationDraft, extraction document...) — jamais une confirmation en soi. */
  hasReliableValue: boolean;
};

export type InpiCompanionFieldSnapshots = Partial<Record<InpiCompanionFieldKey, InpiCompanionFieldSnapshot>>;

/**
 * 4.2.6 — Provenance d'un champ, à un instant donné.
 * "extracted" (🟢) UNIQUEMENT si confirmé DANS le Compagnon
 * (`confirmedFields`) — jamais déduit de la simple présence d'une valeur.
 * "missing" (🔴) pour `domiciliation`, toujours, tant que non confirmé.
 * "proposed" (🟠) sinon, si une valeur fiable existe.
 */
export function resolveInpiCompanionFieldStatus(
  field: InpiCompanionFieldKey,
  snapshot: InpiCompanionFieldSnapshot | undefined,
  companionState: InpiCompanionPersistedState | undefined,
): ActiviteFieldStatus {
  if (companionState?.confirmedFields[field]) return "extracted";
  if (isNeverInferableField(field)) return "missing";
  if (snapshot?.hasReliableValue) return "proposed";
  return "missing";
}

function reasonForStatus(status: ActiviteFieldStatus): string {
  switch (status) {
    case "proposed":
      return "Une valeur est disponible mais doit être confirmée par le client.";
    case "missing":
      return "Cette information n'est pas disponible et doit être renseignée ou décidée par le client.";
    case "extracted":
      return "Déjà confirmé dans le Compagnon.";
  }
}

export type ResolveNextInpiCompanionStepInput = {
  mode: InpiCompanionMode;
  companionState: InpiCompanionPersistedState | undefined;
  fields: InpiCompanionFieldSnapshots;
  /** Calculé par l'appelant, même formule que `validation-profile.ts` (`properties.length > 1`) — jamais une nouvelle source de vérité. */
  isMultiProperty: boolean;
};

export type InpiCompanionStepDecision = {
  step: InpiCompanionStep;
  status: ActiviteFieldStatus;
  reason: string;
  /**
   * Le client peut avancer sans traiter cette étape maintenant (principe
   * "jamais bloquant", Phase 3 §7) — toujours `false` pour un conflit non
   * résolu, seul cas que le moteur traite comme un vrai blocage.
   */
  canSkip: boolean;
  requiresConfirmation: boolean;
  /** `true` uniquement pour `etablissement` en contexte multi-biens — jamais de correspondance bien↔établissement déduite automatiquement (4.2.3). */
  multiPropertyCaution: boolean;
};

/**
 * 4.2.4 — Résolution de la prochaine étape.
 * `null` pour les modes sans séquence d'étapes (diagnostic/verification/
 * attente/regularisation) : ces modes affichent un écran dédié, pas une
 * étape du parcours CRÉATION/POURSUITE.
 */
export function resolveNextInpiCompanionStep(
  input: ResolveNextInpiCompanionStepInput,
): InpiCompanionStepDecision | null {
  if (!STEP_BASED_MODES.has(input.mode)) return null;

  const conflictField = firstConflictField(input.companionState);
  if (conflictField) {
    return {
      step: conflictField,
      status: "proposed",
      reason: "Un conflit doit être arbitré par le client avant de continuer.",
      canSkip: false,
      requiresConfirmation: true,
      multiPropertyCaution: conflictField === "etablissement" && input.isMultiProperty,
    };
  }

  for (const field of INPI_COMPANION_STEP_ORDER) {
    const status = resolveInpiCompanionFieldStatus(field, input.fields[field], input.companionState);
    if (status !== "extracted") {
      return {
        step: field,
        status,
        reason: reasonForStatus(status),
        canSkip: true,
        requiresConfirmation: true,
        multiPropertyCaution: field === "etablissement" && input.isMultiProperty,
      };
    }
  }

  return {
    step: "synthese",
    status: "extracted",
    reason: "Toutes les informations nécessaires ont été confirmées.",
    canSkip: false,
    requiresConfirmation: false,
    multiPropertyCaution: false,
  };
}

/**
 * 4.2.10 — Contrat de contexte pour le futur canal de question libre
 * (Phase 4.5). Pure transformation de données, aucune logique
 * conversationnelle : à ne pas confondre avec une implémentation de chatbot.
 */
export type InpiCompanionEngineContext = {
  mode: InpiCompanionMode;
  step: InpiCompanionStep;
  knownFields: InpiCompanionFieldKey[];
  proposedFields: InpiCompanionFieldKey[];
  missingFields: InpiCompanionFieldKey[];
  conflicts: InpiCompanionConflict[];
  isMultiProperty: boolean;
  dossierInpiStatus: InpiStatus | undefined;
};

export type BuildInpiCompanionEngineContextInput = {
  mode: InpiCompanionMode;
  step: InpiCompanionStep;
  companionState: InpiCompanionPersistedState | undefined;
  fields: InpiCompanionFieldSnapshots;
  isMultiProperty: boolean;
  dossierInpiStatus: InpiStatus | undefined;
};

export function buildInpiCompanionEngineContext(
  input: BuildInpiCompanionEngineContextInput,
): InpiCompanionEngineContext {
  const knownFields: InpiCompanionFieldKey[] = [];
  const proposedFields: InpiCompanionFieldKey[] = [];
  const missingFields: InpiCompanionFieldKey[] = [];

  for (const field of INPI_COMPANION_STEP_ORDER) {
    const status = resolveInpiCompanionFieldStatus(field, input.fields[field], input.companionState);
    if (status === "extracted") knownFields.push(field);
    else if (status === "proposed") proposedFields.push(field);
    else missingFields.push(field);
  }

  const conflicts = input.companionState
    ? (Object.values(input.companionState.conflicts).filter(Boolean) as InpiCompanionConflict[])
    : [];

  return {
    mode: input.mode,
    step: input.step,
    knownFields,
    proposedFields,
    missingFields,
    conflicts,
    isMultiProperty: input.isMultiProperty,
    dossierInpiStatus: input.dossierInpiStatus,
  };
}
