/**
 * R15.3 — fabriques de test Activité. Les états F009 sont produits par l'assistant F009 réel (analyse d'un vrai extrait
 * RNE de test, réponses, confirmation) puis persistés par `f009DraftPatch`, comme le fait le panneau.
 */
import assert from "node:assert/strict";
import type { LmnpDocument } from "@/lib/lmnp/types";
import type { DeclarationDraft } from "@/lib/lmnp/types/domain";
import type { PersistedWorkspace } from "@/lib/lmnp/store/persistence";
import { projectDocumentFactsToF009 } from "@/lib/documents/facts/f009-fact-projection";
import { groundActiviteFactExtraction } from "@/lib/documents/facts/grounding-engine";
import { INPI_RNE_808900351_OCR } from "@/lib/documents/facts/extraction/inpi-rne/fixtures/inpi-rne-808900351.fixture";
import { F009ActiviteAssistant, f009DraftPatch } from "@/runtime/assistants/f009-activite/assistant";
import type { F009Action, F009State } from "@/runtime/assistants/f009-activite/types";

export const NOW = "2026-03-01T10:00:00.000Z";
const assistant = new F009ActiviteAssistant({ dossierId: "dossier-1", fiscalYear: 2025, route: "/assistants/activite" });
export const projection = () => projectDocumentFactsToF009(groundActiviteFactExtraction(INPI_RNE_808900351_OCR, {}, "doc-inpi").extraction);
export const handle = async (state: F009State, action: F009Action) => (await assistant.handle(state, action)).state;

export function docRow(id: string, fileName: string): LmnpDocument {
  return {
    id, fiscalYearId: "fy-2025", fiscalYear: 2025, fileName, mimeType: "application/pdf", sizeBytes: 100,
    category: "autre", documentType: "unknown", status: "analyzed", uploadedAt: "2026-02-01",
  };
}

export function workspaceOf(draft: DeclarationDraft | undefined, documents: LmnpDocument[] = [], overrides: Partial<PersistedWorkspace["fiscalYear"]> = {}): PersistedWorkspace {
  return {
    fiscalYear: { id: "fy-2025", dossierId: "dossier-1", year: 2025, status: "draft", regime: "reel", propertyIds: ["home-1"], createdAt: "2026-01-01", updatedAt: "2026-01-01", ...overrides },
    properties: [{ id: "home-1", label: "Logement", address: "1 rue X", city: "Lyon", postalCode: "69001" }],
    documents, extractions: [], validationItems: [], ledgerEntries: [], declarationDraft: draft,
  };
}

/** Draft as persisted by the panel after `patch` — the document id is stored by the panel on analysis success. */
export function persisted(state: F009State, completed: boolean, extra: Partial<DeclarationDraft> = {}): DeclarationDraft {
  return { completedSteps: [], ...f009DraftPatch(state, NOW, completed), ...extra };
}

/** Real flow: the analysed document is read, nothing else answered yet → values known, unconfirmed. */
export async function analysedInProgress(): Promise<F009State> {
  const uploaded = await handle(assistant.start().state, { type: "upload_document", documentId: "doc-inpi" });
  return handle(uploaded, { type: "analysis_success", projection: projection() });
}

/** Real flow: document analysed, dates answered, all confirmed → completed. */
export async function confirmedState(): Promise<F009State> {
  let state = await analysedInProgress();
  state = await handle(state, { type: "review_all" }); // asks for the availability date
  state = await handle(state, { type: "answer", values: { date: "2025-06-01" } });
  const turn = await assistant.handle(state, { type: "review_all" });
  assert.equal(turn.completed, true);
  return turn.state;
}

