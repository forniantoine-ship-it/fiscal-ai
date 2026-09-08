/**
 * Compagnon INPI — contrat de contexte conversationnel (Phase 4.5.1).
 *
 * Pur assembleur : ne recalcule aucune règle métier, ne duplique aucune
 * donnée. Consomme exclusivement des fonctions déjà exportées par le moteur
 * (`engine.ts`, gelé) et le ViewModel (`inpi-companion-view-model.ts`, gelé) :
 * `resolveInpiCompanionMode`, `resolveNextInpiCompanionStep`,
 * `resolveInpiCompanionFieldStatus`, `hasInpiCompanionConflicts`,
 * `INPI_COMPANION_STEP_ORDER`, `deriveInpiCompanionFieldSnapshots`,
 * `displayValueForField`, `resolveIsMultiProperty`.
 *
 * Confidentialité — whitelist stricte : la valeur de retour n'est JAMAIS
 * construite par spread (`{...draft}`, `{...workspace}`, `{...properties}`).
 * Chaque champ du contexte est nommé explicitement. `fiscalYear`,
 * `workspace` et les documents complets ne sont jamais lus par ce module —
 * ils ne figurent même pas dans sa liste d'imports.
 */

import type { DeclarationDraft, Property } from "@/lib/lmnp/types/domain";
import type { InpiStatus } from "@/lib/lmnp/types/dossier";
import {
  hasInpiCompanionConflicts,
  resolveInpiCompanionFieldStatus,
  resolveInpiCompanionMode,
  resolveNextInpiCompanionStep,
  INPI_COMPANION_STEP_ORDER,
  type InpiCompanionStepDecision,
} from "@/runtime/assistants/inpi-companion/engine";
import type {
  InpiCompanionConflict,
  InpiCompanionFieldKey,
  InpiCompanionMode,
  InpiCompanionProgressStatus,
  InpiCompanionStep,
} from "@/runtime/assistants/inpi-companion/types";

import { deriveInpiCompanionFieldSnapshots, displayValueForField, resolveIsMultiProperty } from "./inpi-companion-view-model";

/**
 * Représentation courte de la question/action actuellement pertinente.
 * `label` reprend les formulations déjà retenues pour le Compagnon (Phase
 * 4.5.1, §4) ; `reason` provient TOUJOURS de `stepDecision.reason` (moteur,
 * `engine.ts`) — jamais un nouveau texte inventé ici.
 */
export type InpiCompanionQuestion = {
  field?: InpiCompanionFieldKey;
  label: string;
  reason: string;
};

/**
 * Action structurée, jamais une phrase libre. Ne contient volontairement
 * aucune valeur qui modifierait directement une donnée métier — le chat
 * pourra expliquer/proposer, jamais confirmer silencieusement (§5).
 */
export type InpiCompanionNextAction =
  | "confirm_field"
  | "resolve_conflict"
  | "provide_missing_field"
  | "review_summary"
  | "open_official_inpi"
  | "resume"
  | "wait"
  | "explain";

export type InpiCompanionChatContext = {
  mode: InpiCompanionMode;
  step: InpiCompanionStep;
  progressStatus: InpiCompanionProgressStatus;
  currentQuestion: InpiCompanionQuestion | null;
  nextAction: InpiCompanionNextAction;
  /** Valeurs confirmées DANS le Compagnon (🟢) — jamais une valeur simplement présente ailleurs. */
  knownValues: Partial<Record<InpiCompanionFieldKey, string>>;
  /** Valeurs fiables mais pas encore confirmées DANS le Compagnon (🟠). */
  proposedValues: Partial<Record<InpiCompanionFieldKey, string>>;
  /** Champs sans valeur exploitable, ou dont la décision appartient au client (🔴). */
  missingFields: InpiCompanionFieldKey[];
  conflicts: InpiCompanionConflict[];
  isMultiProperty: boolean;
  dossierInpiStatus: InpiStatus | undefined;
};

const QUESTION_LABELS: Record<InpiCompanionFieldKey, string> = {
  identite: "identité à confirmer",
  activite: "activité à préciser",
  date_debut: "date de début à confirmer",
  etablissement: "établissement à préciser",
  siren_siret: "SIREN/SIRET à renseigner",
  regime: "régime à confirmer",
  domiciliation: "domiciliation à décider",
  documents: "documents à préparer",
};

function buildCurrentQuestion(stepDecision: InpiCompanionStepDecision | null): InpiCompanionQuestion | null {
  if (!stepDecision) return null;
  if (stepDecision.step === "synthese") {
    return { label: "synthèse à vérifier", reason: stepDecision.reason };
  }
  const field = stepDecision.step;
  return { field, label: QUESTION_LABELS[field], reason: stepDecision.reason };
}

/**
 * `resumed` n'est prioritaire que lorsqu'aucune action plus précise ne se
 * dégage déjà de l'étape courante (synthèse prête → ouvrir l'INPI ; conflit
 * → le résoudre). Sinon "resume" resterait vague pile au moment où une
 * action concrète et déjà connue serait plus utile au client.
 */
function resolveNextAction(input: {
  mode: InpiCompanionMode;
  resumed: boolean;
  stepDecision: InpiCompanionStepDecision | null;
  hasConflicts: boolean;
}): InpiCompanionNextAction {
  switch (input.mode) {
    case "attente":
      return "wait";
    case "regularisation":
      return "explain";
    case "verification":
      return "review_summary";
    case "diagnostic":
      return "explain";
    case "creation":
    case "poursuite":
      break;
  }

  if (!input.stepDecision) return "explain";
  if (input.stepDecision.step === "synthese") return "open_official_inpi";
  if (input.hasConflicts) return "resolve_conflict";
  if (input.resumed) return "resume";
  if (input.stepDecision.status === "missing") return "provide_missing_field";
  if (input.stepDecision.status === "proposed") return "confirm_field";
  return "explain";
}

export type BuildInpiCompanionChatContextInput = {
  draft: DeclarationDraft | undefined;
  properties: readonly Property[];
  dossierInpiStatus: InpiStatus | undefined;
};

/**
 * Construit le contexte conversationnel minimal. Ne fait AUCUN appel réseau,
 * AUCUNE écriture, AUCUN dispatch — pure fonction de lecture, comme le
 * moteur et le ViewModel qu'elle consomme.
 */
export function buildInpiCompanionChatContext(
  input: BuildInpiCompanionChatContextInput,
): InpiCompanionChatContext {
  const { draft, properties, dossierInpiStatus } = input;
  const companionState = draft?.inpiCompanionState;
  const fields = deriveInpiCompanionFieldSnapshots(draft);
  const isMultiProperty = resolveIsMultiProperty(properties);

  const modeDecision = resolveInpiCompanionMode({ dossierInpiStatus, companionState });
  const stepDecision = resolveNextInpiCompanionStep({
    mode: modeDecision.mode,
    companionState,
    fields,
    isMultiProperty,
  });

  const knownValues: Partial<Record<InpiCompanionFieldKey, string>> = {};
  const proposedValues: Partial<Record<InpiCompanionFieldKey, string>> = {};
  const missingFields: InpiCompanionFieldKey[] = [];

  for (const field of INPI_COMPANION_STEP_ORDER) {
    const status = resolveInpiCompanionFieldStatus(field, fields[field], companionState);
    const value = displayValueForField(field, draft);
    if (status === "extracted") {
      if (value) knownValues[field] = value;
    } else if (status === "proposed") {
      if (value) proposedValues[field] = value;
    } else {
      missingFields.push(field);
    }
  }

  const conflicts = companionState
    ? (Object.values(companionState.conflicts).filter(Boolean) as InpiCompanionConflict[])
    : [];

  return {
    mode: modeDecision.mode,
    step: modeDecision.step,
    progressStatus: companionState?.progressStatus ?? "idle",
    currentQuestion: buildCurrentQuestion(stepDecision),
    nextAction: resolveNextAction({
      mode: modeDecision.mode,
      resumed: modeDecision.resumed,
      stepDecision,
      hasConflicts: hasInpiCompanionConflicts(companionState),
    }),
    knownValues,
    proposedValues,
    missingFields,
    conflicts,
    isMultiProperty,
    dossierInpiStatus,
  };
}
