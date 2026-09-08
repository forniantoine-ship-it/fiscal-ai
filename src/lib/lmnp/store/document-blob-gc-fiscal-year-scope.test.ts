/**
 * P0 (bug GC multi-exercices) — `syncDocumentBlobs()`/`loadFileRegistry()`
 * (persistence.ts) purgeaient auparavant le store global `document-blobs` en
 * le comparant uniquement aux documents de l'exercice ACTIF : après un
 * passage N → N+1 (workspace.documents devient `[]`), le premier appel
 * supprimait tous les blobs de TOUS les exercices de l'utilisateur, N compris
 * — alors que `FiscalYearRecord.documents` (l'archive de N) restait, lui,
 * intact. Ce fichier teste la CHAÎNE RÉELLE contre `fake-indexeddb` (pas des
 * mocks des fonctions auditées), en reproduisant exactement le scénario
 * observé : `state.documents` passe de `[document de N]` à `[]` au moment de
 * la transition, comme le fait le reducer `CLOSE_FISCAL_YEAR_AND_CREATE_NEXT`.
 *
 * Run: npx tsx --test --env-file=.env.local src/lib/lmnp/store/document-blob-gc-fiscal-year-scope.test.ts
 */
import "fake-indexeddb/auto";
(globalThis as unknown as { window: unknown }).window = globalThis;

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { putDocumentBlob, getDocumentBlob, putWorkspaceRecord } from "./db";
import { syncDocumentBlobs, hydrateLmnpStore, __testResetWorkspaceSaveChain } from "./persistence";
import type { PersistedWorkspace } from "./persistence";
import type { DocumentBlobRecord } from "./db";
import type { FiscalYear, LmnpDocument } from "../types/domain";

let idCounter = 0;
function uid(prefix: string): string {
  idCounter += 1;
  return `${prefix}-${idCounter}`;
}

function blobRecord(overrides: Partial<DocumentBlobRecord> & { documentId: string }): DocumentBlobRecord {
  return {
    fiscalYearId: uid("fy"),
    fileName: "justificatif.pdf",
    mimeType: "application/pdf",
    sizeBytes: 12,
    uploadedAt: "2025-06-01T00:00:00.000Z",
    data: new TextEncoder().encode("contenu").buffer,
    ...overrides,
  };
}

function fiscalYear(overrides: Partial<FiscalYear> & { id: string }): FiscalYear {
  return {
    year: 2025,
    status: "draft",
    regime: "reel",
    propertyIds: [],
    createdAt: "2025-01-01T00:00:00.000Z",
    updatedAt: "2025-01-01T00:00:00.000Z",
    closures: [],
    ...overrides,
  };
}

function workspaceOf(fy: FiscalYear, documents: LmnpDocument[]): PersistedWorkspace {
  return {
    fiscalYear: fy,
    properties: [],
    documents,
    extractions: [],
    validationItems: [],
    ledgerEntries: [],
  };
}

describe("syncDocumentBlobs — portée stricte à l'exercice actif", () => {
  it("1 — blob d'un AUTRE fiscalYear, absent de documents → conservé", async () => {
    const userId = uid("user");
    const activeFiscalYearId = uid("fy-active");
    const otherFiscalYearId = uid("fy-other");
    const documentId = uid("doc");

    await putDocumentBlob(blobRecord({ documentId, fiscalYearId: otherFiscalYearId, userId }));

    await syncDocumentBlobs([], new Map(), userId, activeFiscalYearId);

    const blob = await getDocumentBlob(documentId);
    assert.ok(blob, "un blob d'un exercice différent de l'actif ne doit jamais être supprimé");
  });

  it("2 — blob de l'exercice ACTIF, absent de documents → toujours supprimé (non-régression)", async () => {
    const userId = uid("user");
    const activeFiscalYearId = uid("fy-active");
    const documentId = uid("doc");

    await putDocumentBlob(blobRecord({ documentId, fiscalYearId: activeFiscalYearId, userId }));

    await syncDocumentBlobs([], new Map(), userId, activeFiscalYearId);

    const blob = await getDocumentBlob(documentId);
    assert.equal(blob, undefined, "un blob orphelin de l'exercice actif doit toujours être purgé");
  });

  it("3 — blob d'un AUTRE utilisateur → conservé", async () => {
    const userId = uid("user");
    const otherUserId = uid("user-other");
    const activeFiscalYearId = uid("fy-active");
    const documentId = uid("doc");

    // Même fiscalYearId que l'actif, mais un autre utilisateur : ne doit
    // jamais être touché par la purge de `userId`.
    await putDocumentBlob(blobRecord({ documentId, fiscalYearId: activeFiscalYearId, userId: otherUserId }));

    await syncDocumentBlobs([], new Map(), userId, activeFiscalYearId);

    const blob = await getDocumentBlob(documentId);
    assert.ok(blob, "un blob d'un autre utilisateur ne doit jamais être supprimé");
  });

  it("4 — fiscalYearId absent sur le blob (portée inconnue) → jamais supprimé silencieusement", async () => {
    const userId = uid("user");
    const activeFiscalYearId = uid("fy-active");
    const documentId = uid("doc");

    // Simule un enregistrement historique sans fiscalYearId (le champ reste
    // typé `string` côté TS, mais un enregistrement déjà en base peut en être
    // dépourvu à l'exécution).
    const record = blobRecord({ documentId, userId }) as DocumentBlobRecord;
    delete (record as { fiscalYearId?: string }).fiscalYearId;
    await putDocumentBlob(record);

    await syncDocumentBlobs([], new Map(), userId, activeFiscalYearId);

    const blob = await getDocumentBlob(documentId);
    assert.ok(blob, "une portée inconnue (fiscalYearId absent) ne doit jamais autoriser la purge");
  });

  it("6 — la purge légitime (même exercice, réellement orphelin) reste inchangée en présence d'un document actif", async () => {
    const userId = uid("user");
    const activeFiscalYearId = uid("fy-active");
    const orphanDocumentId = uid("doc-orphan");
    const keptDocumentId = uid("doc-kept");

    await putDocumentBlob(blobRecord({ documentId: orphanDocumentId, fiscalYearId: activeFiscalYearId, userId }));
    await putDocumentBlob(blobRecord({ documentId: keptDocumentId, fiscalYearId: activeFiscalYearId, userId }));

    const keptDocument: LmnpDocument = {
      id: keptDocumentId,
      fiscalYearId: activeFiscalYearId,
      fileName: "conserve.pdf",
      mimeType: "application/pdf",
      sizeBytes: 12,
    };

    await syncDocumentBlobs([keptDocument], new Map(), userId, activeFiscalYearId);

    assert.equal(await getDocumentBlob(orphanDocumentId), undefined, "l'orphelin réel de l'exercice actif reste purgé");
    assert.ok(await getDocumentBlob(keptDocumentId), "le blob toujours référencé par un document actif est conservé");
  });
});

describe("hydrateLmnpStore — scénario N → clôture → N+1", () => {
  it("5 — après la transition, le blob de N reste présent au prochain chargement de l'app", async () => {
    __testResetWorkspaceSaveChain();
    const userId = uid("user");
    const documentId = uid("doc");
    const fiscalYearN = fiscalYear({ id: uid("fy-n"), status: "closed" });
    const fiscalYearNPlus1 = fiscalYear({ id: uid("fy-n1"), status: "draft" });

    // Blob et document de N, encore présents au moment de la clôture.
    await putDocumentBlob(blobRecord({ documentId, fiscalYearId: fiscalYearN.id, userId }));

    // Le workspace ACTIF bascule vers N+1, vide de tout document — exactement
    // ce que produit CLOSE_FISCAL_YEAR_AND_CREATE_NEXT côté reducer.
    await putWorkspaceRecord(userId, workspaceOf(fiscalYearNPlus1, []));

    // Premier chargement de l'app après la clôture (nouvel onglet / refresh).
    await hydrateLmnpStore(userId);

    const blob = await getDocumentBlob(documentId);
    assert.ok(blob, "le blob de l'exercice clôturé N doit survivre à l'hydratation de N+1");
  });
});
