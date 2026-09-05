/**
 * P3-SOCLE-CYCLE-FISCAL — Design Gate "Clôture N → N+1" — tests IndexedDB
 * RÉELS de persistFiscalYearClosureAndTransition() / loadArchivedFiscalYear()
 * (dossier-db.ts), contre `fake-indexeddb` (in-memory, comportement du spec
 * IndexedDB réel — pas un mock de ces fonctions). Couvre T1/T2/T3/T13/T14 de
 * la matrice initiale (annoncés mais jamais écrits avant ce chantier — trou
 * confirmé par l'audit) ainsi que R1-R13 et les cas de concurrence du P0
 * FINAL GATE.
 *
 * Chaque test utilise un `dossierId`/`userId`/`fiscalYear.id` UNIQUE (compteur
 * global) pour rester isolé des autres tests du même fichier, sans avoir à
 * réinitialiser la base fake entre chaque `it` (la connexion IndexedDB est
 * mise en cache par db.ts pour tout le process, exactement comme dans un
 * onglet réel).
 *
 * Run: npx tsx --test --env-file=.env.local src/lib/lmnp/store/dossier-db.test.ts
 */
import "fake-indexeddb/auto";
(globalThis as unknown as { window: unknown }).window = globalThis;

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  persistFiscalYearClosureAndTransition,
  loadArchivedFiscalYear,
  FiscalYearAlreadyClosedError,
} from "./dossier-db";
import { getDossierRecord, getFiscalYearRecord, getWorkspaceRecord, getDocumentBlob, putDocumentBlob } from "./db";
import { saveWorkspace, __testResetWorkspaceSaveChain } from "./persistence";
import type { PersistedWorkspace } from "./persistence";
import type { Dossier } from "../types/dossier";
import type { FiscalEngineOutput, FiscalYear, LmnpDocument } from "../types/domain";
import type { FiscalYearRecord } from "./dossier-db";

let idCounter = 0;
function uid(prefix: string): string {
  idCounter += 1;
  return `${prefix}-${idCounter}`;
}

function fiscalResult(overrides: Partial<FiscalEngineOutput> = {}): FiscalEngineOutput {
  return {
    exercice: 2025,
    resultatFiscal: 5500,
    resultatAvantAmort: 7000,
    totalRecettes: 9000,
    totalCharges: 2000,
    amortDeduct: 1500,
    amortReporte: 0,
    deficitNouveau: 0,
    stocks: { deficits: [{ millesime: 2025, montant: 800 }], amortissementsReportes: 0 },
    trace: { ksArtifacts: [], computedAt: "2026-09-04T00:00:00.000Z", journal: [] },
    computedAt: "2026-09-04T00:00:00.000Z",
    ...overrides,
  };
}

function readyWorkspace(overrides: {
  fiscalYearId?: string;
  fiscalYearOverrides?: Partial<FiscalYear>;
  documents?: LmnpDocument[];
  siren?: string;
} = {}): PersistedWorkspace {
  const fiscalYearId = overrides.fiscalYearId ?? uid("fy");
  const propertyId = uid("prop");
  return {
    fiscalYear: {
      id: fiscalYearId,
      year: 2025,
      status: "ready_to_close",
      regime: "reel",
      propertyIds: [propertyId],
      declarationGeneratedAt: "2026-09-01T00:00:00.000Z",
      createdAt: "2025-01-01T00:00:00.000Z",
      updatedAt: "2025-01-01T00:00:00.000Z",
      closures: [],
      ...overrides.fiscalYearOverrides,
    },
    properties: [{ id: propertyId, label: "Mon bien", address: "1 rue X", city: "Lyon", postalCode: "69000" }],
    documents: overrides.documents ?? [],
    extractions: [],
    validationItems: [],
    ledgerEntries: [],
    declarationDraft: {
      completedSteps: [],
      siren: overrides.siren ?? "123456789",
      fiscalResult: fiscalResult(),
    },
  };
}

describe("persistFiscalYearClosureAndTransition — R1 happy path", () => {
  it("clôture N, archive N, crée N+1 vide, bascule le workspace vers N+1 — dans une seule transaction", async () => {
    const dossierId = uid("dossier");
    const userId = uid("user");
    const workspace = readyWorkspace();

    const result = await persistFiscalYearClosureAndTransition({
      dossierId,
      userId,
      workspace,
      now: "2026-09-04T00:00:00.000Z",
    });

    // Résultat retourné.
    assert.equal(result.closedFiscalYear.status, "closed");
    assert.equal(result.closedFiscalYear.closures?.length, 1);
    assert.equal(result.nextFiscalYear.status, "draft");
    assert.equal(result.nextFiscalYear.previousFiscalYearId, workspace.fiscalYear.id);
    assert.equal(result.nextFiscalYear.year, workspace.fiscalYear.year + 1);
    assert.equal(result.nextWorkspace.fiscalYear.id, result.nextFiscalYear.id);

    // fiscalYears/N — archive complète et close.
    const archivedN = await getFiscalYearRecord<FiscalYearRecord>(workspace.fiscalYear.id);
    assert.equal(archivedN?.status, "closed");
    assert.equal(archivedN?.dossierId, dossierId);

    // fiscalYears/N+1 — coquille technique vide (Design Gate §5).
    const archivedNPlus1 = await getFiscalYearRecord<FiscalYearRecord>(result.nextFiscalYear.id);
    assert.deepEqual(archivedNPlus1?.documents, []);
    assert.deepEqual(archivedNPlus1?.declarationDraft, undefined);

    // dossier — fiscalYearIds contient exactement N et N+1, pas de N+2.
    const dossier = await getDossierRecord<Dossier>(dossierId);
    assert.deepEqual(new Set(dossier?.fiscalYearIds), new Set([workspace.fiscalYear.id, result.nextFiscalYear.id]));

    // workspace — bascule vers N+1, dans la MÊME transaction (pas via le
    // chemin débounced).
    const workspaceRecord = await getWorkspaceRecord(userId);
    const persisted = workspaceRecord?.data as PersistedWorkspace | undefined;
    assert.equal(persisted?.fiscalYear.id, result.nextFiscalYear.id);
    assert.deepEqual(persisted?.documents, []);
  });

  it("R8 — identité reprise sur N+1, préservée sur l'archive de N", async () => {
    const dossierId = uid("dossier");
    const userId = uid("user");
    const workspace = readyWorkspace({ siren: "987654321" });

    const result = await persistFiscalYearClosureAndTransition({
      dossierId,
      userId,
      workspace,
      now: "2026-09-04T00:00:00.000Z",
    });

    assert.equal(result.nextWorkspace.declarationDraft?.siren, "987654321");
    assert.equal(result.nextWorkspace.declarationDraft?.fiscalResult, undefined, "N+1 ne repart jamais avec le fiscalResult de N");

    const archivedN = await getFiscalYearRecord<FiscalYearRecord>(workspace.fiscalYear.id);
    assert.equal(archivedN?.declarationDraft?.siren, "987654321", "l'identité utilisée par N reste tracée dans son archive");
    assert.notEqual(archivedN?.declarationDraft?.fiscalResult, undefined, "le fiscalResult de N reste dans son archive, jamais effacé");
  });

  it("R7 — transmittedAt n'est jamais écrit par la clôture (indépendance EDI)", async () => {
    const dossierId = uid("dossier");
    const userId = uid("user");
    const workspace = readyWorkspace();

    const result = await persistFiscalYearClosureAndTransition({
      dossierId,
      userId,
      workspace,
      now: "2026-09-04T00:00:00.000Z",
    });

    assert.equal(result.closedFiscalYear.transmittedAt, undefined);
    assert.equal(result.nextWorkspace.fiscalYear.transmittedAt, undefined);
    const archivedN = await getFiscalYearRecord<FiscalYearRecord>(workspace.fiscalYear.id);
    assert.equal(archivedN?.transmittedAt, undefined);
  });

  it("R9 — documents et blobs de N conservés, N+1 démarre sans document, le blob n'est jamais dupliqué ni supprimé", async () => {
    const dossierId = uid("dossier");
    const userId = uid("user");
    const fiscalYearId = uid("fy");
    const documentId = uid("doc");

    await putDocumentBlob({
      documentId,
      fiscalYearId,
      fileName: "bail.pdf",
      mimeType: "application/pdf",
      sizeBytes: 12,
      uploadedAt: "2025-06-01T00:00:00.000Z",
      userId,
      data: new TextEncoder().encode("contenu-bail").buffer,
    });

    const document: LmnpDocument = {
      id: documentId,
      fiscalYearId,
      fileName: "bail.pdf",
      mimeType: "application/pdf",
      sizeBytes: 12,
    };

    const workspace = readyWorkspace({ fiscalYearId, documents: [document] });

    const result = await persistFiscalYearClosureAndTransition({
      dossierId,
      userId,
      workspace,
      now: "2026-09-04T00:00:00.000Z",
    });

    // N+1 (workspace actif) ne porte plus le document.
    assert.deepEqual(result.nextWorkspace.documents, []);

    // N (archive) porte toujours le document.
    const archivedN = await getFiscalYearRecord<FiscalYearRecord>(fiscalYearId);
    assert.deepEqual(archivedN?.documents, [document]);

    // Le blob physique reste accessible tel quel — jamais dupliqué, jamais supprimé.
    const blob = await getDocumentBlob(documentId);
    assert.ok(blob, "le blob doit rester lisible après la transition");
    assert.equal(blob?.fileName, "bail.pdf");
  });
});

describe("persistFiscalYearClosureAndTransition — R2/R10 rejouabilité, rollback, absence de N+2", () => {
  it("R10 — aucun résultat fiscal → refus AVANT toute écriture (rollback total, rien de partiel)", async () => {
    const dossierId = uid("dossier");
    const userId = uid("user");
    const workspace = readyWorkspace();
    workspace.declarationDraft = { completedSteps: [], siren: "123456789", fiscalResult: undefined };

    await assert.rejects(
      () =>
        persistFiscalYearClosureAndTransition({
          dossierId,
          userId,
          workspace,
          now: "2026-09-04T00:00:00.000Z",
        }),
      /Impossible de clôturer/,
    );

    // Rien n'a été écrit : ni dossier, ni archive, ni workspace.
    assert.equal(await getDossierRecord<Dossier>(dossierId), undefined);
    assert.equal(await getWorkspaceRecord(userId), undefined);
  });

  it("R2 — rejouer la même clôture (double appel séquentiel) est refusé : pas de second N+1, pas de N+2", async () => {
    const dossierId = uid("dossier");
    const userId = uid("user");
    const workspace = readyWorkspace();

    const first = await persistFiscalYearClosureAndTransition({
      dossierId,
      userId,
      workspace,
      now: "2026-09-04T00:00:00.000Z",
    });

    // Rejoue l'opération avec le MÊME workspace de départ (simule un double
    // clic ayant échappé à transitionInFlight, ou un onglet resté sur une
    // vue périmée).
    await assert.rejects(
      () =>
        persistFiscalYearClosureAndTransition({
          dossierId,
          userId,
          workspace,
          now: "2026-09-04T00:05:00.000Z",
        }),
      FiscalYearAlreadyClosedError,
    );

    const dossier = await getDossierRecord<Dossier>(dossierId);
    assert.equal(dossier?.fiscalYearIds.length, 2, "exactement N et N+1 — jamais un second N+1 ni un N+2");
    assert.ok(dossier?.fiscalYearIds.includes(first.nextFiscalYear.id));

    // Le workspace actif reste celui écrit par la PREMIÈRE transition.
    const workspaceRecord = await getWorkspaceRecord(userId);
    const persisted = workspaceRecord?.data as PersistedWorkspace | undefined;
    assert.equal(persisted?.fiscalYear.id, first.nextFiscalYear.id);
  });

  it("double-clic réel : deux transitions concurrentes sur le même N → une seule aboutit, aucun N+2", async () => {
    const dossierId = uid("dossier");
    const userId = uid("user");
    const workspace = readyWorkspace();

    const [settledA, settledB] = await Promise.allSettled([
      persistFiscalYearClosureAndTransition({ dossierId, userId, workspace, now: "2026-09-04T00:00:00.000Z" }),
      persistFiscalYearClosureAndTransition({ dossierId, userId, workspace, now: "2026-09-04T00:00:00.100Z" }),
    ]);

    const outcomes = [settledA, settledB];
    const fulfilled = outcomes.filter((o) => o.status === "fulfilled");
    const rejected = outcomes.filter((o) => o.status === "rejected");

    assert.equal(fulfilled.length, 1, "exactement une des deux transitions concurrentes doit réussir");
    assert.equal(rejected.length, 1, "l'autre doit être refusée, jamais silencieusement ignorée");
    assert.ok(
      (rejected[0] as PromiseRejectedResult).reason instanceof FiscalYearAlreadyClosedError,
    );

    const dossier = await getDossierRecord<Dossier>(dossierId);
    assert.equal(dossier?.fiscalYearIds.length, 2, "un seul N+1 créé malgré les deux tentatives concurrentes");
  });
});

describe("loadArchivedFiscalYear — R5/R6 refresh et immutabilité de l'archive", () => {
  it("l'archive de N reste lisible et exacte après la transition (simule un refresh)", async () => {
    const dossierId = uid("dossier");
    const userId = uid("user");
    const workspace = readyWorkspace();

    const result = await persistFiscalYearClosureAndTransition({
      dossierId,
      userId,
      workspace,
      now: "2026-09-04T00:00:00.000Z",
    });

    // Relecture indépendante — simule une nouvelle session/reload consultant
    // l'archive.
    const reread = await loadArchivedFiscalYear(workspace.fiscalYear.id);
    assert.equal(reread?.status, "closed");
    assert.equal(reread?.closures?.length, 1);
    assert.deepEqual(reread?.closures?.[0].stocks, fiscalResult().stocks);

    // fiscalYears/N+1 reste, à ce stade, une coquille vide — jamais lue comme
    // si elle représentait l'état réel de N+1 actif (Design Gate §5).
    const archivedNPlus1 = await loadArchivedFiscalYear(result.nextFiscalYear.id);
    assert.deepEqual(archivedNPlus1?.documents, []);
  });
});

describe("Couche 1/Couche 2 — P0 FINAL GATE, écritures workspace stale", () => {
  it("R11 — une écriture workspace stale de N, en vol au moment du commit de N+1, est refusée (même onglet)", async () => {
    const dossierId = uid("dossier");
    const userId = uid("user");
    const workspace = readyWorkspace();

    const result = await persistFiscalYearClosureAndTransition({
      dossierId,
      userId,
      workspace,
      now: "2026-09-04T00:00:00.000Z",
    });

    // Simule le timer débouncé de N, jamais annulé, qui se déclenche APRÈS le
    // commit de la transition (Couche 1 absente/en échec — scénario du P0
    // FINAL GATE §2, Cas A : écriture déjà "en vol").
    await saveWorkspace(userId, workspace);

    const workspaceRecord = await getWorkspaceRecord(userId);
    const persisted = workspaceRecord?.data as PersistedWorkspace | undefined;
    assert.equal(persisted?.fiscalYear.id, result.nextFiscalYear.id, "N+1 doit rester actif — l'écriture stale de N doit avoir été refusée par la Couche 2");
  });

  it("R12 — la même écriture stale est refusée même en simulant un onglet indépendant (générations de sérialisation réinitialisées)", async () => {
    const dossierId = uid("dossier");
    const userId = uid("user");
    const workspace = readyWorkspace();

    const result = await persistFiscalYearClosureAndTransition({
      dossierId,
      userId,
      workspace,
      now: "2026-09-04T00:00:00.000Z",
    });

    // Réinitialise le compteur de générations du serializer — simule un
    // onglet totalement indépendant (writeGeneration séparé), pour prouver
    // que ce n'est PAS isStaleWorkspaceWrite() (scindé par onglet) qui
    // protège ici, mais bien la relecture disque (Couche 2, partagée entre
    // onglets).
    __testResetWorkspaceSaveChain();

    await saveWorkspace(userId, workspace);

    const workspaceRecord = await getWorkspaceRecord(userId);
    const persisted = workspaceRecord?.data as PersistedWorkspace | undefined;
    assert.equal(persisted?.fiscalYear.id, result.nextFiscalYear.id, "N+1 doit rester actif malgré une génération de sérialisation indépendante");
  });

  it("R14 — une sauvegarde ordinaire du même exercice (N → N, avant toute clôture) continue de fonctionner", async () => {
    const userId = uid("user");
    const workspace = readyWorkspace();
    __testResetWorkspaceSaveChain();

    await saveWorkspace(userId, workspace);
    const updated: PersistedWorkspace = {
      ...workspace,
      declarationDraft: { ...workspace.declarationDraft, siren: "111111111" },
    };
    await saveWorkspace(userId, updated);

    const workspaceRecord = await getWorkspaceRecord(userId);
    const persisted = workspaceRecord?.data as PersistedWorkspace | undefined;
    assert.equal(persisted?.declarationDraft?.siren, "111111111", "une resauvegarde ordinaire du même exercice n'est jamais bloquée par le nouveau guard");
  });

  it("R15 — après transition, une sauvegarde ordinaire de N+1 continue de fonctionner", async () => {
    const dossierId = uid("dossier");
    const userId = uid("user");
    const workspace = readyWorkspace();
    __testResetWorkspaceSaveChain();

    const result = await persistFiscalYearClosureAndTransition({
      dossierId,
      userId,
      workspace,
      now: "2026-09-04T00:00:00.000Z",
    });

    __testResetWorkspaceSaveChain();
    const updatedNextWorkspace: PersistedWorkspace = {
      ...result.nextWorkspace,
      properties: [{ ...result.nextWorkspace.properties[0], label: "Bien mis à jour" }],
    };
    await saveWorkspace(userId, updatedNextWorkspace);

    const workspaceRecord = await getWorkspaceRecord(userId);
    const persisted = workspaceRecord?.data as PersistedWorkspace | undefined;
    assert.equal(persisted?.properties[0].label, "Bien mis à jour", "une resauvegarde ordinaire de N+1 après transition n'est jamais bloquée");
  });
});
