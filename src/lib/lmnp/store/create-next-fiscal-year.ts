/**
 * P3-SOCLE-CYCLE-FISCAL — P0-1 v2 — orchestration de CREATE_NEXT_FISCAL_YEAR.
 *
 * Chemin ENTIÈREMENT séparé de `runCreateNewDeclaration()`
 * (document-deletion-plan.ts) : celui-ci reste "déclarer un autre bien"
 * (remplacement irréversible), celui-ci est "même dossier, exercice
 * suivant". Aucune suppression de document, aucune purge Supabase — cette
 * transition ne l'exige pas (les documents de N restent attachés à N,
 * archivés tels quels par persistFiscalYearTransition()).
 *
 * Ordre : préconditions (synchrones, avant tout effet) → persistance
 * atomique IndexedDB → SEULEMENT ALORS dispatch. Si une précondition échoue
 * ou si la persistance échoue, aucun dispatch n'a lieu et rien n'est écrit
 * (persistFiscalYearTransition est atomique — voir dossier-db.ts).
 */

import { persistFiscalYearTransition, type PersistFiscalYearTransitionResult } from "./dossier-db";
import { canCreateNextFiscalYear } from "../services/dossier/fiscal-year-cycle";
import type { PersistedWorkspace } from "./persistence";
import type { FiscalYear } from "../types/domain";

/**
 * Garde de réentrance minimale, même onglet uniquement (variable de module,
 * comme workspace-save-serializer.ts) : empêche un double appel rapide de
 * produire deux FiscalYear "N+1" concurrents. Ne protège PAS contre deux
 * onglets distincts (risque déjà connu et documenté, hors périmètre de ce
 * correctif — cf. audit post-implémentation §N).
 */
let transitionInFlight = false;

export type RunCreateNextFiscalYearParams = {
  dossierId: string | null;
  workspace: PersistedWorkspace;
  /** Injectable pour les tests — sinon `new Date().toISOString()`. */
  now?: string;
  dispatchCreateNextFiscalYear: (nextFiscalYear: FiscalYear) => void;
  onError: (message: string | null) => void;
  /**
   * Injectable pour les tests (même pattern que `deleteOnServer` dans
   * `runCreateNewDeclaration`) — par défaut, l'écriture IndexedDB réelle.
   */
  persistTransition?: (params: {
    dossierId: string;
    workspace: PersistedWorkspace;
    now: string;
  }) => Promise<PersistFiscalYearTransitionResult>;
};

export async function runCreateNextFiscalYear(
  params: RunCreateNextFiscalYearParams,
): Promise<void> {
  const { dossierId, workspace, dispatchCreateNextFiscalYear, onError } = params;
  const persistTransition = params.persistTransition ?? persistFiscalYearTransition;

  if (transitionInFlight) {
    onError("Une création d'exercice est déjà en cours — patientez.");
    return;
  }

  // Précondition 2 — dossierId doit exister. Jamais un identifiant inventé,
  // jamais un N+1 "apparent" non persisté : erreur explicite, aucun dispatch.
  if (!dossierId) {
    onError("Dossier introuvable — impossible de créer l'exercice suivant pour l'instant.");
    return;
  }

  // Préconditions 3/4 — N doit être clôturé ET porter une closure exploitable.
  const precondition = canCreateNextFiscalYear(workspace.fiscalYear);
  if (!precondition.ok) {
    onError(precondition.reason);
    return;
  }

  transitionInFlight = true;
  try {
    const now = params.now ?? new Date().toISOString();
    const result = await persistTransition({ dossierId, workspace, now });
    onError(null);
    // `result.nextFiscalYear` est EXACTEMENT ce qui vient d'être écrit en
    // IndexedDB — jamais recalculé pour le dispatch (éviterait un second
    // id aléatoire divergent de celui persisté).
    dispatchCreateNextFiscalYear(result.nextFiscalYear);
  } catch (error) {
    onError(
      error instanceof Error ? error.message : "Échec de la création de l'exercice suivant.",
    );
  } finally {
    transitionInFlight = false;
  }
}

/** @internal tests only */
export function __testResetCreateNextFiscalYearGuard(): void {
  transitionInFlight = false;
}
