import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  purgeAllSupabaseDocuments,
  resolveDocumentDeletionPlan,
  runCreateNewDeclaration,
  runDocumentRemoval,
} from "./document-deletion-plan";

describe("resolveDocumentDeletionPlan", () => {
  it("document sans artefact Supabase → local-only", () => {
    const plan = resolveDocumentDeletionPlan({ hasSupabaseArtifacts: false, dossierId: "dossier-A" });
    assert.deepEqual(plan, { kind: "local-only" });
  });

  it("document sans artefact Supabase, même sans dossierId connu → local-only (pas de blocage inutile)", () => {
    const plan = resolveDocumentDeletionPlan({ hasSupabaseArtifacts: undefined, dossierId: null });
    assert.deepEqual(plan, { kind: "local-only" });
  });

  it("document avec artefact Supabase + dossierId connu → server-required", () => {
    const plan = resolveDocumentDeletionPlan({ hasSupabaseArtifacts: true, dossierId: "dossier-A" });
    assert.deepEqual(plan, { kind: "server-required", dossierId: "dossier-A" });
  });

  it("document avec artefact Supabase mais dossierId introuvable → blocked (jamais un fallback local silencieux)", () => {
    const plan = resolveDocumentDeletionPlan({ hasSupabaseArtifacts: true, dossierId: null });
    assert.equal(plan.kind, "blocked");
  });
});

describe("runDocumentRemoval — comportement client (P1-3.2, tests #11-14)", () => {
  it("#14 — document purement local : suppression locale immédiate, aucun appel réseau", async () => {
    const calls: string[] = [];
    let deleteOnServerCalled = false;

    await runDocumentRemoval({
      documentId: "doc-local",
      plan: { kind: "local-only" },
      removeLocal: (id) => calls.push(`removeLocal:${id}`),
      deleteOnServer: async () => {
        deleteOnServerCalled = true;
        return "deleted";
      },
      onPendingChange: (id, pending) => calls.push(`pending:${id}:${pending}`),
      onError: (id, message) => calls.push(`error:${id}:${message}`),
    });

    assert.equal(deleteOnServerCalled, false, "aucun appel réseau pour un document purement local");
    assert.deepEqual(calls, ["removeLocal:doc-local"], "pas d'état pending/erreur pour ce chemin inchangé");
  });

  it("#11 — document avec artefact Supabase : removeLocal n'est jamais appelé avant la résolution du serveur", async () => {
    const order: string[] = [];
    let resolveServer: (() => void) | undefined;
    const serverPromise = new Promise<"deleted">((resolve) => {
      resolveServer = () => resolve("deleted");
    });

    const removal = runDocumentRemoval({
      documentId: "doc-A",
      plan: { kind: "server-required", dossierId: "dossier-A" },
      removeLocal: (id) => order.push(`removeLocal:${id}`),
      deleteOnServer: async () => {
        order.push("server-called");
        return serverPromise;
      },
      onPendingChange: () => {},
      onError: () => {},
    });

    // Laisse le microtask du deleteOnServer démarrer sans se résoudre — removeLocal
    // ne doit toujours pas avoir été appelé tant que le serveur n'a pas répondu.
    await Promise.resolve();
    await Promise.resolve();
    assert.deepEqual(order, ["server-called"], "removeLocal ne doit pas précéder la réponse serveur");

    resolveServer?.();
    await removal;
    assert.deepEqual(order, ["server-called", "removeLocal:doc-A"]);
  });

  it("#12 — succès serveur → removeLocal appelé, pending repasse à false, pas d'erreur", async () => {
    const pendingEvents: Array<[string, boolean]> = [];
    let removed = false;
    let lastError: unknown = "untouched";

    await runDocumentRemoval({
      documentId: "doc-A",
      plan: { kind: "server-required", dossierId: "dossier-A" },
      removeLocal: () => {
        removed = true;
      },
      deleteOnServer: async () => "deleted",
      onPendingChange: (id, pending) => pendingEvents.push([id, pending]),
      onError: (_id, message) => {
        lastError = message;
      },
    });

    assert.equal(removed, true, "suppression locale déclenchée après confirmation serveur");
    assert.deepEqual(pendingEvents, [["doc-A", true], ["doc-A", false]], "pending true puis false");
    assert.equal(lastError, null, "onError(null) appelé pour effacer une éventuelle erreur précédente");
  });

  it("#13 — échec serveur → removeLocal jamais appelé, document reste visible, erreur remontée", async () => {
    let removed = false;
    let capturedError: string | null = null;

    await runDocumentRemoval({
      documentId: "doc-A",
      plan: { kind: "server-required", dossierId: "dossier-A" },
      removeLocal: () => {
        removed = true;
      },
      deleteOnServer: async () => {
        throw new Error("Ressource introuvable ou accès refusé.");
      },
      onPendingChange: () => {},
      onError: (_id, message) => {
        capturedError = message;
      },
    });

    assert.equal(removed, false, "le document ne doit jamais disparaître de l'UI sur un échec serveur");
    assert.equal(capturedError, "Ressource introuvable ou accès refusé.");
  });

  it("dossierId introuvable (plan blocked) → erreur immédiate, ni appel réseau ni suppression locale", async () => {
    let removed = false;
    let serverCalled = false;
    let capturedError: string | null = null;

    await runDocumentRemoval({
      documentId: "doc-A",
      plan: { kind: "blocked", reason: "Dossier introuvable — suppression impossible pour l'instant." },
      removeLocal: () => {
        removed = true;
      },
      deleteOnServer: async () => {
        serverCalled = true;
        return "deleted";
      },
      onPendingChange: () => {},
      onError: (_id, message) => {
        capturedError = message;
      },
    });

    assert.equal(removed, false);
    assert.equal(serverCalled, false);
    assert.equal(capturedError, "Dossier introuvable — suppression impossible pour l'instant.");
  });
});

type StubDoc = { id: string; hasSupabaseArtifacts?: boolean };

function stubDeleteOnServer(behavior: Record<string, "deleted" | "already_deleted" | "error">) {
  const calls: string[] = [];
  return {
    calls,
    fn: async (params: { documentId: string; dossierId: string }) => {
      calls.push(params.documentId);
      const outcome = behavior[params.documentId] ?? "deleted";
      if (outcome === "error") {
        throw new Error(`Suppression échouée pour ${params.documentId}`);
      }
      return outcome;
    },
  };
}

describe("purgeAllSupabaseDocuments (P1-6.2)", () => {
  it("#3 aucun document Supabase → no_documents, aucun appel serveur", async () => {
    const stub = stubDeleteOnServer({});
    const outcome = await purgeAllSupabaseDocuments({
      documents: [{ id: "doc-local", hasSupabaseArtifacts: false }],
      dossierId: "dossier-A",
      deleteOnServer: stub.fn,
    });

    assert.deepEqual(outcome, { status: "no_documents" });
    assert.deepEqual(stub.calls, []);
  });

  it("#4 un seul document distant → purgé, status:purged", async () => {
    const stub = stubDeleteOnServer({ "doc-A": "deleted" });
    const outcome = await purgeAllSupabaseDocuments({
      documents: [{ id: "doc-A", hasSupabaseArtifacts: true }],
      dossierId: "dossier-A",
      deleteOnServer: stub.fn,
    });

    assert.deepEqual(outcome, { status: "purged", count: 1 });
    assert.deepEqual(stub.calls, ["doc-A"]);
  });

  it("#5 plusieurs documents distants → tous purgés, tous appelés", async () => {
    const stub = stubDeleteOnServer({ "doc-A": "deleted", "doc-B": "already_deleted", "doc-C": "deleted" });
    const outcome = await purgeAllSupabaseDocuments({
      documents: [
        { id: "doc-A", hasSupabaseArtifacts: true },
        { id: "doc-B", hasSupabaseArtifacts: true },
        { id: "doc-C", hasSupabaseArtifacts: true },
      ],
      dossierId: "dossier-A",
      deleteOnServer: stub.fn,
    });

    assert.deepEqual(outcome, { status: "purged", count: 3 });
    assert.deepEqual([...stub.calls].sort(), ["doc-A", "doc-B", "doc-C"]);
  });

  it("#6 document local-only mêlé à des documents distants → seuls les distants déclenchent un appel serveur", async () => {
    const stub = stubDeleteOnServer({ "doc-remote": "deleted" });
    const outcome = await purgeAllSupabaseDocuments({
      documents: [
        { id: "doc-local", hasSupabaseArtifacts: false },
        { id: "doc-remote", hasSupabaseArtifacts: true },
      ],
      dossierId: "dossier-A",
      deleteOnServer: stub.fn,
    });

    assert.deepEqual(outcome, { status: "purged", count: 1 });
    assert.deepEqual(stub.calls, ["doc-remote"], "doc-local ne doit jamais déclencher d'appel serveur");
  });

  it("#7/#9 un document échoue (le seul, ou le premier) → status:failed", async () => {
    const stub = stubDeleteOnServer({ "doc-A": "error" });
    const outcome = await purgeAllSupabaseDocuments({
      documents: [{ id: "doc-A", hasSupabaseArtifacts: true }],
      dossierId: "dossier-A",
      deleteOnServer: stub.fn,
    });

    assert.equal(outcome.status, "failed");
  });

  it("#8 plusieurs documents, un seul échoue → status:failed, mais TOUS les autres sont tout de même tentés (Promise.allSettled)", async () => {
    const stub = stubDeleteOnServer({ "doc-A": "deleted", "doc-B": "error", "doc-C": "deleted" });
    const outcome = await purgeAllSupabaseDocuments({
      documents: [
        { id: "doc-A", hasSupabaseArtifacts: true },
        { id: "doc-B", hasSupabaseArtifacts: true },
        { id: "doc-C", hasSupabaseArtifacts: true },
      ],
      dossierId: "dossier-A",
      deleteOnServer: stub.fn,
    });

    assert.equal(outcome.status, "failed");
    assert.deepEqual([...stub.calls].sort(), ["doc-A", "doc-B", "doc-C"], "allSettled — pas de court-circuit au premier échec");
    if (outcome.status === "failed") {
      assert.equal(outcome.failures.length, 1);
      assert.equal(outcome.failures[0].documentId, "doc-B");
    }
  });

  it("#10 retry après échec partiel : les documents déjà purgés reviennent already_deleted (idempotent), seul le reste est retenté", async () => {
    // Simule un premier appel où doc-A a réussi et doc-B a échoué : au retry,
    // le serveur (idempotent, voir delete-document.test.ts) renvoie
    // already_deleted pour doc-A et deleted pour doc-B — succès total.
    const retryStub = stubDeleteOnServer({ "doc-A": "already_deleted", "doc-B": "deleted" });
    const outcome = await purgeAllSupabaseDocuments({
      documents: [
        { id: "doc-A", hasSupabaseArtifacts: true },
        { id: "doc-B", hasSupabaseArtifacts: true },
      ],
      dossierId: "dossier-A",
      deleteOnServer: retryStub.fn,
    });

    assert.deepEqual(outcome, { status: "purged", count: 2 });
  });

  it("#11 already_deleted est un succès — ne bloque jamais la purge globale", async () => {
    const stub = stubDeleteOnServer({ "doc-A": "already_deleted" });
    const outcome = await purgeAllSupabaseDocuments({
      documents: [{ id: "doc-A", hasSupabaseArtifacts: true }],
      dossierId: "dossier-A",
      deleteOnServer: stub.fn,
    });

    assert.deepEqual(outcome, { status: "purged", count: 1 });
  });

  // #12 (extracted_document_data déjà absent) et #13 (Storage déjà absent) sont
  // des comportements internes de deleteDocumentArtifacts, déjà démontrés par
  // delete-document.test.ts (P1-3.2) — à ce niveau d'orchestration, les deux
  // se traduisent identiquement par un outcome "already_deleted"/"deleted",
  // couvert par les tests #10/#11 ci-dessus. Pas de nouvelle primitive.
});

describe("runCreateNewDeclaration (P1-6.2)", () => {
  it("#3/#15 aucun document Supabase → dispatch immédiat, aucun appel serveur", async () => {
    const stub = stubDeleteOnServer({});
    let dispatched = false;
    let error: string | null = "untouched";

    await runCreateNewDeclaration({
      documents: [{ id: "doc-local", hasSupabaseArtifacts: false }],
      dossierId: "dossier-A",
      deleteOnServer: stub.fn,
      dispatchCreateNewDeclaration: () => {
        dispatched = true;
      },
      onError: (message) => {
        error = message;
      },
    });

    assert.equal(dispatched, true);
    assert.deepEqual(stub.calls, []);
    assert.equal(error, null);
  });

  it("#4/#5 N/N réussissent → purge complète puis dispatch", async () => {
    const stub = stubDeleteOnServer({ "doc-A": "deleted", "doc-B": "already_deleted" });
    let dispatched = false;

    await runCreateNewDeclaration({
      documents: [
        { id: "doc-A", hasSupabaseArtifacts: true },
        { id: "doc-B", hasSupabaseArtifacts: true },
      ],
      dossierId: "dossier-A",
      deleteOnServer: stub.fn,
      dispatchCreateNewDeclaration: () => {
        dispatched = true;
      },
      onError: () => {},
    });

    assert.equal(dispatched, true);
    assert.deepEqual([...stub.calls].sort(), ["doc-A", "doc-B"]);
  });

  it("#7 un document échoue (0/1) → workspace inchangé, dispatch jamais appelé", async () => {
    const stub = stubDeleteOnServer({ "doc-A": "error" });
    let dispatched = false;
    let error: string | null = null;

    await runCreateNewDeclaration({
      documents: [{ id: "doc-A", hasSupabaseArtifacts: true }],
      dossierId: "dossier-A",
      deleteOnServer: stub.fn,
      dispatchCreateNewDeclaration: () => {
        dispatched = true;
      },
      onError: (message) => {
        error = message;
      },
    });

    assert.equal(dispatched, false, "aucun faux succès — le workspace actuel doit rester intact");
    assert.notEqual(error, null);
  });

  it("#8 N-1/N réussissent, 1 échoue → workspace inchangé (dispatch jamais appelé)", async () => {
    const stub = stubDeleteOnServer({ "doc-A": "deleted", "doc-B": "deleted", "doc-C": "error" });
    let dispatched = false;

    await runCreateNewDeclaration({
      documents: [
        { id: "doc-A", hasSupabaseArtifacts: true },
        { id: "doc-B", hasSupabaseArtifacts: true },
        { id: "doc-C", hasSupabaseArtifacts: true },
      ],
      dossierId: "dossier-A",
      deleteOnServer: stub.fn,
      dispatchCreateNewDeclaration: () => {
        dispatched = true;
      },
      onError: () => {},
    });

    assert.equal(dispatched, false);
  });

  it("#9 le premier document échoue (0/N) → workspace inchangé", async () => {
    const stub = stubDeleteOnServer({ "doc-A": "error", "doc-B": "deleted" });
    let dispatched = false;

    await runCreateNewDeclaration({
      documents: [
        { id: "doc-A", hasSupabaseArtifacts: true },
        { id: "doc-B", hasSupabaseArtifacts: true },
      ],
      dossierId: "dossier-A",
      deleteOnServer: stub.fn,
      dispatchCreateNewDeclaration: () => {
        dispatched = true;
      },
      onError: () => {},
    });

    assert.equal(dispatched, false);
  });

  it("#10 retry après échec → converge vers le dispatch une fois tous les documents purgés", async () => {
    const retryStub = stubDeleteOnServer({ "doc-A": "already_deleted", "doc-B": "deleted" });
    let dispatched = false;

    await runCreateNewDeclaration({
      documents: [
        { id: "doc-A", hasSupabaseArtifacts: true },
        { id: "doc-B", hasSupabaseArtifacts: true },
      ],
      dossierId: "dossier-A",
      deleteOnServer: retryStub.fn,
      dispatchCreateNewDeclaration: () => {
        dispatched = true;
      },
      onError: () => {},
    });

    assert.equal(dispatched, true);
  });

  it("#14 aucun dispatch avant la résolution complète de tous les appels serveur (persistence)", async () => {
    const order: string[] = [];
    let resolveB: (() => void) | undefined;
    const pendingB = new Promise<"deleted">((resolve) => {
      resolveB = () => resolve("deleted");
    });

    const removal = runCreateNewDeclaration({
      documents: [
        { id: "doc-A", hasSupabaseArtifacts: true },
        { id: "doc-B", hasSupabaseArtifacts: true },
      ],
      dossierId: "dossier-A",
      deleteOnServer: async (params) => {
        order.push(`server:${params.documentId}`);
        if (params.documentId === "doc-B") return pendingB;
        return "deleted";
      },
      dispatchCreateNewDeclaration: () => {
        order.push("dispatch");
      },
      onError: () => {},
    });

    await Promise.resolve();
    await Promise.resolve();
    assert.ok(!order.includes("dispatch"), "dispatch ne doit jamais précéder la résolution de tous les appels serveur");

    resolveB?.();
    await removal;
    assert.equal(order[order.length - 1], "dispatch", "dispatch survient seulement après la dernière résolution serveur");
  });

  // P3-SOCLE-CYCLE-FISCAL — P0-1 v2 : runCreateNewDeclaration() ne porte plus
  // aucune logique de cycle fiscal (persistFiscalYearTransition retiré) —
  // cette fonction reste strictement dédiée à "déclarer un autre bien".
  // Voir create-next-fiscal-year.test.ts pour le flux N → N+1 séparé.
});
