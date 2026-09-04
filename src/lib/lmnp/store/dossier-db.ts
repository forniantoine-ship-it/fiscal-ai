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
  withStores,
  STORE_DOSSIER,
  STORE_FISCAL_YEARS,
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
import type { Dossier } from "../types/dossier";
import {
  createNextFiscalYear,
  extractDossierLevelDataFromWorkspace,
  extractIdentity,
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
