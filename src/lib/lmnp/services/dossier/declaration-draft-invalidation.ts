/**
 * Lot 4 — invalidations déterministes appelées par le reducer.
 *
 * Préserve les INPUTS utilisateur ; invalide outputs dérivés, confirmations
 * et completed state quand une source structurante change. Pas de dependency
 * graph générique, pas d'event bus.
 *
 * Distinction importante :
 * - changement d'état SOURCE (assistant state) → invalide output + confirm ;
 * - pose/remplacement d'un OUTPUT (confirmation) → invalide seulement les
 *   descendants, jamais la confirmation que l'on vient de poser.
 */

import type { DeclarationDraft } from "../../types/domain";

type DraftPatch = Partial<DeclarationDraft>;

/** Aligné sur le reducer (P0-1C) : `computedAt` n'est jamais un signal fiscal. */
const NON_FISCAL_KEYS = new Set(["computedAt"]);

function definedKeys(record: Record<string, unknown>): string[] {
  return Object.keys(record).filter(
    (key) => record[key] !== undefined && !NON_FISCAL_KEYS.has(key),
  );
}

function sameValue(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((item, i) => sameValue(item, b[i]));
  }
  const aRecord = a as Record<string, unknown>;
  const bRecord = b as Record<string, unknown>;
  const aKeys = definedKeys(aRecord);
  const bKeys = new Set(definedKeys(bRecord));
  if (aKeys.length !== bKeys.size) return false;
  return aKeys.every((key) => bKeys.has(key) && sameValue(aRecord[key], bRecord[key]));
}

function stripCompleted(steps: string[] | undefined, remove: ReadonlySet<string>): string[] {
  return (steps ?? []).filter((step) => !remove.has(step));
}

/**
 * Produit un patch d'invalidation (à merger APRÈS le patch utilisateur) quand
 * une clé structurante change réellement. Retourne `{}` si rien à invalider
 * (même valeur, ou clé absente du patch).
 */
export function buildDownstreamInvalidationPatch(
  current: DeclarationDraft,
  patch: DraftPatch,
): DraftPatch {
  const invalidation: DraftPatch = {};

  const dateChanged =
    "dateMiseEnService" in patch &&
    !sameValue(current.dateMiseEnService, patch.dateMiseEnService);

  const logementOutputChanged =
    "logementAmortissement" in patch &&
    !sameValue(current.logementAmortissement, patch.logementAmortissement);

  const financementOutputChanged =
    "financementCharges" in patch &&
    !sameValue(current.financementCharges, patch.financementCharges);

  const financementStateChanged =
    "financementAssistantState" in patch &&
    !sameValue(current.financementAssistantState, patch.financementAssistantState);

  const chargesChanged =
    "chargesAssistant" in patch &&
    !sameValue(current.chargesAssistant, patch.chargesAssistant);

  const revenusChanged =
    "revenusAssistant" in patch &&
    !sameValue(current.revenusAssistant, patch.revenusAssistant);

  const logementStateChanged =
    "logementAssistantState" in patch &&
    !sameValue(current.logementAssistantState, patch.logementAssistantState);

  // A — dateMiseEnService structurante → outputs / confirmations dépendants
  // F010–F014 : date de mise en service change le prorata pré-exploitation
  // (F012 isolatePreExploitationCharge) et le calcul des recettes (F013
  // computeRecettesExercice), pas seulement F010/F011/F014.
  // `declarationGeneratedAt` vit sur FiscalYear — le reducer l'invalide via
  // contributiveKeyChanged / présence d'un patch d'invalidation aval.
  if (dateChanged) {
    if (!("logementAmortissement" in patch)) invalidation.logementAmortissement = undefined;
    if (!("financementCharges" in patch)) invalidation.financementCharges = undefined;
    if (!("chargesAssistant" in patch)) invalidation.chargesAssistant = undefined;
    if (!("revenusAssistant" in patch)) invalidation.revenusAssistant = undefined;
    if (!("amortissementAssistant" in patch)) invalidation.amortissementAssistant = undefined;
    if (!("logementConfirmedAt" in patch)) invalidation.logementConfirmedAt = undefined;
    if (!("creditConfirmedAt" in patch)) invalidation.creditConfirmedAt = undefined;
    if (!("chargesConfirmedAt" in patch)) invalidation.chargesConfirmedAt = undefined;
    if (!("revenusConfirmedAt" in patch)) invalidation.revenusConfirmedAt = undefined;
    if (!("amortissementConfirmedAt" in patch)) invalidation.amortissementConfirmedAt = undefined;
    invalidation.fiscalResult = undefined;
    invalidation.rfs = undefined;
    invalidation.liasseResult = undefined;
    invalidation.liasseRfs = undefined;
  }

  // B — saisie source F010 (pas l'output) → clear output + confirm + F014
  if (logementStateChanged && !logementOutputChanged) {
    if (!("logementAmortissement" in patch)) invalidation.logementAmortissement = undefined;
    if (!("amortissementAssistant" in patch)) invalidation.amortissementAssistant = undefined;
    if (!("logementConfirmedAt" in patch)) invalidation.logementConfirmedAt = undefined;
    if (!("amortissementConfirmedAt" in patch)) invalidation.amortissementConfirmedAt = undefined;
    invalidation.completedSteps = stripCompleted(
      current.completedSteps,
      new Set(["logement", "logement-assistant", "amortissement"]),
    );
  }

  // B' — nouvel output F010 → invalide F014 seulement (confirmation F010 posée à part)
  if (logementOutputChanged) {
    if (!("amortissementAssistant" in patch)) invalidation.amortissementAssistant = undefined;
    if (!("amortissementConfirmedAt" in patch)) invalidation.amortissementConfirmedAt = undefined;
    invalidation.completedSteps = stripCompleted(
      invalidation.completedSteps ?? current.completedSteps,
      new Set(["amortissement"]),
    );
  }

  // C — saisie source F011 → clear output + confirm
  if (financementStateChanged && !financementOutputChanged) {
    if (!("financementCharges" in patch)) invalidation.financementCharges = undefined;
    if (!("creditConfirmedAt" in patch)) invalidation.creditConfirmedAt = undefined;
    invalidation.completedSteps = stripCompleted(
      invalidation.completedSteps ?? current.completedSteps,
      new Set(["credit", "financement-assistant"]),
    );
  }

  // C' — nouvel output F011 → F012 recouvrement périmé + F014 si présent
  if (financementOutputChanged) {
    if (
      !("chargesConfirmedAt" in patch) &&
      (current.chargesAssistant?.recouvrementAssuranceF011 ||
        current.chargesAssistant?.recouvrementFraisDossierF011)
    ) {
      invalidation.chargesConfirmedAt = undefined;
    }
    if (!("amortissementAssistant" in patch) && current.amortissementAssistant) {
      invalidation.amortissementAssistant = undefined;
      if (!("amortissementConfirmedAt" in patch)) invalidation.amortissementConfirmedAt = undefined;
    }
  }

  // D — charges F012 → confirmation F012 ; F014 si composants changent
  if (chargesChanged) {
    if (!("chargesConfirmedAt" in patch)) invalidation.chargesConfirmedAt = undefined;
    const composantsChanged = !sameValue(
      current.chargesAssistant?.composantsNouveaux,
      patch.chargesAssistant?.composantsNouveaux,
    );
    if (composantsChanged && !("amortissementAssistant" in patch)) {
      invalidation.amortissementAssistant = undefined;
      if (!("amortissementConfirmedAt" in patch)) invalidation.amortissementConfirmedAt = undefined;
    }
    invalidation.completedSteps = stripCompleted(
      invalidation.completedSteps ?? current.completedSteps,
      new Set(["charges", "charges-assistant"]),
    );
  }

  // E — revenus F013 → confirmation
  if (revenusChanged) {
    if (!("revenusConfirmedAt" in patch)) invalidation.revenusConfirmedAt = undefined;
    invalidation.completedSteps = stripCompleted(
      invalidation.completedSteps ?? current.completedSteps,
      new Set(["revenus", "revenus-assistant"]),
    );
  }

  return invalidation;
}
