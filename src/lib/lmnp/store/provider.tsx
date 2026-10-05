"use client";

import { sha256HexOfFile } from "@/lib/documents/content-identity";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  createDefaultWorkspace,
  flushWorkspaceSaveConfirmed,
  readLastSyncedServerRevision,
  flushWorkspaceSave,
  hydrateLmnpStore,
  reconcileLocalWorkspaceWithSnapshots,
  removePersistedDocument,
  resetAutosaveStatus,
  scheduleSaveWorkspace,
  subscribeAutosaveStatus,
  syncDocumentBlobs,
  type AutosaveStatus,
  type ConfirmedWorkspaceSaveResult,
} from "./persistence";
import { lastClosedFiscalYear } from "@/lib/lmnp/services/payment/fiscal-year-closure";
import { toPersistedWorkspace } from "./workspace-snapshot";
import { isValidPersistedWorkspace } from "./workspace-snapshot";
import { getWorkspaceRecord, listScopedWorkspaceRecords } from "./db";
import { pickTargetYear } from "./workspace-snapshot-resolve";
import {
  beginWorkspaceSnapshotHydration,
  completeWorkspaceSnapshotHydration,
  listWorkspaceSnapshots,
} from "./workspace-snapshot-client";
import { selectWorkspace, type LmnpAction, type LmnpState } from "./reducer";
import { trackedWorkspaceReducer, workspaceCanPersist, workspaceIsDirty, workspaceScopeKey, type TrackedWorkspace } from "./workspace-dirty";
import { runCreateNextFiscalYear } from "./create-next-fiscal-year";
import { runCloseAndCreateNextFiscalYear } from "./close-and-create-next-fiscal-year";
import { loadArchivedWorkspaceFromServer } from "./fiscal-year-archive";
import { repairLegacyTakeoverContinuity } from "@/lib/lmnp/services/dossier/repair-legacy-takeover-continuity";
import { loadDossierInpiStatus, saveDossierInpiStatus, type DossierInpiStatusMirror } from "./dossier-db";
import { resolveDocumentFile } from "@/lib/lmnp/services/resolve-document-file";
import type { DeclarationDraft } from "../types";
import type { InpiStatus, InpiStatusSource } from "../types/dossier";
import { AppLoadingSkeleton } from "@/components/lmnp/shared/AppLoadingSkeleton";
import { subscribeAuthBoundary } from "@/lib/lmnp/auth/auth-boundary";
import { useV3CorrectionScope } from "@/lab/v2-dossier/correction-context";
import { scopeMatchesWorkspace } from "@/lab/v2-dossier/correction-scope";
import { fetchOwnedDossierById, type LmnpDossier } from "@/lib/lmnp/dossier/supabase-dossier";
import {
  logWorkspaceHydrationComplete,
  logWorkspaceHydrationStart,
} from "@/lib/lmnp/hydration";
import { LmnpHydrationProvider } from "@/lib/lmnp/hydration";
import {
  deleteDocumentOnServer,
  ensureActiveDossier,
  fetchDocumentsForDossier,
  setCurrentDossierId,
  reconcileWorkspaceDocuments,
  resolveDocumentDeletionPlan,
  runCreateNewDeclaration,
  runDocumentRemoval,
} from "@/lib/lmnp/dossier";
import { resolveMonoPropertyId } from "@/lib/lmnp/dossier/property-scope";
import { bienScopeFor, resolveActivePropertyId, resolveUploadPropertyScope, withActivePropertyId } from "@/lib/lmnp/dossier/bien-scope";

interface LmnpContextValue {
  workspace: ReturnType<typeof selectWorkspace>;
  dispatch: (action: LmnpAction) => void;
  /**
   * R2B.2b — bien actif : bien explicite du scope V3, sinon bien unique d'un exercice mono cohérent, sinon aucun
   * (`resolveActivePropertyId`). Jamais le premier bien implicite ; aucune écriture, aucune migration.
   */
  activePropertyId: string | undefined;
  getFile: (documentId: string) => File | undefined;
  isReady: boolean;
  autosaveStatus: AutosaveStatus;
  /** Bound auth user id — null means IndexedDB workspace writes are disabled. */
  persistenceUserId: string | null;
  /** Flush the committed workspace; legacy callers may still provide a draft patch. */
  flushWorkspace: (patch?: { declarationDraft?: Partial<DeclarationDraft> }) => Promise<void>;
  /** Current hydrated workspace: revision returned solely after a successful server CAS. */
  confirmWorkspaceSave: (patch?: { declarationDraft?: Partial<DeclarationDraft> }) => Promise<ConfirmedWorkspaceSaveResult>;
  /**
   * MB-MULTI-SERVER-TRUST-2 — vide l'autosave, puis renvoie la révision serveur CONFIRMÉE que le serveur comparera à `expectedRevision`
   * avant toute livraison. Jamais une valeur lue sur le serveur ni devinée : sans confirmation, `failed` (la livraison n'est pas demandée).
   */
  resolveDeliveryRevision: () => Promise<{ status: "ok"; revision: number } | { status: "failed"; reason: string }>;
  /** Document ids currently awaiting server-side deletion confirmation (Supabase-backed documents only). */
  pendingDocumentDeletions: Set<string>;
  /** Last document-deletion error, if any — cleared on the next removal attempt for that document. */
  documentDeletionError: { documentId: string; message: string } | null;
  /**
   * P3-SOCLE-CYCLE-FISCAL — P0-1 v2 — crée l'exercice fiscal suivant du MÊME
   * dossier (distinct de "déclarer un autre bien" / dispatch
   * CREATE_NEW_DECLARATION). Aucun déclencheur UI n'est câblé sur cette
   * fonction pour l'instant — exposée pour un chantier ultérieur.
   */
  createNextFiscalYear: () => Promise<void>;
  /** Dernière erreur de createNextFiscalYear, le cas échéant. */
  nextFiscalYearError: string | null;
  /**
   * Design Gate "Clôture N → N+1", Décision 1 — geste utilisateur unique
   * "Clôturer et continuer" : clôture explicite de N + transition atomique
   * vers N+1. Câblée depuis DeclarationReadyView.tsx.
   */
  closeFiscalYearAndCreateNext: () => Promise<void>;
  /** Dernière erreur de closeFiscalYearAndCreateNext, le cas échéant. */
  closeFiscalYearError: string | null;
  /**
   * P1 — statut INPI, Dossier-level (cf. types/dossier.ts). Source de vérité
   * durable : le record `Dossier` en IndexedDB (survit N→N+1). Ce champ est
   * un miroir de lecture pour le rendu React, hydraté une fois `isReady`
   * (effet séparé ci-dessous, jamais câblé dans l'effet d'hydratation
   * principal — volontairement, cf. commentaire de dossier-db.ts sur le
   * risque de modifier cet effet sans l'avoir intégralement audité).
   * `undefined` tant que non hydraté OU si aucun Dossier n'existe encore.
   */
  dossierInpiStatus: DossierInpiStatusMirror | undefined;
  /** Écrit le statut INPI (Dossier-level) puis met à jour le miroir local. */
  updateInpiStatus: (status: InpiStatus, source: InpiStatusSource) => Promise<void>;
  /** true pendant l'écriture de updateInpiStatus (évite les doubles clics). */
  inpiStatusUpdating: boolean;
}

const LmnpContext = createContext<LmnpContextValue | null>(null);

function toPersisted(state: LmnpState) {
  return toPersistedWorkspace(state);
}

export function LmnpProvider({ children, explicitDossier = null }: { children: ReactNode; explicitDossier?: LmnpDossier | null }) {
  const correctionScope = useV3CorrectionScope();
  const [isReady, setIsReady] = useState(false);
  const [hydrationError, setHydrationError] = useState<string | null>(null);
  const [isHydratingWorkspace, setIsHydratingWorkspace] = useState(true);
  const [autosaveStatus, setAutosaveStatus] = useState<AutosaveStatus>("idle");
  const [persistenceUserId, setPersistenceUserId] = useState<string | null>(null);
  const [pendingDocumentDeletions, setPendingDocumentDeletions] = useState<Set<string>>(new Set());
  const [documentDeletionError, setDocumentDeletionError] = useState<{
    documentId: string;
    message: string;
  } | null>(null);
  // P3-SOCLE-CYCLE-FISCAL — P0-1 v2 — dernière erreur de CREATE_NEXT_FISCAL_YEAR.
  const [nextFiscalYearError, setNextFiscalYearError] = useState<string | null>(null);
  // Design Gate "Clôture N → N+1" — dernière erreur de closeFiscalYearAndCreateNext.
  const [closeFiscalYearError, setCloseFiscalYearError] = useState<string | null>(null);
  // P1 — miroir React du statut INPI Dossier-level (source de vérité :
  // IndexedDB STORE_DOSSIER, cf. dossier-db.ts). Géré en useState séparé du
  // useReducer principal, volontairement : aucune action ni case ajoutés à
  // reducer.ts pour ce chantier, exactement le même patron que
  // `autosaveStatus`/`closeFiscalYearError` ci-dessus.
  const [dossierInpiStatus, setDossierInpiStatus] = useState<DossierInpiStatusMirror | undefined>(undefined);
  const [inpiStatusUpdating, setInpiStatusUpdating] = useState(false);
  const authUserIdRef = useRef<string | null>(null);
  const [tracked, dispatchTracked] = useReducer(trackedWorkspaceReducer, {
    workspace: { ...createDefaultWorkspace(), fileRegistry: new Map() } as LmnpState,
    appliedActions: 0, incarnation: 0, version: 0, savedVersion: 0, scopeKey: null,
  } satisfies TrackedWorkspace);
  const state = tracked.workspace;
  const stateRef = useRef(state);
  const trackedRef = useRef(tracked);
  const queuedActionsRef = useRef(0);
  const commitWaitersRef = useRef<Array<{ target: number; resolve: () => void }>>([]);
  useLayoutEffect(() => {
    stateRef.current = state;
    trackedRef.current = tracked;
    commitWaitersRef.current = commitWaitersRef.current.filter(waiter => {
      if (waiter.target > tracked.appliedActions) return true;
      waiter.resolve();
      return false;
    });
  }, [state, tracked]);
  const dispatch = useCallback((action: LmnpAction) => {
    queuedActionsRef.current += 1;
    dispatchTracked({ type: "apply", action, userId: authUserIdRef.current });
  }, []);
  const awaitCommittedActions = useCallback(async () => {
    const target = queuedActionsRef.current;
    if (trackedRef.current.appliedActions >= target) return;
    await new Promise<void>(resolve => commitWaitersRef.current.push({ target, resolve }));
  }, []);

  const hydrationBlockedRef = useRef(false);
  const pendingFileLoadsRef = useRef(new Set<string>());

  useEffect(() => {
    return subscribeAuthBoundary(async ({ userId, previousUserId, userChanged }) => {
      let blocked = false;
      try {
        if (userChanged && previousUserId && !hydrationBlockedRef.current && workspaceCanPersist(trackedRef.current, previousUserId, true)) {
          const previous = toPersisted(stateRef.current);
          if (!correctionScope || scopeMatchesWorkspace(correctionScope, previous)) {
            await flushWorkspaceSave(previousUserId, previous);
          }
        }

        hydrationBlockedRef.current = false;
        setHydrationError(null);
        beginWorkspaceSnapshotHydration();
        authUserIdRef.current = userId;
        setPersistenceUserId(userId);
        setIsReady(false);
        setIsHydratingWorkspace(true);
        logWorkspaceHydrationStart();
        pendingFileLoadsRef.current.clear();

        if (!userId) {
          dispatch({ type: "AUTH_SESSION_RESET" });
          resetAutosaveStatus();
          return;
        }

        // Resolve the dossier before reading any local workspace. The URL gate
        // already checked ownership; an auth switch cannot reuse that result.
        const exactCorrection = !explicitDossier && correctionScope
          ? await fetchOwnedDossierById(userId, correctionScope.dossierId) : null;
        const dossier = explicitDossier
          ? explicitDossier.user_id === userId ? explicitDossier : null
          : exactCorrection ? exactCorrection.status === "ok" ? exactCorrection.dossier : null
          : await ensureActiveDossier(userId);
        if (correctionScope && dossier?.id !== correctionScope.dossierId) {
          blocked = true;
          hydrationBlockedRef.current = true;
          setHydrationError("Le dossier de cette correction a changé.");
          return;
        }
        if (explicitDossier && !dossier) {
          blocked = true;
          hydrationBlockedRef.current = true;
          setHydrationError("Ce dossier ne peut pas être vérifié pour cette session.");
          return;
        }
        if (dossier) setCurrentDossierId(dossier.id, userId);
        const listed = dossier ? await listWorkspaceSnapshots(dossier.id) : null;
        if (listed?.status === "error") {
          blocked = true;
          hydrationBlockedRef.current = true;
          setHydrationError("Les exercices de ce dossier ne peuvent pas être vérifiés pour le moment.");
          return;
        }
        const snapshots = listed?.status === "ok" ? listed.snapshots.filter(row => row.dossierId === dossier?.id) : [];
        const scopedRecords = dossier ? await listScopedWorkspaceRecords(userId, dossier.id) : [];
        const legacyRecord = dossier ? await getWorkspaceRecord(userId) : undefined;
        const candidates = scopedRecords.flatMap(record => isValidPersistedWorkspace(record.data) &&
          record.data.fiscalYear.status !== "closed" ? [record.data] : []);
        const legacyWorkspace = legacyRecord?.data;
        if (isValidPersistedWorkspace(legacyWorkspace) &&
            legacyWorkspace.fiscalYear.dossierId === dossier?.id &&
            legacyWorkspace.fiscalYear.status !== "closed" &&
            !candidates.some(candidate => candidate.fiscalYear.year === legacyWorkspace.fiscalYear.year)) {
          candidates.push(legacyWorkspace);
        }
        if (dossier && dossier.active_fiscal_year == null && candidates.length > 1 && snapshots.length === 0) {
          blocked = true;
          hydrationBlockedRef.current = true;
          setHydrationError("Nous ne pouvons pas déterminer automatiquement l’exercice actif de ce dossier.");
          return;
        }
        const target = dossier
          ? pickTargetYear(candidates.length === 1 ? candidates[0] : null, snapshots, lastClosedFiscalYear(), dossier.active_fiscal_year)
          : { status: "no_year" as const };
        if (dossier && (target.status === "ambiguous" || (explicitDossier && target.status === "no_year"))) {
          blocked = true;
          hydrationBlockedRef.current = true;
          setHydrationError("Nous ne pouvons pas déterminer automatiquement l’exercice actif de ce dossier.");
          return;
        }
        const { workspace, fileRegistry, lastSyncedServerRevision } = await hydrateLmnpStore(
          userId, dossier && target.status === "resolved" ? { dossierId: dossier.id, fiscalYear: target.year } : undefined,
        );
        const localWorkspace = dossier && workspace && workspace.fiscalYear.dossierId !== dossier.id
          ? null : workspace;
        const localFileRegistry = localWorkspace === workspace ? fileRegistry : new Map<string, File>();

        let baseWorkspace = localWorkspace;
        if (dossier) {
          const decision = await reconcileLocalWorkspaceWithSnapshots({
            userId,
            expectedDossierId: dossier.id,
            local: localWorkspace,
            lastSyncedServerRevision,
            snapshots,
            fallbackYear: lastClosedFiscalYear(),
            // Lot 3 — server active year wins over civil fallback / stale local N.
            activeFiscalYear: dossier.active_fiscal_year,
          });
          if (decision.blockWrites ||
              (decision.source === "none" && (snapshots.length > 0 || localWorkspace?.fiscalYear.status === "closed"))) {
            blocked = true;
            hydrationBlockedRef.current = true;
            setHydrationError(decision.source === "blocked" && decision.reason === "ambiguous_fiscal_year"
              ? "Nous ne pouvons pas déterminer automatiquement l’exercice actif de ce dossier."
              : "L’exercice actif de ce dossier ne peut pas être restauré en sécurité.");
            return;
          }
          baseWorkspace = decision.workspace ?? createDefaultWorkspace();
          if (!baseWorkspace.fiscalYear.dossierId) {
            baseWorkspace = {
              ...baseWorkspace,
              fiscalYear: { ...baseWorkspace.fiscalYear, dossierId: dossier.id },
            };
          }
          completeWorkspaceSnapshotHydration({
            blockWrites: decision.blockWrites,
            dossierId: dossier.id,
            fiscalYear: baseWorkspace.fiscalYear.year,
          });
        } else {
          baseWorkspace = localWorkspace ?? createDefaultWorkspace();
        }

        if (dossier && !baseWorkspace.fiscalYear.dossierId) {
          baseWorkspace = {
            ...baseWorkspace,
            fiscalYear: { ...baseWorkspace.fiscalYear, dossierId: dossier.id },
          };
        }

        // Reconcile may select a newer local workspace after the outer server
        // check. Refuse it before HYDRATE/isReady and therefore before autosave.
        if ((correctionScope && !scopeMatchesWorkspace(correctionScope, baseWorkspace)) ||
            (explicitDossier && (baseWorkspace.fiscalYear.dossierId !== explicitDossier.id ||
              target.status !== "resolved" || baseWorkspace.fiscalYear.year !== target.year))) {
          blocked = true;
          hydrationBlockedRef.current = true;
          setHydrationError("L’exercice ou le bien de cette correction a changé.");
          return;
        }

        // Pre-P0-2E successors stored only scalar opening totals. Recover the
        // per-asset inventory exclusively from the closed server archive.
        if (dossier && baseWorkspace.fiscalYear.immobilisationsOuverture &&
            baseWorkspace.fiscalYear.previousFiscalYearId &&
            !baseWorkspace.fiscalYear.repriseHistoriqueEnContinuite &&
            !baseWorkspace.fiscalYear.continuiteNativeVerifiee &&
            baseWorkspace.fiscalYear.immobilisationsOuverture.actifsReprise === undefined) {
          const archived = await loadArchivedWorkspaceFromServer({
            dossierId: dossier.id,
            fiscalYear: baseWorkspace.fiscalYear.year - 1,
          });
          baseWorkspace = {
            ...baseWorkspace,
            fiscalYear: repairLegacyTakeoverContinuity(
              baseWorkspace.fiscalYear,
              archived.status === "ok" ? archived.workspace.fiscalYear : undefined,
            ),
          };
        }

        const supabaseDocuments = dossier
          ? await fetchDocumentsForDossier(dossier.id, {
              fiscalYear: baseWorkspace.fiscalYear.year,
            })
          : [];
        const reconciliation = reconcileWorkspaceDocuments({
          localDocuments: baseWorkspace.documents,
          supabaseDocuments,
          fiscalYearId: baseWorkspace.fiscalYear.id,
          fiscalYear: baseWorkspace.fiscalYear.year,
          propertyId: resolveMonoPropertyId(baseWorkspace),
          localBlobDocumentIds: new Set(localFileRegistry.keys()),
          localExtractedDocumentIds: new Set(baseWorkspace.extractions.map((e) => e.documentId)),
        });

        console.log("[workspace] reconciliation completed", {
          userId,
          localCount: baseWorkspace.documents.length,
          supabaseCount: supabaseDocuments.length,
          mergedCount: reconciliation.documents.length,
        });

        // TEMPORARY AUDIT LOG — remove after root-cause is confirmed
        const restoredDocs = reconciliation.documents.filter((d) => d.category === "charges");
        console.log("[charges-hydration]", {
          restoredDocs: restoredDocs.map((doc) => ({
            id: doc.id,
            fileName: doc.fileName,
            status: doc.status,
            hasAnalysis: baseWorkspace.extractions.some((e) => e.documentId === doc.id),
          })),
        });
        // TEMPORARY AUDIT LOG — remove after root-cause is confirmed
        console.log("[charges-hydration-debug]", {
          indexedDbDocCount: baseWorkspace.documents.length,
          fileRegistryKeys: [...localFileRegistry.keys()],
          workspaceDocuments: baseWorkspace.documents.map((doc) => ({
            id: doc.id,
            fileName: doc.fileName,
            category: doc.category,
            status: doc.status,
            hasLocalBlob: localFileRegistry.has(doc.id),
            hasExtractions: baseWorkspace.extractions.some((e) => e.documentId === doc.id),
          })),
          reconciledDocuments: reconciliation.documents.map((doc) => ({
            id: doc.id,
            fileName: doc.fileName,
            category: doc.category,
            status: doc.status,
            hasLocalBlob: localFileRegistry.has(doc.id),
            hasExtractions: baseWorkspace.extractions.some((e) => e.documentId === doc.id),
          })),
        });

        // GLOBAL HYDRATION ANALYZED PROMOTION
        // Runs after reconciliation, before HYDRATE dispatch, for ALL document categories.
        // Invariant: if a doc has persisted extractions, its analysis already completed in a
        // prior session. The stored status may be stale ("uploaded") due to the 350ms debounce
        // save racing an auth event, or Supabase rows being absent. Promote unconditionally.
        const extractedDocIds = new Set(baseWorkspace.extractions.map((e) => e.documentId));
        const promotedDocuments = reconciliation.documents.map((doc) => {
          const previousStatus = doc.status;
          const hasPersistedExtractions = extractedDocIds.has(doc.id);
          const finalStatus =
            doc.status === "uploaded" && hasPersistedExtractions ? "analyzed" as const : doc.status;
          // TEMPORARY AUDIT LOG — remove after root-cause is confirmed
          console.log("[global-hydration-promotion]", {
            id: doc.id,
            fileName: doc.fileName,
            category: doc.category,
            previousStatus,
            hasPersistedExtractions,
            finalStatus,
          });
          return finalStatus !== previousStatus ? { ...doc, status: finalStatus } : doc;
        });

        if (localWorkspace) {
          console.log("[workspace] restored existing workspace", { userId });
        } else {
          console.log("[workspace] initialized fresh workspace", { userId });
        }

        dispatch({
          type: "HYDRATE",
          payload: {
            ...baseWorkspace,
            documents: promotedDocuments,
          },
          files: localFileRegistry,
        });

        // Hydration proves only that a workspace was read. It is not a new
        // confirmed server save and must not display the autosave success state.
        resetAutosaveStatus();
      } finally {
        logWorkspaceHydrationComplete();
        setIsHydratingWorkspace(false);
        console.log("[workspace] hydration completed", { userId: authUserIdRef.current });
        setIsReady(!blocked);
      }
    });
  }, [correctionScope, dispatch, explicitDossier]);

  useEffect(() => subscribeAutosaveStatus(setAutosaveStatus), []);

  // P1 — hydratation du statut INPI, effet ENTIÈREMENT séparé de l'effet
  // d'hydratation du workspace ci-dessus (jamais fusionné avec lui — cf.
  // dossier-db.ts : cet effet est déjà complexe et activement instrumenté,
  // le modifier sans audit complet dépasserait le périmètre de ce chantier).
  // Se déclenche une fois `isReady` (workspace hydraté) ET un dossierId
  // Supabase disponible ; sans dossierId, aucun Dossier ne peut exister
  // (cf. Dossier.id === lmnp_dossiers.id), le miroir reste `undefined`.
  useEffect(() => {
    if (!isReady || !authUserIdRef.current) return;
    const dossierId = stateRef.current.fiscalYear.dossierId;
    if (!dossierId) return;

    let cancelled = false;
    void loadDossierInpiStatus(dossierId).then((result) => {
      if (!cancelled) setDossierInpiStatus(result ?? {});
    });
    return () => {
      cancelled = true;
    };
  }, [isReady]);

  const updateInpiStatus = useCallback(async (status: InpiStatus, source: InpiStatusSource) => {
    const dossierId = stateRef.current.fiscalYear.dossierId;
    if (!dossierId) return;
    if (correctionScope && !scopeMatchesWorkspace(correctionScope, toPersisted(stateRef.current))) throw new Error("scope_mismatch");
    setInpiStatusUpdating(true);
    try {
      const now = new Date().toISOString();
      await saveDossierInpiStatus({
        dossierId,
        workspace: toPersisted(stateRef.current),
        status,
        source,
        now,
      });
      setDossierInpiStatus({ status, source, updatedAt: now });
    } finally {
      setInpiStatusUpdating(false);
    }
  }, [correctionScope]);

  useEffect(() => {
    if (!workspaceCanPersist(tracked, authUserIdRef.current, isReady)) return;
    const snapshot = toPersisted(tracked.workspace);
    if (correctionScope && !scopeMatchesWorkspace(correctionScope, snapshot)) {
      queueMicrotask(() => setAutosaveStatus("error"));
      return;
    }
    const { scopeKey, incarnation, version } = tracked;
    if (!scopeKey) return;
    scheduleSaveWorkspace(snapshot, authUserIdRef.current, () => {
      dispatchTracked({ type: "server_confirmed", scopeKey, incarnation, version });
    });
  }, [
    isReady,
    tracked,
    correctionScope,
  ]);

  useLayoutEffect(() => {
    if (!isReady) return;
    void syncDocumentBlobs(state.documents, state.fileRegistry, authUserIdRef.current, state.fiscalYear.id);
  }, [isReady, state.documents, state.fileRegistry, state.fiscalYear.id]);

  // Identité de contenu : SHA-256 des octets de chaque fichier chargé dont l'empreinte est absente (uploads, restaurations, anciens
  // documents). Calcul async hors reducer ; aucune décision fiscale n'en dépend ici (détection de risque de double comptage seulement).
  useEffect(() => {
    if (!isReady) return;
    let cancelled = false;
    for (const doc of state.documents) {
      if (doc.contentSha256 !== undefined) continue;
      const file = state.fileRegistry.get(doc.id);
      if (file === undefined) continue;
      void sha256HexOfFile(file)
        .then((sha256) => { if (!cancelled) dispatch({ type: "DOCUMENT_SET_CONTENT_SHA256", documentId: doc.id, sha256 }); })
        .catch(() => undefined);
    }
    return () => { cancelled = true; };
  }, [isReady, state.documents, state.fileRegistry, dispatch]);

  useEffect(() => {
    if (!isReady) return;

    const flush = () => {
      if (!workspaceCanPersist(trackedRef.current, authUserIdRef.current, isReady)) return;
      const snapshot = toPersisted(stateRef.current);
      if (correctionScope && !scopeMatchesWorkspace(correctionScope, snapshot)) return;
      const { scopeKey, incarnation, version } = trackedRef.current;
      if (!scopeKey) return;
      void flushWorkspaceSave(authUserIdRef.current, snapshot, () => {
        dispatchTracked({ type: "server_confirmed", scopeKey, incarnation, version });
      });
      void syncDocumentBlobs(
        stateRef.current.documents,
        stateRef.current.fileRegistry,
        authUserIdRef.current,
        stateRef.current.fiscalYear.id,
      );
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") flush();
    };

    window.addEventListener("beforeunload", flush);
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      window.removeEventListener("beforeunload", flush);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [isReady, correctionScope]);

  const workspace = useMemo(() => selectWorkspace(state), [state]);
  const activePropertyId = useMemo(() => resolveActivePropertyId(correctionScope, workspace), [correctionScope, workspace]);

  const getFile = useCallback(
    (documentId: string) => {
      const cached = state.fileRegistry.get(documentId);
      if (cached) return cached;

      if (pendingFileLoadsRef.current.has(documentId)) return undefined;

      const doc = state.documents.find((d) => d.id === documentId);
      if (!doc) return undefined;

      // Lazy restore: IndexedDB first, then Storage via storagePath (Lot 3).
      // Never mass-download at hydrate — only when a consumer asks for the blob.
      pendingFileLoadsRef.current.add(documentId);
      void resolveDocumentFile(doc, () => undefined, {
        onCached: (id, file) => {
          dispatch({ type: "REGISTER_FILE", documentId: id, file });
        },
      })
        .catch(() => {
          // Keep metadata; consumer sees undefined until re-import / retry.
        })
        .finally(() => {
          pendingFileLoadsRef.current.delete(documentId);
        });

      return undefined;
    },
    [dispatch, state.fileRegistry, state.documents],
  );

  const flushWorkspace = useCallback(
    async (patch?: { declarationDraft?: Partial<DeclarationDraft> }) => {
      // Callers still pass a speculative patch for the old pre-commit flush.
      // The reducer is now the only mutation authority; wait for its commit
      // and persist that exact state instead of replaying a possibly stale patch.
      void patch;
      await awaitCommittedActions();
      const userId = authUserIdRef.current;
      if (!workspaceCanPersist(trackedRef.current, userId, isReady)) {
        if (workspaceIsDirty(trackedRef.current)) throw new Error("scope_unavailable");
        return;
      }
      const base = toPersisted(stateRef.current);
      if (correctionScope && !scopeMatchesWorkspace(correctionScope, base)) throw new Error("scope_mismatch");
      const { scopeKey, incarnation, version } = trackedRef.current;
      if (!scopeKey) throw new Error("scope_unavailable");
      await flushWorkspaceSave(userId, base, () => {
        dispatchTracked({ type: "server_confirmed", scopeKey, incarnation, version });
      });
    },
    [awaitCommittedActions, correctionScope, isReady],
  );

  const confirmWorkspaceSave = useCallback(
    async (patch?: { declarationDraft?: Partial<DeclarationDraft> }): Promise<ConfirmedWorkspaceSaveResult> => {
      void patch;
      await awaitCommittedActions();
      const userId = authUserIdRef.current;
      if (!userId || !isReady || hydrationBlockedRef.current) {
        return { status: "failed", reason: "scope_unavailable" };
      }
      const current = toPersisted(stateRef.current);
      // The loaded workspace owns the save scope even on ordinary production URLs.
      // An explicit correction still has to match; it never falls back to another dossier.
      const saveScope = correctionScope ?? {
        dossierId: current.fiscalYear.dossierId,
        fiscalYearId: current.fiscalYear.id,
        year: current.fiscalYear.year,
        property: { kind: "not_applicable" as const },
      };
      if (!saveScope.dossierId || !saveScope.fiscalYearId || !Number.isInteger(saveScope.year)) {
        return { status: "failed", reason: "scope_unavailable" };
      }
      if (!scopeMatchesWorkspace({ ...saveScope, dossierId: saveScope.dossierId }, current)) return { status: "failed", reason: "scope_mismatch" };
      if (trackedRef.current.scopeKey !== workspaceScopeKey(userId, stateRef.current)) {
        return { status: "failed", reason: "scope_unavailable" };
      }
      if (!workspaceCanPersist(trackedRef.current, userId, isReady)) {
        return workspaceIsDirty(trackedRef.current)
          ? { status: "failed", reason: "scope_unavailable" }
          : { status: "clean" };
      }
      const { scopeKey, incarnation, version } = trackedRef.current;
      if (!scopeKey) return { status: "failed", reason: "scope_unavailable" };
      const result = await flushWorkspaceSaveConfirmed(userId, () => {
        const base = toPersisted(stateRef.current);
        if (authUserIdRef.current !== userId || trackedRef.current.incarnation !== incarnation ||
            !scopeMatchesWorkspace({ ...saveScope, dossierId: saveScope.dossierId! }, base)) throw new Error("scope_mismatch");
        return base;
      });
      if (result.status === "confirmed") {
        dispatchTracked({ type: "server_confirmed", scopeKey, incarnation, version });
      }
      return result;
    },
    [awaitCommittedActions, correctionScope, isReady],
  );

  const resolveDeliveryRevision = useCallback(async (): Promise<{ status: "ok"; revision: number } | { status: "failed"; reason: string }> => {
    const saved = await confirmWorkspaceSave();
    if (saved.status === "confirmed") return { status: "ok", revision: saved.revision };
    if (saved.status === "failed") return { status: "failed", reason: saved.reason };
    // « clean » : aucune écriture en attente — la révision à envoyer est celle que cet onglet a confirmée en dernier.
    const userId = authUserIdRef.current;
    const revision = userId ? await readLastSyncedServerRevision(userId, toPersisted(stateRef.current)) : null;
    return revision !== null ? { status: "ok", revision } : { status: "failed", reason: "revision_unknown" };
  }, [confirmWorkspaceSave]);

  // P3-SOCLE-CYCLE-FISCAL — P0-1 v2 — même dossier, exercice suivant.
  // Chemin entièrement distinct de CREATE_NEW_DECLARATION (dispatchWithPersistence
  // ci-dessous) : aucune purge de document, préconditions vérifiées avant tout
  // effet, dispatch uniquement après persistance atomique réussie.
  // Aucun déclencheur UI n'existe encore pour cette fonction — exposée ici
  // pour un câblage dans un chantier ultérieur (voir rapport).
  const createNextFiscalYear = useCallback(async () => {
    await runCreateNextFiscalYear({
      dossierId: stateRef.current.fiscalYear.dossierId ?? null,
      userId: authUserIdRef.current,
      workspace: toPersisted(stateRef.current),
      dispatchCreateNextFiscalYear: (nextFiscalYear, properties) =>
        dispatch({ type: "CREATE_NEXT_FISCAL_YEAR", nextFiscalYear, properties }),
      onError: setNextFiscalYearError,
    });
  }, [dispatch]);

  // Design Gate "Clôture N → N+1", Décision 1 — geste utilisateur unique
  // "Clôturer et continuer", câblé depuis DeclarationReadyView.tsx. userId
  // transmis explicitement (authUserIdRef.current) : requis pour flusher le
  // debounce en attente (Couche 1, P0 FINAL GATE) ET pour écrire le workspace
  // de N+1 dans la même transaction atomique.
  const closeFiscalYearAndCreateNext = useCallback(async () => {
    await runCloseAndCreateNextFiscalYear({
      dossierId: stateRef.current.fiscalYear.dossierId ?? null,
      userId: authUserIdRef.current,
      workspace: toPersisted(stateRef.current),
      dispatchCloseAndCreateNext: (nextWorkspace) =>
        dispatch({ type: "CLOSE_FISCAL_YEAR_AND_CREATE_NEXT", nextWorkspace }),
      onError: setCloseFiscalYearError,
    });
  }, [dispatch]);

  const dispatchWithPersistence = useCallback((action: LmnpAction) => {
    if (action.type === "REMOVE_DOCUMENT") {
      const documentId = action.documentId;
      const target = stateRef.current.documents.find((d) => d.id === documentId);
      const plan = resolveDocumentDeletionPlan({
        hasSupabaseArtifacts: target?.hasSupabaseArtifacts,
        dossierId: stateRef.current.fiscalYear.dossierId ?? null,
        documentRole: target?.documentRole,
        originFiscalYear: target?.fiscalYear,
        activeFiscalYear: stateRef.current.fiscalYear.year,
      });

      void runDocumentRemoval({
        documentId,
        plan,
        removeLocal: (id) => {
          dispatch(action);
          void removePersistedDocument(id);
        },
        deleteOnServer: deleteDocumentOnServer,
        onPendingChange: (id, pending) => {
          setPendingDocumentDeletions((current) => {
            const next = new Set(current);
            if (pending) next.add(id);
            else next.delete(id);
            return next;
          });
        },
        onError: (id, message) => {
          setDocumentDeletionError(message ? { documentId: id, message } : null);
        },
      });
      return;
    }

    if (action.type === "CREATE_NEW_DECLARATION") {
      // Purge every Supabase-backed document BEFORE replacing the workspace —
      // never the reverse. dispatch(action) below is what actually wipes
      // state.documents, which is what the autosave effect watches; as long
      // as it isn't called, no IndexedDB write of the empty workspace can
      // happen, and a failed purge leaves the current workspace untouched.
      //
      // P3-SOCLE-CYCLE-FISCAL — P0-1 v2 : cette action reste strictement
      // "déclarer un autre bien" (nouveau dossier/parcours, remplacement
      // intégral et irréversible — cf. le texte de confirmation affiché à
      // l'utilisateur dans DeclarationCompletedActions.tsx). Elle ne doit
      // JAMAIS créer un FiscalYear N+1 du dossier courant — c'est le rôle de
      // CREATE_NEXT_FISCAL_YEAR (voir create-next-fiscal-year.ts), un flux
      // entièrement séparé. Ne pas réintroduire ici de logique de cycle
      // fiscal pluriannuel.
      void runCreateNewDeclaration({
        documents: stateRef.current.documents,
        dossierId: stateRef.current.fiscalYear.dossierId ?? null,
        deleteOnServer: deleteDocumentOnServer,
        dispatchCreateNewDeclaration: () => dispatch(action),
        onError: (message) => {
          if (message) {
            alert(
              `Suppression des documents impossible : ${message}\n\nVotre déclaration actuelle n'a pas été modifiée.`,
            );
          }
        },
      });
      return;
    }

    dispatch(action);
  }, [dispatch]);

  const value = useMemo(
    () => ({
      workspace,
      dispatch: dispatchWithPersistence,
      activePropertyId,
      getFile,
      isReady,
      autosaveStatus,
      persistenceUserId,
      flushWorkspace,
      confirmWorkspaceSave,
      resolveDeliveryRevision,
      pendingDocumentDeletions,
      documentDeletionError,
      createNextFiscalYear,
      nextFiscalYearError,
      closeFiscalYearAndCreateNext,
      closeFiscalYearError,
      dossierInpiStatus,
      updateInpiStatus,
      inpiStatusUpdating,
    }),
    [
      workspace,
      dispatchWithPersistence,
      activePropertyId,
      getFile,
      isReady,
      autosaveStatus,
      persistenceUserId,
      flushWorkspace,
      confirmWorkspaceSave,
      resolveDeliveryRevision,
      pendingDocumentDeletions,
      documentDeletionError,
      createNextFiscalYear,
      nextFiscalYearError,
      closeFiscalYearAndCreateNext,
      closeFiscalYearError,
      dossierInpiStatus,
      updateInpiStatus,
      inpiStatusUpdating,
    ],
  );

  if (hydrationError) {
    return <main className="mx-auto max-w-2xl p-8" role="alert">
      <h1>Dossier indisponible</h1><p>{hydrationError}</p>
    </main>;
  }

  if (!isReady) {
    return (
      <LmnpHydrationProvider
        isHydratingWorkspace={isHydratingWorkspace}
        setWorkspaceHydrating={setIsHydratingWorkspace}
      >
        <AppLoadingSkeleton message="Restauration de votre dossier…" />
      </LmnpHydrationProvider>
    );
  }

  return (
    <LmnpHydrationProvider
      isHydratingWorkspace={isHydratingWorkspace}
      setWorkspaceHydrating={setIsHydratingWorkspace}
    >
      <LmnpContext.Provider value={value}>{children}</LmnpContext.Provider>
    </LmnpHydrationProvider>
  );
}

/** Read-only presentation may render outside the workspace provider. */
export function useOptionalLmnp(): LmnpContextValue | null {
  return useContext(LmnpContext);
}

export function useLmnp(): LmnpContextValue {
  const ctx = useContext(LmnpContext);
  if (!ctx) throw new Error("useLmnp must be used within LmnpProvider");
  return ctx;
}

/**
 * R2B.2b — scope du bien actif pour un panel F010–F014 : brouillon lu (legacy : le brouillon lui-même ; scopé : la vue
 * du bien actif) et dispatch qui porte le bien actif sur les actions propres au bien. Bloqué en scopé sans bien actif :
 * aucune vue de repli, et `BienScopeGate` ne monte alors pas le panel.
 */
const EMPTY_BIEN_DRAFT: DeclarationDraft = Object.freeze({ completedSteps: [] }) as DeclarationDraft;

/** MB-MULTI-UX-1 — attribution explicite des téléversements de documents de bien (voir `resolveUploadPropertyScope`). */
export function useUploadPropertyScope() {
  const { workspace, activePropertyId } = useLmnp();
  return useMemo(() => resolveUploadPropertyScope(workspace, activePropertyId), [workspace, activePropertyId]);
}

export function useBienScope() {
  const { workspace, dispatch, activePropertyId } = useLmnp();
  const scope = useMemo(() => bienScopeFor(workspace, activePropertyId), [workspace, activePropertyId]);
  const propertyId = scope.status === "ready" ? scope.propertyId : undefined;
  const scopedDispatch = useCallback(
    (action: LmnpAction) => dispatch(withActivePropertyId(action, propertyId)),
    [dispatch, propertyId],
  );
  return {
    scope,
    propertyId,
    // Bloqué : brouillon VIDE (jamais une vue à plat de repli) — `BienScopeGate` ne monte d'ailleurs pas le panel.
    draft: scope.status === "ready" ? scope.draft : EMPTY_BIEN_DRAFT,
    property: propertyId === undefined ? undefined : workspace.properties.find((item) => item.id === propertyId),
    dispatch: scopedDispatch,
  };
}
