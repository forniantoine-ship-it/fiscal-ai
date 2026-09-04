import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { resolveDocumentDeletionPlan, runDocumentRemoval } from "./document-deletion-plan";

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
