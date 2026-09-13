import "fake-indexeddb/auto";
import assert from "node:assert/strict";
import { test } from "node:test";
import type { PersistedWorkspace } from "./persistence";
import { F009ActiviteAssistant, f009DraftPatch, restoreF009 } from "@/runtime/assistants/f009-activite/assistant";
Object.assign(globalThis, { window: globalThis });

/**
 * persistence.ts importe transitivement @/lib/supabase.ts, dont le client
 * est construit au chargement du module — même pattern que
 * reducer-upload-documents-id.test.ts.
 */
async function loadPersistence() {
  process.env.NEXT_PUBLIC_SUPABASE_URL ??= "https://test.invalid.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??= "test-anon-key";
  return import("./persistence");
}

const assistant = new F009ActiviteAssistant({ dossierId: "f009-idb", fiscalYear: 2025, route: "/assistants/activite" });
function workspace(): PersistedWorkspace {
  return { fiscalYear: { id: "f009-idb", year: 2025, status: "draft", regime: "reel", propertyIds: [], createdAt: "now", updatedAt: "now" }, properties: [], documents: [], extractions: [], validationItems: [], ledgerEntries: [], declarationDraft: { completedSteps: [], exploitantEmail: "preserved@example.test", personalAddress: "1 rue Exemple", personalCity: "Paris", personalPostalCode: "75001" } };
}
test("IndexedDB : report sans SIRET, reload, aucune donnée effacée", async () => {
  const { saveWorkspace, loadWorkspace } = await loadPersistence();
  const ws = workspace(); const state = (await assistant.handle(assistant.start(ws.declarationDraft).state, { type: "defer" })).state;
  ws.declarationDraft = { ...ws.declarationDraft!, ...f009DraftPatch(state, "2025-01-01", true) };
  await saveWorkspace("f009-idb-user", ws); const restored = await loadWorkspace("f009-idb-user");
  assert.equal(restoreF009(restored!.declarationDraft).step, "complete"); assert.equal(restoreF009(restored!.declarationDraft).deferred, true);
  assert.equal(restored!.declarationDraft?.exploitantEmail, "preserved@example.test"); assert.equal(restored!.declarationDraft?.inpiConfirmedAt, undefined);
});
test("IndexedDB : état validé, correction structurée, reprise et identité conservées", async () => {
  const { saveWorkspace, loadWorkspace } = await loadPersistence();
  const ws = workspace(); ws.declarationDraft = { ...ws.declarationDraft!, siret: "10458947800015", exploitantLastName: "Martin", exploitantFirstName: "Alice", activityStartDate: "2024-01-01", dateMiseEnService: "2024-02-01" };
  let state = assistant.start(ws.declarationDraft).state;
  state = (await assistant.handle(state, { type: "correct_field", field: "lastName", value: "Durand" })).state;
  state = (await assistant.handle(state, { type: "review_all" })).state;
  ws.declarationDraft = { ...ws.declarationDraft, ...f009DraftPatch(state, "2025-01-01", true) };
  await saveWorkspace("f009-idb-complete", ws); const loaded = await loadWorkspace("f009-idb-complete"); const resumed = restoreF009(loaded!.declarationDraft);
  assert.equal(resumed.step, "complete"); assert.equal(resumed.siret, "10458947800015"); assert.equal(resumed.lastName, "Durand"); assert.equal(resumed.resolutions?.[0].selected, "Durand");
  assert.equal(loaded!.declarationDraft?.siren, "104589478"); assert.equal(loaded!.declarationDraft?.exploitantEmail, "preserved@example.test"); assert.equal("messages" in resumed, false);
});
