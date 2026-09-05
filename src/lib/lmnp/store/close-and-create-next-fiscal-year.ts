/**
 * P3-SOCLE-CYCLE-FISCAL — Design Gate "Clôture N → N+1", Décision 1 —
 * orchestration du geste utilisateur unique "Clôturer et continuer" : clôture
 * explicite de N + transition atomique vers N+1, en une seule opération.
 *
 * Chemin ENTIÈREMENT distinct de :
 *  - `runCreateNextFiscalYear()` (create-next-fiscal-year.ts), qui reste
 *    utilisable indépendamment si clôture et création devaient un jour être
 *    redécouplées — non modifié par ce chantier ;
 *  - `JOURNEY_MARK_TRANSMITTED`, réservé au futur retour EDI réel — cette
 *    orchestration n'écrit jamais `transmittedAt` ;
 *  - `CREATE_NEW_DECLARATION`, qui reste "déclarer un autre bien" (reset
 *    intégral, irréversible) — non touché.
 *
 * Ordre imposé (P0 FINAL GATE, workspace debounce vs clôture N → N+1) :
 * flush du workspace en attente AVANT toute revalidation métier, pour
 * éliminer toute écriture stale de N encore en vol avant le début de la
 * transaction atomique. Voir persistFiscalYearClosureAndTransition()
 * (dossier-db.ts) pour la Couche 2 (garde structurelle) et la relecture
 * anti-concurrence multi-onglet.
 */
import { flushWorkspaceSave } from "./persistence";
import {
  persistFiscalYearClosureAndTransition,
  FiscalYearAlreadyClosedError,
  type PersistFiscalYearClosureAndTransitionResult,
} from "./dossier-db";
import { canCloseFiscalYear } from "../services/dossier/fiscal-year-cycle";
import type { PersistedWorkspace } from "./persistence";

/**
 * Garde de réentrance minimale, même onglet uniquement (variable de module,
 * comme create-next-fiscal-year.ts) : empêche un double appel rapide de
 * produire deux transitions concurrentes. Ne protège PAS contre deux onglets
 * distincts — la seule protection multi-onglet réelle est la relecture
 * anti-concurrence DANS la transaction IndexedDB (dossier-db.ts).
 */
let transitionInFlight = false;

export type RunCloseAndCreateNextFiscalYearParams = {
  dossierId: string | null;
  /** Utilisateur authentifié courant — nécessaire pour flusher et écrire le workspace. */
  userId: string | null;
  workspace: PersistedWorkspace;
  /** Injectable pour les tests — sinon `new Date().toISOString()`. */
  now?: string;
  dispatchCloseAndCreateNext: (nextWorkspace: PersistedWorkspace) => void;
  onError: (message: string | null) => void;
  /**
   * Injectable pour les tests (même pattern que `persistTransition` dans
   * `runCreateNextFiscalYear`) — par défaut, l'écriture IndexedDB réelle.
   */
  persistClosureAndTransition?: (params: {
    dossierId: string;
    userId: string;
    workspace: PersistedWorkspace;
    now: string;
  }) => Promise<PersistFiscalYearClosureAndTransitionResult>;
  /**
   * Injectable pour les tests — par défaut, `flushWorkspaceSave` réel
   * (persistence.ts). Permet de vérifier l'ORDRE d'appel (flush avant tout
   * le reste) sans dépendre d'IndexedDB.
   */
  flushPendingWorkspace?: (userId: string | null) => Promise<void>;
};

export async function runCloseAndCreateNextFiscalYear(
  params: RunCloseAndCreateNextFiscalYearParams,
): Promise<void> {
  const { dossierId, userId, workspace, dispatchCloseAndCreateNext, onError } = params;
  const persistClosureAndTransition =
    params.persistClosureAndTransition ?? persistFiscalYearClosureAndTransition;
  const flushPendingWorkspace = params.flushPendingWorkspace ?? flushWorkspaceSave;

  if (transitionInFlight) {
    onError("Une clôture d'exercice est déjà en cours — patientez.");
    return;
  }

  // Le check ci-dessus et la pose du verrou ci-dessous doivent rester dans le
  // même bloc SYNCHRONE (aucun `await` entre les deux) : c'est cette
  // atomicité, pas `transitionInFlight` seul, qui empêche un double appel
  // synchrone rapproché de passer les deux le check avant que l'un des deux
  // ne pose le verrou (JS mono-thread : tant qu'aucun `await` n'a cédé la
  // main, aucun second appel ne peut s'exécuter entre le check et la pose).
  transitionInFlight = true;
  try {
    // Couche 1 (P0 FINAL GATE) — annule le debounce et purge toute écriture
    // encore en attente AVANT toute revalidation et avant le début de la
    // transaction. Doit rester la TOUTE PREMIÈRE étape observable une fois
    // le verrou de réentrance posé.
    await flushPendingWorkspace(userId);

    // Précondition — dossierId doit exister. Jamais un identifiant inventé,
    // jamais une clôture "apparente" non persistée : erreur explicite, aucun
    // dispatch (même patron que runCreateNextFiscalYear()).
    if (!dossierId) {
      onError("Dossier introuvable — impossible de clôturer l'exercice pour l'instant.");
      return;
    }
    if (!userId) {
      onError("Utilisateur non identifié — impossible de clôturer l'exercice pour l'instant.");
      return;
    }

    // Précondition métier — status === "ready_to_close" ET declarationGeneratedAt
    // ET absence de dérive détectée par resolveDeclarationGenerationGate() (P0-1,
    // B1/B2). Revalidée ici sur le workspace live transmis par l'appelant
    // (jamais mise en cache) : si elle a changé depuis l'affichage du bouton,
    // la clôture est refusée avant tout effet.
    const precondition = canCloseFiscalYear({
      fiscalYear: workspace.fiscalYear,
      declarationDraft: workspace.declarationDraft,
      properties: workspace.properties,
    });
    if (!precondition.ok) {
      onError(precondition.reason);
      return;
    }

    const now = params.now ?? new Date().toISOString();
    const result = await persistClosureAndTransition({ dossierId, userId, workspace, now });
    onError(null);
    // `result.nextWorkspace` est EXACTEMENT ce qui vient d'être écrit en
    // IndexedDB — jamais recalculé pour le dispatch.
    dispatchCloseAndCreateNext(result.nextWorkspace);
  } catch (error) {
    if (error instanceof FiscalYearAlreadyClosedError) {
      onError(error.message);
    } else {
      onError(
        error instanceof Error ? error.message : "Échec de la clôture de l'exercice.",
      );
    }
  } finally {
    transitionInFlight = false;
  }
}

/** @internal tests only */
export function __testResetCloseAndCreateNextFiscalYearGuard(): void {
  transitionInFlight = false;
}
