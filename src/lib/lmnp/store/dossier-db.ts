/**
 * P3-SOCLE-CYCLE-FISCAL — P0-1 — orchestration IndexedDB du cycle fiscal
 * pluriannuel (Dossier / FiscalYear / closures). Couche fine au-dessus de
 * `db.ts` : toute la logique de décision (extraction, garde stocks,
 * construction de N+1) reste dans `../services/dossier/fiscal-year-cycle.ts`
 * (pure, testable sans IndexedDB) — ce fichier ne fait que persister.
 *
 * Migration paresseuse et volontaire : le store `dossier` n'est créé pour un
 * utilisateur qu'au premier passage réel N → N+1 (ensureDossierRecord),
 * jamais au chargement de l'application. Câbler un déclenchement automatique
 * à l'hydratation (`provider.tsx`, effet de reconciliation des documents)
 * n'a volontairement pas été fait dans ce P0-1 : cet effet est déjà complexe
 * et activement instrumenté, et le modifier sans l'avoir intégralement
 * audité aurait dépassé le périmètre confié — voir le rapport final.
 */

import {
  getDossierRecord,
  getFiscalYearRecord,
  putDossierRecord,
  withStores,
  workspaceKeyForUser,
  STORE_DOSSIER,
  STORE_FISCAL_YEARS,
  STORE_WORKSPACE,
  type WorkspaceRecord,
} from "./db";
import type { PersistedWorkspace } from "./persistence";
import type {
  DeclarationDraft,
  Extraction,
  FiscalYear,
  LedgerEntry,
  LmnpDocument,
  ValidationItem,
} from "../types/domain";
import type { Dossier, InpiStatus, InpiStatusSource } from "../types/dossier";
import {
  closeFiscalYear,
  createNextDeclarationDraft,
  createNextFiscalYear,
  extractDossierLevelDataFromWorkspace,
  extractIdentity,
  resolvePatrimoineOuvertureNPlusUn,
  resolveStocksOuverture,
} from "../services/dossier/fiscal-year-cycle";

/**
 * Récupère le Dossier existant, ou le construit une seule fois depuis le
 * workspace mono-exercice courant (migration paresseuse). N'écrit rien tant
 * que le Dossier n'existe pas déjà ET qu'aucune transition n'est demandée —
 * la construction n'est persistée que par `persistFiscalYearTransition()`,
 * dans la même transaction atomique que le reste.
 */
async function buildOrLoadDossier(
  dossierId: string,
  workspace: PersistedWorkspace,
  now: string,
): Promise<Dossier> {
  const existing = await getDossierRecord<Dossier>(dossierId);
  if (existing) return existing;

  const { properties, financements } = extractDossierLevelDataFromWorkspace(workspace);
  return {
    id: dossierId,
    ...extractIdentity(workspace.declarationDraft),
    properties,
    financements,
    fiscalYearIds: [workspace.fiscalYear.id],
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * P1 — lecture isolée du statut INPI (Dossier-level). N'écrit rien : si
 * aucun Dossier n'a encore été créé (migration paresseuse, cf. commentaire
 * de fichier ci-dessus), retourne `undefined` — jamais un statut par défaut
 * inventé ici (la dérivation "aucun statut connu" vs "not_started déclaré"
 * reste la responsabilité de `resolveInpiValidationState()`).
 */
export type DossierInpiStatusMirror = {
  status?: InpiStatus;
  source?: InpiStatusSource;
  updatedAt?: string;
};

export async function loadDossierInpiStatus(dossierId: string): Promise<DossierInpiStatusMirror | undefined> {
  const existing = await getDossierRecord<Dossier>(dossierId);
  if (!existing) return undefined;
  return {
    status: existing.inpiStatus,
    source: existing.inpiStatusSource,
    updatedAt: existing.inpiStatusUpdatedAt,
  };
}

/**
 * P1 — écrit le statut INPI (Dossier-level) dans une transaction ISOLÉE,
 * portant UNIQUEMENT `STORE_DOSSIER` — jamais `STORE_FISCAL_YEARS` ni
 * `STORE_WORKSPACE`. Volontairement indépendante de
 * `persistFiscalYearTransition()`/`persistFiscalYearClosureAndTransition()`
 * (atomicité et garde anti-concurrence de ces deux fonctions inchangées,
 * jamais réutilisées ni contournées ici) : le statut INPI n'a aucun rapport
 * avec la clôture d'un exercice, il doit pouvoir être écrit à tout moment,
 * y compris pour un dossier mono-exercice n'ayant jamais clôturé.
 *
 * Réutilise `buildOrLoadDossier()` (migration paresseuse inchangée) pour
 * garantir qu'un seul enregistrement `Dossier` existe jamais pour un
 * `dossierId` donné : si une vraie transition N→N+1 survient plus tard,
 * `buildOrLoadDossier()` retrouve cet enregistrement (même id ==
 * `lmnp_dossiers.id`) et le complète normalement — aucune double création,
 * aucune seconde source de vérité.
 */
export async function saveDossierInpiStatus(params: {
  dossierId: string;
  workspace: PersistedWorkspace;
  status: InpiStatus;
  source: InpiStatusSource;
  now: string;
}): Promise<Dossier> {
  const { dossierId, workspace, status, source, now } = params;
  const base = await buildOrLoadDossier(dossierId, workspace, now);
  const dossier: Dossier = {
    ...base,
    inpiStatus: status,
    inpiStatusSource: source,
    inpiStatusUpdatedAt: now,
  };
  await putDossierRecord(dossier);
  return dossier;
}

/**
 * P3-SOCLE-CYCLE-FISCAL — P0-1 v2 — représentation persistée d'un exercice
 * dans le store `fiscalYears` : le `FiscalYear` (identité/statut/closures)
 * ÉTENDU des données propres à l'exercice (documents, extractions,
 * validations, écritures, draft de déclaration). Nécessaire pour que "les
 * documents de N restent consultables dans N" soit réellement vrai — un
 * `FiscalYear` seul (sans ces champs) ne les portait pas. Le blob physique
 * (`document-blobs`) n'est jamais dupliqué ici : seules les métadonnées
 * (`LmnpDocument`) sont archivées, la référence au blob (`documentId`) reste
 * la même.
 */
export interface FiscalYearRecord extends FiscalYear {
  documents: LmnpDocument[];
  extractions: Extraction[];
  validationItems: ValidationItem[];
  ledgerEntries: LedgerEntry[];
  declarationDraft?: DeclarationDraft;
}

export type PersistFiscalYearTransitionResult = {
  dossier: Dossier;
  closedFiscalYear: FiscalYearRecord;
  /** FiscalYear "identité" — c'est CE qui doit être dispatché en mémoire, jamais recalculé. */
  nextFiscalYear: FiscalYear;
};

/**
 * Persiste atomiquement la transition N → N+1 :
 *  - le Dossier (créé s'il n'existait pas encore — migration paresseuse — ou
 *    mis à jour avec les bases F-010/F-011 les plus récentes) ;
 *  - N tel qu'il se trouve au moment de l'appel (closures comprises — c'est
 *    au CALLER de s'assurer que N est bien celui qu'on veut figer, en lui
 *    passant `workspace.fiscalYear` APRÈS que la clôture a été ajoutée en
 *    mémoire par le reducer, jamais avant), ÉTENDU de ses documents/
 *    extractions/validationItems/ledgerEntries/declarationDraft — jamais
 *    supprimés, jamais dupliqués physiquement (blobs inchangés) ;
 *  - N+1, nouvellement créé, jamais copié depuis les données métier de N
 *    (collections vides, aucun draft).
 *
 * Une seule transaction IndexedDB (`withStores`) : soit les trois
 * enregistrements sont écrits ensemble, soit aucun ne l'est — jamais un état
 * "dossier écrit mais fiscalYear absent" (Mini-audit technique final §2).
 * N'effectue AUCUNE opération Supabase — cette transition ne supprime jamais
 * de document (P0-1 v2, correction du défaut d'ordre purge/persistance).
 */
export async function persistFiscalYearTransition(params: {
  dossierId: string;
  workspace: PersistedWorkspace;
  now: string;
}): Promise<PersistFiscalYearTransitionResult> {
  const { dossierId, workspace, now } = params;
  const closedFiscalYear: FiscalYearRecord = {
    ...workspace.fiscalYear,
    dossierId,
    documents: workspace.documents,
    extractions: workspace.extractions,
    validationItems: workspace.validationItems,
    ledgerEntries: workspace.ledgerEntries,
    declarationDraft: workspace.declarationDraft,
  };

  const baseDossier = await buildOrLoadDossier(dossierId, workspace, now);
  const { properties, financements } = extractDossierLevelDataFromWorkspace(workspace);
  const nextFiscalYear = createNextFiscalYear(closedFiscalYear, dossierId, now);
  const nextFiscalYearRecord: FiscalYearRecord = {
    ...nextFiscalYear,
    documents: [],
    extractions: [],
    validationItems: [],
    ledgerEntries: [],
    declarationDraft: undefined,
  };

  const fiscalYearIds = [...new Set([...baseDossier.fiscalYearIds, closedFiscalYear.id, nextFiscalYear.id])];
  const dossier: Dossier = {
    ...baseDossier,
    ...extractIdentity(workspace.declarationDraft),
    properties,
    financements,
    fiscalYearIds,
    updatedAt: now,
  };

  await withStores([STORE_DOSSIER, STORE_FISCAL_YEARS], "readwrite", (stores) => {
    stores[STORE_DOSSIER]!.put(dossier);
    stores[STORE_FISCAL_YEARS]!.put(closedFiscalYear);
    stores[STORE_FISCAL_YEARS]!.put(nextFiscalYearRecord);
  });

  return { dossier, closedFiscalYear, nextFiscalYear };
}

/**
 * Lecture seule d'un exercice archivé — jamais l'exercice actif du workspace
 * courant. Retourne `FiscalYearRecord` (documents/extractions/validations/
 * écritures/draft compris) — pas seulement l'identité `FiscalYear`. Aucune
 * UI ne consomme encore cette fonction (câblage laissé à un chantier
 * ultérieur, cf. rapport).
 */
export function loadArchivedFiscalYear(fiscalYearId: string): Promise<FiscalYearRecord | undefined> {
  return getFiscalYearRecord<FiscalYearRecord>(fiscalYearId);
}

/**
 * Levée quand la relecture anti-concurrence (DANS la transaction) révèle que
 * l'exercice courant a déjà été clôturé par une autre transaction (autre
 * onglet, ou double clic ayant échappé à `transitionInFlight`) — jamais une
 * erreur générique dans ce cas précis, pour que l'appelant puisse afficher un
 * message explicite plutôt qu'un échec IndexedDB opaque.
 */
export class FiscalYearAlreadyClosedError extends Error {
  constructor(fiscalYearId: string) {
    super(
      `L'exercice ${fiscalYearId} a déjà été clôturé — probablement depuis un autre onglet. Votre dossier va être mis à jour.`,
    );
    this.name = "FiscalYearAlreadyClosedError";
  }
}

export type PersistFiscalYearClosureAndTransitionResult = {
  dossier: Dossier;
  closedFiscalYear: FiscalYearRecord;
  /** FiscalYear "identité" de N+1 — c'est CE qui doit être dispatché en mémoire, jamais recalculé. */
  nextFiscalYear: FiscalYear;
  /**
   * Workspace complet de N+1, EXACTEMENT ce qui vient d'être écrit dans
   * `STORE_WORKSPACE` — le reducer ne fait que l'appliquer tel quel (même
   * principe que `nextFiscalYear` pour `persistFiscalYearTransition`).
   */
  nextWorkspace: PersistedWorkspace;
};

/**
 * P3-SOCLE-CYCLE-FISCAL — Décision 1 (Design Gate clôture) — persiste
 * atomiquement le geste unique "Clôturer et continuer" :
 *  - clôture explicite de N (`closeFiscalYear()`, jamais `transmittedAt`) ;
 *  - archive de N (`fiscalYears/{N}`), étendue de ses documents/extractions/
 *    validationItems/ledgerEntries/declarationDraft — jamais supprimés ;
 *  - création de N+1 (`fiscalYears/{N+1}`, coquille technique vide — voir
 *    Design Gate §5, ce n'est pas un enregistrement actif consultable) ;
 *  - bascule du workspace actif vers N+1 (`STORE_WORKSPACE`).
 *
 * UNE SEULE transaction IndexedDB (`withStores`) couvrant `dossier` +
 * `fiscalYears` + `workspace` — P0 FINAL GATE (workspace debounce) : sans
 * cela, l'autosave débouncée existante pourrait réécrire l'ancien N sur
 * `workspace` après le commit de cette transition (voir §5 du P0 FINAL GATE).
 *
 * Relecture anti-concurrence DANS la transaction (P0 FINAL GATE §5/§6) :
 * avant tout `put()`, relit `fiscalYears/{N}` depuis le store lui-même (pas
 * depuis `params.workspace`, potentiellement stale côté appelant) — si un
 * autre onglet a déjà clôturé ce même exercice, la transaction est annulée
 * (`tx.abort()`) SANS AUCUNE écriture partielle, et `FiscalYearAlreadyClosedError`
 * est levée. `transitionInFlight` (orchestration) ne protège que le même
 * onglet — cette relecture est la seule protection multi-onglet réelle,
 * puisqu'elle s'appuie sur IndexedDB, partagé entre onglets.
 */
export async function persistFiscalYearClosureAndTransition(params: {
  dossierId: string;
  userId: string;
  workspace: PersistedWorkspace;
  now: string;
}): Promise<PersistFiscalYearClosureAndTransitionResult> {
  const { dossierId, userId, workspace, now } = params;

  const fiscalResult = workspace.declarationDraft?.fiscalResult;
  if (!fiscalResult) {
    // closeFiscalYear() n'ajoute une closure QUE si fiscalResult existe — elle
    // ne pose jamais status:"closed" elle-même (c'est la responsabilité de
    // l'appelant, exactement comme le fait déjà touchFiscalYear(fy, "closed")
    // dans le reducer pour JOURNEY_MARK_TRANSMITTED, reducer.ts). L'appelant
    // doit avoir déjà vérifié canCloseFiscalYear() avant d'invoquer cette
    // fonction ; ce refus explicite est un filet de sécurité, jamais une
    // précondition supplémentaire inventée ici — on ne clôture jamais "sans
    // rien à figer".
    throw new Error(
      "Impossible de clôturer cet exercice : aucun résultat fiscal disponible pour figer une clôture.",
    );
  }

  // G1-P1 — continuité patrimoniale (compte exploitant / RAN), même niveau
  // architectural que les stocks fiscaux ci-dessous. `patrimoine` (le
  // PatrimonialState résolu de CET exercice) vit sur `draft.rfs.patrimoine`
  // (dernière génération) ; `ranSituation` (l'entrée BRUTE, absente de
  // `RanResolution`) vit séparément sur `draft.bilanPatrimonial.ran.situation`
  // — les deux sont encore présents sur le draft de N à cet instant (jamais
  // effacés avant la transition N+1, cf. `createNextDeclarationDraft()` plus
  // bas). Absent dans les deux cas ⇒ `patrimoineSource: undefined` ⇒
  // `closeFiscalYear()` ne construit aucune closure patrimoniale partielle.
  const patrimoineN = workspace.declarationDraft?.rfs?.patrimoine;
  const ranSituationN = workspace.declarationDraft?.bilanPatrimonial?.ran?.situation;
  const patrimoineSource =
    patrimoineN !== undefined && ranSituationN !== undefined
      ? { state: patrimoineN, ranSituation: ranSituationN }
      : undefined;

  const closedFiscalYearIdentity = closeFiscalYear(
    { ...workspace.fiscalYear, status: "closed", updatedAt: now },
    fiscalResult,
    now,
    {
      sourceDeclarationVersionId: workspace.declarationDraft?.declaration?.currentVersionId,
      patrimoine: patrimoineSource,
    },
  );

  const closedFiscalYear: FiscalYearRecord = {
    ...closedFiscalYearIdentity,
    dossierId,
    documents: workspace.documents,
    extractions: workspace.extractions,
    validationItems: workspace.validationItems,
    ledgerEntries: workspace.ledgerEntries,
    declarationDraft: workspace.declarationDraft,
  };

  const baseDossier = await buildOrLoadDossier(dossierId, workspace, now);
  const { properties, financements } = extractDossierLevelDataFromWorkspace(workspace);
  const nextFiscalYearBase = createNextFiscalYear(closedFiscalYear, dossierId, now);
  // P1-1 — branchement réel des stocks N → N+1 : `closedFiscalYear` porte
  // déjà sa nouvelle closure (closeFiscalYear() vient de l'ajouter
  // ci-dessus) et `nextFiscalYearBase.previousFiscalYearId` pointe déjà vers
  // elle (createNextFiscalYear()) — resolveStocksOuverture() revérifie ses 6
  // conditions sur ces objets réels (jamais présumées). Persisté sur
  // FiscalYear N+1 lui-même, jamais dans `declarationDraft.fiscalResult`
  // (réservé au miroir de la dernière génération du MÊME exercice).
  const stocksOuvertureResult = resolveStocksOuverture(nextFiscalYearBase, closedFiscalYear);
  const nextFiscalYearWithStocks: FiscalYear =
    stocksOuvertureResult.status === "available"
      ? {
          ...nextFiscalYearBase,
          stocksOuverture: {
            sourceClosureId: stocksOuvertureResult.sourceClosureId,
            stocks: stocksOuvertureResult.stocks,
          },
        }
      : nextFiscalYearBase;
  // G1-P1 — même patron exact que les stocks ci-dessus : `nextFiscalYearBase`
  // porte déjà `previousFiscalYearId` (createNextFiscalYear()) et
  // `closedFiscalYear` porte déjà sa nouvelle closure (closeFiscalYear() vient
  // de l'ajouter ci-dessus) — resolvePatrimoineOuvertureNPlusUn() revérifie
  // ses propres gardes sur ces objets réels. Persisté sur FiscalYear N+1
  // lui-même, jamais dans `declarationDraft.bilanPatrimonial` (qui reste
  // vierge à chaque nouvel exercice, cf. createNextDeclarationDraft()).
  const patrimoineOuvertureResult = resolvePatrimoineOuvertureNPlusUn(nextFiscalYearBase, closedFiscalYear);
  const nextFiscalYear: FiscalYear =
    patrimoineOuvertureResult.status === "available"
      ? {
          ...nextFiscalYearWithStocks,
          patrimoineOuverture: {
            sourceClosureId: patrimoineOuvertureResult.sourceClosureId,
            ouvertureCompteExploitant: patrimoineOuvertureResult.ouvertureCompteExploitant,
            ran: patrimoineOuvertureResult.ran,
          },
        }
      : nextFiscalYearWithStocks;
  const nextFiscalYearRecord: FiscalYearRecord = {
    ...nextFiscalYear,
    documents: [],
    extractions: [],
    validationItems: [],
    ledgerEntries: [],
    declarationDraft: undefined,
  };

  const fiscalYearIds = [...new Set([...baseDossier.fiscalYearIds, closedFiscalYear.id, nextFiscalYear.id])];
  const dossier: Dossier = {
    ...baseDossier,
    ...extractIdentity(workspace.declarationDraft),
    properties,
    financements,
    fiscalYearIds,
    updatedAt: now,
  };

  // P0-B — `properties` ici (calculé juste au-dessus par
  // extractDossierLevelDataFromWorkspace()) porte l'`amortissementBase`
  // fraîchement fusionnée (F-010 + composants F-012 de CET exercice, cf.
  // mergeComposantsF012()) — mêmes IDs, mêmes biens (Property reste
  // Dossier-level), mais jamais `workspace.properties` tel quel : cet objet
  // stale ne porte jamais les composants F-012 créés dans l'exercice qui se
  // clôture, ce qui les aurait rendus invisibles en N+1 malgré leur
  // persistance sur `dossier.properties` (deux structures divergentes).
  const nextWorkspace: PersistedWorkspace = {
    fiscalYear: nextFiscalYear,
    properties,
    documents: [],
    extractions: [],
    validationItems: [],
    ledgerEntries: [],
    declarationDraft: createNextDeclarationDraft(workspace.declarationDraft),
    aiActivityFeed: [],
  };

  const workspaceRecord: WorkspaceRecord = {
    id: workspaceKeyForUser(userId),
    data: nextWorkspace,
    updatedAt: now,
  };

  let concurrencyConflict = false;

  try {
    await withStores(
      [STORE_DOSSIER, STORE_FISCAL_YEARS, STORE_WORKSPACE],
      "readwrite",
      (stores, tx) => {
        const checkRequest = stores[STORE_FISCAL_YEARS]!.get(workspace.fiscalYear.id);
        checkRequest.onsuccess = () => {
          const currentOnDisk = checkRequest.result as FiscalYearRecord | undefined;
          if (currentOnDisk?.status === "closed") {
            // Une autre transaction (autre onglet, ou double clic ayant
            // échappé à transitionInFlight) a déjà clôturé N — abort strict,
            // aucune écriture partielle (P0 FINAL GATE §5/§6).
            concurrencyConflict = true;
            tx.abort();
            return;
          }
          stores[STORE_DOSSIER]!.put(dossier);
          stores[STORE_FISCAL_YEARS]!.put(closedFiscalYear);
          stores[STORE_FISCAL_YEARS]!.put(nextFiscalYearRecord);
          stores[STORE_WORKSPACE]!.put(workspaceRecord);
        };
        checkRequest.onerror = () => {
          tx.abort();
        };
      },
    );
  } catch (error) {
    if (concurrencyConflict) {
      throw new FiscalYearAlreadyClosedError(workspace.fiscalYear.id);
    }
    throw error;
  }

  return { dossier, closedFiscalYear, nextFiscalYear, nextWorkspace };
}
